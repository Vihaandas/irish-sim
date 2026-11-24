// Robots: the team's IRISH Rev F robot (numbers from the CAD + robot/analysis) and generic AI robots.
'use strict';

// ---------- the team robot: every number here comes from the CAD or the team's analysis files ----------
const LB = 0.4536;
const IRISH = {
  name: 'IRISH Rev F',
  // robot/analysis/weight.js (Rev F): 103.8 lb CAD + 2.5 wire + 13.2 battery + 12.4 bumpers
  massLb: 106.1 + 13.2 + 12.4,     // analysis/weight.json, wood revision 2026-11-23: robot + battery + bumpers
  // bumper outline from the CAD bumpers (BP-*), robot frame inches: X +-18.75, Y -3.23..35.56
  bumper: { x: 18.75, y0: -3.231, y1: 35.56, zTop: 7.5 },
  frame: { L: 32.31, W: 31.0 },
  topIn: 21.5,                       // deployed top 21.5 in (backstop), under the 22.25 in TRENCH arm
  // drivetrain: AndyMark AM14U5, 4 CIM, Toughbox Mini. The CAD gearbox is 14T:50T then 16T:48T = 10.71:1 (not 8.45:1),
  // 6 in HiGrip: 13.0 ft/s free; AndyMark's user guide quotes 10.0 ft/s loaded for this exact setup.
  // cv / scrub are calibrated by tools/drive_test.js (see README: drive calibration).
  drive: { motorsPerSide: 2, Ts: 2.41, Is: 131, wf: 5310 * 2 * Math.PI / 60, G: 10.71, r: 3 * IN, track: 26.6 * IN, wheelbase: 25.1 * IN, Ilim: 40, eff: 0.85, mu: 1.05,
    cv: 24, scrub: 0.40, slipSat: 0.30, ramp: 0.15, Rbat: 0.018 },
  // intake: team 22 in module on IN-70 pivot arms, pivot (Y 31.0, Z 8.8), folds 132.5 deg (CAD), deploy NEO + MAXPlanetary 25:1
  intake: { pivotY: 31.0, pivotZ: 8.8, stowDeg: 132.5, tipY: 44.19, deployTime: 0.35, transit: 0.47, minApproach: 0.76, slowCaptureRate: 3.0 },
  // passive ramp hopper (analysis/sim_hopper.js): 10 FUEL drain in 6.17 s = 1.53 FUEL/s; ~2-3 preload with the arm folded
  hopper: { passiveInterval: 6.17 / 10 * 1.0, poweredInterval: 0.16, lanes: 2, physicalMax: 14, preload: 3 },
  // simple 2-wide shooter: fixed 72 deg hood, exit (lane X +-3.19, Y 4.47, Z 16.22), 4 in Colson drum (R 2 in), exit ratio 0.55,
  // drum J 31.4 lb-in^2 on a NEO (60 A), 6-8 FUEL/s feed, 1.58% speed drop per shot (shooter/analysis/simple.js)
  shooter: { exitX: 3.19, exitY: 4.47, exitZ: 16.22, launchDeg: 72, Rw: 2 * IN, kExit: 0.55, J: 31.4 * LB * IN * IN, Ts: 2.6, wf: 5676 * 2 * Math.PI / 60, Ilim: 60, Is: 105, feedBPS: 7, drop: 0.0158, fireTime: 0.1 },
};
IRISH.mass = IRISH.massLb * LB;
IRISH.yc = (IRISH.bumper.y0 + IRISH.bumper.y1) / 2;            // footprint centre (robot origin) in CAD Y
IRISH.hl = (IRISH.bumper.y1 - IRISH.bumper.y0) / 2 * IN;
IRISH.hw = IRISH.bumper.x * IN;
IRISH.I = IRISH.mass * ((2 * IRISH.hl) ** 2 + (2 * IRISH.hw) ** 2) / 12;
// shot table rows (robot/analysis/shot_drop.js): gap from front bumper to HUB wall (ft) -> exit speed (m/s), window %, drum rpm
// FUEL path through the team's intake module, deployed pose (robot frame inches: [t s, Y, Z]).
// From analysis/sim_f.js: 9 ft/s approach, module rollers at 55% of NEO free speed. Contact 0.049 s,
// over the bumper 0.223 s, lands on the ramp 0.516 s, reaches the indexer 1.606 s; lob apex 17.19 in.
IRISH.intake.path = [[0.005,49.45,2.95],[0.015,48.37,2.92],[0.025,47.29,2.89],[0.035,46.21,2.88],[0.045,45.13,2.88],[0.055,44.02,2.84],[0.065,42.71,2.68],[0.075,41.33,2.65],[0.085,40.22,3.04],[0.095,39.83,3.78],[0.105,39.81,4.65],[0.115,39.59,5.75],[0.125,39.15,7.04],[0.135,38.6,8.13],[0.145,37.91,8.97],[0.155,37.19,9.74],[0.165,36.47,10.48],[0.175,35.75,11.18],[0.185,35.03,11.85],[0.195,34.31,12.47],[0.205,33.59,13.05],[0.215,32.88,13.6],[0.225,32.16,14.11],[0.235,31.44,14.57],[0.245,30.72,15],[0.255,30,15.4],[0.265,29.28,15.75],[0.275,28.56,16.06],[0.285,27.84,16.34],[0.295,27.12,16.57],[0.305,26.4,16.77],[0.315,25.68,16.93],[0.325,24.96,17.05],[0.335,24.25,17.14],[0.345,23.53,17.18],[0.355,22.81,17.18],[0.365,22.09,17.15],[0.375,21.39,17.08],[0.385,21.05,17],[0.395,21.14,16.89],[0.405,21.48,16.77],[0.415,21.84,16.6],[0.425,22.21,16.4],[0.435,22.57,16.16],[0.445,22.93,15.88],[0.455,23.3,15.57],[0.465,23.66,15.21],[0.475,24.03,14.82],[0.485,24.39,14.38],[0.495,24.75,13.91],[0.505,25.12,13.4],[0.515,25.48,12.85],[0.525,25.79,12.41],[0.535,26.01,12.33],[0.545,26.16,12.56]];
IRISH.intake.pathEnd = 0.516;
// passive ramp (one bent polycarbonate sheet): channel from the lip (Y 29.25, Z 10.487) down to the shooter floor (Y 13.348, Z 7.59).
// Ball-centre height is calibrated to the CAD reference FUEL (centre lanes Z 13.17 at Y 24, wings +1 in).
const rampZ = y => 7.59 + (y - 13.348) * (10.487 - 7.59) / (29.25 - 13.348) + 2.955 + 0.68;
// hopper rest spots on the ramp: 'next' is the spot a ball rolls down to when it is free ('L' / 'R' = the shooter lanes)
const HOPPER_SLOTS = [
  { x: -3.19, y: 21.4, dz: 0, next: 'L' }, { x: 3.19, y: 21.4, dz: 0, next: 'R' },
  { x: -3.19, y: 26.0, dz: 0, next: 0 }, { x: 3.19, y: 26.0, dz: 0, next: 1 },
  { x: -9.4, y: 20.6, dz: 1.0, next: 0 }, { x: 9.4, y: 20.6, dz: 1.0, next: 1 },
  { x: -9.4, y: 25.8, dz: 1.0, next: 4 }, { x: 9.4, y: 25.8, dz: 1.0, next: 5 },
  { x: -3.19, y: 23.7, dz: 5.6, next: 2 }, { x: 3.19, y: 23.7, dz: 5.6, next: 3 },
  { x: -6.3, y: 22.6, dz: 5.4, next: 4 }, { x: 6.3, y: 22.6, dz: 5.4, next: 5 },
  { x: 0, y: 25.0, dz: 9.0, next: 8 }, { x: 0, y: 20.5, dz: 9.0, next: 9 },
];
const LANES = [{ x: -3.19, y: 15.6, z: 10.95 }, { x: 3.19, y: 15.6, z: 10.95 }];   // CAD "REF - FUEL queued in shooter"
function intakePathAt(t) {
  const P = IRISH.intake.path; if (t <= P[0][0]) return [P[0][1], P[0][2]];
  for (let i = 1; i < P.length; i++) if (t <= P[i][0]) { const a = P[i - 1], b = P[i], u = (t - a[0]) / (b[0] - a[0]); return [lerp(a[1], b[1], u), lerp(a[2], b[2], u)]; }
  const l = P[P.length - 1]; return [l[1], l[2]];
}
function intakePathTimeAtY(y) { for (const p of IRISH.intake.path) if (p[1] <= y) return p[0]; return IRISH.intake.pathEnd - 0.2; }
// where a FUEL in the intake is drawn (robot frame inches), following the sim path; inside the module it moves with the arm
function transitLocal(rb, tr) {
  const tEnd = IRISH.intake.pathEnd, tp = tr.t0 + clamp(tr.t, 0, 1) * (tEnd - tr.t0), fade = Math.max(0, 1 - tr.t * 5);
  let [Y, Z] = intakePathAt(tp); const X = tr.x0 + tr.off[0] * fade; Y += tr.off[1] * fade; Z += tr.off[2] * fade;
  if (rb.intakePos > 0.001 && Y > 30) {
    const a = rb.intakePos * IRISH.intake.stowDeg * DEG, py = IRISH.intake.pivotY, pz = IRISH.intake.pivotZ, dy = Y - py, dz = Z - pz;
    Y = py + dy * Math.cos(a) - dz * Math.sin(a); Z = pz + dy * Math.sin(a) + dz * Math.cos(a);
  }
  return [X, Y, Z];
}
const slotLocal = s => [s.x, s.y, rampZ(s.y) + s.dz];
// shooter: the indexer pushes the ball from its lane under the drum (axis Y 8.85, Z 14.8 after the 1.70 in drop);
// it wraps 108 deg round the drum under the hood and leaves at the exit point (Y 4.47, Z 16.22) on the 72 deg line
const FIRE_PATH = (() => {
  const pts = [[15.6, 10.95], [12.6, 10.35]], c = [8.85, 14.8], r = Math.hypot(4.47 - 8.85, 16.22 - 14.8), a1 = Math.atan2(16.22 - 14.8, 4.47 - 8.85) - 2 * Math.PI;
  for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + (a1 + Math.PI / 2) * k / 12; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, L, total: L[L.length - 1] };
})();
function fireLocal(u, x) {
  const F = FIRE_PATH, s = clamp(u, 0, 1) * F.total; let i = 1; while (i < F.L.length - 1 && F.L[i] < s) i++;
  const a = F.pts[i - 1], b = F.pts[i], k = (s - F.L[i - 1]) / (F.L[i] - F.L[i - 1] || 1);
  return [x, lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
}
const SHOT_TABLE = [[0, 6.10, 3.9, 2085], [1, 6.47, 2.8, 2211], [2, 6.87, 2.0, 2348], [3, 7.28, 1.6, 2488], [4, 7.68, 1.6, 2625], [5, 8.09, 1.2, 2765], [6, 8.49, 1.2, 2902], [8, 9.28, 0.9, 3172], [10, 10.06, 0.8, 3438]];
// distance from the exit point to the HUB centre for a row: 23.5 + gap + 3.25 bumper + 32.31 frame - 4.47 exit (inches)
const gapToExitDist = gapFt => (23.5 + gapFt * 12 + 3.25 + 32.31 - IRISH.shooter.exitY) * IN;
const exitDistToGap = d => (d / IN - (23.5 + 3.25 + 32.31 - IRISH.shooter.exitY)) / 12;

// extend the table past 10 ft with the same ballistic model (flagged as outside the CAD table)
const SHOT_EXT = [];
function buildShotExtension() {
  for (let gap = 11; gap <= 22; gap += 1) {
    const s = solveShot(gapToExitDist(gap), IRISH.shooter.exitZ * IN, IRISH.shooter.launchDeg * DEG, 8, 18);
    if (s) SHOT_EXT.push([gap, s.v, 100 * (s.hi - s.lo) / s.v, s.v / IRISH.shooter.kExit / IRISH.shooter.Rw * 60 / (2 * Math.PI)]);
  }
}
// -> {rpm, v, windowPct, extrapolated}
function shotFor(gapFt) {
  const rows = SHOT_TABLE.concat(SHOT_EXT);
  if (gapFt <= rows[0][0]) return { rpm: rows[0][3], v: rows[0][1], win: rows[0][2], ext: false };
  for (let i = 1; i < rows.length; i++) if (gapFt <= rows[i][0]) {
    const a = rows[i - 1], b = rows[i], t = (gapFt - a[0]) / (b[0] - a[0]);
    return { rpm: lerp(a[3], b[3], t), v: lerp(a[1], b[1], t), win: lerp(a[2], b[2], t), ext: gapFt > 10 };
  }
  const l = rows[rows.length - 1]; return { rpm: l[3], v: l[1], win: l[2], ext: true, out: true };
}
const PRESETS = [{ key: '1', gap: 0, label: 'HUB wall' }, { key: '2', gap: 3, label: '3 ft' }, { key: '3', gap: 6, label: '6 ft' }, { key: '4', gap: 10, label: 'START LINE' }];

// generic AI robot (kitbot-like): 4 CIM 10.71:1 6 in, 36 x 36 in with bumpers
function genericSpec(level) {
  const s = { easy: 0.8, normal: 1.0, hard: 1.12 }[level] || 1;
  return {
    name: 'AI', massLb: 115, mass: 115 * LB, hl: 18 * IN, hw: 18 * IN, topIn: 20,
    drive: { motorsPerSide: 2, Ts: 2.41, Is: 131, wf: 5310 * 2 * Math.PI / 60, G: 10.71 / s, r: 3 * IN, track: 23 * IN, wheelbase: 20 * IN, Ilim: 40, eff: 0.85, mu: 1.0, cv: 22, scrub: 0.38, slipSat: 0.30, ramp: 0.15, Rbat: 0.018 },
    ai: { level, capacity: 8, preload: 8, rate: { easy: 1.2, normal: 1.8, hard: 3.2 }[level] || 1.8, sigma: { easy: 0.07, normal: 0.045, hard: 0.02 }[level] || 0.045,
      exitH: 0.55, angle: 58 * DEG, intakeHalfW: 0.36 },
  };
}

let ROBOT_ID = 0;
class Robot {
  constructor(spec, alliance, opts = {}) {
    this.id = ROBOT_ID++; this.spec = spec; this.alliance = alliance; this.isPlayer = !!opts.player; this.label = opts.label || '';
    this.mass = spec.mass; this.I = spec.I || spec.mass * ((2 * spec.hl) ** 2 + (2 * spec.hw) ** 2) / 12;
    this.x = 0; this.z = 0; this.th = 0; this.vx = 0; this.vz = 0; this.w = 0; this.y = 0; this.pitch = 0;
    this.cmd = { l: 0, r: 0, intake: false, stow: false, outtake: false, shoot: false, prespin: false };
    this.intakePos = 1; this.intakeTarget = 1;  // 1 = stowed (start configuration), 0 = deployed
    this.rollers = 0;
    this.transit = []; this.hopper = []; this.staged = []; this.firing = [];
    this.drumW = 0; this.drumTarget = 0; this.shotCd = 0; this.feedT = 0; this.lane = 1; this.outCd = 0; this.slowCapture = 0;
    this.jam = false; this.aiState = null;
    this.stats = { collected: 0, shots: 0, made: 0, points: 0, fouls: 0, leave: false, parked: false };
  }
  get fx() { return Math.cos(this.th); } get fz() { return Math.sin(this.th); }
  count() { return this.transit.length + this.hopper.length + this.staged.length + (this.firing ? this.firing.length : 0); }
  place(x, z, th) { this.x = x; this.z = z; this.th = th; this.vx = this.vz = this.w = 0; this.y = terrainH(x, z); this.pitch = 0; }
  deployed() { return this.intakePos < 0.04; }
  boxes() {
    const b = [{ cx: this.x, cz: this.z, fx: this.fx, fz: this.fz, hl: this.spec.hl, hw: this.spec.hw, main: true }];
    if (this.spec === IRISH && this.intakePos < 0.4) {
      const ext = (IRISH.intake.tipY - IRISH.bumper.y1) * IN * (1 - this.intakePos / 0.4);
      const c = this.spec.hl + ext / 2;
      b.push({ cx: this.x + this.fx * c, cz: this.z + this.fz * c, fx: this.fx, fz: this.fz, hl: ext / 2 + 0.005, hw: (IRISH.intakeHalfW || 0.3), intake: true });
    }
    return b;
  }
  mainBox() { return { cx: this.x, cz: this.z, fx: this.fx, fz: this.fz, hl: this.spec.hl, hw: this.spec.hw }; }
  pointVel(px, pz) { const dx = px - this.x, dz = pz - this.z; return [this.vx - this.w * dz, this.vz + this.w * dx]; }
  // robot-local (CAD inches X right, Y fwd, Z up) -> world metres, including pitch on the BUMP
  toWorld(X, Y, Z) {
    const f = (Y - (this.spec.yc || 0)) * IN, u = Z * IN, rgt = X * IN;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const f2 = f * cp - u * sp, u2 = f * sp + u * cp;
    return [this.x + this.fx * f2 - this.fz * rgt, this.y + u2, this.z + this.fz * f2 + this.fx * rgt];
  }

  // ---- tank drive physics ----
  stepDrive(dt, enabled) {
    const d = this.spec.drive, m = this.mass;
    const fx = this.fx, fz = this.fz, rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz, vr = this.vx * rx + this.vz * rz;
    const T = d.track;
    // open-loop ramp on the motor controllers (what most robot code sets) and battery sag under load
    const ramp = dt / (d.ramp || 0.001);
    this.uL = approachVal(this.uL || 0, enabled ? clamp(this.cmd.l, -1, 1) : 0, ramp); this.uR = approachVal(this.uR || 0, enabled ? clamp(this.cmd.r, -1, 1) : 0, ramp);
    const V = this.vbat === undefined ? 12.5 : this.vbat, Fmax = d.mu * m * GRAV / 2; let Itot = 0;
    const side = (v, u) => {
      const wm = v / d.r * d.G; let I = d.Is * (u * V / 12 - wm / d.wf); I = clamp(I, -d.Ilim, d.Ilim); Itot += Math.abs(I) * d.motorsPerSide;
      // gearbox / carpet losses grow with speed (calibrated so full stick holds about 10 ft/s, like AndyMark's loaded figure)
      return clamp(d.motorsPerSide * (d.Ts / d.Is) * I * d.G * d.eff / d.r - (d.cv || 0) * v, -Fmax, Fmax);
    };
    // disabled robots coast (no output); enabled robots in neutral brake
    let FL = side(vf + this.w * T / 2, this.uL), FR = side(vf - this.w * T / 2, this.uR);
    if (!enabled) { FL = FR = 0; }
    this.vbat = clamp(12.5 - (d.Rbat || 0) * (Itot + 4), 7, 12.5);
    const Frr = 0.02 * m * GRAV * Math.tanh(vf / 0.05) + (enabled ? 0 : 0.25 * m * GRAV * Math.tanh(vf / 0.2));
    let af = (FL + FR - Frr) / m - GRAV * Math.sin(this.pitch);
    // wheel scrub: the end wheels slide sideways when the robot rotates. Like a tire it saturates with slip angle,
    // so it is strongest turning in place and much weaker when rolling forward (steering at speed stays responsive).
    const arm = d.wheelbase / 2, slip = Math.abs(this.w) * arm / (Math.abs(vf) + 0.25);
    const scrubT = Math.sign(this.w) * d.scrub * m * GRAV * arm * Math.tanh(slip / d.slipSat) + (enabled ? 0 : 0.2 * m * GRAV * 0.32 * Math.tanh(this.w / 0.3));
    const al = ((FL - FR) * T / 2 - scrubT) / this.I;
    vf += af * dt; this.w += al * dt;
    // tank drive: wheels resist sideways motion
    const dv = Math.min(Math.abs(vr), 1.0 * GRAV * dt); vr -= Math.sign(vr) * dv;
    // intake jam on the BUMP ramp: the deployed module hits the plywood ramp
    this.jam = false;
    if (this.spec === IRISH && this.intakePos < 0.5 && vf > 0) {
      const tip = (IRISH.intake.tipY - IRISH.yc) * IN, tx = this.x + fx * tip, tz = this.z + fz * tip;
      const tipBottom = this.y + tip * Math.sin(this.pitch) + 1.0 * IN;
      if (terrainH(tx, tz) > tipBottom + 0.004) { vf = Math.min(vf, 0); this.jam = true; }
    }
    this.vx = vf * fx + vr * rx; this.vz = vf * fz + vr * rz;
    this.x += this.vx * dt; this.z += this.vz * dt; this.th = wrapAng(this.th + this.w * dt);
    // ride height and pitch over the BUMP (front/rear wheel contacts, centre wheel on the ridge)
    const hb = d.wheelbase / 2;
    const hF = terrainH(this.x + fx * hb, this.z + fz * hb), hR = terrainH(this.x - fx * hb, this.z - fz * hb), hC = terrainH(this.x, this.z);
    const yT = Math.max((hF + hR) / 2, hC - 0.01), pT = Math.atan2(hF - hR, 2 * hb);
    this.y += (yT - this.y) * Math.min(1, dt * 25); this.pitch += (pT - this.pitch) * Math.min(1, dt * 18);
  }
}

// ---- robot collision resolution (static blocks + robot-robot) ----
function resolveStatic(rb) {
  for (let iter = 0; iter < 2; iter++) for (const box of rb.boxes()) for (const s of ROBOT_BLOCKS) {
    const o = obbOverlap(box, aabbAsObb(s)); if (!o) continue;
    rb.x -= o.nx * o.depth; rb.z -= o.nz * o.depth;
    const [pvx, pvz] = rb.pointVel(o.px, o.pz); const vn = pvx * o.nx + pvz * o.nz;
    if (vn > 0) {
      const dx = o.px - rb.x, dz = o.pz - rb.z, rn = dx * o.nz - dz * o.nx;
      const J = -(1.1) * vn / (1 / rb.mass + rn * rn / rb.I);
      rb.vx += J * o.nx / rb.mass; rb.vz += J * o.nz / rb.mass; rb.w += J * rn / rb.I;
    }
    if (box.intake && s.name !== 'wall' && s.name !== 'rail') rb.hitWithIntake = s.name;
  }
}
function resolveRobots(a, b, onContact) {
  let touched = false;
  for (const ba of a.boxes()) for (const bb of b.boxes()) {
    const o = obbOverlap(ba, bb); if (!o) continue; touched = true;
    const ia = 1 / a.mass, ib = 1 / b.mass, tot = ia + ib;
    a.x -= o.nx * o.depth * ia / tot; a.z -= o.nz * o.depth * ia / tot; b.x += o.nx * o.depth * ib / tot; b.z += o.nz * o.depth * ib / tot;
    const [avx, avz] = a.pointVel(o.px, o.pz), [bvx, bvz] = b.pointVel(o.px, o.pz);
    const vn = (avx - bvx) * o.nx + (avz - bvz) * o.nz;
    if (vn > 0) {
      const ra = (o.px - a.x) * o.nz - (o.pz - a.z) * o.nx, rb2 = (o.px - b.x) * o.nz - (o.pz - b.z) * o.nx;
      const J = -1.15 * vn / (ia + ib + ra * ra / a.I + rb2 * rb2 / b.I);
      a.vx += J * o.nx * ia; a.vz += J * o.nz * ia; a.w += J * ra / a.I;
      b.vx -= J * o.nx * ib; b.vz -= J * o.nz * ib; b.w -= J * rb2 / b.I;
    }
    if (onContact) onContact(a, b, ba, bb);
  }
  return touched;
}
