// Usage: node tools/auto_matrix.js . [autos,comma,separated] [runs per case]
// Run each auto across alliances, start spots, AI levels and random seeds; report the player's AUTO results.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(process.argv[2], 'js');
const src = ['core.js', 'robot.js', 'fuel.js', 'game.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const autos = (process.argv[3] || 'shoot-leave,shoot-depot').split(','), N = +(process.argv[4] || 4);
const ctx = { console, Math, performance: { now: () => Date.now() }, AUTOS: autos, N }; vm.createContext(ctx);
vm.runInContext(src + `
IRISH.intakeHalfW = 0.35; IRISH.captureHalfW = 11 * IN; buildShotExtension(); buildAiTable();
function run(auto, alliance, start, ai) {
  const W = { t: 0, robots: [], fuel: new FuelWorld(), settings: Object.assign({}, DEFAULTS, { mode: 'match', ai, auto, alliance, start }) }; W.game = new Game(W); W.game.reset();
  const DT = 1 / 120, P = W.player; let lastShot = 0, shots0 = 0, refill = 0, maxN = 0, emptyT = null;
  for (let i = 0; i < 120 * 23.5; i++) {
    const g = W.game; W.t += DT; g.update(DT); const en = g.enabled;
    if (g.isAuto()) runAuto(W, P, DT); else { stopDrive(P); P.cmd.shoot = P.cmd.intake = false; }
    for (const r of W.robots) if (!r.isPlayer) aiUpdate(W, r, DT);
    for (const r of W.robots) { r.enabled = en; r.stepDrive(DT, en); if (r.spec === IRISH) stepIrish(W, r, DT, en); else stepAiMech(W, r, DT, en); }
    for (const r of W.robots) resolveStatic(r);
    const rs = W.robots; for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) if (resolveRobots(rs[a], rs[b])) g.onRobotContact(rs[a], rs[b]);
    fuelStep(W, DT / 2); fuelStep(W, DT / 2);
    if (P.count() === 0 && emptyT === null) emptyT = W.t;
    if (emptyT !== null) maxN = Math.max(maxN, P.count());
    if (P.stats.shots !== shots0) { shots0 = P.stats.shots; lastShot = W.t; }
  }
  const f = W.game.score[alliance].fouls.concat(W.game.score[otherAlliance(alliance)].fouls).filter(x => x.who === 'YOU');
  return { shots: P.stats.shots, made: P.stats.made, leave: P.stats.leave, emptyT, refill: maxN, lastShot, fouls: f.map(x => x.rule).join(' '), step: W.game.autoRun.i + '/' + W.game.autoRun.steps.length };
}
for (const auto of AUTOS) {
  const rows = [];
  for (const alliance of ['blue', 'red']) for (const start of ['center', 'left', 'right']) for (const ai of ['off', 'normal', 'hard']) for (let k = 0; k < N; k++) rows.push(Object.assign({ alliance, start, ai }, run(auto, alliance, start, ai)));
  const avg = k => (rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(2);
  const worst = rows.slice().sort((a, b) => a.made - b.made).slice(0, 4);
  console.log('==', auto, 'runs', rows.length, 'made avg', avg('made'), 'min', Math.min(...rows.map(r => r.made)), 'max', Math.max(...rows.map(r => r.made)), 'shots avg', avg('shots'), 'leave', rows.filter(r => r.leave).length + '/' + rows.length,
    'fouls', rows.filter(r => r.fouls).length, 'preload empty at', avg('emptyT'), 's, refilled to', avg('refill'), 'last shot', avg('lastShot'));
  for (const r of worst) console.log('   worst:', JSON.stringify(r));
  const fr = rows.filter(r => r.fouls); if (fr.length) console.log('   foul runs:', JSON.stringify(fr.slice(0, 3)));
}
`, ctx);
