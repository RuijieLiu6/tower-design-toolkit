"""Runs public/rhino/tdt_link.py without Rhino, for testing the Toolkit's live link (no Rhino on the build machine).

    python tools/rhino_link_stub.py [model.3dm] [--edit-every SECONDS]
    python tools/rhino_link_stub.py --selftest      the link's own logic: no endless re-sends, manual sync, settings

Stand-ins for the few RhinoCommon pieces the script uses (RhinoApp, RhinoDoc events and ActiveDoc, Write3dmFile,
FileWriteOptions, mesh settings) and for scriptcontext.sticky. "Writing" the document copies the given .3dm (default:
tools/import-fixtures/typical-two-towers-mm.3dm). Every --edit-every seconds (default 6) it fires a document event, as
an edit in Rhino would, so the page should update. Ctrl+C stops it. The HTTP server, the origin rule and the
revision logic are the real script's; only Rhino itself is stood in for.
"""
import os
import shutil
import sys
import time
import types

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
args = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith("--") and sys.argv[i - 1] != "--edit-every"]
MODEL = args[0] if args else os.path.join(HERE, "import-fixtures", "typical-two-towers-mm.3dm")
EVERY = float(sys.argv[sys.argv.index("--edit-every") + 1]) if "--edit-every" in sys.argv else 6.0


class Event(object):
    def __init__(self):
        self.handlers = []

    def __iadd__(self, h):
        self.handlers.append(h)
        return self

    def __isub__(self, h):
        self.handlers = [x for x in self.handlers if x is not h]
        return self

    def fire(self):
        for h in list(self.handlers):
            h(None, None)


class Obj(object):
    """Like a Brep in Rhino: it has no render mesh until one is made, and making one fires a document event (as Rhino
    does), which is what kept version 1 of the link re-sending forever."""
    IsDeleted = False
    ObjectType = "Brep"

    def __init__(self):
        self.meshes = []

    def GetMeshes(self, *a):
        return self.meshes

    def CreateMeshes(self, *a):
        self.meshes = ["render mesh"]
        Rhino.RhinoDoc.ReplaceRhinoObject.fire()
        return 1


class Strings(object):
    def __init__(self):
        self.values = {}

    def GetValue(self, key):
        return self.values.get(key)

    def SetString(self, key, value):
        self.values[key] = value


class Doc(object):
    Name = os.path.basename(MODEL)
    ModelUnitSystem = "Millimeters"
    Objects = [Obj(), Obj()]
    Strings = Strings()

    def GetCurrentMeshingParameters(self):
        return None

    def Write3dmFile(self, path, opts):
        assert opts.IncludeRenderMeshes is True
        shutil.copyfile(MODEL, path)
        return True


Rhino = types.ModuleType("Rhino")
Rhino.RhinoApp = types.SimpleNamespace(WriteLine=lambda s: print(s, flush=True), Idle=Event())
Rhino.RhinoDoc = types.SimpleNamespace(ActiveDoc=Doc(), **{n: Event() for n in (
    "AddRhinoObject", "DeleteRhinoObject", "ReplaceRhinoObject", "UndeleteRhinoObject", "ModifyObjectAttributes",
    "LayerTableEvent", "DocumentPropertiesChanged", "EndOpenDocument", "NewDocument")})
Rhino.Geometry = types.SimpleNamespace(MeshingParameters=types.SimpleNamespace(FastRenderMesh=None), MeshType=types.SimpleNamespace(Render=0))
Rhino.DocObjects = types.SimpleNamespace(ObjectType=types.SimpleNamespace(Brep="Brep", Extrusion="Extrusion", SubD="SubD"))
Rhino.FileIO = types.SimpleNamespace(FileWriteOptions=lambda: types.SimpleNamespace())
sc = types.ModuleType("scriptcontext")
sc.sticky = {}
sys.modules["Rhino"] = Rhino
sys.modules["scriptcontext"] = sc

ns = {"__name__": "tdt_link"}
script = os.path.join(ROOT, "public", "rhino", "tdt_link.py")
exec(compile(open(script, encoding="utf-8").read(), script, "exec"), ns)
ns["main"]()


def selftest():
    link = sc.sticky["tower_design_toolkit_link"]
    idle = lambda n=15: [(Rhino.RhinoApp.Idle.fire(), time.sleep(0.12)) for _ in range(n)]
    idle()
    assert link.rev == 1, "the first copy: rev %s" % link.rev
    idle(25)  # 3 s and no edit: version 1 kept going here (its own meshes counted as edits)
    assert link.rev == 1, "re-sent without an edit: rev %s" % link.rev
    Rhino.RhinoDoc.AddRhinoObject.fire(); idle()
    assert link.rev == 2, "an edit is sent: rev %s" % link.rev
    link.instant = False
    Rhino.RhinoDoc.AddRhinoObject.fire(); idle()
    assert link.rev == 2 and link.dirty, "manual sync waits for Send now: rev %s" % link.rev
    link.send_now = True; idle(3)
    assert link.rev == 3 and not link.dirty, "Send now sends: rev %s" % link.rev
    link.instant = True
    link.set_setting("levels", 3); idle()
    assert Doc.Strings.values["tdt.basement_levels"] == "3" and link.rev == 4 and link.snapshot.settings == {"levels": "3"}, "a setting travels with the model"
    ns["stop_link"]()
    print("selftest: ok (no re-send without an edit, manual sync, Send now, settings)", flush=True)


if "--selftest" in sys.argv:
    selftest()
    sys.exit(0)
last_edit = time.time()
try:
    while True:
        time.sleep(0.2)
        Rhino.RhinoApp.Idle.fire()
        if EVERY > 0 and time.time() - last_edit > EVERY:
            last_edit = time.time()
            Rhino.RhinoDoc.AddRhinoObject.fire()
            print("stub: an edit in 'Rhino'", flush=True)
except KeyboardInterrupt:
    ns["stop_link"]()
