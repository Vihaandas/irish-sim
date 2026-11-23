// Sound engine (Web Audio, everything synthesized: no audio files).
// Continuous voices follow the robot (drive motors, shooter drum, intake rollers) plus crowd ambience;
// one-shots for FUEL bounces, shots, scoring, horns, fouls and collisions.
'use strict';
const Sound = {
  ctx: null, out: null, master: null, volume: 0.7, enabled: true, lastThud: 0, thuds: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.enabled ? this.volume : 0; this.master.connect(c.destination);
    this.out = c.createDynamicsCompressor(); this.out.threshold.value = -14; this.out.ratio.value = 4; this.out.connect(this.master);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const voice = (type, freq, filt, q = 0.7) => {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = type; o.frequency.value = freq; f.type = 'lowpass'; f.frequency.value = filt; f.Q.value = q; g.gain.value = 0;
      o.connect(f).connect(g).connect(this.out); o.start(); return { o, f, g };
    };
    // drive: two CIM-ish whines per side, slightly detuned
    this.drive = [voice('sawtooth', 60, 900), voice('sawtooth', 61.5, 900)];
    this.drum = [voice('triangle', 80, 2400), voice('sine', 160, 3000)];
    this.roll = voice('square', 70, 380, 2);
    // crowd: filtered noise bed
    const n = c.createBufferSource(); n.buffer = buf; n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.5;
    this.crowdG = c.createGain(); this.crowdG.gain.value = 0;
    n.connect(bp).connect(this.crowdG).connect(this.out); n.start();
  },
  setVolume(v) { this.volume = v; this.apply(); },
  setEnabled(on) { this.enabled = on; this.apply(); },
  apply() { if (this.master) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.05); },
  // per-frame: continuous sounds follow the player's robot
  update(s) {
    if (!this.ctx) return; const t = this.ctx.currentTime, k = 0.06;
    const sp = Math.min(1, s.speed / 5.0), effort = Math.min(1, s.effort);
    this.drive.forEach((v, i) => { v.o.frequency.setTargetAtTime(48 + sp * 150 + i * 2.5, t, k); v.f.frequency.setTargetAtTime(500 + sp * 1600, t, k); v.g.gain.setTargetAtTime(s.active ? 0.012 + 0.05 * effort + 0.025 * sp : 0, t, 0.08); });
    const r = s.drumRpm / 60;
    this.drum[0].o.frequency.setTargetAtTime(Math.max(20, r * 2), t, k); this.drum[1].o.frequency.setTargetAtTime(Math.max(40, r * 4), t, k);
    const dg = s.active ? Math.min(0.045, s.drumRpm / 3500 * 0.045) : 0;
    this.drum[0].g.gain.setTargetAtTime(dg, t, 0.1); this.drum[1].g.gain.setTargetAtTime(dg * 0.35, t, 0.1);
    this.roll.g.gain.setTargetAtTime(s.active && s.rollers ? 0.025 : 0, t, 0.05);
    this.roll.o.frequency.setTargetAtTime(s.rollers < 0 ? 55 : 72, t, 0.05);
    this.crowdG.gain.setTargetAtTime(s.crowd, t, 0.6);
  },
  env(node, peak, a, d, t0) { const g = node.gain, t = t0 || this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(peak, t + a); g.exponentialRampToValueAtTime(0.0001, t + a + d); },
  tone(freq, dur, type = 'sine', vol = 0.1, slide = 0, delay = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    o.connect(g).connect(this.out); this.env(g, vol, 0.008, dur, t); o.start(t); o.stop(t + dur + 0.05);
  },
  burst(dur, freq, q, vol, type = 'bandpass', delay = 0) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4; f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f).connect(g).connect(this.out); this.env(g, vol, 0.004, dur, t); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },
  // ---- one-shots ----
  thud(intensity, dist) {
    if (!this.ctx) return; const now = this.ctx.currentTime;
    if (now - this.lastThud > 0.25) this.thuds = 0; if (this.thuds > 8) return; this.thuds++; this.lastThud = now;
    const v = Math.min(0.14, intensity * 0.03) / (1 + dist * 0.25); if (v < 0.004) return;
    this.burst(0.09, 220 + Math.random() * 120, 1.2, v, 'lowpass'); this.tone(90 + Math.random() * 30, 0.08, 'sine', v * 0.8, -30);
  },
  shot() { this.burst(0.14, 900, 0.8, 0.08); this.tone(140, 0.12, 'sine', 0.12, -70); },
  pickup() { this.tone(330, 0.06, 'triangle', 0.05, 160); this.burst(0.05, 1500, 1, 0.025); },
  score(mine) { const b = mine ? 880 : 660; this.tone(b, 0.12, 'triangle', mine ? 0.07 : 0.035); this.tone(b * 1.5, 0.18, 'triangle', mine ? 0.06 : 0.03, 0, 0.07); },
  cheer(level) { if (!this.ctx) return; this.burst(1.2, 1100, 0.4, 0.025 + 0.04 * level, 'bandpass'); },
  clank(i) { this.burst(0.12, 2200, 3, Math.min(0.12, 0.03 * i)); this.tone(180, 0.1, 'square', Math.min(0.05, 0.012 * i), -60); },
  click() { this.tone(1200, 0.03, 'square', 0.02); },
  tick() { this.tone(988, 0.07, 'square', 0.04); },
  count() { this.tone(523, 0.16, 'square', 0.05); },
  go() { this.horn(0.8, [392, 494, 587]); },
  horn(dur = 1.1, chord = [233, 294, 349]) { chord.forEach(f => this.tone(f, dur, 'sawtooth', 0.04, 0)); },
  endHorn() { this.horn(1.6, [196, 247, 294]); },
  shiftHorn() { this.tone(659, 0.14, 'square', 0.05); this.tone(988, 0.22, 'square', 0.05, 0, 0.14); },
  foul() { this.tone(110, 0.45, 'sawtooth', 0.07, -20); this.tone(116, 0.45, 'sawtooth', 0.05, -20); },
  jam() { this.burst(0.18, 400, 2, 0.08, 'lowpass'); this.tone(70, 0.2, 'square', 0.04, -20); },
  deploy(up) { this.tone(up ? 260 : 200, 0.22, 'sawtooth', 0.02, up ? 120 : -80); },
};
