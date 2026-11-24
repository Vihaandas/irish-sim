// Game rules (IRISH 2026 BUILT manual sections 4-5), mechanisms, autos and AI robots.
'use strict';
const DEFAULTS = {
  mode: 'match', alliance: 'blue', station: 1, start: 'center', ai: 'normal', defense: false,
  drive: 'arcade', shotMode: 'vision', gate: true, intakeModel: 'smooth', hopper: 'passive', noise: 'real',
  auto: 'shoot-depot', camera: 'follow', turnScale: 0.65, fuelBonus: 60, sound: true, quality: 'high',
  input: 'keyboard', assists: 'on', intakeMode: 'toggle', labels: true, volume: 0.7, arc: true, trail: true, fps: false,
};
const otherAlliance = a => a === 'blue' ? 'red' : 'blue';

class Game {
  constructor(W) { this.W = W; }
  reset() {
    const W = this.W, S = W.settings;
    W.t = 0; W.robots = []; W.fuel.stage(); ROBOT_ID = 0;
    this.feed = []; this.toasts = []; this.over = false; this.lastPeriod = null; this.swapLog = []; this.lastSwapT = -99;
    this.score = { blue: this.blankScore(), red: this.blankScore() };
    this.foulCd = new Map(); this.contactPairs = new Set();
    const mine = S.alliance, opp = otherAlliance(mine);
    const lineX = a => START_X[a], face = a => a === 'blue' ? 0 : Math.PI;
    // player robot: centred on its ROBOT STARTING LINE (G303 D), facing the HUB
    const P = new Robot(IRISH, mine, { player: true, label: 'YOU' });
    const zs = { left: -1.9, center: 0, right: 1.9 }[S.start] || 0;
    const zSide = mine === 'blue' ? 1 : -1;   // driver's right is +z for BLUE, -z for RED
    P.place(lineX(mine), CZ + zs * zSide, face(mine));
    W.robots.push(P); W.player = P;
    W.fuel.giveTo(P, IRISH.hopper.preload).forEach((b, i) => { if (i < IRISH.hopper.lanes) { b.lane = i; P.staged.push(b); } else irishHopperAdd(P, b, 0, 21.4); });
    if (S.ai !== 'off' && S.mode === 'match') {
      const spec = genericSpec(S.ai);
      const partnerZ = CZ + (zs <= 0 ? 2.3 : -2.3) * zSide;
      const add = (all, z, label) => { const r = new Robot(spec, all, { label }); r.place(lineX(all), z, face(all)); W.robots.push(r); W.fuel.giveTo(r, spec.ai.preload).forEach(b => r.hopper.push(b)); return r; };
      add(mine, partnerZ, 'PARTNER');
      const o1 = add(opp, CZ - 1.6, 'OPP 1'); add(opp, CZ + 2.3, 'OPP 2');
      if (S.defense) o1.defender = true;
    }
    for (const r of W.robots) { r.startedOnLine = obbTouchesXStrip(r.mainBox(), START_X[r.alliance] - TAPE / 2, START_X[r.alliance] + TAPE / 2); r.leftLine = false; r.crossedCenter = false; r.overT = 0; r.overCount = 0; }
    this.player = P;
    if (S.mode === 'practice') { W.t = MATCH.periods[2].t0; }
    this.drill = S.mode.startsWith('drill') ? { kind: S.mode, len: S.mode === 'drill-shoot' ? 60 : 90, refillT: 0 } : null;
    if (this.drill) {
      W.t = 0; const s = mine === 'blue' ? 1 : -1;
      if (this.drill.kind === 'drill-shoot') { P.place(CX - s * 2.9, CZ + 0.4, face(mine)); this.refillPlayer(10); }
      else {
        // 40 FUEL scattered over our half, away from the HUB and the BUMP
        for (let k = 0; k < 40; k++) { let x, z; do { x = s > 0 ? 0.9 + Math.random() * (CX - 2.2) : FIELD.L - 0.9 - Math.random() * (CX - 2.2); z = 0.4 + Math.random() * (FIELD.W - 0.8); } while (Math.hypot(x - START_X[mine], z - P.z) < 0.9); W.fuel.add(x, FUEL.r, z); }
      }
    }
    this.autoRun = S.mode === 'match' ? makeAuto(S.auto) : null;
  }
  // practice tools: put the robot back on its STARTING LINE / load it with FUEL (reusing resting FUEL far away first)
  resetPlayer() { const P = this.player; P.place(START_X[P.alliance], CZ, P.alliance === 'blue' ? 0 : Math.PI); P.intakeTarget = P.intakePos = 1; }
  refillPlayer(n) {
    const W = this.W, P = this.player, need = Math.max(0, n - P.count()); if (!need) return;
    const spare = W.fuel.balls.filter(b => b.state === F_FIELD && b.y < 0.12 && Math.hypot(b.vx, b.vz) < 0.05 && Math.hypot(b.x - P.x, b.z - P.z) > 3).sort(() => Math.random() - 0.5);
    for (let k = 0; k < need; k++) {
      const b = spare.length && W.fuel.balls.length > 180 ? spare.pop() : W.fuel.add(P.x, 0.3, P.z);
      b.state = F_HELD; b.owner = P; b.vx = b.vy = b.vz = 0; b.shooter = null;
      const free = [0, 1].find(l => !P.staged.some(q => q.lane === l));
      if (free !== undefined) { b.lane = free; P.staged.push(b); } else irishHopperAdd(P, b, 0, 21.4);
    }
  }
  blankScore() { return { autoFuel: 0, teleFuel: 0, fuelPts: 0, leave: 0, park: 0, foulPts: 0, fouls: [], rp: {}, total: 0 }; }
  // ---- timeline ----
  period(t = this.W.t) {
    if (this.drill) return t < this.drill.len ? { name: this.drill.kind === 'drill-shoot' ? 'SHOOTING DRILL' : 'INTAKE DRILL', t0: 0, t1: this.drill.len, swap: false, drill: true } : { name: 'DRILL OVER', t0: this.drill.len, t1: 1e9, swap: false, disabled: true, over: true };
    if (this.W.settings.mode === 'practice') { const k = Math.floor((t - 23) / 25); return { name: 'PRACTICE  SHIFT ' + (k + 1), t0: 23 + k * 25, t1: 23 + (k + 1) * 25, swap: k % 2 === 0, practice: true }; }
    for (const p of MATCH.periods) if (t < p.t1) return p;
    return { name: 'MATCH OVER', t0: MATCH.end, t1: 1e9, swap: false, disabled: true, over: true };
  }
  swapped(t = this.W.t) { return this.period(t).swap; }
  // which half (-1: x < CENTER LINE, +1: x > CENTER LINE) is this alliance's ALLIANCE ZONE right now
  zoneSign(all, t = this.W.t) { const base = all === 'blue' ? -1 : 1; return this.swapped(t) ? -base : base; }
  inZone(rb, t) { const [x0, x1] = obbXRange(rb.mainBox()); return this.zoneSign(rb.alliance, t) < 0 ? x0 < CX : x1 > CX; }
  // HUB half -> alliance credited (table 6-3), using the timing of the shot for the 3 s processing allowance
  creditFor(side, t) { const sw = this.swapped(t); return sw ? otherAlliance(side) : side; }
  get enabled() { const p = this.period(); return !p.disabled && !this.over; }
  isAuto() { return this.W.settings.mode === 'match' && this.W.t < MATCH.auto; }
  clock() {
    const t = this.W.t;
    if (this.drill) return Math.max(0, this.drill.len - t);
    if (this.W.settings.mode === 'practice') { const p = this.period(); return Math.max(0, p.t1 - t); }
    if (t < MATCH.auto) return MATCH.auto - t;
    if (t < MATCH.auto + MATCH.delay) return 0;
    return Math.max(0, MATCH.end - t);
  }
  // ---- events ----
  toast(text, kind = 'info', dur = 2.2) { this.toasts.push({ text, kind, until: this.W.t + dur, born: performance.now() }); if (this.toasts.length > 4) this.toasts.shift(); }
  log(text, kind) { const c = Math.ceil(this.clock() - 1e-6); this.feed.unshift({ text, kind, t: this.W.t, clock: (this.isAuto() ? 'A ' : '') + Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0') }); if (this.feed.length > 7) this.feed.pop(); }
  foul(rb, type, rule, why, key) {
    if (key) { const k = key + rb.id; const until = this.foulCd.get(k) || -1; if (this.W.t < until) return; this.foulCd.set(k, this.W.t + 1.5); }
    const opp = otherAlliance(rb.alliance), pts = type === 'MAJOR' ? POINTS.major : POINTS.minor;
    this.score[opp].foulPts += pts; this.score[rb.alliance].fouls.push({ type, rule, why, t: this.W.t, who: rb.label });
    rb.stats.fouls++; this.W.onFoulFx && this.W.onFoulFx(rb);
    this.log(`${type} FOUL ${rule}: ${rb.label} ${why} (+${pts} ${opp.toUpperCase()})`, rb.isPlayer ? 'bad' : 'warn');
    if (rb.isPlayer) { this.toast(`${type} FOUL - ${rule}: ${why}`, 'bad', 3.2); this.W.sfx && this.W.sfx('foul'); }
  }
  onHubScore(b, side) {
    const W = this.W, t = W.t;
    if (W.settings.mode === 'match' && (t > MATCH.end + MATCH.grace)) return;
    const tc = b.launchT >= 0 && t - b.launchT < 3 ? b.launchT : t;    // 3 s assessment after a SHIFT change
    const all = this.creditFor(side, tc);
    const autoPts = W.settings.mode === 'match' && tc < MATCH.auto;
    const pts = autoPts ? POINTS.fuelAuto : POINTS.fuelTele;
    const sc = this.score[all]; if (autoPts) sc.autoFuel++; else sc.teleFuel++; sc.fuelPts += pts;
    W.onScoreFx && W.onScoreFx(b, side, all, b.shooter && b.shooter.isPlayer);
    if (b.shooter) {
      const sh = b.shooter;
      if (sh.alliance === all) { sh.stats.made++; sh.stats.points += pts; if (sh.isPlayer) { this.toast(`+${pts}  FUEL scored`, 'good', 1.0); W.sfx && W.sfx('score'); } }
      else if (sh.isPlayer) { this.toast(`Wrong side of the HUB: +${pts} for ${all.toUpperCase()}`, 'bad', 2.4); }
    }
  }
  onCollect(rb) { if (rb.isPlayer) this.W.sfx && this.W.sfx('pick'); }
  onCatch(rb) { if (rb.isPlayer) this.toast('FUEL landed in your hopper', 'info', 1.2); }
  onFuelOut(b) { if (b.shooter && b.shooter.isPlayer && this.W.t - b.launchT < 3) this.toast('FUEL left the FIELD (G405 if deliberate)', 'warn', 2); }
  onLaunch(rb) {
    if (this.W.settings.mode === 'match' && !this.inZone(rb)) this.foul(rb, 'MAJOR', 'G407', 'launched FUEL outside its ALLIANCE ZONE');
  }
  onRobotContact(a, b) {
    if (a.alliance === b.alliance || !this.enabled) return;
    const W = this.W, t = W.t;
    // G403: no contact with opponents in AUTO
    // the robot driving into the other one is the one that made contact (G210: forced contact is not penalised)
    const initiated = (off, vic) => { const dx = vic.x - off.x, dz = vic.z - off.z, d = Math.hypot(dx, dz) || 1; const so = (off.vx * dx + off.vz * dz) / d, sv = -(vic.vx * dx + vic.vz * dz) / d; return so > 0.25 && so >= sv; };
    if (this.isAuto()) { for (const [r, o] of [[a, b], [b, a]]) if (initiated(r, o)) this.foul(r, 'MAJOR', 'G403', 'contacted an opponent in AUTO', 'g403'); return; }
    // G420: an opponent touching the HUB wall on its scoring side is protected (2 s grace after each SHIFT change)
    const p = this.period(); if (t - p.t0 < 2) return;
    for (const [vic, off] of [[a, b], [b, a]]) {
      if (this.touchingOwnHubWall(vic) && initiated(off, vic)) this.foul(off, 'MAJOR', 'G420', 'contacted a robot protected at the HUB', 'g420');
    }
  }
  touchingOwnHubWall(rb) {
    const zs = this.zoneSign(rb.alliance); const face = CX + zs * HUB.half;
    const bx = rb.mainBox(); const [x0, x1] = obbXRange(bx);
    const zc = obbCorners(bx).map(p => p[1]);
    const zOverlap = Math.max(...zc) > CZ - HUB.half && Math.min(...zc) < CZ + HUB.half;
    return zOverlap && (zs > 0 ? Math.abs(x0 - face) < 0.04 : Math.abs(x1 - face) < 0.04);
  }
  // ---- per-step rules ----
  update(dt) {
    const W = this.W, S = W.settings, t = W.t, p = this.period();
    if (this.lastPeriod !== p.name) {
      if (this.lastPeriod) this.onPeriodChange(p);
      this.lastPeriod = p.name;
    }
    // countdown to a zone swap
    const next = this.period(p.t1 + 0.01);
    if (S.mode === 'match' || S.mode === 'practice') {
      const left = p.t1 - t;
      if (!p.disabled && next.swap !== p.swap && left <= 5 && left > 0) {
        const s = Math.ceil(left); if (this.swapCount !== s) { this.swapCount = s; W.sfx && W.sfx('tick'); }
      }
    }
    for (const rb of W.robots) {
      // LEAVE tracking in AUTO
      if (S.mode === 'match' && t < MATCH.auto) {
        const off = !obbTouchesXStrip(rb.mainBox(), START_X[rb.alliance] - TAPE / 2, START_X[rb.alliance] + TAPE / 2);
        if (off) rb.leftLine = true;
        const [x0, x1] = obbXRange(rb.mainBox());
        const crossed = rb.alliance === 'blue' ? x0 > CX : x1 < CX;
        if (crossed && !rb.crossedCenter) { rb.crossedCenter = true; this.foul(rb, 'MINOR', 'G403', 'crossed the CENTER LINE in AUTO'); }
      }
      // G408: 10 FUEL limit
      const n = rb.count();
      if (n > 10 && this.enabled) {
        if (rb.overCount < n - 10) { for (let k = rb.overCount; k < n - 10; k++) this.foul(rb, 'MINOR', 'G408', `controlling ${n} FUEL (limit 10)`); rb.overCount = n - 10; rb.overT = 0; }
        rb.overT += dt; if (rb.overT >= 3) { rb.overT = 0; this.foul(rb, 'MINOR', 'G408', 'still over 10 FUEL'); }
      } else if (n <= 10) { rb.overCount = 0; rb.overT = 0; }
    }
    // swap timing for the player
    if (this.pendingSwap && this.inZoneCentre(this.player)) { this.swapLog.push(t - this.pendingSwap); this.pendingSwap = null; }
    // end of AUTO: LEAVE
    if (S.mode === 'match' && !this.autoScored && t >= MATCH.auto) {
      this.autoScored = true;
      for (const rb of W.robots) {
        const off = !obbTouchesXStrip(rb.mainBox(), START_X[rb.alliance] - TAPE / 2, START_X[rb.alliance] + TAPE / 2);
        rb.stats.leave = rb.startedOnLine && rb.leftLine && off;
        if (rb.stats.leave) this.score[rb.alliance].leave += POINTS.leave;
        if (rb.isPlayer) this.toast(rb.stats.leave ? 'LEAVE +3' : 'No LEAVE points (must be fully off the STARTING LINE)', rb.stats.leave ? 'good' : 'warn', 2.5);
      }
    }
    if (this.drill) {
      if (t >= this.drill.len + 2 && !this.over) { this.over = true; W.onFinish && W.onFinish(); }
      // shooting drill: a fresh 10 once the robot is empty
      if (this.drill.kind === 'drill-shoot' && t < this.drill.len) { if (this.player.count() === 0) { this.drill.refillT += dt; if (this.drill.refillT > 1.2) { this.drill.refillT = 0; this.refillPlayer(10); this.toast('Refilled: 10 FUEL', 'info', 1.0); } } else this.drill.refillT = 0; }
    }
    if (S.mode === 'match' && !this.endScored && t >= MATCH.end) this.scoreEnd();
    if (S.mode === 'match' && t >= MATCH.end + MATCH.grace && !this.over) { this.over = true; this.finish(); }
    for (const a of ['blue', 'red']) { const s = this.score[a]; s.total = s.fuelPts + s.leave + s.park + s.foulPts; }
  }
  inZoneCentre(rb) { return Math.sign(rb.x - CX) === this.zoneSign(rb.alliance); }
  onPeriodChange(p) {
    const W = this.W, mine = this.player.alliance;
    W.sfx && W.sfx(p.disabled ? 'end' : 'shift');
    if (p.name === 'AUTO SCORING') { this.toast('AUTO over - robots disabled for 3 s', 'info', 2.6); return; }
    if (p.over) return;
    const zs = this.zoneSign(mine); const far = (mine === 'blue') === (zs > 0);
    this.toast(`${p.name}: score from the ${far ? 'FAR' : 'NEAR'} half (${zs > 0 ? 'RED' : 'BLUE'} side)`, far ? 'swap' : 'info', 3.2);
    this.log(`${p.name} - ${mine.toUpperCase()} zone is the ${zs > 0 ? 'RED' : 'BLUE'} half`, 'info');
    if (!this.inZoneCentre(this.player)) this.pendingSwap = W.t; else this.pendingSwap = null;
    if (p.name === 'END GAME') this.toast('END GAME: PARK on your STARTING LINE before 0:00 (+2)', 'info', 3.5);
  }
  scoreEnd() {
    const W = this.W; this.endScored = true;
    for (const rb of W.robots) {
      rb.stats.parked = obbTouchesXStrip(rb.mainBox(), START_X[rb.alliance] - TAPE / 2, START_X[rb.alliance] + TAPE / 2);
      if (rb.stats.parked) this.score[rb.alliance].park += POINTS.park;
    }
    // CONNECTION: all 4 robots bumper to bumper, at least one PARKED
    this.connection = false;
    if (W.robots.length === 4 && W.robots.some(r => r.stats.parked)) {
      const grown = r => { const b = r.mainBox(); b.hl += 0.03; b.hw += 0.03; return b; };
      const seen = new Set([0]); const q = [0];
      while (q.length) { const i = q.pop(); for (let j = 0; j < 4; j++) if (!seen.has(j) && obbOverlap(grown(W.robots[i]), grown(W.robots[j]))) { seen.add(j); q.push(j); } }
      this.connection = seen.size === 4;
    }
  }
  finish() {
    const W = this.W, S = W.settings;
    for (const a of ['blue', 'red']) {
      const s = this.score[a], o = this.score[otherAlliance(a)];
      const robots = W.robots.filter(r => r.alliance === a);
      s.rp.auto = robots.every(r => r.stats.leave) && s.autoFuel >= 5 ? 1 : 0;
      s.rp.fuel = s.autoFuel + s.teleFuel >= S.fuelBonus ? 1 : 0;
      s.rp.connection = this.connection ? 1 : 0;
      s.total = s.fuelPts + s.leave + s.park + s.foulPts; o.total = o.fuelPts + o.leave + o.park + o.foulPts;
      s.rp.result = s.total > o.total ? 3 : s.total === o.total ? 1 : 0;
      s.rp.sum = s.rp.auto + s.rp.fuel + s.rp.connection + s.rp.result;
    }
    W.onFinish && W.onFinish();
  }
}

// ---------------- mechanisms ----------------
function stepIrish(W, rb, dt, enabled) {
  const c = rb.cmd, S = IRISH, set = W.settings;
  if (enabled) { if (c.intake || c.outtake) rb.intakeTarget = 0; else if (c.stow) rb.intakeTarget = 1; }
  rb.intakePos = approachVal(rb.intakePos, rb.intakeTarget, dt / S.intake.deployTime);
  rb.rollers = enabled && rb.deployed() ? (c.outtake ? -1 : c.intake ? 1 : 0) : 0;
  // through the module along the sim path, then onto the ramp
  for (const tr of rb.transit) tr.t += dt / (tr.dur || S.intake.transit);
  for (let i = rb.transit.length - 1; i >= 0; i--) if (rb.transit[i].t >= 1) { const tr = rb.transit.splice(i, 1)[0], p = transitLocal(rb, Object.assign({}, tr, { t: 1 })); irishHopperAdd(rb, tr.b, p[0], p[1]); }
  // ramp: FUEL roll down to the shooter lanes at the measured passive-ramp rate
  irishHopperStep(rb, dt, set.hopper === 'powered' ? S.hopper.poweredInterval : S.hopper.passiveInterval);
  // outtake: reversing the module only reaches FUEL still in the module (the ramp slopes away from it)
  rb.outCd -= dt;
  if (rb.rollers < 0 && rb.outCd <= 0) {
    const i = rb.transit.findIndex(tr => transitLocal(rb, tr)[1] > 30);
    if (i >= 0) {
      const tr = rb.transit.splice(i, 1)[0], src = tr.b; rb.outCd = 0.25; const p = rb.toWorld(tr.x0, S.intake.tipY + 3, 3.5);
      launchBall(W, src, rb, p, [rb.vx + rb.fx * 2.2, 0.6, rb.vz + rb.fz * 2.2], [0, 0, 0]); rb.stats.shots--; src.shooter = null;
    }
  }
  // shooter target from the shot table: vision (AprilTag distance) or the driver's presets
  const sh = S.shooter, ex = rb.toWorld(0, sh.exitY, sh.exitZ);
  const dHub = Math.hypot(HUB.cx - ex[0], HUB.cz - ex[2]);
  rb.gap = exitDistToGap(dHub);
  rb.shot = set.shotMode === 'vision' ? shotFor(Math.max(0, rb.gap)) : shotFor(PRESETS[rb.preset || 0].gap);
  const spin = enabled && (c.shoot || c.prespin);
  const wt = spin ? rb.shot.rpm * 2 * Math.PI / 60 : 0;
  const tauMax = Math.max(0, Math.min(sh.Ts * sh.Ilim / sh.Is, sh.Ts * (1 - rb.drumW / sh.wf)));
  const fric = 0.03 + 0.00025 * rb.drumW;
  let tau = spin ? clamp(0.35 * (wt - rb.drumW) + fric, -0.8, tauMax) : 0;
  rb.drumW = Math.max(0, rb.drumW + (tau - fric) / sh.J * dt);
  const err = wt > 0 ? Math.abs(rb.drumW - wt) / wt : 1;
  rb.ready = spin && err <= rb.shot.win / 200;
  // aim: heading error to the HUB centre
  rb.aimErr = wrapAng(Math.atan2(HUB.cz - ex[2], HUB.cx - ex[0]) - rb.th);
  rb.shotCd -= dt;
  if (enabled && c.shoot && rb.staged.length && rb.shotCd <= 0 && (rb.ready || !set.gate) && rb.drumW > 30 && (!rb.feedOk || rb.feedOk())) {
    // the indexer pushes the next lane's FUEL under the drum; it leaves the hood fireTime later
    let b = rb.staged.find(q => q.lane === rb.nextLane) || rb.staged[0];
    rb.staged.splice(rb.staged.indexOf(b), 1); const lane = b.lane === 1 ? 1 : 0; rb.nextLane = 1 - lane;
    rb.firing.push({ b, t: 0, lane }); rb.shotCd = 1 / sh.feedBPS;
    W.game.onLaunch(rb, b); W.sfx && rb.isPlayer && W.sfx('shot');
  }
  for (const fq of rb.firing) fq.t += dt;
  while (rb.firing.length && rb.firing[0].t >= sh.fireTime) {
    const fq = rb.firing.shift(), b = fq.b;
    const pos = rb.toWorld(LANES[fq.lane].x, sh.exitY, sh.exitZ);
    const nz = set.noise === 'real' ? 1 : 0;
    const v = sh.kExit * rb.drumW * sh.Rw * (1 + randn() * 0.0035 * nz);
    const el = sh.launchDeg * DEG + rb.pitch + randn() * 0.25 * DEG * nz, yaw = randn() * 0.35 * DEG * nz;
    const ch = Math.cos(el), fx = rb.fx, fz = rb.fz;
    const d = [fx * ch * Math.cos(yaw) - fz * ch * Math.sin(yaw), Math.sin(el), fz * ch * Math.cos(yaw) + fx * ch * Math.sin(yaw)];
    const [pvx, pvz] = rb.pointVel(pos[0], pos[2]);
    const s = [-d[2], 0, d[0]]; const sl = Math.hypot(s[0], s[2]) || 1;
    launchBall(W, b, rb, pos, [d[0] * v + pvx, d[1] * v, d[2] * v + pvz], [s[0] / sl, 0, s[2] / sl]);
    rb.drumW *= 1 - sh.drop;
  }
}

// generic AI robot mechanisms: aim at the HUB and lob with its own speed table
const AI_TABLE = [];
function buildAiTable() {
  const a = genericSpec('normal').ai;
  for (let d = 1.3; d <= 6.0; d += 0.1) { const s = solveShot(d, a.exitH, a.angle, 3, 14); AI_TABLE.push([d, s ? s.v : null]); }
}
function aiShotSpeed(d) { let best = null; for (const [dd, v] of AI_TABLE) if (v && Math.abs(dd - d) < 0.051) best = v; return best; }
function stepAiMech(W, rb, dt, enabled) {
  const a = rb.spec.ai;
  rb.rollers = enabled && rb.cmd.intake ? 1 : 0;
  rb.shotCd -= dt;
  if (enabled && rb.cmd.shoot && rb.hopper.length && rb.shotCd <= 0) {
    const d = Math.hypot(HUB.cx - rb.x, HUB.cz - rb.z), v0 = aiShotSpeed(d);
    if (!v0) return;
    const b = rb.hopper.shift(), sg = a.sigma;
    const yaw = Math.atan2(HUB.cz - rb.z, HUB.cx - rb.x) + randn() * sg * 0.9, el = a.angle + randn() * sg * 0.5, v = v0 * (1 + randn() * sg);
    const ch = Math.cos(el), dir = [Math.cos(yaw) * ch, Math.sin(el), Math.sin(yaw) * ch];
    const pos = [rb.x + rb.fx * 0.1, rb.y + a.exitH, rb.z + rb.fz * 0.1];
    W.game.onLaunch(rb, b);
    const s = [-dir[2], 0, dir[0]], sl = Math.hypot(s[0], s[2]) || 1;
    launchBall(W, b, rb, pos, [dir[0] * v + rb.vx, dir[1] * v, dir[2] * v + rb.vz], [s[0] / sl, 0, s[2] / sl]);
    rb.shotCd = 1 / a.rate;
  }
}

// ---------------- driving helpers (AI + autos) ----------------
function driveToward(rb, tx, tz, maxV = 1, stopDist = 0.05, reverse = false) {
  const dx = tx - rb.x, dz = tz - rb.z, dist = Math.hypot(dx, dz);
  let desired = Math.atan2(dz, dx); if (reverse) desired = wrapAng(desired + Math.PI);
  const err = wrapAng(desired - rb.th);
  let turn = clamp(err * 2.4 - rb.w * 0.22, -1, 1); if (Math.abs(err) > 0.03) turn += Math.sign(turn) * 0.2;
  // trapezoid-style approach: command the speed we can still brake from (about 3 m/s^2)
  let thr = clamp(Math.sqrt(2 * 3.0 * Math.max(0, dist - stopDist)) / 5.0 + 0.04, 0, maxV) * Math.max(0, Math.cos(err)) ** 3;
  if (dist - stopDist < 0.02) thr = 0;
  if (Math.abs(err) > 1.1) thr = 0;
  if (reverse) thr = -thr;
  rb.cmd.l = clamp(thr + turn * 0.75, -1, 1); rb.cmd.r = clamp(thr - turn * 0.75, -1, 1);
  return dist;
}
function turnToward(rb, tx, tz, offset = 0) {
  const err = wrapAng(Math.atan2(tz - rb.z, tx - rb.x) + offset - rb.th);
  let turn = clamp(err * 2.0 - rb.w * 0.3, -0.7, 0.7); if (Math.abs(err) > 0.012) turn = Math.sign(turn) * Math.max(Math.abs(turn), 0.29);
  rb.cmd.l = turn; rb.cmd.r = -turn; return Math.abs(err);
}
function stopDrive(rb) { rb.cmd.l = rb.cmd.r = 0; }

// ---------------- autos for the team robot ----------------
// each auto is a list of steps run in order during AUTO
function makeAuto(name) {
  const hubAim = rb => { const e = rb.toWorld(0, IRISH.shooter.exitY, IRISH.shooter.exitZ); return wrapAng(Math.atan2(HUB.cz - e[2], HUB.cx - e[0]) - rb.th); };
  const fwd = (dist) => ({ name: 'drive', init(rb) { this.tx = rb.x + rb.fx * dist; this.tz = rb.z + rb.fz * dist; }, run(rb) { return driveToward(rb, this.tx, this.tz, 0.55, 0.0) < 0.06; } });
  const aim = { name: 'aim', run(rb) { const e = hubAim(rb); let turn = clamp(e * 2.2 - rb.w * 0.3, -0.5, 0.5); if (Math.abs(e) > 0.012) turn = Math.sign(turn) * Math.max(Math.abs(turn), 0.29); rb.cmd.l = turn; rb.cmd.r = -turn; return Math.abs(e) < 1.2 * DEG && Math.abs(rb.w) < 0.1; } };
  // shooting stops 0.1 s before AUTO ends so nothing is launched while the robots are disabled
  const AUTO_END = MATCH.periods[0].t1 - 0.1;
  const shootAll = (maxT = 9) => ({ name: 'shoot', init() { this.t = 0; }, run(rb, W, dt) { this.t += dt; stopDrive(rb); const e = hubAim(rb); let turn = clamp(e * 2.0, -0.3, 0.3); if (Math.abs(e) > 0.02) turn = Math.sign(turn) * Math.max(Math.abs(turn), 0.28); else turn = 0; rb.cmd.l = turn; rb.cmd.r = -turn; rb.cmd.shoot = true; const done = rb.count() === 0 || this.t > maxT || W.t > AUTO_END; if (done) rb.cmd.shoot = false; return done; } });
  const spin = { name: 'spin', run(rb) { rb.cmd.prespin = true; return true; } };
  // opts: intake (run the intake), v (max speed), tol (arrive distance), full (finish once holding 10), by (finish at this match time regardless)
  const goTo = (fx, fz, opts = {}) => ({ name: 'goto', run(rb, W) {
    const s = W.settings.alliance === 'blue' ? 1 : -1; const tx = s > 0 ? fx : FIELD.L - fx;
    if (opts.full && rb.count() >= 10) return true;
    if (opts.by && W.t > opts.by) return true;
    if (opts.intake && rb.count() < 10) rb.cmd.intake = true;
    return driveToward(rb, tx, fz, opts.v || 0.7, 0.0) < (opts.tol || 0.15);
  } });
  const stow = { name: 'stow', run(rb) { rb.cmd.intake = false; rb.cmd.stow = true; return true; } };
  const routines = {
    'none': [],
    'leave': [fwd(1.0)],
    'shoot-leave': [spin, fwd(1.0), aim, shootAll()],
    // 10 preloaded: shoot them all from just past the line (LEAVE), refill at our DEPOT, come back and shoot until AUTO ends.
    // The DEPOT steps give up at 12.5 s so there is always time to drive back and shoot.
    'shoot-depot': [spin, fwd(0.75), aim, shootAll(7.5),
      goTo(2.2, CZ, { v: 0.85 }), goTo(0.95, CZ, { intake: true, v: 0.5, tol: 0.12, full: true, by: 12.5 }),
      goTo(0.75, CZ - 0.45, { intake: true, v: 0.35, full: true, by: 12.5 }), goTo(0.75, CZ + 0.45, { intake: true, v: 0.35, full: true, by: 12.5 }),
      stow, goTo(5.0, CZ, { v: 0.85, tol: 0.1 }), aim, shootAll()],
  };
  const steps = (routines[name] || []).map(s => Object.assign(Object.create(s), {}));
  return { name, steps, i: 0, started: false };
}
function runAuto(W, rb, dt) {
  const A = W.game.autoRun; if (!A) return;
  rb.cmd.l = rb.cmd.r = 0; rb.cmd.shoot = false; rb.cmd.intake = false; rb.cmd.stow = false;
  rb.capLimit = 10;   // the auto's intake code stops at 10 FUEL (G408), like the teleop assist
  const s = A.steps[A.i]; if (!s) { stopDrive(rb); return; }
  if (!s._init) { s._init = true; s.init && s.init(rb); }
  if (s.run(rb, W, dt)) { A.i++; stopDrive(rb); }
}

// ---------------- AI robots ----------------
function aiUpdate(W, rb, dt) {
  const g = W.game, ai = rb.ai || (rb.ai = { think: 0, mode: 'collect', tx: rb.x, tz: rb.z, stuck: 0, backT: 0, spot: (Math.random() - 0.5) * 1.6 });
  rb.cmd.intake = false; rb.cmd.shoot = false;
  if (!g.enabled) { stopDrive(rb); return; }
  ai.think -= dt; if (ai.think <= 0) { ai.think = 0.25; aiPlan(W, rb, ai); }
  // unstick
  const sp = Math.hypot(rb.vx, rb.vz);
  if (ai.backT > 0) { ai.backT -= dt; rb.cmd.l = -0.6; rb.cmd.r = -0.25; return; }
  if (ai.mode !== 'shoot' && ai.mode !== 'park-hold' && Math.abs(rb.cmd.l + rb.cmd.r) > 0.6 && sp < 0.12) { ai.stuck += dt; if (ai.stuck > 1.2) { ai.stuck = 0; ai.backT = 0.7; } } else ai.stuck = 0;
  const maxV = { easy: 0.55, normal: 0.72, hard: 0.95 }[rb.spec.ai.level] || 0.72;
  if (ai.mode === 'shoot') {
    const d = Math.hypot(ai.tx - rb.x, ai.tz - rb.z);
    if (d > 0.35) { driveToward(rb, ai.tx, ai.tz, maxV, 0.05); avoidRobots(W, rb); }
    else { const e = turnToward(rb, HUB.cx, HUB.cz); if (e < 4 * DEG && sp < 0.25) rb.cmd.shoot = g.inZone(rb); }
  } else if (ai.mode === 'cross') {
    const wp = ai.path[0];
    if (!wp) stopDrive(rb); else if (driveToward(rb, wp[0], wp[1], maxV, 0.0) < 0.3) ai.path.shift();
  } else if (ai.mode === 'collect') {
    rb.cmd.intake = true; driveToward(rb, ai.tx, ai.tz, maxV * 0.8, 0.0);
  } else if (ai.mode === 'defend') {
    driveToward(rb, ai.tx, ai.tz, maxV, 0.1);
  } else if (ai.mode === 'park') {
    if (driveToward(rb, ai.tx, ai.tz, maxV * 0.6, 0.0) < 0.12) { stopDrive(rb); ai.mode = 'park-hold'; }
  } else stopDrive(rb);
  if (ai.mode !== 'shoot' && ai.mode !== 'park-hold') avoidRobots(W, rb);
}
function avoidRobots(W, rb) {
  for (const o of W.robots) {
    if (o === rb) continue;
    const dx = o.x - rb.x, dz = o.z - rb.z, d = Math.hypot(dx, dz); if (d > 1.6) continue;
    const ahead = dx * rb.fx + dz * rb.fz, side = -dx * rb.fz + dz * rb.fx;
    if (ahead > 0 && Math.abs(side) < (o.isPlayer ? 1.25 : 1.05)) { const k = (1.6 - d) / 1.6 * (o.isPlayer ? 1.4 : 1); const s = side >= 0 ? -1 : 1; rb.cmd.l += s * 0.5 * k; rb.cmd.r -= s * 0.5 * k; rb.cmd.l *= 1 - 0.4 * k; rb.cmd.r *= 1 - 0.4 * k;
      if (o.isPlayer && d < 1.25 && Math.abs(side) < 0.95) { rb.cmd.l = Math.min(rb.cmd.l, 0.05) + s * 0.3; rb.cmd.r = Math.min(rb.cmd.r, 0.05) - s * 0.3; } }
  }
}
function aiPlan(W, rb, ai) {
  const g = W.game, t = W.t, zs = g.zoneSign(rb.alliance), a = rb.spec.ai;
  const inHalf = Math.sign(rb.x - CX) === zs && Math.abs(rb.x - CX) > HUB.half + 0.1;
  // AUTO: score the preload from near the line, then collect in our half
  // END GAME: PARK on our STARTING LINE for the last seconds
  if (W.settings.mode === 'match' && t > MATCH.end - 7 && t < MATCH.end) {
    const lx = START_X[rb.alliance];
    if (ai.mode !== 'park' && ai.mode !== 'park-hold') { ai.mode = 'park'; ai.tx = lx; ai.tz = clamp(rb.z, 0.6, FIELD.W - 0.6); if (Math.abs(rb.x - lx) > 5) ai.mode = 'idle'; }
    return;
  }
  if (rb.defender && !g.isAuto()) {
    const P = W.player; const toward = Math.hypot(HUB.cx - P.x, HUB.cz - P.z) || 1;
    ai.mode = 'defend';
    ai.tx = clamp(P.x + (HUB.cx - P.x) / toward * 1.0, 0.6, FIELD.L - 0.6); ai.tz = clamp(P.z + (HUB.cz - P.z) / toward * 1.0, 0.6, FIELD.W - 0.6);
    if (Math.hypot(ai.tx - HUB.cx, ai.tz - HUB.cz) < 1.5) { const k = 1.5 / Math.hypot(ai.tx - HUB.cx, ai.tz - HUB.cz); ai.tx = HUB.cx + (ai.tx - HUB.cx) * k; ai.tz = HUB.cz + (ai.tz - HUB.cz) * k; }
    // cross over the BUMP/TRENCH like everyone else when the player is on the other half
    if (Math.sign(rb.x - CX) !== Math.sign(P.x - CX) && Math.abs(rb.x - CX) > 0.8) { planCross(rb, ai, Math.sign(P.x - CX)); }
    return;
  }
  if (!inHalf && !(ai.mode === 'cross' && ai.path.length)) { if (Math.sign(rb.x - CX) !== zs) { planCross(rb, ai, zs); return; } }
  if (ai.mode === 'cross' && ai.path.length) return;
  const n = rb.count();
  const fuelTargets = W.fuel.balls.filter(b => b.state === F_FIELD && b.y < 0.25 && Math.sign(b.x - CX) === zs && Math.abs(b.x - CX) > HUB.half + 0.35 && b.z > 0.12 && b.z < FIELD.W - 0.12 && !(b.claim && b.claim !== rb && b.claimT > t)
    && !W.robots.some(o => o !== rb && Math.hypot(o.x - b.x, o.z - b.z) < (o.isPlayer ? 1.25 : 0.85)));
  // a robot parked on our shooting spot: pick another
  if (ai.mode === 'shoot' && W.robots.some(o => o !== rb && Math.hypot(o.x - ai.tx, o.z - ai.tz) < (o.isPlayer ? 1.3 : 1.0))) ai.mode = 'repick';
  if (n >= a.capacity || (n > 0 && (fuelTargets.length === 0 || ai.mode === 'shoot' || ai.mode === 'repick')) || (g.isAuto() && (n >= 4 || (n > 0 && t < 3)))) {
    if (ai.mode !== 'shoot') {
      ai.mode = 'shoot';
      const r = { easy: 2.4, normal: 2.7, hard: 3.1 }[a.level] || 2.7;
      let best = null, bs = -1e9;
      for (let ang = -0.95; ang <= 0.95; ang += 0.1) {
        const tx = CX + zs * r * Math.cos(ang), tz = CZ + r * Math.sin(ang);
        if (tz < 0.7 || tz > FIELD.W - 0.7 || onBump(tx, tz)) continue;
        let room = 9;
        for (const o of W.robots) if (o !== rb) {
          room = Math.min(room, Math.hypot(o.x - tx, o.z - tz)); if (o.ai && o.ai.mode === 'shoot') room = Math.min(room, Math.hypot(o.ai.tx - tx, o.ai.tz - tz));
          // keep clear of where the driver's robot is heading (its next 1.5 m)
          if (o.isPlayer) for (const k of [0.75, 1.5]) room = Math.min(room, Math.hypot(o.x + o.fx * k - tx, o.z + o.fz * k - tz) - 0.3);
        }
        const sc = Math.min(room, 2.2) - 0.35 * Math.hypot(rb.x - tx, rb.z - tz) - 0.3 * Math.abs(ang - ai.spot);
        if (sc > bs) { bs = sc; best = [tx, tz]; }
      }
      ai.tx = best ? best[0] : CX + zs * r; ai.tz = best ? best[1] : CZ + 1.2;
    }
    return;
  }
  if (fuelTargets.length) {
    // nearest, preferring ones in front
    let best = null, bd = 1e9;
    for (const b of fuelTargets) { const dx = b.x - rb.x, dz = b.z - rb.z; let d = Math.hypot(dx, dz); const ahead = (dx * rb.fx + dz * rb.fz) / (d || 1); d *= 1.25 - 0.25 * ahead; if (d < bd) { bd = d; best = b; } }
    best.claim = rb; best.claimT = t + 1.0;
    ai.mode = 'collect'; ai.tx = best.x; ai.tz = best.z;
  } else { ai.mode = 'idle'; }
}
function planCross(rb, ai, zs) {
  // over the BUMP (z ~ 1.7) or under the TRENCH (z ~ 6.35): whichever is closer
  const bumpZ = (BUMP.z0 + BUMP.z1) / 2, trenchZ = (TRENCH.z0 + TRENCH.post + TRENCH.z1 - TRENCH.post) / 2;
  const useBump = Math.abs(rb.z - bumpZ) < Math.abs(rb.z - trenchZ);
  // keep right: robots heading +x use the low-z lane, robots heading -x the high-z lane
  const zc = (useBump ? bumpZ : trenchZ) + (zs > 0 ? -1 : 1) * (useBump ? 0.8 : 0.62);
  ai.mode = 'cross'; ai.path = [[CX - zs * 1.6, zc], [CX - zs * 1.0, zc], [CX + zs * 1.5, zc]];
}

// ---------------- driver assists (the "easy controls") ----------------
// What real robot code could do with an AprilTag camera and odometry:
// auto-aim while SHOOT is held, feed only when aimed + slow + in the ALLIANCE ZONE,
// pre-spin while carrying FUEL in the zone, stow the intake after it is released, stop intaking at 10 FUEL.
function playerAssist(W, P, inp, dt) {
  const g = W.game, on = W.settings.assists !== 'off';
  P.cmd.l = inp.l; P.cmd.r = inp.r; P.cmd.outtake = inp.outtake; P.cmd.shoot = inp.shoot; P.preset = inp.preset;
  P.cmd.intake = inp.intake; P.cmd.prespin = inp.prespin;
  // toggle mode: the second press raises the intake (with assists on, the auto-stow below waits until the module is clear)
  P.cmd.stow = inp.stow || (!on && inp.intakeUp);
  P.assist = null; P.capLimit = on ? 10 : null;
  if (!on) { P.feedOk = null; return; }
  const n = P.count(), inZone = W.settings.mode !== 'match' || g.inZone(P);
  if (inp.intake && n >= 10) { P.cmd.intake = false; P.assist = 'full'; }
  // stow once the module is clear (FUEL in the module would be flung out by the folding arm)
  if (!inp.intake && !inp.outtake && !P.transit.some(tr => tr.t < 0.6)) { P.stowT = (P.stowT || 0) + dt; if (P.stowT > 0.45) P.cmd.stow = true; } else P.stowT = 0;
  P.cmd.prespin = inp.prespin || (n > 0 && inZone);
  if (inp.shoot && n > 0) {
    const e = P.aimErr || 0;
    let turn = clamp(e * 2.4 - P.w * 0.25, -0.65, 0.65);
    if (Math.abs(e) > 0.012) turn = Math.sign(turn) * Math.max(Math.abs(turn), 0.29); else turn = 0;
    P.cmd.l = turn; P.cmd.r = -turn;
    P.assist = !inZone ? 'zone' : Math.abs(e) > 2 * DEG ? 'aiming' : !P.ready ? 'spinning' : 'firing';
  }
  P.feedOk = () => Math.abs(P.aimErr || 0) < 2 * DEG && Math.hypot(P.vx, P.vz) < 0.35 && (W.settings.mode !== 'match' || g.inZone(P));
}

// ---------------- the team robot's hopper: FUEL rest on spots on the ramp and roll down to the two shooter lanes ----------------
const irishSlotFree = (rb, id) => !rb.hopper.some(b => b.slot === id);
const irishLaneFree = (rb, lane) => !rb.staged.some(b => b.lane === lane) && !(rb.firing || []).some(f => f.lane === lane && f.t < 0.03);
function irishHopperAdd(rb, b, x, y) {
  let best = -1, bd = 1e9;
  HOPPER_SLOTS.forEach((s, i) => { if (!irishSlotFree(rb, i)) return; const d = Math.hypot(s.x - x, s.y - y) + s.dz * 0.8; if (d < bd) { bd = d; best = i; } });
  b.slot = best >= 0 ? best : null; b.slotT = 0.15; b.land = [x, y];
  rb.hopper.push(b);
}
function irishHopperStep(rb, dt, iv) {
  for (const b of rb.hopper) {
    b.slotT = (b.slotT || 0) - dt; if (b.slotT > 0) continue;
    if (b.slot === null || b.slot === undefined) { const free = HOPPER_SLOTS.findIndex((s, i) => irishSlotFree(rb, i)); if (free >= 0) { b.slot = free; b.slotT = 0.12; } continue; }
    const nx = HOPPER_SLOTS[b.slot].next;
    if (typeof nx === 'number' && irishSlotFree(rb, nx)) { b.slot = nx; b.slotT = 0.12; }
  }
  if (rb.hopper.length) rb.feedT = Math.min(iv, rb.feedT + dt); else rb.feedT = 0;
  if (rb.feedT < iv) return;
  for (const lane of [0, 1]) {
    if (!irishLaneFree(rb, lane)) continue;
    let b = rb.hopper.find(q => q.slot === lane);
    if (!b && !irishLaneFree(rb, 1 - lane)) b = rb.hopper.find(q => q.slot === 1 - lane);   // roll across the channel
    if (!b) continue;
    rb.hopper.splice(rb.hopper.indexOf(b), 1); b.slot = null; b.lane = lane; rb.staged.push(b); rb.feedT = 0; return;
  }
}
