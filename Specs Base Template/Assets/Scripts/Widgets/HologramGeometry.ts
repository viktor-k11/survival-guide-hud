/**
 * HologramGeometry — populates the DESIGN-TIME blueprint stage groups under
 * `WorldRoot/HologramRoot` with low-poly wireframe geometry.
 *
 * Hard rule 1, read carefully: this script creates NO scene objects and NO
 * components. Every stage group (`HologramTent/S1..S5`, `HologramFire/S1..S4`)
 * and its RenderMeshVisual exist in the hierarchy at design time; this script
 * only POPULATES those existing visuals with mesh data, once, at start. The
 * materials stay whatever is wired in the Inspector (PH_Cyan / PH_Amber /
 * PH_PhosphorGreen / PH_Warning) — recolouring a stage is an Inspector edit,
 * never a code edit. All dimensions are @input for the same reason.
 *
 * Hard rule 2: the geometry is pure line work (MeshTopology.Lines). On the
 * additive waveguide thin bright strokes over nothing are exactly the
 * "blueprint hologram" read — there is nothing here that could darken.
 *
 * Hard rule 3: no logic. This script subscribes to nothing and decides
 * nothing; enabling/disabling stage groups belongs to whoever consumes the
 * `hologramStage` event. Geometry is built even while the objects are
 * disabled, so the first enable shows a finished blueprint.
 *
 * Stages are CUMULATIVE: S3 contains S1+S2's line work too, because stage
 * groups are mutually exclusive (enable one, disable the rest — SCENE-MAP.md).
 *
 * Local-space contract: each stage object must sit at local (0,0,0), scale 1.
 * Geometry encodes real centimetres, ground at local y=0, tent door facing +Z.
 */

/** Accumulates line segments, then bakes them into an existing RenderMeshVisual. */
class WireMesh {
  private verts: number[] = [];
  private indices: number[] = [];
  private count: number = 0;

  line(ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    this.verts.push(ax, ay, az, bx, by, bz);
    this.indices.push(this.count, this.count + 1);
    this.count += 2;
  }

  polyline(pts: number[][], closed: boolean): void {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      this.line(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
    if (closed && pts.length > 2) {
      const a = pts[pts.length - 1];
      const b = pts[0];
      this.line(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }

  /** Circle on the ground plane (XZ), centre (cx, cy, cz). */
  circle(cx: number, cy: number, cz: number, r: number, segments: number): void {
    const pts: number[][] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]);
    }
    this.polyline(pts, true);
  }

  /** Axis-aligned wireframe box: centre + full sizes. 12 edges. */
  wireBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const c = [
      [cx - x, cy - y, cz - z], [cx + x, cy - y, cz - z],
      [cx + x, cy - y, cz + z], [cx - x, cy - y, cz + z],
      [cx - x, cy + y, cz - z], [cx + x, cy + y, cz - z],
      [cx + x, cy + y, cz + z], [cx - x, cy + y, cz + z],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0], // bottom
      [4, 5], [5, 6], [6, 7], [7, 4], // top
      [0, 4], [1, 5], [2, 6], [3, 7], // verticals
    ];
    for (const e of edges) {
      const a = c[e[0]], b = c[e[1]];
      this.line(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  }

  /** Bake into an EXISTING RenderMeshVisual. Position-only layout: the PH_*
   *  materials are unlit base-colour, so normals/uvs/vertex colours would be
   *  dead weight. */
  apply(rmv: RenderMeshVisual): boolean {
    const builder = new MeshBuilder([{ name: "position", components: 3 }]);
    builder.topology = MeshTopology.Lines;
    builder.indexType = MeshIndexType.UInt16;
    builder.appendVerticesInterleaved(this.verts);
    builder.appendIndices(this.indices);
    if (!builder.isValid()) return false;
    rmv.mesh = builder.getMesh();
    builder.updateMesh();
    return true;
  }
}

@component
export class HologramGeometry extends BaseScriptComponent {
  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Tent stage groups (WorldRoot/HologramRoot/HologramTent)</span>')
  @input @hint("HologramTent/S1_Footprint") private tentS1: SceneObject;
  @input @hint("HologramTent/S2_Poles") private tentS2: SceneObject;
  @input @hint("HologramTent/S3_Canopy") private tentS3: SceneObject;
  @input @hint("HologramTent/S4_Stakes") private tentS4: SceneObject;
  @input @hint("HologramTent/S5_Complete") private tentS5: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Fire stage groups (WorldRoot/HologramRoot/HologramFire)</span>')
  @input @hint("HologramFire/S1_ClearedSpot") private fireS1: SceneObject;
  @input @hint("HologramFire/S2_Tinder") private fireS2: SceneObject;
  @input @hint("HologramFire/S3_LogCabin") private fireS3: SceneObject;
  @input @hint("HologramFire/S4_Flame") private fireS4: SceneObject;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Tent dimensions (cm) — DOME, crossed poles</span>')
  @ui.label('<span style="color: #94A3B8; font-size: 11px;">A dome pitched on two poles crossing corner-to-corner, per the assembly reference: footprint, poles crossed over it, body clipped up, fly with a vestibule, then pegged out. NOT an A-frame ridge tent.</span>')
  @input @widget(new SliderWidget(40, 200, 1)) @hint("Footprint width (X).") private tentWidth: number = 90;
  @input @widget(new SliderWidget(40, 240, 1)) @hint("Footprint depth (Z). Door faces +Z.") private tentDepth: number = 110;
  @input @widget(new SliderWidget(30, 160, 1)) @hint("Apex height where the two poles cross.") private tentHeight: number = 62;
  @input @widget(new SliderWidget(4, 40, 1)) @hint("How far outside the corners the stakes sit.") private stakeOffset: number = 16;

  @input
  @widget(new SliderWidget(6, 32, 1))
  @hint("Segments per pole arc. More = smoother dome, more line segments.")
  private poleSegments: number = 14;

  @input
  @widget(new SliderWidget(1, 5, 1))
  @hint("Horizontal body rings between ground and apex. These are what make the wireframe read as a DOME rather than as two loose arcs.")
  private bodyRings: number = 3;

  @input
  @widget(new SliderWidget(0, 90, 1))
  @hint("How far the fly's vestibule/porch reaches beyond the front edge (+Z). 0 = no vestibule.")
  private vestibuleDepth: number = 34;

  @input
  @widget(new SliderWidget(0.0, 0.6, 0.02))
  @hint("How far the poles bow OUTWARD from the straight corner-to-corner line, as a fraction of half-width. Real dome poles bow; 0 gives flat vertical arches.")
  private poleBow: number = 0.18;

  @ui.separator
  @ui.label('<span style="color: #7CFFB2;">Fire-lay dimensions (cm)</span>')
  @input @widget(new SliderWidget(15, 100, 1)) @hint("Cleared-spot radius.") private clearRadius: number = 40;
  @input @widget(new SliderWidget(3, 25, 1)) @hint("Tinder-bundle base radius.") private tinderRadius: number = 9;
  @input @widget(new SliderWidget(5, 40, 1)) @hint("Tinder-bundle apex height.") private tinderHeight: number = 14;
  @input @widget(new SliderWidget(10, 80, 1)) @hint("Log length in the cabin stack.") private logLength: number = 44;
  @input @widget(new SliderWidget(2, 12, 0.5)) @hint("Log thickness.") private logThickness: number = 5;
  @input @widget(new SliderWidget(10, 60, 1)) @hint("Flame outline height above the stack.") private flameHeight: number = 30;

  @ui.separator
  @input
  @widget(new SliderWidget(0.0, 3.0, 0.1))
  @hint("Lift of ground line work above y=0, to keep strokes off coplanar ground widgets.")
  private groundLift: number = 0.6;

  @input private enableLogging: boolean = false;

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.buildAll());
  }

  private buildAll(): void {
    // Tent — cumulative stages, in the order the reference assembles a DOME:
    //   1 footprint down · 2 poles crossed over it · 3 body clipped up ·
    //   4 fly + vestibule · 5 pegged out, door in.
    // The object names are the SCENE-MAP contract and do not move; S4 now
    // carries the fly (it used to carry the stakes) because that is the order
    // a dome actually goes up — you cannot peg a fly you have not draped.
    this.buildInto(this.tentS1, (m) => this.tentFootprint(m));
    this.buildInto(this.tentS2, (m) => { this.tentFootprint(m); this.tentPoles(m); });
    this.buildInto(this.tentS3, (m) => { this.tentFootprint(m); this.tentPoles(m); this.tentCanopy(m); });
    this.buildInto(this.tentS4, (m) => {
      this.tentFootprint(m); this.tentPoles(m); this.tentCanopy(m); this.tentFly(m);
    });
    this.buildInto(this.tentS5, (m) => {
      this.tentFootprint(m); this.tentPoles(m); this.tentCanopy(m); this.tentFly(m);
      this.tentStakes(m); this.tentDoor(m);
    });
    // Fire — cumulative stages.
    this.buildInto(this.fireS1, (m) => this.fireCleared(m));
    this.buildInto(this.fireS2, (m) => { this.fireCleared(m); this.fireTinder(m); });
    this.buildInto(this.fireS3, (m) => { this.fireCleared(m); this.fireTinder(m); this.fireLogCabin(m); });
    this.buildInto(this.fireS4, (m) => {
      this.fireCleared(m); this.fireTinder(m); this.fireLogCabin(m); this.fireFlame(m);
    });
  }

  private buildInto(obj: SceneObject, fill: (m: WireMesh) => void): void {
    if (!obj) return;
    const rmv = obj.getComponent("Component.RenderMeshVisual") as RenderMeshVisual;
    if (!rmv) {
      print("[HOLOGEO] no RenderMeshVisual on " + obj.name + " — stage left as authored");
      return;
    }
    const m = new WireMesh();
    fill(m);
    const ok = m.apply(rmv);
    if (this.enableLogging) print("[HOLOGEO] " + obj.name + (ok ? " populated" : " INVALID mesh, kept placeholder"));
  }

  // ---------------------------------------------------------------- tent ----

  /**
   * A point on a dome pole: an arc from corner A to corner B over the apex.
   *
   * `t` runs 0..1 along the pole. Height is a half-sine (0 at both corners,
   * `tentHeight` at the crossing point). The arc also BOWS outward from the
   * straight A-B line by `poleBow`, perpendicular in plan — real dome poles
   * bow, and without it the two arcs read as flat crossed hoops rather than a
   * dome.
   */
  private polePoint(ax: number, az: number, bx: number, bz: number, t: number): number[] {
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const y = this.groundLift + this.tentHeight * Math.sin(Math.PI * t);
    // Perpendicular to A->B in plan, scaled by a sine so the bow is zero at
    // the pegged corners and greatest at the apex.
    const dx = bx - ax, dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const bow = this.poleBow * (this.tentWidth / 2) * Math.sin(Math.PI * t);
    return [x + (-dz / len) * bow, y, z + (dx / len) * bow];
  }

  /** S1 — the footprint sheet on the ground: outline, diagonals, fold hints. */
  private tentFootprint(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2, g = this.groundLift;
    m.polyline([[-w, g, -d], [w, g, -d], [w, g, d], [-w, g, d]], true);
    // The diagonals are not decoration: they are the lines the two poles will
    // follow, so step 1 already shows where step 2 goes.
    m.line(-w, g, -d, w, g, d);
    m.line(w, g, -d, -w, g, d);
    // Corner tabs — where the pole ends and the pegs land.
    const tab = 7;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        m.line(sx * w, g, sz * d, sx * (w - tab), g, sz * d);
        m.line(sx * w, g, sz * d, sx * w, g, sz * (d - tab));
      }
    }
  }

  /** S2 — the two poles, crossed corner to corner over the footprint. */
  private tentPoles(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2;
    const segs = Math.max(4, Math.round(this.poleSegments));
    const corners: number[][] = [
      [-w, -d, w, d], // pole A: back-left -> front-right
      [w, -d, -w, d], // pole B: back-right -> front-left
    ];
    for (const c of corners) {
      const pts: number[][] = [];
      for (let i = 0; i <= segs; i++) {
        pts.push(this.polePoint(c[0], c[1], c[2], c[3], i / segs));
      }
      m.polyline(pts, false);
    }
  }

  /**
   * S3 — the inner tent clipped up onto the poles.
   *
   * Horizontal rings through the four points where the two arcs sit at the
   * same height. That is what turns two crossed arcs into a legible dome, and
   * it is the shape the reference shows standing before the fly goes on.
   */
  private tentCanopy(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2;
    const rings = Math.max(1, Math.round(this.bodyRings));
    for (let r = 1; r <= rings; r++) {
      // Ring r sits at parameter t along each pole, so all four points share a height.
      const t = (r / (rings + 1)) * 0.5;
      const a1 = this.polePoint(-w, -d, w, d, t);
      const a2 = this.polePoint(-w, -d, w, d, 1 - t);
      const b1 = this.polePoint(w, -d, -w, d, t);
      const b2 = this.polePoint(w, -d, -w, d, 1 - t);
      // Order them around the dome: back-left, back-right, front-right, front-left.
      m.polyline([a1, b1, a2, b2], true);
    }
  }

  /** S4 — the fly over the dome, with the vestibule reaching out at the door. */
  private tentFly(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2, g = this.groundLift;
    const segs = Math.max(4, Math.round(this.poleSegments));
    const v = this.vestibuleDepth;
    if (v <= 0) return;

    // Vestibule ridge: from the apex out and down to the ground ahead of the
    // door — the porch in step 5 of the reference.
    const apex = this.polePoint(-w, -d, w, d, 0.5);
    const nose = [0, g, d + v];
    const ridge: number[][] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      ridge.push([
        apex[0] + (nose[0] - apex[0]) * t,
        apex[1] + (nose[1] - apex[1]) * t + Math.sin(Math.PI * t) * this.tentHeight * 0.12,
        apex[2] + (nose[2] - apex[2]) * t,
      ]);
    }
    m.polyline(ridge, false);

    // Vestibule side seams, front corners out to the nose.
    for (const sx of [1, -1]) {
      m.line(sx * w, g, d, nose[0], nose[1], nose[2]);
      // and the fly hem along the ground at the front.
      m.line(sx * w, g, d, sx * w * 0.5, g, d + v * 0.45);
      m.line(sx * w * 0.5, g, d + v * 0.45, nose[0], nose[1], nose[2]);
    }
  }

  /** S5 — pegged out: angled stakes, guy lines, and the door. */
  private tentStakes(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2, g = this.groundLift;
    const o = this.stakeOffset;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const ax = sx * (w + o), az = sz * (d + o); // ground anchor
        // The peg leans AWAY from the tent at ~45°, as in the reference's
        // step 6/7 detail circles.
        m.line(ax + sx * 4, 11, az + sz * 4, ax, g, az);
        // Guy line from the pole's corner foot to the peg head.
        m.line(sx * w, g, sz * d, ax + sx * 4, 11, az + sz * 4);
        // Ground tick (small X) at the anchor.
        m.line(ax - 3, g, az - 3, ax + 3, g, az + 3);
        m.line(ax - 3, g, az + 3, ax + 3, g, az - 3);
      }
    }
  }

  /** S5 — the D-shaped door on the front face of the dome. */
  private tentDoor(m: WireMesh): void {
    const d = this.tentDepth / 2, h = this.tentHeight, g = this.groundLift;
    const segs = 10;
    const rx = this.tentWidth * 0.3, ry = h * 0.62;
    const z = d + (this.vestibuleDepth > 0 ? 1.5 : 0.8);
    // Half-ellipse door arch, hinged on the ground line.
    const pts: number[][] = [];
    for (let i = 0; i <= segs; i++) {
      const a = Math.PI * (i / segs);
      pts.push([Math.cos(a) * rx, g + Math.sin(a) * ry, z]);
    }
    m.polyline(pts, false);
    m.line(-rx, g, z, rx, g, z);
    // Zip pull down the middle.
    m.line(0, g + ry, z, 0, g + ry * 0.45, z);
  }

  // ---------------------------------------------------------------- fire ----

  /** S1 — cleared spot: two rings, radial ticks, centre cross. */
  private fireCleared(m: WireMesh): void {
    const r = this.clearRadius, g = this.groundLift;
    m.circle(0, g, 0, r, 28);
    m.circle(0, g, 0, r * 0.72, 20);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      m.line(Math.cos(a) * r * 0.72, g, Math.sin(a) * r * 0.72, Math.cos(a) * r, g, Math.sin(a) * r);
    }
    m.line(-4, g, 0, 4, g, 0);
    m.line(0, g, -4, 0, g, 4);
  }

  /** S2 — tinder bundle: teepee of slanted twigs over a base ring. */
  private fireTinder(m: WireMesh): void {
    const r = this.tinderRadius, h = this.tinderHeight, g = this.groundLift;
    m.circle(0, g, 0, r, 10);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      m.line(Math.cos(a) * r, g, Math.sin(a) * r, 0, h, 0);
    }
  }

  /** S3 — log-cabin stack: three alternating courses of wireframe logs. */
  private fireLogCabin(m: WireMesh): void {
    const L = this.logLength, t = this.logThickness, half = L * 0.32;
    for (let course = 0; course < 3; course++) {
      const y = (course + 0.5) * t;
      if (course % 2 === 0) {
        m.wireBox(0, y, -half, L, t, t); // along X
        m.wireBox(0, y, half, L, t, t);
      } else {
        m.wireBox(-half, y, 0, t, t, L); // along Z
        m.wireBox(half, y, 0, t, t, L);
      }
    }
  }

  /** S4 — lit flame: two crossed zig-zag outlines above the stack. */
  private fireFlame(m: WireMesh): void {
    const y0 = 3 * this.logThickness - 2; // just above the top course
    const f = this.flameHeight / 30; // outline authored at height 30
    const outline: number[][] = [
      [0, 0], [6, 6], [3, 12], [7, 18], [2, 24], [0, 30],
      [-2, 24], [-7, 18], [-3, 12], [-6, 6],
    ];
    const xy: number[][] = [], zy: number[][] = [];
    for (const p of outline) {
      xy.push([p[0] * f, y0 + p[1] * f, 0]);
      zy.push([0, y0 + p[1] * f, p[0] * f]);
    }
    m.polyline(xy, true);
    m.polyline(zy, true);
  }
}
