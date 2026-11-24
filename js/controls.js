// Driver controls: simple defaults, keyboard/controller glyphs, remapping, and a WPILib snippet for the same layout.
'use strict';
const PAD_BTN = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Guide'];
const PAD_AXIS = ['Left stick X', 'Left stick Y', 'Right stick X', 'Right stick Y'];
const JAVA_BTN = ['a()', 'b()', 'x()', 'y()', 'leftBumper()', 'rightBumper()', 'leftTrigger()', 'rightTrigger()', 'back()', 'start()', 'leftStick()', 'rightStick()', 'povUp()', 'povDown()', 'povLeft()', 'povRight()'];
const JAVA_AXIS = ['getLeftX()', 'getLeftY()', 'getRightX()', 'getRightY()'];
const WPI_RAW_AXIS = [0, 1, 4, 5];   // browser axis index -> XboxController raw axis index

const CONTROL_ACTIONS = [
  { id: 'shoot', label: 'Shoot', hint: 'hold: aims at the HUB and fires', java: 'whileTrue(shooter.aimAndShoot())' },
  { id: 'intake', label: 'Intake', hint: 'press: lowers and runs; press again: raises (or hold, in the setting above)', java: 'toggleOnTrue(intake.deployAndRun())', javaHold: 'whileTrue(intake.deployAndRun())' },
  { id: 'outtake', label: 'Outtake', hint: 'hold: reverses the intake (FUEL still in the module)', java: 'whileTrue(intake.outtake())' },
  { id: 'slow', label: 'Slow mode', hint: 'hold for fine driving', java: 'whileTrue(drive.slowMode())' },
  { id: 'stow', label: 'Stow intake', hint: 'automatic with assists on', java: 'onTrue(intake.stow())' },
  { id: 'prespin', label: 'Pre-spin drum', hint: 'toggle; automatic with assists on', java: 'toggleOnTrue(shooter.preSpin())' },
  { id: 'preset1', label: 'RPM preset: HUB wall', hint: 'preset mode only', java: 'onTrue(shooter.usePresetGapFeet(0))' },
  { id: 'preset2', label: 'RPM preset: 3 ft', hint: 'preset mode only', java: 'onTrue(shooter.usePresetGapFeet(3))' },
  { id: 'preset3', label: 'RPM preset: 6 ft', hint: 'preset mode only', java: 'onTrue(shooter.usePresetGapFeet(6))' },
  { id: 'preset4', label: 'RPM preset: 10 ft', hint: 'preset mode only', java: 'onTrue(shooter.usePresetGapFeet(10))' },
  { id: 'reset', label: 'Reset robot to the line', hint: 'practice and drills', sim: true },
  { id: 'refill', label: 'Load 10 FUEL', hint: 'free practice', sim: true },
  { id: 'camera', label: 'Change camera', sim: true },
  { id: 'pause', label: 'Pause', sim: true },
];
const CONTROL_AXES = [
  { id: 'throttle', label: 'Drive forward / back', keys: 'W / S', prompt: 'Push the stick forward' },
  { id: 'turn', label: 'Turn', keys: 'A / D', prompt: 'Push the stick right' },
  { id: 'right', label: 'Right side (tank only)', keys: 'I / K', prompt: 'Push the stick forward' },
];
const DEFAULT_BINDS = {
  keys: { shoot: ['Space'], intake: ['KeyE'], outtake: ['KeyQ'], slow: ['ShiftLeft'], stow: ['KeyX'], prespin: ['KeyF'], preset1: ['Digit1'], preset2: ['Digit2'], preset3: ['Digit3'], preset4: ['Digit4'], camera: ['KeyC'], pause: ['Escape'], reset: ['KeyR'], refill: ['KeyG'] },
  pad: { shoot: { b: 7 }, intake: { b: 6 }, outtake: { b: 1 }, slow: { b: 4 }, stow: { b: 3 }, prespin: { b: 5 }, preset1: { b: 12 }, preset2: { b: 15 }, preset3: { b: 13 }, preset4: { b: 14 }, camera: { b: 8 }, pause: { b: 9 }, reset: { b: 10 }, refill: { b: 11 } },
  axes: { throttle: { a: 1, inv: true }, turn: { a: 2, inv: false }, right: { a: 3, inv: true } },
};
const BIND_KEY = 'irish-sim-binds-v2';

const Controls = {
  binds: JSON.parse(JSON.stringify(DEFAULT_BINDS)),
  capture: null,
  listeners: [],
  load() {
    try { const s = JSON.parse(localStorage.getItem(BIND_KEY) || 'null'); if (s && s.keys && s.pad && s.axes) this.binds = { keys: Object.assign({}, DEFAULT_BINDS.keys, s.keys), pad: Object.assign({}, DEFAULT_BINDS.pad, s.pad), axes: Object.assign({}, DEFAULT_BINDS.axes, s.axes) }; } catch (e) { /* storage blocked */ }
  },
  save() { try { localStorage.setItem(BIND_KEY, JSON.stringify(this.binds)); } catch (e) { /* ignore */ } this.changed(); },
  reset() { this.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS)); this.capture = null; this.save(); },
  changed() { for (const f of this.listeners) f(); },
  keyName(code) {
    if (!code) return '-';
    const map = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R Shift', ControlLeft: 'Ctrl', ControlRight: 'R Ctrl', AltLeft: 'Alt', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backquote: '`' };
    return map[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace(/^Numpad/, 'Num ');
  },
  padName(bd) { if (!bd) return '-'; if (bd.b !== undefined) return PAD_BTN[bd.b] || 'Button ' + bd.b; return (PAD_AXIS[bd.a] || 'Axis ' + bd.a) + (bd.dir > 0 ? ' +' : ' -'); },
  axisName(ax) { if (!ax) return '-'; return (PAD_AXIS[ax.a] || 'Axis ' + ax.a) + (ax.inv ? ' (inverted)' : ''); },
  // HTML glyph for an action in the chosen input mode
  glyph(id, mode) {
    if (mode === 'controller') {
      const bd = this.binds.pad[id]; if (!bd) return '<span class="g">-</span>';
      if (bd.b !== undefined) {
        const n = PAD_BTN[bd.b] || 'B' + bd.b;
        const cls = { A: 'ga', B: 'gb', X: 'gx', Y: 'gy' }[n] || (/^(LT|RT|LB|RB)$/.test(n) ? 'gt' : /^D-pad/.test(n) ? 'gd' : 'gs');
        return `<span class="g ${cls}">${n.replace('D-pad ', 'D-pad ')}</span>`;
      }
      return `<span class="g gs">${this.padName(bd)}</span>`;
    }
    const k = (this.binds.keys[id] || [])[0];
    return `<kbd>${this.keyName(k)}</kbd>`;
  },
  stickGlyph(id) { const ax = this.binds.axes[id]; if (!ax) return '<span class="g gs">-</span>'; return `<span class="g gs">${(PAD_AXIS[ax.a] || 'Axis ' + ax.a).replace(/ [XY]$/, '').replace(' stick', ' stick')}</span>`; },
  keyDown(id, keys) { return (this.binds.keys[id] || []).some(c => keys.has(c)); },
  keyEdge(id, edges) { return (this.binds.keys[id] || []).some(c => edges.has(c)); },
  padValue(pad, id) {
    const bd = this.binds.pad[id]; if (!pad || !bd) return 0;
    if (bd.b !== undefined) { const b = pad.buttons[bd.b]; return b ? (b.value || (b.pressed ? 1 : 0)) : 0; }
    return Math.max(0, (pad.axes[bd.a] || 0) * (bd.dir || 1));
  },
  axis(pad, id) { const ax = this.binds.axes[id]; if (!pad || !ax) return 0; return (pad.axes[ax.a] || 0) * (ax.inv ? -1 : 1); },
  // ---- capture ----
  start(kind, id, pad) { this.capture = { kind, id, base: pad ? { b: pad.buttons.map(b => b.pressed || b.value > 0.5), a: pad.axes.slice() } : null }; this.changed(); },
  cancel() { this.capture = null; this.changed(); },
  handleKey(e) {
    const c = this.capture; if (!c) return false;
    if (c.kind !== 'key') { if (e.code === 'Escape') { this.cancel(); return true; } return false; }
    e.preventDefault();
    if (e.code === 'Escape') { this.cancel(); return true; }
    if (e.code === 'Backspace' || e.code === 'Delete') this.binds.keys[c.id] = [];
    else if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyI', 'KeyK', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return true;
    else this.binds.keys[c.id] = [e.code];
    this.capture = null; this.save(); return true;
  },
  pollCapture(pad) {
    const c = this.capture; if (!c || c.kind === 'key') return !!c;
    if (!pad) return true;
    if (!c.base) c.base = { b: pad.buttons.map(b => b.pressed || b.value > 0.5), a: pad.axes.slice() };
    if (c.kind === 'pad') {
      const i = pad.buttons.findIndex((b, k) => (b.pressed || b.value > 0.5) && !c.base.b[k]);
      if (i >= 0) { this.binds.pad[c.id] = { b: i }; this.capture = null; this.save(); return true; }
      const a = pad.axes.findIndex((v, k) => Math.abs(v - (c.base.a[k] || 0)) > 0.6);
      if (a >= 0) { this.binds.pad[c.id] = { a, dir: Math.sign(pad.axes[a]) || 1 }; this.capture = null; this.save(); }
      return true;
    }
    let best = -1, bv = 0.6;
    pad.axes.forEach((v, k) => { const d = Math.abs(v - (c.base.a[k] || 0)); if (d > bv) { bv = d; best = k; } });
    if (best >= 0) { this.binds.axes[c.id] = { a: best, inv: pad.axes[best] < 0 }; this.capture = null; this.save(); }
    return true;
  },
  conflicts() {
    const seen = new Map(), dup = new Set();
    for (const a of CONTROL_ACTIONS) { const bd = this.binds.pad[a.id]; if (!bd) continue; const k = bd.b !== undefined ? 'b' + bd.b : 'a' + bd.a + (bd.dir > 0 ? '+' : '-'); if (seen.has(k)) { dup.add(a.id); dup.add(seen.get(k)); } else seen.set(k, a.id); }
    const ks = new Map();
    for (const a of CONTROL_ACTIONS) for (const code of this.binds.keys[a.id] || []) { if (ks.has(code)) { dup.add('k:' + a.id); dup.add('k:' + ks.get(code)); } else ks.set(code, a.id); }
    return dup;
  },
  // ---- remap editor ----
  render(el) {
    if (!el) return;
    const c = this.capture, dup = this.conflicts();
    const chip = (kind, id, text, extra = '') => {
      const on = c && c.kind === kind && c.id === id;
      const label = on ? (kind === 'key' ? 'Press a key' : kind === 'pad' ? 'Press a button' : CONTROL_AXES.find(x => x.id === id).prompt) : text;
      return `<button type="button" class="bind${on ? ' live' : ''}${extra}" data-kind="${kind}" data-id="${id}">${label}</button>`;
    };
    const rows = CONTROL_AXES.map(a => `<tr><td>${a.label}</td><td><span class="fixed">${a.keys}</span></td><td>${chip('axis', a.id, this.axisName(this.binds.axes[a.id]))}</td></tr>`)
      .concat(CONTROL_ACTIONS.map(a => `<tr><td>${a.label}<span class="hintsm">${a.sim ? 'sim only' : a.hint || ''}</span></td><td>${chip('key', a.id, (this.binds.keys[a.id] || []).map(k => this.keyName(k)).join(' / ') || '-', dup.has('k:' + a.id) ? ' dup' : '')}</td><td>${chip('pad', a.id, this.padName(this.binds.pad[a.id]), dup.has(a.id) ? ' dup' : '')}</td></tr>`));
    el.innerHTML = `<div class="tablewrap"><table class="bindtable"><thead><tr><th>Action</th><th>Keyboard</th><th>Controller</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
      <div class="row bindbar"><button type="button" class="btn" data-act="reset">Reset to defaults</button><button type="button" class="btn" data-act="code">Show robot-code bindings</button>
      <span class="note">${dup.size ? '<b class="badtxt">Red bindings are used twice.</b> ' : ''}Click a binding, then press the new key or button, or move the stick. Esc cancels.</span></div>
      <div class="codebox" hidden><div class="row"><button type="button" class="btn" data-act="copy">Copy</button><span class="note">WPILib Java for RobotContainer. Command and subsystem names are placeholders.</span></div><pre tabindex="0"></pre></div>`;
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.kind) { const pad = Controls.getPad ? Controls.getPad() : null; if (c && c.kind === b.dataset.kind && c.id === b.dataset.id) this.cancel(); else this.start(b.dataset.kind, b.dataset.id, pad); return; }
      const act = b.dataset.act, box = el.querySelector('.codebox');
      if (act === 'reset') this.reset();
      else if (act === 'code') { box.hidden = !box.hidden; box.querySelector('pre').textContent = this.javaSnippet(Controls.settings || {}); }
      else if (act === 'copy') {
        const pre = box.querySelector('pre'), txt = pre.textContent;
        const sel = () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
        try { navigator.clipboard.writeText(txt).then(() => { b.textContent = 'Copied'; }, () => { sel(); b.textContent = 'Selected: press Ctrl+C'; }); } catch (err) { sel(); b.textContent = 'Selected: press Ctrl+C'; }
      }
    };
  },
  javaSnippet(S) {
    const B = this.binds;
    const axF = a => { if (!a) return '0.0'; const f = JAVA_AXIS[a.a] ? 'driver.' + JAVA_AXIS[a.a] : `driver.getRawAxis(${WPI_RAW_AXIS[a.a] !== undefined ? WPI_RAW_AXIS[a.a] : a.a})`; return (a.inv ? '-' : '') + f; };
    const trig = bd => {
      if (!bd) return null;
      if (bd.b !== undefined) return JAVA_BTN[bd.b] ? 'driver.' + JAVA_BTN[bd.b] : null;
      const raw = WPI_RAW_AXIS[bd.a] !== undefined ? WPI_RAW_AXIS[bd.a] : bd.a;
      return bd.dir > 0 ? `driver.axisGreaterThan(${raw}, 0.5)` : `driver.axisLessThan(${raw}, -0.5)`;
    };
    const ts = S.turnScale || 0.65;
    const lines = [
      '// Driver controller layout from the IRISH BUILT driver sim (' + new Date().toISOString().slice(0, 10) + ').',
      '// Write these commands so the real robot drives the way the drivers practised.',
      '// Subsystem and command names below are placeholders.',
      'private final CommandXboxController driver = new CommandXboxController(0);',
      '',
      'private void configureBindings() {',
    ];
    if (S.drive === 'tank') lines.push('  // Tank drive. The sim squares each stick.', '  drive.setDefaultCommand(drive.tankDrive(', `      () -> ${axF(B.axes.throttle)},`, `      () -> ${axF(B.axes.right)}));`);
    else {
      const turn = S.drive === 'arcade1' ? axF({ a: 0, inv: false }) : axF(B.axes.turn);
      lines.push(`  // ${S.drive === 'arcade1' ? 'One-stick' : 'Split'} arcade drive. The sim squares both inputs, scales turning to ${Math.round(ts * 100)}%`,
        '  // and adds a 0.26 minimum turn output so small turns beat the drop-center wheel scrub.',
        '  drive.setDefaultCommand(drive.arcadeDrive(', `      () -> ${axF(B.axes.throttle)},`, `      () -> ${turn}));`);
    }
    lines.push('');
    for (const a of CONTROL_ACTIONS) {
      if (a.sim) continue;
      const t = trig(B.pad[a.id]);
      const j = S.intakeMode === 'hold' && a.javaHold ? a.javaHold : a.java;
      lines.push(t ? `  ${t}.${j};   // ${a.label}` : `  // ${a.label}: not bound to a controller button`);
    }
    lines.push('}');
    if (S.assists !== 'off') lines.push('', '// Driver assists the sim used (aimAndShoot / deployAndRun should do the same):',
      '//  - Shoot: turn to the HUB AprilTags (IDs 9/10/25/26), set drum rpm from the shot table by distance,',
      '//    feed only when aimed within 2 deg, moving under 1.1 ft/s and inside our ALLIANCE ZONE (G407).',
      '//  - Pre-spin the drum whenever we hold FUEL inside our ALLIANCE ZONE.',
      '//  - Stow the intake 0.45 s after it is switched off (it jams on the BUMP when deployed).',
      '//  - Stop the intake rollers at 10 FUEL (G408).');
    const simOnly = CONTROL_ACTIONS.filter(a => a.sim).map(a => `${a.label} = ${this.padName(B.pad[a.id])}`).join(', ');
    lines.push('', `// Sim-only buttons: ${simOnly}.`);
    if (this.conflicts().size) lines.push('// Warning: some buttons are bound to two actions in the sim.');
    return lines.join('\n');
  },
};
Controls.load();
