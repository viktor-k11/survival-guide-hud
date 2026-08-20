#!/usr/bin/env python3
"""
Generates the stored terrain point clouds in Assets/Survey/fixtures/.

WHY THESE EXIST
---------------
The Lens Studio Preview cannot feed a survey. Its Interactive simulation scenes
do give World Query real surfaces (Colorful Home returns room geometry: walls
with sideways normals and floor at several heights), but the simulated device
camera is pinned at the origin and only about five depth taps resolve per pose,
so the live cloud tops out at a handful of points however long the survey runs.
Measured 2026-08-20: Sunlit Outdoor = 3 distinct points, Colorful Home = 6.

A tent needs a 2.5 m footprint covered to 60% at 25 cm resolution — roughly 60
cells. That is never going to come out of the Preview. So the terrain itself
becomes a fixture, exactly like the Gemini responses (hard rule 5): the survey
can be driven from a stored cloud with no World Query in the loop at all, which
makes the markers, labels and the distance guard testable and demo-safe.

Units are CENTIMETRES, matching the Lens runtime. Ground sits at y = -173 cm,
which is the floor height the Preview's own simulated ground reports.

    python3 Tools/make-survey-fixtures.py

Deterministic: no randomness, so regenerating gives byte-identical files.
"""
import json
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "Assets", "Survey", "fixtures")
GROUND_Y = -173.0


def wobble(x, z, amp):
    """Deterministic pseudo-noise. Not random: the fixture must not drift."""
    return amp * math.sin(x * 0.021 + z * 0.013) * math.cos(x * 0.007 - z * 0.019)


def flat_patch(x0, x1, z0, z1, step, amp):
    """Up-facing ground points over a rectangle, with a little height wobble."""
    pts = []
    x = x0
    while x <= x1:
        z = z0
        while z <= z1:
            y = GROUND_Y + wobble(x, z, amp)
            # Normal tilts with the local slope so flatness scoring sees the
            # wobble in BOTH of its terms, not just the height spread.
            nx = -wobble(x + step, z, amp) + wobble(x - step, z, amp)
            nz = -wobble(x, z + step, amp) + wobble(x, z - step, amp)
            n = normalise(nx / (2 * step), 1.0, nz / (2 * step))
            pts.append([r(x), r(y), r(z), r4(n[0]), r4(n[1]), r4(n[2])])
            z += step
        x += step
    return pts


def rock_ring(cx, cz, inner, outer, step, height):
    """A rubble berm: steep, broken ground the selector must refuse."""
    pts = []
    x = cx - outer
    while x <= cx + outer:
        z = cz - outer
        while z <= cz + outer:
            d = math.hypot(x - cx, z - cz)
            if inner <= d <= outer:
                t = (d - inner) / max(1e-6, outer - inner)
                y = GROUND_Y + height * math.sin(t * math.pi) + wobble(x, z, 18.0)
                # Facets pointing every which way — nothing here is a campsite.
                n = normalise(math.sin(x * 0.05), 0.35, math.cos(z * 0.05))
                pts.append([r(x), r(y), r(z), r4(n[0]), r4(n[1]), r4(n[2])])
            z += step
        x += step
    return pts


def normalise(x, y, z):
    m = math.sqrt(x * x + y * y + z * z) or 1.0
    return (x / m, y / m, z / m)


def r(v):
    return round(v, 1)


def r4(v):
    return round(v, 4)


def write(name, note, points):
    path = os.path.join(OUT, name)
    payload = {
        "name": name.replace(".json", ""),
        "note": note,
        "unit": "cm",
        "groundY": GROUND_Y,
        "pointCount": len(points),
        "format": "[x, y, z, nx, ny, nz]",
        "points": points,
    }
    with open(path, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
        f.write("\n")
    print("%-34s %5d points  %6.1f KB" % (name, len(points), os.path.getsize(path) / 1024.0))


def main():
    os.makedirs(OUT, exist_ok=True)

    # 1. An open clearing AHEAD OF THE USER. Ground only where a survey would
    #    actually have collected it: the swept arc in front, roughly 1.2 m to
    #    7 m out. A cloud that wraps all the way around the user is not a
    #    survey — it is a map — and it puts suggested sites behind their head.
    write(
        "survey-open-clearing.json",
        "6.4 x 6.4 m clearing in the arc ahead of the user (-Z is forward), "
        "gentle undulation. The good case: two tent sites and a fire site that "
        "satisfies the 3 m constraint.",
        flat_patch(-320, 320, -760, -120, 25, 1.2),
    )

    # 2. A clearing barely wider than one tent, ringed by rubble. The fire
    #    CANNOT get 3 m from the tent, so distanceWarning must fire and the
    #    fire must still be placed.
    pts = flat_patch(-160, 160, -440, -120, 25, 1.0)
    pts += rock_ring(0, -280, 210, 330, 30, 55.0)
    write(
        "survey-cramped-camp.json",
        "3.2 x 3.2 m clearing ringed by rubble. The constraint case: no fire "
        "site can clear the tent by 3 m, so the fire is placed anyway and "
        "distanceWarning is raised.",
        pts,
    )


if __name__ == "__main__":
    main()
