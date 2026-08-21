#!/usr/bin/env python3
"""Deterministic camp + trail fixture for NavigationController.useFixtureTrail.

Hard rule 5, applied to navigation the way make-survey-fixtures.py applies it
to terrain: a stored camp point and a stored trail, so stakes, chips, FOLLOW
TRAIL and the bearing readout can be exercised on a desk (and by LEAF) without
walking the preview camera. Regenerating produces byte-identical output.

Geometry: camp 1 m ahead of the boot origin, then a gently weaving 12-mark
trail heading away at the shipping spacing (150 cm). Ground level matches the
Sunlit Outdoor floor (y = -173 cm). CENTIMETRES, same space as the bus.
"""
import json
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "Assets", "Survey", "fixtures", "camp-trail-demo.json")

GROUND_Y = -173.0
SPACING_CM = 150.0
MARKS = 12

camp = [0.0, GROUND_Y, -100.0]

marks = []
for i in range(MARKS):
    # A walked line, not a surveyed one: straight out along -Z with a lazy
    # weave, so the follow cursor has real corners to consume.
    z = camp[2] - SPACING_CM * (i + 1)
    x = 60.0 * math.sin(i * 0.7)
    marks.append([round(x, 1), GROUND_Y, round(z, 1)])

fixture = {
    "name": "camp-trail-demo",
    "campCm": camp,
    "marksCm": marks,
    "spacingCm": SPACING_CM,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(fixture, f, indent=2)
    f.write("\n")

print("wrote %s: camp + %d marks, %.0f cm spacing" % (os.path.normpath(OUT), MARKS, SPACING_CM))
