#!/usr/bin/env node
/**
 * make-prop-meshes.js — authored, untextured, single-material training props.
 *
 * Why authored geometry and not the AI backends: the props must be FLAT-SHADED,
 * UNTEXTURED, ONE MATERIAL SLOT each, because the visual pass recolours them to
 * a single flat emissive hue in the Inspector. SPECS text-to-3D and FAST3D both
 * bake colour into textures on every output — the read would be lost the moment
 * the texture is dropped, and dropping it is the whole plan. So the read lives
 * in the GEOMETRY: silhouette and facet edges, authored on purpose.
 *
 * Deterministic (fixed seeds) — rerunning produces byte-identical files, same
 * contract as Tools/make-survey-fixtures.py.
 *
 * Output (glTF metres; Lens Studio imports at 100x → cm):
 *   Assets/GeneratedMeshes/FirewoodLog.glb     ~45 cm long, X is the long axis
 *   Assets/GeneratedMeshes/KindlingBundle.glb  ~25 cm tall bundle, Y up
 *   Assets/GeneratedMeshes/TentStake.glb       ~20 cm tall peg, Y up
 *
 * Every mesh: one primitive, one material (flat base colour, no textures),
 * per-face normals (flat shading), min-Y = 0 (rests on the ground).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "Assets", "GeneratedMeshes");

// ------------------------------------------------------------------ helpers

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class FlatMesh {
  constructor() { this.pos = []; this.nrm = []; this.idx = []; }
  /** One flat-shaded triangle; the face normal is shared by its three verts. */
  tri(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    const base = this.pos.length / 3;
    for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(nx, ny, nz); }
    this.idx.push(base, base + 1, base + 2);
  }
  /** Quad a-b-c-d (counter-clockwise seen from outside). */
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  /** Triangle fan cap over a ring of points, facing `flip ? -normal : normal`. */
  cap(ring, flip) {
    for (let i = 1; i < ring.length - 1; i++) {
      if (flip) this.tri(ring[0], ring[i + 1], ring[i]);
      else this.tri(ring[0], ring[i], ring[i + 1]);
    }
  }
  groundToY0() {
    let minY = Infinity;
    for (let i = 1; i < this.pos.length; i += 3) minY = Math.min(minY, this.pos[i]);
    for (let i = 1; i < this.pos.length; i += 3) this.pos[i] -= minY;
  }
}

/** Ring of `sides` points around an axis frame. axisFn(i) -> [x,y,z]. */
function ringAround(center, uAxis, vAxis, radiusFn, sides, phase) {
  const out = [];
  for (let i = 0; i < sides; i++) {
    const t = phase + (i / sides) * Math.PI * 2;
    const r = radiusFn(i);
    out.push([
      center[0] + uAxis[0] * Math.cos(t) * r + vAxis[0] * Math.sin(t) * r,
      center[1] + uAxis[1] * Math.cos(t) * r + vAxis[1] * Math.sin(t) * r,
      center[2] + uAxis[2] * Math.cos(t) * r + vAxis[2] * Math.sin(t) * r,
    ]);
  }
  return out;
}

/** Skin quads between two equal-length rings. */
function tube(mesh, ringA, ringB) {
  const n = ringA.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    mesh.quad(ringA[i], ringA[j], ringB[j], ringB[i]);
  }
}

// ------------------------------------------------------- GLB writer (2.0)

function writeGlb(file, mesh, name, baseColor) {
  const pos = new Float32Array(mesh.pos);
  const nrm = new Float32Array(mesh.nrm);
  const idx = new Uint16Array(mesh.idx);

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
  }

  const pad4 = (n) => (n + 3) & ~3;
  const posBytes = pos.byteLength, nrmBytes = nrm.byteLength, idxBytes = pad4(idx.byteLength);
  const bin = Buffer.alloc(posBytes + nrmBytes + idxBytes);
  Buffer.from(pos.buffer).copy(bin, 0);
  Buffer.from(nrm.buffer).copy(bin, posBytes);
  Buffer.from(idx.buffer).copy(bin, posBytes + nrmBytes);

  const json = {
    asset: { version: "2.0", generator: "clad make-prop-meshes (authored, deterministic)" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: name }],
    meshes: [{ name: "geometry_0", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{
      name: name + "_Flat",
      pbrMetallicRoughness: { baseColorFactor: baseColor, metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: false,
    }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: nrmBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes + nrmBytes, byteLength: idx.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min: min, max: max },
      { bufferView: 1, componentType: 5126, count: nrm.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: idx.length, type: "SCALAR" },
    ],
  };

  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = pad4(jsonBuf.length) - jsonBuf.length;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const total = 12 + 8 + jsonBuf.length + 8 + bin.length;
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(0x46546c67, o); o += 4;          // glTF
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(jsonBuf.length, o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o); o += 4;          // JSON
  jsonBuf.copy(out, o); o += jsonBuf.length;
  out.writeUInt32LE(bin.length, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4;          // BIN
  bin.copy(out, o);
  fs.writeFileSync(file, out);
  console.log(`wrote ${path.basename(file)}  tris=${idx.length / 3}  verts=${pos.length / 3}  bytes=${total}`);
}

// ------------------------------------------------------------- 1. the log
// X is the long axis — the snap orientation the stacking step needs. Octagonal
// section with seeded per-vertex radius jitter (bark facets), a slight taper,
// inset end faces (the "cut" reads at grazing angles), and one branch stub for
// an unmistakable silhouette.

function buildLog() {
  const m = new FlatMesh();
  const rnd = mulberry32(1101);
  const LEN = 0.45, R0 = 0.105, R1 = 0.095, SIDES = 8, SEGS = 4;
  const U = [0, 1, 0], V = [0, 0, 1]; // section plane is YZ; axis is X

  const rings = [];
  for (let s = 0; s <= SEGS; s++) {
    const x = -LEN / 2 + (s / SEGS) * LEN;
    const rBase = R0 + (R1 - R0) * (s / SEGS);
    const jitter = [];
    for (let i = 0; i < SIDES; i++) jitter.push(1 + (rnd() - 0.5) * 0.16);
    rings.push(ringAround([x, 0, 0], U, V, (i) => rBase * jitter[i], SIDES, rnd() * 0.2));
  }
  for (let s = 0; s < SEGS; s++) tube(m, rings[s], rings[s + 1]);

  // Inset end faces: outer ring -> smaller inner ring pushed 1.5 cm inward,
  // then a flat cap. The step edge is what reads as a chopped face.
  for (const [ring, xDir] of [[rings[0], -1], [rings[SEGS], +1]]) {
    const cx = ring[0][0];
    const inner = ring.map((p) => [cx - xDir * 0.015, p[1] * 0.62, p[2] * 0.62]);
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (xDir > 0) m.quad(ring[i], ring[j], inner[j], inner[i]);
      else m.quad(ring[j], ring[i], inner[i], inner[j]);
    }
    m.cap(inner, xDir < 0);
  }

  // Branch stub: a 5-sided tapered prism angled up-and-back from the top.
  const sb = [0.08, 0.085, 0.02], st = [0.13, 0.185, 0.055]; // base/tip centers
  const axis = [st[0] - sb[0], st[1] - sb[1], st[2] - sb[2]];
  const aLen = Math.hypot(...axis); const aN = axis.map((c) => c / aLen);
  let u = [1, 0, 0];
  if (Math.abs(aN[0]) > 0.9) u = [0, 0, 1];
  const w = [aN[1] * u[2] - aN[2] * u[1], aN[2] * u[0] - aN[0] * u[2], aN[0] * u[1] - aN[1] * u[0]];
  const wl = Math.hypot(...w); const wN = w.map((c) => c / wl);
  const uN = [wN[1] * aN[2] - wN[2] * aN[1], wN[2] * aN[0] - wN[0] * aN[2], wN[0] * aN[1] - wN[1] * aN[0]];
  const ringB = ringAround(sb, uN, wN, () => 0.032, 5, 0.3);
  const ringT = ringAround(st, uN, wN, () => 0.02, 5, 0.3);
  tube(m, ringB, ringT);
  m.cap(ringT, false);

  m.groundToY0();
  return m;
}

// -------------------------------------------------------- 2. the kindling
// Seven thin hexagonal sticks, splayed outward top and bottom, cinched by an
// octagonal cord band at the waist. The splay is the silhouette.

function buildKindling() {
  const m = new FlatMesh();
  const rnd = mulberry32(2202);
  const H = 0.24, STICK_R = 0.014;

  const sticks = [[0, 0, 0]];
  for (let i = 0; i < 6; i++) {
    const t = (i / 6) * Math.PI * 2;
    sticks.push([Math.cos(t) * 0.036, 0, Math.sin(t) * 0.036]);
  }

  for (const [sx, , sz] of sticks) {
    // Lean each stick away from the bundle centre; both ends splay.
    const lean = 0.20 + rnd() * 0.35; // radians-ish tilt factor
    const dirX = sx === 0 && sz === 0 ? (rnd() - 0.5) * 0.2 : sx * 9;
    const dirZ = sx === 0 && sz === 0 ? (rnd() - 0.5) * 0.2 : sz * 9;
    const bot = [sx - dirX * lean * 0.06, 0.0, sz - dirZ * lean * 0.06];
    const top = [sx + dirX * lean * 0.06, H, sz + dirZ * lean * 0.06];
    const axis = [top[0] - bot[0], top[1] - bot[1], top[2] - bot[2]];
    const aLen = Math.hypot(...axis); const aN = axis.map((c) => c / aLen);
    let u = [1, 0, 0];
    const w0 = [aN[1] * u[2] - aN[2] * u[1], aN[2] * u[0] - aN[0] * u[2], aN[0] * u[1] - aN[1] * u[0]];
    const wl = Math.hypot(...w0); const wN = w0.map((c) => c / wl);
    const uN = [wN[1] * aN[2] - wN[2] * aN[1], wN[2] * aN[0] - wN[0] * aN[2], wN[0] * aN[1] - wN[1] * aN[0]];
    const phase = rnd() * Math.PI;
    const rB = STICK_R * (0.85 + rnd() * 0.3), rT = STICK_R * (0.85 + rnd() * 0.3);
    const ringB = ringAround(bot, uN, wN, () => rB, 6, phase);
    const ringT = ringAround(top, uN, wN, () => rT, 6, phase);
    tube(m, ringB, ringT);
    m.cap(ringB, true);
    m.cap(ringT, false);
  }

  // Cord band: short octagonal sleeve at the waist, wider than the bundle.
  const bandB = ringAround([0, H * 0.46, 0], [1, 0, 0], [0, 0, 1], () => 0.055, 8, 0.15);
  const bandT = ringAround([0, H * 0.58, 0], [1, 0, 0], [0, 0, 1], () => 0.055, 8, 0.15);
  tube(m, bandB, bandT);
  m.cap(bandB, true);
  m.cap(bandT, false);

  m.groundToY0();
  return m;
}

// ----------------------------------------------------------- 3. the stake
// Classic peg: wide flat hexagonal head, faceted square shaft, pyramid tip.
// Point-down, head-up; min-Y is the tip resting on the ground.

function buildStake() {
  const m = new FlatMesh();
  const TIP_Y = 0.0, SHAFT_Y0 = 0.05, SHAFT_Y1 = 0.155, HEAD_Y0 = 0.155, HEAD_Y1 = 0.185;
  const SHAFT_R = 0.017, HEAD_R = 0.045;
  const U = [1, 0, 0], V = [0, 0, 1];

  const shaftB = ringAround([0, SHAFT_Y0, 0], U, V, () => SHAFT_R, 4, Math.PI / 4);
  const shaftT = ringAround([0, SHAFT_Y1, 0], U, V, () => SHAFT_R, 4, Math.PI / 4);
  tube(m, shaftB, shaftT);

  // Tip: pyramid from the shaft base down to a point.
  const tip = [0, TIP_Y, 0];
  for (let i = 0; i < shaftB.length; i++) {
    const j = (i + 1) % shaftB.length;
    m.tri(shaftB[j], shaftB[i], tip);
  }

  // Head: hexagonal puck with a chamfered underside overhang.
  const headB = ringAround([0, HEAD_Y0, 0], U, V, () => HEAD_R * 0.7, 6, 0.1);
  const headM = ringAround([0, HEAD_Y0 + 0.008, 0], U, V, () => HEAD_R, 6, 0.1);
  const headT = ringAround([0, HEAD_Y1, 0], U, V, () => HEAD_R * 0.92, 6, 0.1);
  tube(m, headB, headM);
  tube(m, headM, headT);
  m.cap(headB, true);
  m.cap(headT, false);

  m.groundToY0();
  return m;
}

// -------------------------------------------------------------------- main

fs.mkdirSync(OUT_DIR, { recursive: true });
writeGlb(path.join(OUT_DIR, "FirewoodLog.glb"), buildLog(), "FirewoodLog", [0.72, 0.45, 0.20, 1]);
writeGlb(path.join(OUT_DIR, "KindlingBundle.glb"), buildKindling(), "KindlingBundle", [0.85, 0.65, 0.30, 1]);
writeGlb(path.join(OUT_DIR, "TentStake.glb"), buildStake(), "TentStake", [1.0, 0.45, 0.05, 1]);
console.log("done — untextured, one material slot each, flat-shaded, min-Y=0");
