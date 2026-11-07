# -*- coding: utf-8 -*-
"""Tower Design Toolkit link for Archicad (25 and later).

Publishes the Archicad model as IFC to one file the Toolkit links, through a Publisher Set named
"Tower Design Toolkit". In the Tower Design Toolkit, "Link the file" once (Chrome or Edge). Each time you run this script
again (or press Publish on that set), the file is written again and the Toolkit updates by itself. Nothing is uploaded.

Once, in Archicad:
  1. Publisher Sets (Organizer > Publisher Sets): a new set named exactly  Tower Design Toolkit
  2. Add your 3D view (or the whole model) to it, and set its Format to IFC (translator: General Translator) and its
     path to Documents\\TowerDesignToolkit (the folder this script also uses).
Then run this script from Archicad's Python palette (Window > Palettes > Python Palette, "Run"). Optional: add
  --every 30
to republish every 30 seconds while it runs (stop it with the palette's Stop button).

Name layers or element IDs so the roles read in the Toolkit: Tower massing, Podium, Below grade, Landscape,
Urban design, Context, Site boundary. IFC carries metres and the project's true north.

Uses Graphisoft's official "archicad" Python package (pip install archicad), which the Python palette provides.
Written by the Tower Design Toolkit team (UBC ARCH 540), MIT licence. Not yet tested inside Archicad (it was not
installed where it was written): treat it as unverified and tell us what happens.
"""
import os
import sys
import time

VERSION = "1.0"
SET_NAME = "Tower Design Toolkit"
OUT = os.path.join(os.path.expanduser("~"), "Documents", "TowerDesignToolkit")


def connect():
    try:
        from archicad import ACConnection
    except ImportError:
        sys.exit("The archicad package is missing: run this from Archicad's Python palette, or pip install archicad.")
    conn = ACConnection.connect()
    if not conn:
        sys.exit("Archicad is not reachable: open the project in Archicad (25 or later) and run this from its Python palette.")
    return conn


def publish(acc):
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    try:
        acc.PublishPublisherSet(SET_NAME, OUT)
    except Exception as e:  # noqa: BLE001 (the API's own error says what is wrong)
        sys.exit('Archicad could not publish the set "{0}": {1}. Check the set exists with that exact name and its format is IFC.'.format(SET_NAME, e))
    print("Tower Design Toolkit link {0}: published \"{1}\" to {2} at {3}.".format(VERSION, SET_NAME, OUT, time.strftime("%H:%M:%S")))


def main():
    acc = connect().commands
    every = None
    if "--every" in sys.argv:
        try:
            every = max(10.0, float(sys.argv[sys.argv.index("--every") + 1]))
        except (IndexError, ValueError):
            every = 30.0
    publish(acc)
    print("The first time, press \"Link the file\" in the Toolkit's Import > Archicad and pick the IFC file in {0}.".format(OUT))
    while every:
        time.sleep(every)
        publish(acc)


main()
