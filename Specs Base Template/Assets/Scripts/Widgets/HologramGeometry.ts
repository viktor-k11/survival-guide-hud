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
  @ui.label('<span style="color: #7CFFB2;">Tent dimensions (cm)</span>')
  @input @widget(new SliderWidget(40, 200, 1)) @hint("Footprint width (X).") private tentWidth: number = 90;
  @input @widget(new SliderWidget(40, 240, 1)) @hint("Footprint depth (Z). Door faces +Z.") private tentDepth: number = 110;
  @input @widget(new SliderWidget(30, 160, 1)) @hint("Ridge height.") private tentHeight: number = 62;
  @input @widget(new SliderWidget(4, 40, 1)) @hint("How far outside the corners the stakes sit.") private stakeOffset: number = 16;

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
    // Tent — cumulative stages.
    this.buildInto(this.tentS1, (m) => this.tentFootprint(m));
    this.buildInto(this.tentS2, (m) => { this.tentFootprint(m); this.tentPoles(m); });
    this.buildInto(this.tentS3, (m) => { this.tentFootprint(m); this.tentPoles(m); this.tentCanopy(m); });
    this.buildInto(this.tentS4, (m) => { this.tentFootprint(m); this.tentPoles(m); this.tentCanopy(m); this.tentStakes(m); });
    this.buildInto(this.tentS5, (m) => {
      this.tentFootprint(m); this.tentPoles(m); this.tentCanopy(m); this.tentStakes(m); this.tentDoor(m);
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

  /** S1 — ground footprint: rect, diagonals, dashed ridge hint. */
  private tentFootprint(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2, g = this.groundLift;
    m.polyline([[-w, g, -d], [w, g, -d], [w, g, d], [-w, g, d]], true);
    m.line(-w, g, -d, w, g, d);
    m.line(w, g, -d, -w, g, d);
    // Dashed centre line marks the future ridge orientation.
    const dashes = 6;
    for (let i = 0; i < dashes; i++) {
      const t0 = i / dashes, t1 = t0 + 0.6 / dashes;
      m.line(0, g, -d + this.tentDepth * t0, 0, g, -d + this.tentDepth * t1);
    }
  }

  /** S2 — A-frame pole set: two A ends, ridge, crossbars. */
  private tentPoles(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2, h = this.tentHeight, g = this.groundLift;
    for (const s of [1, -1]) {
      const z = d * s;
      m.line(0, h, z, -w, g, z); // A legs
      m.line(0, h, z, w, g, z);
      const t = 0.55; // crossbar at 45% height
      m.line(-w * t, h * (1 - t), z, w * t, h * (1 - t), z);
    }
    m.line(0, h, d, 0, h, -d); // ridge
  }

  /** S3 — canopy: fabric panel lines over the frame. */
  private tentCanopy(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2, h = this.tentHeight;
    for (const t of [1 / 3, 2 / 3]) {
      const y = h * (1 - t);
      // Slope panel seams, ridge-parallel, both sides.
      m.line(-w * t, y, -d, -w * t, y, d);
      m.line(w * t, y, -d, w * t, y, d);
      // Rear wall panel seams close the back face.
      m.line(-w * t, y, -d, w * t, y, -d);
    }
  }

  /** S4 — staking out: four stakes with guy lines and ground ticks. */
  private tentStakes(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2, h = this.tentHeight, g = this.groundLift;
    const o = this.stakeOffset;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const ax = sx * (w + o), az = sz * (d + o); // ground anchor
        m.line(ax + sx * 3, 10, az + sz * 3, ax, g, az); // stake, leaning away
        // Guy line from mid-slope edge to stake head.
        m.line(sx * w * 0.5, h * 0.5, sz * d, ax + sx * 3, 10, az + sz * 3);
        // Ground tick (small X) at the anchor.
        m.line(ax - 3, g, az - 3, ax + 3, g, az + 3);
        m.line(ax - 3, g, az + 3, ax + 3, g, az - 3);
      }
    }
  }

  /** S5 — finished: door V, zipper, ridge pennant. */
  private tentDoor(m: WireMesh): void {
    const w = this.tentWidth / 2, d = this.tentDepth / 2, h = this.tentHeight, g = this.groundLift;
    m.line(0, h * 0.8, d, -w * 0.35, g, d); // door V
    m.line(0, h * 0.8, d, w * 0.35, g, d);
    m.line(0, h * 0.8, d, 0, h * 0.42, d); // zipper
    // Pennant on the front ridge end.
    m.line(0, h, d, 0, h + 9, d);
    m.polyline([[0, h + 9, d], [7, h + 7, d], [0, h + 5, d]], true);
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
