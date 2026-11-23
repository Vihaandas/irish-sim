// Headless checks of the sim logic (no graphics): drive speed, drum spin-up, shot table accuracy, full AI match.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const src = ['core.js', 'robot.js', 'fuel.js', 'game.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const ctx = { console, Math, performance: { now: () => Date.now() } }; vm.createContext(ctx);
vm.runInContext(src + `
IRISH.intakeHalfW = 0.35; IRISH.captureHalfW = 11 * IN;
buildShotExtension(); buildAiTable();
function newWorld(settings) { const W = { t: 0, robots: [], fuel: new FuelWorld(), settings: Object.assign({}, DEFAULTS, settings) }; W.game = new Game(W); W.game.reset(); return W; }
function step(W, dt, ctl) {
  const g = W.game, P = W.player; W.t += dt; g.update(dt); const en = g.enabled;
  if (g.isAuto() && W.settings.auto !== 'manual') runAuto(W, P, dt); else if (en && ctl) ctl(P, W); else { stopDrive(P); }
  for (const r of W.robots) if (!r.isPlayer) aiUpdate(W, r, dt);
  for (const r of W.robots) { r.enabled = en; r.stepDrive(dt, en); if (r.spec === IRISH) stepIrish(W, r, dt, en); else stepAiMech(W, r, dt, en); }
  for (const r of W.robots) resolveStatic(r);
  const rs = W.robots; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (resolveRobots(rs[i], rs[j])) g.onRobotContact(rs[i], rs[j]);
  fuelStep(W, dt / 2); fuelStep(W, dt / 2);
}
const DT = 1 / 120;
// 1) top speed + 0-90% time
{ const W = newWorld({ mode: 'practice', ai: 'off' }); const P = W.player; P.place(0.6, 1.0, 0); let t90 = null;
  for (let i = 0; i < 300; i++) { step(W, DT, p => { p.cmd.l = p.cmd.r = 1; }); const v = Math.hypot(P.vx, P.vz); if (!t90 && v > 0.9 * 5.03) t90 = i * DT; }
  console.log('drive: speed after 3 s', (Math.hypot(P.vx, P.vz) / FT).toFixed(2), 'ft/s; 90% of free at', t90 && t90.toFixed(2), 's; x', P.x.toFixed(2));
  // spin in place
  P.place(2, CZ, 0); for (let i = 0; i < 240; i++) step(W, DT, p => { p.cmd.l = 1; p.cmd.r = -1; });
  console.log('turn rate full opposite', (P.w / DEG).toFixed(0), 'deg/s');
}
// 2) drum spin-up to the 10 ft rpm
{ const W = newWorld({ mode: 'practice', ai: 'off' }); const P = W.player; P.preset = 3; W.settings.shotMode = 'presets'; let tr = null;
  for (let i = 0; i < 600; i++) { step(W, DT, p => { p.cmd.prespin = true; }); if (!tr && P.ready) tr = i * DT; }
  console.log('drum: ready at', tr && tr.toFixed(2), 's; rpm', (P.drumW * 60 / 2 / Math.PI).toFixed(0), 'target', P.shot.rpm.toFixed(0));
}
// 3) shooting accuracy by gap (no scatter, then realistic), robot stopped facing the HUB on the blue side, normal zone
for (const noise of ['none', 'real']) {
  const out = [];
  for (const gap of [0, 2, 4, 6, 8, 10, 13, 16]) {
    const W = newWorld({ mode: 'practice', ai: 'off', noise }); const P = W.player; W.t = 33 + 1; // practice: shift 2 (k=0 swap) -> use t so zone is normal
    W.t = 23 + 25 + 1; // practice shift 2: not swapped -> blue scores from x<CX
    const d = gapToExitDist(gap); const ex = (IRISH.shooter.exitY - IRISH.yc) * IN; // exit offset fwd from origin (negative)
    P.place(CX - d + ex, CZ, 0); P.intakePos = 1; P.intakeTarget = 1;
    // fill with 10
    while (P.staged.length) P.staged.pop(); while (P.hopper.length) P.hopper.pop();
    W.fuel.giveTo(P, 10).forEach((b, i) => { if (i < 2) { b.lane = i; P.staged.push(b); } else irishHopperAdd(P, b, 0, 22); });
    let made = 0; const before = W.game.score.blue.teleFuel;
    for (let i = 0; i < 120 * 14; i++) step(W, DT, p => { p.cmd.shoot = true; p.cmd.l = p.cmd.r = 0; });
    made = W.game.score.blue.teleFuel - before;
    out.push(gap + 'ft:' + made + '/' + P.stats.shots + (W.game.score.red.teleFuel ? ' (red ' + W.game.score.red.teleFuel + ')' : ''));
  }
  console.log('shots (' + noise + '):', out.join('  '));
}
// 4) full match with AI, player runs auto then sits
for (const auto of ['shoot-leave', 'shoot-depot']) {
  const W = newWorld({ mode: 'match', ai: 'normal', auto }); let errs = 0;
  try { for (let i = 0; i < 120 * 170; i++) step(W, DT, p => { p.cmd.l = p.cmd.r = 0; }); } catch (e) { errs++; console.log('ERR', e.stack); }
  const g = W.game; const s = a => { const x = g.score[a]; return a + ' ' + x.total + ' (auto ' + x.autoFuel + ', tele ' + x.teleFuel + ', leave ' + x.leave + ', park ' + x.park + ', foul+ ' + x.foulPts + ', RP ' + JSON.stringify(x.rp) + ')'; };
  console.log('match', auto, '| over', g.over, '|', s('blue'), '|', s('red'));
  const P = W.player; console.log('  player: leave', P.stats.leave, 'shots', P.stats.shots, 'made', P.stats.made, 'collected', P.stats.collected, 'count', P.count(), 'pos', P.x.toFixed(2), P.z.toFixed(2));
  const A = W.game.autoRun; console.log('  auto step reached', A && A.i, '/', A && A.steps.length);
  console.log('  fouls', JSON.stringify(g.score.blue.fouls.concat(g.score.red.fouls).map(f => f.rule + ' ' + f.who + ' ' + f.t.toFixed(1))));
  console.log('  fuel states', JSON.stringify(W.fuel.balls.reduce((a, b) => (a[b.state] = (a[b.state] || 0) + 1, a), {})), 'AI', W.robots.filter(r => !r.isPlayer).map(r => r.label + ':' + r.stats.made + '/' + r.stats.shots + ' c' + r.stats.collected).join(' '));
}
`, ctx);
// 5) driver assists: hold shoot from 30 deg off-target, 6 ft gap -> robot turns itself and scores
vm.runInContext(`
{
  const W = newWorld({ mode: 'practice', ai: 'off', assists: 'on' }); const P = W.player; W.t = 23 + 25 + 1;
  const d = gapToExitDist(6), ex = (IRISH.shooter.exitY - IRISH.yc) * IN;
  P.place(CX - d + ex, CZ + 0.4, 0.5); P.intakePos = P.intakeTarget = 1;
  while (P.staged.length) P.staged.pop(); while (P.hopper.length) P.hopper.pop();
  W.fuel.giveTo(P, 6).forEach((b, i) => { if (i < 2) { b.lane = i; P.staged.push(b); } else irishHopperAdd(P, b, 0, 22); });
  const inp = { l: 0, r: 0, intake: false, stow: false, outtake: false, shoot: true, prespin: false, preset: 3 };
  for (let i = 0; i < 120 * 8; i++) step(W, DT, p => playerAssist(W, p, inp, DT));
  console.log('assist auto-aim: shots', P.stats.shots, 'scored', W.game.score.blue.teleFuel, 'final aim err', (P.aimErr / DEG).toFixed(2), 'deg, intake stowed', P.intakePos.toFixed(2));
  // intake stops at 10 with assists
  const W2 = newWorld({ mode: 'practice', ai: 'off', assists: 'on', intakeModel: 'easy' }); const Q = W2.player; Q.place(1.6, CZ, Math.PI);
  const inp2 = { l: 0.35, r: 0.35, intake: true, stow: false, outtake: false, shoot: false, prespin: false, preset: 3 };
  for (let i = 0; i < 120 * 5; i++) step(W2, DT, p => playerAssist(W2, p, inp2, DT));
  console.log('assist 10-FUEL stop: count', Q.count(), 'G408 fouls', W2.game.score.blue.fouls.filter(f => f.rule === 'G408').length);
}
`, ctx);

// 6) intake flow: drive through a row of FUEL, follow one ball from carpet to the shooter lanes
vm.runInContext(`
{
  const W = newWorld({ mode: 'practice', ai: 'off', assists: 'on' }); const P = W.player; W.t = 23 + 25 + 1;
  while (P.staged.length) P.staged.pop(); while (P.hopper.length) P.hopper.pop();
  P.place(3.0, CZ, 0); P.intakePos = P.intakeTarget = 0;
  const b = W.fuel.add(4.4, FUEL.r, CZ + 0.05);
  const inp = { l: 0.55, r: 0.55, intake: true, stow: false, outtake: false, shoot: false, prespin: false, preset: 3 };
  const log = []; let lastWhere = '';
  for (let i = 0; i < 120 * 3; i++) {
    step(W, DT, p => playerAssist(W, p, i < 120 * 1.1 ? inp : Object.assign({}, inp, { l: 0, r: 0 }), DT));
    const where = P.transit.some(t => t.b === b) ? 'module' : P.hopper.includes(b) ? 'ramp slot ' + b.slot : P.staged.includes(b) ? 'lane ' + b.lane : b.state === F_FIELD ? 'field' : '?';
    if (where !== lastWhere) { log.push((i / 120).toFixed(2) + 's ' + where); lastWhere = where; }
  }
  console.log('intake flow:', log.join(' -> '), '| count', P.count());
  // shoot it: the ball passes round the drum for 0.1 s before it is in the air
  const inp2 = { l: 0, r: 0, intake: false, stow: false, outtake: false, shoot: true, prespin: false, preset: 3 };
  let fired = null, flying = null;
  for (let i = 0; i < 120 * 6 && flying === null; i++) { step(W, DT, p => playerAssist(W, p, inp2, DT)); if (fired === null && P.firing.length) fired = W.t; if (b.state === F_FIELD && fired !== null) flying = W.t; }
  console.log('shot: through the drum for', flying && fired ? (flying - fired).toFixed(3) : '-', 's; scored', W.game.score.blue.teleFuel + W.game.score.red.teleFuel);
}
`, ctx);
// 7) intake funnel: creep (1.5 ft/s) over a row of 6 FUEL spread across 30 in; smooth vs strict team-sim model
vm.runInContext(`
for (const model of ['smooth', 'cad']) {
  const W = newWorld({ mode: 'practice', ai: 'off', assists: 'on', intakeModel: model }); const P = W.player; W.t = 23 + 25 + 1;
  while (P.staged.length) P.staged.pop(); while (P.hopper.length) P.hopper.pop();
  P.place(2.4, 2.0, 0); P.intakePos = P.intakeTarget = 0;
  for (let k = 0; k < 6; k++) W.fuel.add(3.6 + k * 0.35, FUEL.r, 2.0 + (k - 2.5) * 0.13);
  const inp = { l: 0.1, r: 0.1, intake: true, stow: false, outtake: false, shoot: false, prespin: false, preset: 3 };
  for (let i = 0; i < 120 * 6; i++) step(W, DT, p => playerAssist(W, p, inp, DT));
  console.log('funnel', model, ': picked up', P.stats.collected, 'of 6 at', (Math.hypot(P.vx, P.vz) / FT).toFixed(1), 'ft/s');
}
// 8) shooting drill: 60 s, assisted shooting from the spawn spot, refills
{
  const W = newWorld({ mode: 'drill-shoot', ai: 'off', assists: 'on' }); const P = W.player; let finished = false; W.onFinish = () => { finished = true; };
  const inp = { l: 0, r: 0, intake: false, stow: false, outtake: false, shoot: true, prespin: false, preset: 3 };
  for (let i = 0; i < 120 * 63 && !finished; i++) step(W, DT, p => playerAssist(W, p, inp, DT));
  console.log('drill-shoot: finished', finished, 'shots', P.stats.shots, 'scored', W.game.score[P.alliance].teleFuel, 'balls in world', W.fuel.balls.length);
}
`, ctx);
