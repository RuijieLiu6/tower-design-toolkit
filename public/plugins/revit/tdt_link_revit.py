# -*- coding: utf-8 -*-
"""Tower Design Toolkit link for Revit (2021 and later).

Exports the open Revit model as IFC to one file the Toolkit links:
    Documents\\TowerDesignToolkit\\<model name>.ifc
In the Tower Design Toolkit, "Link the file" once (Chrome or Edge). Each time you run this script again, the file is
written again and the Toolkit updates by itself, with the role mapping you chose the first time. Nothing is uploaded.

Run it with pyRevit (put it in a pyRevit extension as a button, or open it with pyRevit's "Run script") or with
RevitPythonShell ("Run script"). Without either: File > Export > IFC to the same file does the same thing by hand.

What it writes: IFC 2x3 Coordination View 2.0, every element visible in the model (masses, floors, walls, roofs,
generic models). In the Toolkit, map masses (IfcBuildingElementProxy) or whole storeys to Tower massing and Podium;
name your masses or their category so the roles read: Tower massing, Podium, Below grade, Landscape, Urban design,
Context, Site boundary. IFC carries metres and the project's true north.

Written by the Tower Design Toolkit team (UBC ARCH 540), MIT licence. Not yet tested inside Revit (it was not installed
where it was written): treat it as unverified and tell us what happens.
"""
import os

import clr

clr.AddReference("RevitAPI")
clr.AddReference("RevitAPIUI")
from Autodesk.Revit.DB import IFCExportOptions, IFCVersion, Transaction  # noqa: E402
from Autodesk.Revit.UI import TaskDialog  # noqa: E402

VERSION = "1.0"
OUT = os.path.join(os.path.expanduser("~"), "Documents", "TowerDesignToolkit")


def ui_app():
    # pyRevit and RevitPythonShell both give the running Revit as __revit__.
    try:
        return __revit__  # noqa: F821
    except NameError:
        raise RuntimeError("Run this inside Revit with pyRevit or RevitPythonShell.")


def export(doc):
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    name = os.path.splitext(doc.Title)[0] or "Revit model"
    opts = IFCExportOptions()
    opts.FileVersion = IFCVersion.IFC2x3CV2
    opts.WallAndColumnSplitting = False
    opts.ExportBaseQuantities = False
    # Revit exports IFC inside a transaction; rolling it back leaves the model exactly as it was.
    t = Transaction(doc, "Tower Design Toolkit: export IFC")
    t.Start()
    try:
        ok = doc.Export(OUT, name + ".ifc", opts)
    finally:
        t.RollBack()
    return os.path.join(OUT, name + ".ifc") if ok else None


def main():
    uidoc = ui_app().ActiveUIDocument
    if uidoc is None:
        TaskDialog.Show("Tower Design Toolkit", "Open a model first.")
        return
    path = export(uidoc.Document)
    if path:
        TaskDialog.Show("Tower Design Toolkit", "Sent to the Toolkit:\n{0}\n\nThe first time, press \"Link the file\" in the Toolkit's Import > Revit and pick this file. "
                        "After that, run this script again whenever you want the Toolkit to update.".format(path))
    else:
        TaskDialog.Show("Tower Design Toolkit", "Revit did not write the IFC file. Try File > Export > IFC to {0}.".format(OUT))


main()
