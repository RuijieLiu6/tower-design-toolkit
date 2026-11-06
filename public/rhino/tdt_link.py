#! python3
# -*- coding: utf-8 -*-
"""
Tower Design Toolkit Link 2: keeps the Tower Design Toolkit (in your browser) in step with the model open in Rhino.

Run it in Rhino 7 or 8:  type  RunPythonScript  and pick this file. A small "Tower Design Toolkit" window opens.
Run it again to bring the window back. Stop the link from the window (or close Rhino).
Then, in the Toolkit: Site step > Import > Link Rhino live > Connect to Rhino.

The window
  * Status: the address the Toolkit reads, whether the Toolkit is connected, the model's revision.
  * Instant sync: on, every change reaches the Toolkit a moment after you make it. Off, changes wait until you
    press "Send now" (useful while you try things out).
  * Toolkit layers: one click sets up Toolkit::Tower massing, Podium, Below grade, Landscape, Urban design, Context and
    Site boundary. Objects on them reach the Toolkit with that role, so nothing needs mapping.
  * Ground and basements: the ground level (the Toolkit's entrance floor; type it, or take it from a selected object),
    the number of basement levels, their floor-to-floor and use. "Basement under selection" draws the basement volume
    under the selected massing on the Below grade layer. These settings travel with the model as document text.

What it serves (this computer only, http://127.0.0.1:8798, or the next free port up to 8800)
  GET /tdt/rev        -> {"rev", "doc", "objects", "units", "port", "version", "instant", "pending", "settings"}
  GET /tdt/model.3dm  -> the latest copy, with render meshes (header X-TDT-Rev)
Only the Toolkit's own pages may read it (its GitHub Pages site and copies on localhost). Nothing leaves your computer.
Written for Rhino 8 (CPython 3) and Rhino 7 (IronPython 2.7). Tower Design Toolkit, Ruijie Liu and Sinnie Choi, 2026.
"""
from __future__ import print_function

import json
import os
import tempfile
import threading
import time

try:  # CPython 3 (Rhino 8)
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from socketserver import ThreadingMixIn
except ImportError:  # IronPython 2.7 (Rhino 7)
    from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
    from SocketServer import ThreadingMixIn

import Rhino
import scriptcontext as sc

try:  # the window; without Eto (a test stand-in) the link runs headless
    import Eto.Forms as forms
    import Eto.Drawing as drawing
except Exception:  # pragma: no cover
    forms = None
    drawing = None

VERSION = "2.0"
PORTS = (8798, 8799, 8800)
STICKY = "tower_design_toolkit_link"
TOOLKIT_URL = "https://ruijieliu6.github.io/tower-design-toolkit/#/guided"
# Pages that may read the model: the Toolkit's site and local copies of it (npm run dev / preview).
ALLOWED_ORIGINS = ("https://ruijieliu6.github.io",)
LOCAL_PREFIXES = ("http://localhost:", "http://127.0.0.1:", "http://[::1]:")
SETTLE_S = 0.6       # wait this long after the last change before writing a copy
MIN_GAP_S = 1.0      # and at most one copy per second
CONNECTED_S = 5.0    # the Toolkit counts as connected if it asked within this many seconds

# Toolkit layers: name, colour, the role the Toolkit gives them (its mapping reads these names).
LAYERS = (
    ("Tower massing", (31, 95, 139)),
    ("Podium", (127, 159, 184)),
    ("Below grade", (61, 90, 128)),
    ("Landscape", (111, 159, 90)),
    ("Urban design", (179, 154, 107)),
    ("Context", (154, 149, 139)),
    ("Site boundary", (42, 157, 143)),
)
# Document text the Toolkit reads (lib/import/rhino.ts docStrings; lib/interchange/build.ts).
KEYS = {"ground": "tdt.ground_z", "levels": "tdt.basement_levels", "f2f": "tdt.basement_f2f", "use": "tdt.basement_use"}


def say(text):
    Rhino.RhinoApp.WriteLine("Tower Design Toolkit Link: " + text)


def origin_allowed(origin):
    if not origin:
        return True  # not a browser page (curl, a test): it reads nothing a page could not
    if origin in ALLOWED_ORIGINS:
        return True
    return any(origin.startswith(p) for p in LOCAL_PREFIXES)


def doc_string(doc, key, default=""):
    try:
        v = doc.Strings.GetValue(key)
        return default if v is None else v
    except Exception:
        return default


class Snapshot(object):
    """The latest copy of the document, swapped whole so the server thread never sees half of one."""
    def __init__(self, rev, data, doc, objects, units, settings):
        self.rev, self.data, self.doc, self.objects, self.units, self.settings = rev, data, doc, objects, units, settings


class Link(object):
    def __init__(self):
        self.snapshot = Snapshot(0, None, "", 0, "", {})
        self.rev = 0
        self.dirty = True          # something changed since the last copy
        self.pending = 0           # changes waiting while instant sync is off
        self.instant = True
        self.send_now = False
        self.writing = False       # our own writes (render meshes, the copy) must not count as changes
        self.changed_at = 0.0
        self.written_at = 0.0
        self.last_seen = 0.0       # when the Toolkit last asked
        self.server = None
        self.port = None
        self.path = os.path.join(tempfile.gettempdir(), "tower_design_toolkit_link.3dm")
        self.handlers = []
        self.window = None

    # ------------------------------------------------------------------ Rhino side (UI thread)
    def touch(self, *args):
        if self.writing:
            return
        self.pending += 1
        self.dirty = True
        self.changed_at = time.time()

    def idle(self, sender, e):
        if not self.dirty:
            return
        if not self.instant and not self.send_now:
            return  # waits for Send now
        now = time.time()
        if not self.send_now and (now - self.changed_at < SETTLE_S or now - self.written_at < MIN_GAP_S):
            return
        self.dirty = False
        self.send_now = False
        self.written_at = now
        try:
            self.write_copy()
            self.pending = 0
        except Exception as ex:  # keep the link alive; say what went wrong
            self.dirty = True
            say("could not write the model ({0}). It will try again on the next change.".format(ex))

    def settings(self, doc):
        out = {}
        for name, key in KEYS.items():
            v = doc_string(doc, key)
            if v != "":
                out[name] = v
        return out

    def write_copy(self):
        doc = Rhino.RhinoDoc.ActiveDoc
        if doc is None:
            return
        self.writing = True
        try:
            # Breps, extrusions and SubDs reach the Toolkit as their render meshes: make the ones that are missing.
            try:
                mp = doc.GetCurrentMeshingParameters()
            except Exception:
                mp = Rhino.Geometry.MeshingParameters.FastRenderMesh
            count = 0
            for obj in doc.Objects:
                if obj.IsDeleted:
                    continue
                count += 1
                t = obj.ObjectType
                if t in (Rhino.DocObjects.ObjectType.Brep, Rhino.DocObjects.ObjectType.Extrusion, Rhino.DocObjects.ObjectType.SubD):
                    try:
                        if len(obj.GetMeshes(Rhino.Geometry.MeshType.Render)) == 0:
                            obj.CreateMeshes(Rhino.Geometry.MeshType.Render, mp, False)
                    except Exception:
                        pass
            opts = Rhino.FileIO.FileWriteOptions()
            opts.IncludeRenderMeshes = True
            opts.IncludePreviewImage = False
            opts.IncludeBitmapTable = False
            opts.IncludeHistory = False
            opts.SuppressDialogBoxes = True
            if not doc.Write3dmFile(self.path, opts):
                raise IOError("Rhino did not write " + self.path)
            with open(self.path, "rb") as f:
                data = f.read()
            self.rev += 1
            self.snapshot = Snapshot(self.rev, data, doc.Name or "Untitled", count, str(doc.ModelUnitSystem), self.settings(doc))
        finally:
            self.writing = False

    def set_setting(self, name, value):
        doc = Rhino.RhinoDoc.ActiveDoc
        if doc is None:
            return
        doc.Strings.SetString(KEYS[name], str(value))
        self.touch()

    def setup_layers(self):
        doc = Rhino.RhinoDoc.ActiveDoc
        if doc is None:
            return 0
        made = 0
        parent_index = doc.Layers.FindByFullPath("Toolkit", -1)
        if parent_index < 0:
            parent = Rhino.DocObjects.Layer()
            parent.Name = "Toolkit"
            parent_index = doc.Layers.Add(parent)
            made += 1
        parent_id = doc.Layers[parent_index].Id
        for name, rgb in LAYERS:
            if doc.Layers.FindByFullPath("Toolkit::" + name, -1) >= 0:
                continue
            layer = Rhino.DocObjects.Layer()
            layer.Name = name
            layer.ParentLayerId = parent_id
            try:
                import System.Drawing
                layer.Color = System.Drawing.Color.FromArgb(rgb[0], rgb[1], rgb[2])
            except Exception:
                pass
            doc.Layers.Add(layer)
            made += 1
        doc.Views.Redraw()
        return made

    def ground_from_selection(self):
        doc = Rhino.RhinoDoc.ActiveDoc
        objs = list(doc.Objects.GetSelectedObjects(False, False)) if doc else []
        if not objs:
            return None
        z = min(o.Geometry.GetBoundingBox(True).Min.Z for o in objs)
        return z

    def basement_under_selection(self):
        """A box on Toolkit::Below grade under the selected objects' plan extent, from the ground down."""
        doc = Rhino.RhinoDoc.ActiveDoc
        objs = list(doc.Objects.GetSelectedObjects(False, False)) if doc else []
        if not objs:
            return "Select the massing first, then press Basement under selection."
        self.setup_layers()
        bbox = Rhino.Geometry.BoundingBox.Empty
        for o in objs:
            bbox.Union(o.Geometry.GetBoundingBox(True))
        try:
            ground = float(doc_string(doc, KEYS["ground"], "0") or 0)
            levels = int(float(doc_string(doc, KEYS["levels"], "2") or 2))
            f2f = float(doc_string(doc, KEYS["f2f"], "3.2") or 3.2)
        except ValueError:
            ground, levels, f2f = 0.0, 2, 3.2
        scale = Rhino.RhinoMath.UnitScale(Rhino.UnitSystem.Meters, doc.ModelUnitSystem)
        depth = max(1, levels) * f2f * scale
        box = Rhino.Geometry.BoundingBox(bbox.Min.X, bbox.Min.Y, ground - depth, bbox.Max.X, bbox.Max.Y, ground)
        brep = Rhino.Geometry.Brep.CreateFromBox(box)
        attrs = Rhino.DocObjects.ObjectAttributes()
        attrs.LayerIndex = doc.Layers.FindByFullPath("Toolkit::Below grade", -1)
        attrs.Name = "Basement ({0} levels)".format(max(1, levels))
        doc.Objects.AddBrep(brep, attrs)
        doc.Views.Redraw()
        return "Basement drawn on Toolkit::Below grade: {0} levels, {1:.1f} m deep.".format(max(1, levels), depth / scale)

    DOC_EVENTS = ("AddRhinoObject", "DeleteRhinoObject", "ReplaceRhinoObject", "UndeleteRhinoObject",
                  "ModifyObjectAttributes", "LayerTableEvent", "DocumentPropertiesChanged", "EndOpenDocument", "NewDocument")

    def hook(self):
        # One stored handler per event, so the same delegate is removed again (Python 3 makes a new bound method each time).
        self._touch, self._idle = self.touch, self.idle
        for name in self.DOC_EVENTS:
            ev = getattr(Rhino.RhinoDoc, name, None)
            if ev is None:
                continue
            ev += self._touch
            self.handlers.append((Rhino.RhinoDoc, name, self._touch))
        ev = Rhino.RhinoApp.Idle
        ev += self._idle
        self.handlers.append((Rhino.RhinoApp, "Idle", self._idle))

    def unhook(self):
        for owner, name, handler in self.handlers:
            try:
                ev = getattr(owner, name)
                ev -= handler
            except Exception:
                pass
        self.handlers = []

    # ------------------------------------------------------------------ server side (its own thread)
    def start(self):
        link = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def cors(self):
                origin = self.headers.get("Origin")
                if origin and origin_allowed(origin):
                    self.send_header("Access-Control-Allow-Origin", origin)
                    self.send_header("Vary", "Origin")
                    self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
                    self.send_header("Access-Control-Allow-Headers", "*")
                    self.send_header("Access-Control-Expose-Headers", "X-TDT-Rev")
                    # Chrome's Private Network Access: a public page may reach this local server.
                    self.send_header("Access-Control-Allow-Private-Network", "true")
                self.send_header("Cache-Control", "no-store")

            def reply(self, code, ctype, body):
                self.send_response(code)
                self.cors()
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body)))
                if ctype == "application/octet-stream":
                    self.send_header("X-TDT-Rev", str(link.snapshot.rev))
                self.end_headers()
                self.wfile.write(body)

            def do_OPTIONS(self):
                if not origin_allowed(self.headers.get("Origin")):
                    return self.reply(403, "text/plain", b"origin not allowed")
                self.send_response(204)
                self.cors()
                self.send_header("Content-Length", "0")
                self.end_headers()

            def do_GET(self):
                if not origin_allowed(self.headers.get("Origin")):
                    return self.reply(403, "text/plain", b"origin not allowed")
                path = self.path.split("?")[0]
                s = link.snapshot
                if path == "/tdt/rev":
                    if self.headers.get("Origin"):
                        link.last_seen = time.time()
                    body = json.dumps({"rev": s.rev, "doc": s.doc, "objects": s.objects, "units": s.units, "port": link.port, "version": VERSION,
                                       "instant": link.instant, "pending": link.pending if link.dirty else 0, "settings": s.settings})
                    return self.reply(200, "application/json", body.encode("utf-8"))
                if path == "/tdt/model.3dm":
                    if s.data is None:
                        return self.reply(503, "text/plain", b"the first copy is still being written")
                    return self.reply(200, "application/octet-stream", s.data)
                if path in ("/", "/tdt"):
                    text = "Tower Design Toolkit Link {0} is running. Open the Toolkit and press Connect to Rhino.".format(VERSION)
                    return self.reply(200, "text/plain; charset=utf-8", text.encode("utf-8"))
                return self.reply(404, "text/plain", b"not found")

        class Server(ThreadingMixIn, HTTPServer):
            daemon_threads = True
            allow_reuse_address = False

        last = None
        for port in PORTS:
            try:
                self.server = Server(("127.0.0.1", port), Handler)
                self.port = port
                break
            except Exception as ex:
                last = ex
        if self.server is None:
            raise IOError("ports {0} are all in use ({1})".format(", ".join(str(p) for p in PORTS), last))
        t = threading.Thread(target=self.server.serve_forever)
        t.daemon = True
        t.start()
        self.hook()

    def stop(self):
        self.unhook()
        if self.server is not None:
            try:
                self.server.shutdown()
                self.server.server_close()
            except Exception:
                pass
        self.server = None
        if self.window is not None:
            try:
                self.window.close_quietly()
            except Exception:
                pass
            self.window = None

    def show(self):
        if forms is None:
            return
        if self.window is None:
            self.window = LinkWindow(self)
        self.window.show()


# ---------------------------------------------------------------------- the window (Eto, Rhino 7 and 8)
if forms is not None:
    class LinkWindow(object):
        def __init__(self, link):
            self.link = link
            self.closing_quietly = False
            f = forms.Form()
            f.Title = "Tower Design Toolkit"
            f.Resizable = False
            f.Padding = drawing.Padding(10)
            try:
                f.Owner = Rhino.UI.RhinoEtoApp.MainWindow
            except Exception:
                pass
            self.form = f

            self.status = forms.Label()
            self.connected = forms.Label()
            self.revision = forms.Label()

            self.instant = forms.CheckBox()
            self.instant.Text = "Instant sync (send every change)"
            self.instant.Checked = link.instant
            self.instant.CheckedChanged += self.on_instant
            self.send = forms.Button()
            self.send.Text = "Send now"
            self.send.Click += self.on_send

            self.layers = forms.Button()
            self.layers.Text = "Set up Toolkit layers"
            self.layers.Click += self.on_layers

            doc = Rhino.RhinoDoc.ActiveDoc
            self.ground = forms.NumericStepper()
            self.ground.DecimalPlaces = 2
            self.ground.Value = float(doc_string(doc, KEYS["ground"], "0") or 0) if doc else 0.0
            self.ground.ValueChanged += self.on_ground
            self.ground_pick = forms.Button()
            self.ground_pick.Text = "From selection"
            self.ground_pick.Click += self.on_ground_pick
            self.levels = forms.NumericStepper()
            self.levels.MinValue, self.levels.MaxValue, self.levels.DecimalPlaces = 0, 8, 0
            self.levels.Value = float(doc_string(doc, KEYS["levels"], "0") or 0) if doc else 0
            self.levels.ValueChanged += self.on_levels
            self.f2f = forms.NumericStepper()
            self.f2f.MinValue, self.f2f.MaxValue, self.f2f.DecimalPlaces, self.f2f.Increment = 2.6, 6.0, 1, 0.1
            self.f2f.Value = float(doc_string(doc, KEYS["f2f"], "3.2") or 3.2) if doc else 3.2
            self.f2f.ValueChanged += self.on_f2f
            self.use = forms.DropDown()
            self.use.DataStore = ["Parking and loading", "Mixed: parking, storage, plant"]
            self.use.SelectedIndex = 1 if (doc and doc_string(doc, KEYS["use"]) == "mixed") else 0
            self.use.SelectedIndexChanged += self.on_use
            self.dig = forms.Button()
            self.dig.Text = "Basement under selection"
            self.dig.Click += self.on_dig
            self.note = forms.Label()
            self.note.Wrap = forms.WrapMode.Word
            self.note.Width = 300

            self.open = forms.Button()
            self.open.Text = "Open the Toolkit"
            self.open.Click += self.on_open
            self.stop = forms.Button()
            self.stop.Text = "Stop link"
            self.stop.Click += self.on_stop

            def head(text):
                lab = forms.Label()
                lab.Text = text
                lab.Font = drawing.SystemFonts.Bold()
                return lab

            def row(*cells):
                r = forms.StackLayout()
                r.Orientation = forms.Orientation.Horizontal
                r.Spacing = 6
                r.VerticalContentAlignment = forms.VerticalAlignment.Center
                for c in cells:
                    if isinstance(c, str):
                        lab = forms.Label()
                        lab.Text = c
                        c = lab
                    r.Items.Add(forms.StackLayoutItem(c))
                return r

            layout = forms.StackLayout()
            layout.Spacing = 6
            layout.HorizontalContentAlignment = forms.HorizontalAlignment.Stretch
            for item in (head("Link"), self.status, self.connected, self.revision,
                         head("Sync"), self.instant, row(self.send),
                         head("Toolkit layers"), row(self.layers),
                         head("Ground and basements"), row("Ground level (z)", self.ground, self.ground_pick),
                         row("Basement levels", self.levels, "floor-to-floor (m)", self.f2f), row("Use", self.use),
                         row(self.dig), self.note,
                         row(self.open, self.stop)):
                layout.Items.Add(forms.StackLayoutItem(item))
            f.Content = layout
            f.Closed += self.on_closed

            self.timer = forms.UITimer()
            self.timer.Interval = 1.0
            self.timer.Elapsed += self.refresh
            self.timer.Start()
            self.refresh(None, None)

        def show(self):
            self.form.Show()
            try:
                self.form.BringToFront()
            except Exception:
                pass

        def close_quietly(self):
            self.closing_quietly = True
            self.timer.Stop()
            self.form.Close()

        def refresh(self, sender, e):
            link = self.link
            self.status.Text = "Running on http://127.0.0.1:{0}".format(link.port)
            ago = time.time() - link.last_seen
            self.connected.Text = "Toolkit connected" if ago < CONNECTED_S else ("Toolkit not connected yet: in the Toolkit, Import > Connect to Rhino" if link.last_seen == 0 else "Toolkit not asking (last {0:.0f} s ago)".format(ago))
            waiting = (not link.instant) and link.dirty
            self.revision.Text = "Model sent {0} time{1}{2}".format(link.rev, "" if link.rev == 1 else "s", " · changes waiting: press Send now" if waiting else "")
            self.send.Enabled = (not link.instant) and link.dirty

        def on_instant(self, sender, e):
            self.link.instant = bool(self.instant.Checked)
            self.refresh(None, None)

        def on_send(self, sender, e):
            self.link.send_now = True

        def on_layers(self, sender, e):
            n = self.link.setup_layers()
            self.note.Text = "Toolkit layers ready ({0} added). Put objects on them and they reach the Toolkit with that role.".format(n) if n else "The Toolkit layers are already there."

        def on_ground(self, sender, e):
            self.link.set_setting("ground", round(self.ground.Value, 3))

        def on_ground_pick(self, sender, e):
            z = self.link.ground_from_selection()
            if z is None:
                self.note.Text = "Select the ground (a surface or the lowest slab) first."
                return
            self.ground.Value = z  # fires on_ground
            self.note.Text = "Ground level taken from the selection: z = {0:.2f}.".format(z)

        def on_levels(self, sender, e):
            self.link.set_setting("levels", int(self.levels.Value))

        def on_f2f(self, sender, e):
            self.link.set_setting("f2f", round(self.f2f.Value, 2))

        def on_use(self, sender, e):
            self.link.set_setting("use", "mixed" if self.use.SelectedIndex == 1 else "parking")

        def on_dig(self, sender, e):
            self.note.Text = self.link.basement_under_selection()

        def on_open(self, sender, e):
            try:
                import webbrowser
                webbrowser.open(TOOLKIT_URL)
            except Exception:
                Rhino.UI.Dialogs.ShowMessage("Open " + TOOLKIT_URL + " in your browser.", "Tower Design Toolkit")

        def on_stop(self, sender, e):
            stop_link()

        def on_closed(self, sender, e):
            self.timer.Stop()
            self.link.window = None
            if not self.closing_quietly:
                say("window closed; the link keeps running. Run the script again to open the window.")


def stop_link():
    running = sc.sticky.get(STICKY)
    if running is not None:
        running.stop()
        del sc.sticky[STICKY]
        say("stopped. Run the script again to start it.")


def main():
    running = sc.sticky.get(STICKY)
    if running is not None and getattr(running, "show", None) is not None and getattr(running, "server", None) is not None:
        running.show()  # already running: bring the window back
        return
    if running is not None:  # an older version of the link: replace it
        try:
            running.stop()
        except Exception:
            pass
        del sc.sticky[STICKY]
    link = Link()
    try:
        link.start()
    except Exception as ex:
        say("could not start: {0}".format(ex))
        return
    sc.sticky[STICKY] = link
    link.touch()
    say("running on http://127.0.0.1:{0}. In the Toolkit: Import > Connect to Rhino. Run this script again to open the window.".format(link.port))
    link.show()


if __name__ == "__main__":
    main()
