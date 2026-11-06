#! python3
# -*- coding: utf-8 -*-
"""
Tower Design Toolkit Link: keeps the Tower Design Toolkit (in your browser) in step with the model open in Rhino.

Run it in Rhino 7 or 8:  type  RunPythonScript  and pick this file. Run it again to stop the link.
Then, in the Toolkit: Design tools > Rhino import > Link Rhino live > Connect to Rhino.

What it does
  * Serves the open Rhino document to the Toolkit on this computer only, at http://127.0.0.1:8798 (the next free
    port up to 8800 if that one is taken). Nothing leaves your computer: the page in your browser reads it from there.
  * After every change (an object added, moved, deleted, a layer renamed...), once Rhino is idle, it writes a copy of
    the document with render meshes to a temporary .3dm and serves that copy. The Toolkit reads it exactly as it
    reads a .3dm you upload: layers and their full paths, object names, user text (role=..., use=...), units and the
    Earth anchor's north all come across, and the Toolkit keeps your layer-to-role mapping between updates.
  * Only the Toolkit's own pages may read the model (its GitHub Pages site and copies running on localhost), so
    another website you visit while the link runs cannot.

Endpoints:  GET /tdt/rev        -> {"rev", "doc", "objects", "units", "port", "version"}
            GET /tdt/model.3dm  -> the latest copy (header X-TDT-Rev)
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

VERSION = "1.0"
PORTS = (8798, 8799, 8800)
STICKY = "tower_design_toolkit_link"
# Pages that may read the model: the Toolkit's site and local copies of it (npm run dev / preview).
ALLOWED_ORIGINS = ("https://ruijieliu6.github.io",)
LOCAL_PREFIXES = ("http://localhost:", "http://127.0.0.1:", "http://[::1]:")
SETTLE_S = 0.6       # wait this long after the last change before writing a copy
MIN_GAP_S = 1.0      # and at most one copy per second


def say(text):
    Rhino.RhinoApp.WriteLine("Tower Design Toolkit Link: " + text)


def origin_allowed(origin):
    if not origin:
        return True  # not a browser page (curl, a test): it reads nothing a page could not
    if origin in ALLOWED_ORIGINS:
        return True
    return any(origin.startswith(p) for p in LOCAL_PREFIXES)


class Snapshot(object):
    """The latest copy of the document, swapped whole so the server thread never sees half of one."""
    def __init__(self, rev, data, doc, objects, units):
        self.rev, self.data, self.doc, self.objects, self.units = rev, data, doc, objects, units


class Link(object):
    def __init__(self):
        self.snapshot = Snapshot(0, None, "", 0, "")
        self.rev = 0
        self.dirty = True
        self.changed_at = 0.0
        self.written_at = 0.0
        self.server = None
        self.port = None
        self.path = os.path.join(tempfile.gettempdir(), "tower_design_toolkit_link.3dm")
        self.handlers = []

    # ------------------------------------------------------------------ Rhino side (UI thread)
    def touch(self, *args):
        self.dirty = True
        self.changed_at = time.time()

    def idle(self, sender, e):
        if not self.dirty:
            return
        now = time.time()
        if now - self.changed_at < SETTLE_S or now - self.written_at < MIN_GAP_S:
            return
        self.dirty = False
        self.written_at = now
        try:
            self.write_copy()
        except Exception as ex:  # keep the link alive; say what went wrong
            say("could not write the model ({0}). It will try again on the next change.".format(ex))

    def write_copy(self):
        doc = Rhino.RhinoDoc.ActiveDoc
        if doc is None:
            return
        # Breps, extrusions and SubDs reach the Toolkit as their render meshes: make sure every one has them.
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
        units = str(doc.ModelUnitSystem)
        name = doc.Name or "Untitled"
        self.snapshot = Snapshot(self.rev, data, name, count, units)

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
                    body = json.dumps({"rev": s.rev, "doc": s.doc, "objects": s.objects, "units": s.units, "port": link.port, "version": VERSION})
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


def main():
    running = sc.sticky.get(STICKY)
    if running is not None:
        running.stop()
        del sc.sticky[STICKY]
        say("stopped. Run the script again to start it.")
        return
    link = Link()
    try:
        link.start()
    except Exception as ex:
        say("could not start: {0}".format(ex))
        return
    sc.sticky[STICKY] = link
    link.touch()
    say("running on http://127.0.0.1:{0}. In the Toolkit: Rhino import > Connect to Rhino. Run this script again to stop.".format(link.port))


if __name__ == "__main__":
    main()
