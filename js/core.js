// IRISH 2026 BUILT driver sim - core: units, field geometry from the IRISH game manual, terrain, colliders.
// World frame (metres): x along the field (0 = BLUE alliance wall, L = RED wall), z across (0..W), y up.
'use strict';
const IN = 0.0254, FT = 0.3048, GRAV = 9.81, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const wrapAng = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const randn = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// ---- FIELD (manual 3.2 - 3.8) ----
const FIELD = { L: 651.2 * IN, W: 317.7 * IN, guardH: 20.0 * IN, wallH: 78.8 * IN };
const CX = FIELD.L / 2, CZ = FIELD.W / 2;
// HUB (3.4, fig 3-5/3-6): 47 x 47 in, rim 72 in, hex opening 41.7 in across flats (flats face the alliances),
// divider on the CENTER LINE (top ~80.3 in, scaled from fig 3-6 in shooter/analysis/traj.js).
const HUB = { cx: CX, cz: CZ, half: 23.5 * IN, rim: 72 * IN, apothem: 20.85 * IN, boxTop: 56 * IN, dividerTop: 80.3 * IN, exitY: 14 * IN };
HUB.circ = HUB.apothem / Math.cos(Math.PI / 6);
// BUMP (3.5): 135 in wide (from the hub to the guardrail), 44.4 in deep, 6.513 in tall, ramps up to the CENTER LINE.
const BUMP = { z0: 0, z1: 135 * IN, halfDepth: 22.2 * IN, h: 6.513 * IN };
// TRENCH (3.6): from the hub to the other guardrail, 47 in deep, arm underside 22.25 in, 110.75 in clear between the posts.
const TRENCH = { z0: CZ + HUB.half, z1: FIELD.W, halfDepth: 23.5 * IN, armBottom: 22.25 * IN, armTop: 25.75 * IN, armHalf: 1.75 * IN, tall: 40.25 * IN };
TRENCH.post = ((TRENCH.z1 - TRENCH.z0) - 110.75 * IN) / 2;
// DEPOT (3.7): 48 x 30 in inside the 2 in tape, on each ALLIANCE WALL, centred.
const DEPOT = { w: 48 * IN, d: 30 * IN, tape: 2 * IN };
// ROBOT STARTING LINE: centred between the ALLIANCE WALL and the CENTER LINE. Tape is 2 in.
const START_X = { blue: CX / 2, red: FIELD.L - CX / 2 };
const TAPE = 2 * IN;
// FUEL (3.9): 5.91 in foam ball, 0.448-0.500 lb.
const FUEL = { r: 5.91 * IN / 2, m: 0.215, cd: 0.5, cl: 0.15 };
FUEL.k = 0.5 * 1.2 * Math.PI * FUEL.r * FUEL.r / FUEL.m;

// ---- MATCH (4.4, table 6-2 / 6-3) ----
// t = seconds since the start of AUTO. 'normal' = each alliance scores on its own side of the HUB from its own half.
const MATCH = {
  auto: 20, delay: 3, teleop: 140, grace: 3,
  periods: [
    { name: 'AUTO', t0: 0, t1: 20, swap: false },
    { name: 'AUTO SCORING', t0: 20, t1: 23, swap: false, disabled: true },
    { name: 'TRANSITION SHIFT', t0: 23, t1: 33, swap: true },
    { name: 'SHIFT 1', t0: 33, t1: 58, swap: false },
    { name: 'SHIFT 2', t0: 58, t1: 83, swap: true },
    { name: 'SHIFT 3', t0: 83, t1: 108, swap: false },
    { name: 'SHIFT 4', t0: 108, t1: 133, swap: true },
    { name: 'END GAME', t0: 133, t1: 163, swap: false },
  ],
  end: 163,
};
// point values (table 6-4)
const POINTS = { fuelAuto: 4, fuelTele: 2, leave: 3, park: 2, minor: 2, major: 6 };

// ---- terrain ----
function terrainH(x, z) {
  if (z < BUMP.z1 && z > BUMP.z0) { const d = Math.abs(x - CX); if (d < BUMP.halfDepth) return BUMP.h * (1 - d / BUMP.halfDepth); }
  return 0;
}
function terrainSlopeX(x, z) {
  if (z < BUMP.z1 && z > BUMP.z0) { const d = x - CX; if (Math.abs(d) < BUMP.halfDepth) return -Math.sign(d) * BUMP.h / BUMP.halfDepth; }
  return 0;
}
const onBump = (x, z) => z < BUMP.z1 + 0.05 && Math.abs(x - CX) < BUMP.halfDepth + 0.05;

// ---- static colliders ----
// 2D boxes that stop robots (x0,x1,z0,z1)
const ROBOT_BLOCKS = [
  { name: 'HUB', x0: CX - HUB.half, x1: CX + HUB.half, z0: CZ - HUB.half, z1: CZ + HUB.half },
  { name: 'TRENCH post (hub side)', x0: CX - TRENCH.halfDepth, x1: CX + TRENCH.halfDepth, z0: TRENCH.z0, z1: TRENCH.z0 + TRENCH.post },
  { name: 'TRENCH post (rail side)', x0: CX - TRENCH.halfDepth, x1: CX + TRENCH.halfDepth, z0: TRENCH.z1 - TRENCH.post, z1: TRENCH.z1 },
  { name: 'wall', x0: -2, x1: 0, z0: -2, z1: FIELD.W + 2 },
  { name: 'wall', x0: FIELD.L, x1: FIELD.L + 2, z0: -2, z1: FIELD.W + 2 },
  { name: 'rail', x0: -2, x1: FIELD.L + 2, z0: -2, z1: 0 },
  { name: 'rail', x0: -2, x1: FIELD.L + 2, z0: FIELD.W, z1: FIELD.W + 2 },
];
// 3D boxes FUEL bounce off (x0,x1,y0,y1,z0,z1)
const FUEL_BOXES = [
  { x0: CX - HUB.half, x1: CX + HUB.half, y0: 0, y1: HUB.boxTop, z0: CZ - HUB.half, z1: CZ + HUB.half },
  { x0: CX - TRENCH.armHalf, x1: CX + TRENCH.armHalf, y0: TRENCH.armBottom, y1: TRENCH.armTop, z0: TRENCH.z0, z1: TRENCH.z1 },
  { x0: CX - TRENCH.armHalf, x1: CX + TRENCH.armHalf, y0: 0, y1: TRENCH.tall, z0: TRENCH.z0, z1: TRENCH.z0 + 3.5 * IN },
  { x0: CX - TRENCH.armHalf, x1: CX + TRENCH.armHalf, y0: 0, y1: TRENCH.armTop, z0: TRENCH.z1 - 3.5 * IN, z1: TRENCH.z1 },
  { x0: CX - TRENCH.halfDepth, x1: CX + TRENCH.halfDepth, y0: 0, y1: 1.5 * IN, z0: TRENCH.z0, z1: TRENCH.z0 + TRENCH.post },
  { x0: CX - TRENCH.halfDepth, x1: CX + TRENCH.halfDepth, y0: 0, y1: 1.5 * IN, z0: TRENCH.z1 - TRENCH.post, z1: TRENCH.z1 },
];

// hexagon test for the HUB opening: flats face +-x, vertices at +-z. Returns signed distance (negative inside).
function hexDist(x, z) {
  const dx = Math.abs(x - HUB.cx), dz = Math.abs(z - HUB.cz);
  // normals of the 3 distinct edges for a hex with flats on +-x: (1,0), (cos60, sin60)
  return Math.max(dx, dx * 0.5 + dz * Math.sqrt(3) / 2) - HUB.apothem;
}

// ---- 2D oriented boxes ----
// box: {cx, cz, fx, fz (unit forward), hl (half length along f), hw (half width)}
function obbCorners(b) {
  const rx = -b.fz, rz = b.fx; const out = [];
  for (const [a, c] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) out.push([b.cx + b.fx * b.hl * a + rx * b.hw * c, b.cz + b.fz * b.hl * a + rz * b.hw * c]);
  return out;
}
function aabbAsObb(s) { return { cx: (s.x0 + s.x1) / 2, cz: (s.z0 + s.z1) / 2, fx: 1, fz: 0, hl: (s.x1 - s.x0) / 2, hw: (s.z1 - s.z0) / 2 }; }
// SAT. Returns null or {nx, nz (from a to b), depth, px, pz (contact point)}
function obbOverlap(a, b) {
  const axes = [[a.fx, a.fz], [-a.fz, a.fx], [b.fx, b.fz], [-b.fz, b.fx]];
  const dx = b.cx - a.cx, dz = b.cz - a.cz; let best = null;
  for (const [ax, az] of axes) {
    const ra = a.hl * Math.abs(a.fx * ax + a.fz * az) + a.hw * Math.abs(-a.fz * ax + a.fx * az);
    const rb = b.hl * Math.abs(b.fx * ax + b.fz * az) + b.hw * Math.abs(-b.fz * ax + b.fx * az);
    const d = dx * ax + dz * az; const o = ra + rb - Math.abs(d);
    if (o <= 0) return null;
    if (!best || o < best.depth) best = { nx: d >= 0 ? ax : -ax, nz: d >= 0 ? az : -az, depth: o };
  }
  // contact point: average of corners of each box that lie inside the other
  const inside = (p, q) => { const lx = p[0] - q.cx, lz = p[1] - q.cz; return Math.abs(lx * q.fx + lz * q.fz) <= q.hl + 1e-4 && Math.abs(-lx * q.fz + lz * q.fx) <= q.hw + 1e-4; };
  const pts = obbCorners(a).filter(p => inside(p, b)).concat(obbCorners(b).filter(p => inside(p, a)));
  if (pts.length) { best.px = pts.reduce((s, p) => s + p[0], 0) / pts.length; best.pz = pts.reduce((s, p) => s + p[1], 0) / pts.length; }
  else { best.px = (a.cx + b.cx) / 2; best.pz = (a.cz + b.cz) / 2; }
  return best;
}
function pointInObb(px, pz, b, pad = 0) {
  const lx = px - b.cx, lz = pz - b.cz;
  return Math.abs(lx * b.fx + lz * b.fz) <= b.hl + pad && Math.abs(-lx * b.fz + lz * b.fx) <= b.hw + pad;
}
// does the OBB touch the vertical projection of an x-strip [x0,x1] (a taped line across the field)?
function obbTouchesXStrip(b, x0, x1) {
  const xs = obbCorners(b).map(p => p[0]); return Math.max(...xs) >= x0 && Math.min(...xs) <= x1;
}
function obbXRange(b) { const xs = obbCorners(b).map(p => p[0]); return [Math.min(...xs), Math.max(...xs)]; }

// ---- FUEL ballistics (same model as shooter/analysis/traj.js: Cd 0.50, backspin lift CL 0.15) ----
// Solve the exit speed that lands a shot from (h0) at horizontal distance d (to HUB centre) at angle a (rad).
function shotVerdict(d, h0, a, v0, CL = FUEL.cl) {
  let x = 0, z = h0, vx = v0 * Math.cos(a), vz = v0 * Math.sin(a); const k = FUEL.k, dt = 0.001;
  const rimX = d - HUB.apothem;
  for (let t = 0; t < 5; t += dt) {
    const v = Math.hypot(vx, vz);
    const ax = -k * FUEL.cd * v * vx - k * CL * v * vz, az = -GRAV - k * FUEL.cd * v * vz + k * CL * v * vx;
    vx += ax * dt; vz += az * dt; x += vx * dt; z += vz * dt;
    if (Math.hypot(x - rimX, z - HUB.rim) < FUEL.r) return 'rim';
    if (z < HUB.rim && x + FUEL.r >= d - HUB.half && x < rimX) return 'wall';
    if (x >= d - FUEL.r) return z < HUB.dividerTop ? 'in' : 'over';
    if (vz < 0 && z <= HUB.rim) return x > rimX ? 'in' : 'short';
  }
  return 'short';
}
function solveShot(d, h0, a, lo = 2, hi = 20) {
  let first = null, last = null;
  for (let v = lo; v <= hi; v += 0.02) { const r = shotVerdict(d, h0, a, v); if (r === 'in') { if (first === null) first = v; last = v; } else if (first !== null) break; }
  return first === null ? null : { v: (first + last) / 2, lo: first, hi: last };
}
