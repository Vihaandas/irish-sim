// Drivetrain characterization of the sim robot (like a WPILib SysId / stopwatch session):
// top speed, 0-90 % time, 10 ft and 20 ft sprints, in-place turn rate, 90/180 deg turn times, coast-down.
// node tools/drive_test.js            -> current robot model
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const src = ['core.js', 'robot.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const ctx = { console, Math, OUT: {} }; vm.createContext(ctx);
vm.runInContext(src + (process.env.D ? ";Object.assign(IRISH.drive, " + process.env.D + ");" : "") + `
const DT = 1 / 240, R = new Robot(IRISH, 'blue', { player: true }), d = IRISH.drive;
const reset = () => { R.place(1, 4, 0); R.vx = R.vz = R.w = 0; R.uL = R.uR = 0; R.vbat = undefined; };
const sp = () => Math.hypot(R.vx, R.vz);
// straight line, full stick
reset(); let t = 0, t90 = null, x0 = R.x, t10 = null, t20 = null, peakI = 0, minV = 99;
while (t < 4) { R.cmd.l = R.cmd.r = 1; R.stepDrive(DT, true); t += DT; const dx = (R.x - x0) / FT;
  if (t10 === null && dx >= 10) t10 = t; if (t20 === null && dx >= 20) t20 = t; if (R.vbat !== undefined) minV = Math.min(minV, R.vbat); }
const vtop = sp(); reset(); t = 0; while (t < 4) { R.cmd.l = R.cmd.r = 1; R.stepDrive(DT, true); t += DT; if (t90 === null && sp() >= 0.9 * vtop) t90 = t; }
// coast-down / brake from top speed with sticks released (brake mode)
let tb = 0, xb = R.x; while (sp() > 0.02 && tb < 3) { R.cmd.l = R.cmd.r = 0; R.stepDrive(DT, true); tb += DT; }
const brakeDist = (R.x - xb) / FT;
// in-place turn, full and 65 % stick (the default turn sensitivity)
const turnRate = u => { reset(); let tt = 0, w = 0; while (tt < 3) { R.cmd.l = u; R.cmd.r = -u; R.stepDrive(DT, true); tt += DT; } return Math.abs(R.w) / DEG; };
const turnTime = (deg, u) => { reset(); let tt = 0, a = 0; while (Math.abs(a) < deg * DEG && tt < 5) { R.cmd.l = u; R.cmd.r = -u; const th = R.th; R.stepDrive(DT, true); a += wrapAng(R.th - th); tt += DT; } return tt; };
// turn radius at full speed with half turn stick (arcade mix like the game: thr 1, turn 0.5*0.65)
reset(); t = 0; while (t < 4) { const tr = 0.5 * 0.65; let l = 1 + tr, r = 1 - tr; const m = Math.max(1, l, r); R.cmd.l = l / m; R.cmd.r = r / m; R.stepDrive(DT, true); t += DT; }
const radius = sp() / Math.max(1e-6, Math.abs(R.w));
Object.assign(OUT, { topFt: vtop / FT, t90, t10, t20, brakeFt: brakeDist, brakeS: tb, turnFull: turnRate(1), turn65: turnRate(0.65), t90deg: turnTime(90, 0.65), t180deg: turnTime(180, 0.65), radiusFt: radius / FT, minBattery: minV, free: d.wf / d.G * d.r / FT * 1, ratio: d.G });
`, ctx);
const o = ctx.OUT, f = (v, n = 2) => v === null || v === undefined ? '-' : (+v).toFixed(n);
console.log(`ratio ${f(o.ratio)}:1, free speed ${f(o.free, 1)} ft/s`);
console.log(`top speed ${f(o.topFt, 1)} ft/s | 0-90% ${f(o.t90)} s | 10 ft ${f(o.t10)} s | 20 ft ${f(o.t20)} s | stop from top ${f(o.brakeFt, 1)} ft in ${f(o.brakeS)} s${o.minBattery < 99 ? ' | battery min ' + f(o.minBattery, 1) + ' V' : ''}`);
console.log(`turn in place: full stick ${f(o.turnFull, 0)} deg/s, 65% stick ${f(o.turn65, 0)} deg/s | 90 deg ${f(o.t90deg)} s, 180 deg ${f(o.t180deg)} s (65%) | radius at speed, half turn ${f(o.radiusFt, 1)} ft`);
