const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const src = ['core.js', 'robot.js', 'fuel.js', 'game.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const ctx = { console, Math, performance: { now: () => Date.now() }, AUTO: process.argv[2] || 'shoot-leave' }; vm.createContext(ctx);
vm.runInContext(src + `
IRISH.intakeHalfW = 0.35; IRISH.captureHalfW = 11 * IN; buildShotExtension(); buildAiTable();
const W = { t: 0, robots: [], fuel: new FuelWorld(), settings: Object.assign({}, DEFAULTS, { mode: 'match', ai: 'normal', auto: AUTO }) }; W.game = new Game(W); W.game.reset();
const DT = 1 / 120, P = W.player; let last = -1;
for (let i = 0; i < 120 * 40; i++) {
  const g = W.game; W.t += DT; g.update(DT); const en = g.enabled;
  if (g.isAuto()) runAuto(W, P, DT); else stopDrive(P);
  for (const r of W.robots) if (!r.isPlayer) aiUpdate(W, r, DT);
  for (const r of W.robots) { r.enabled = en; r.stepDrive(DT, en); if (r.spec === IRISH) stepIrish(W, r, DT, en); else stepAiMech(W, r, DT, en); }
  for (const r of W.robots) resolveStatic(r);
  const rs = W.robots; for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) if (resolveRobots(rs[a], rs[b])) g.onRobotContact(rs[a], rs[b]);
  fuelStep(W, DT / 2); fuelStep(W, DT / 2);
  if (i % 60 === 0) {
    const A = g.autoRun, s = A.steps[A.i];
    const ai = W.robots.filter(r => !r.isPlayer).map(r => r.label + '[' + (r.ai && r.ai.mode) + ' ' + r.x.toFixed(1) + ',' + r.z.toFixed(1) + ' n' + r.count() + ']').join(' ');
    console.log(W.t.toFixed(1), 'step', A.i, s && s.name, 'P', P.x.toFixed(2), P.z.toFixed(2), (P.th / DEG).toFixed(0) + 'deg', 'v', Math.hypot(P.vx, P.vz).toFixed(2), 'n', P.count(), 'cmd', P.cmd.l.toFixed(2), P.cmd.r.toFixed(2), 'left', P.leftLine, '|', ai);
  }
}
console.log('leave', P.stats.leave, 'autoFuel', W.game.score.blue.autoFuel, 'fouls', JSON.stringify(W.game.score.blue.fouls.concat(W.game.score.red.fouls)));
`, ctx);
