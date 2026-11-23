// Scene, visuals, input, cameras, HUD and menus for the IRISH BUILT driver sim.
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const SET_KEY = 'irish-sim-settings-v2';
  const W = { t: 0, robots: [], fuel: new FuelWorld(), settings: Object.assign({}, DEFAULTS) };
  W.game = new Game(W);
  window.SIM = W;
  try { Object.assign(W.settings, JSON.parse(localStorage.getItem(SET_KEY) || '{}')); } catch (e) { /* storage blocked */ }
  const S = () => W.settings;
  const COL = { blue: 0x3b82f6, red: 0xef4444, fuel: 0xf6c443 };
  const col = hex => new THREE.Color(hex).convertSRGBToLinear();
  const QUALITY = { high: { shadow: 4096, ratio: 2, crowd: true }, medium: { shadow: 2048, ratio: 1.5, crowd: true }, low: { shadow: 0, ratio: 1, crowd: false } };
  let state = 'loading';

  // ---------------- renderer, environment, lights ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('view').appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = col(0x0f141b); scene.fog = new THREE.Fog(col(0x0f141b), 32, 80);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 300);
  const resize = () => { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  window.addEventListener('resize', resize); resize();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  (function buildEnvironment() {
    // a small "arena" rendered once into a reflection map: overhead light banks, alliance-coloured ends
    const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(60, 22, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x1a2029), side: THREE.BackSide })));
    const panel = (w, h, p, r, c, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(s), side: THREE.DoubleSide })); m.position.set(p[0], p[1], p[2]); m.rotation.set(r[0], r[1], r[2]); env.add(m); };
    for (let i = -2; i <= 2; i++) for (const z of [-7, 0, 7]) panel(5, 1.2, [i * 9, 10.6, z], [Math.PI / 2, 0, 0], 0xffffff, 7);
    panel(34, 5, [-29.6, 3, 0], [0, Math.PI / 2, 0], 0x3b82f6, 1.0); panel(34, 5, [29.6, 3, 0], [0, -Math.PI / 2, 0], 0xef4444, 1.0);
    panel(56, 7, [0, 4, -19.6], [0, 0, 0], 0x7d8da3, 0.7); panel(56, 7, [0, 4, 19.6], [0, Math.PI, 0], 0x7d8da3, 0.7);
    panel(60, 40, [0, -10.9, 0], [-Math.PI / 2, 0, 0], 0x3a4048, 1);
    scene.environment = pm.fromScene(env, 0.035).texture; pm.dispose();
  })();
  scene.add(new THREE.HemisphereLight(col(0xdfe9ff), col(0x24221f), 0.35));
  const sun = new THREE.DirectionalLight(col(0xffffff), 1.6); sun.position.set(CX - 6, 18, CZ - 8); sun.target.position.set(CX, 0, CZ);
  sun.castShadow = true; Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 7.5, bottom: -7.5, near: 2, far: 45 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(col(0xc8d8ff), 0.4); fill.position.set(CX + 8, 10, CZ + 10); scene.add(fill);

  // ---------------- procedural textures ----------------
  function canvasTex(w, h, draw, repeat, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  const rnd = Math.random;
  const grain = (x, w, h, base, line, n) => { x.fillStyle = base; x.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { x.strokeStyle = line.replace('A', (0.05 + rnd() * 0.12).toFixed(2)); x.lineWidth = 0.6 + rnd() * 1.6; const y = rnd() * h; x.beginPath(); x.moveTo(0, y); for (let px = 0; px <= w; px += 16) x.lineTo(px, y + Math.sin(px * 0.03 + i) * 3 + (rnd() - 0.5) * 1.5); x.stroke(); } };
  const TEX = {
    carpet: canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#585e65'; x.fillRect(0, 0, w, h); for (let i = 0; i < 30000; i++) { const v = 74 + rnd() * 52 | 0; x.fillStyle = `rgba(${v},${v + 3},${v + 8},0.55)`; x.fillRect(rnd() * w, rnd() * h, 1.2, 1 + rnd() * 2.4); } }, [30, 15]),
    wood: canvasTex(256, 256, (x, w, h) => grain(x, w, h, '#c9a174', 'rgba(110,70,35,A)', 60), [1, 1]),
    ply: canvasTex(512, 256, (x, w, h) => { grain(x, w, h, '#dcc095', 'rgba(150,105,55,A)', 70); x.fillStyle = 'rgba(90,60,30,.35)'; x.fillRect(0, 0, w, 2); x.fillRect(0, h / 2, w, 2); }, [1, 1]),
    diamond: canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#8b939b'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(230,236,242,.35)'; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.save(); x.translate(i * 16 + (j % 2) * 8 + 4, j * 16 + 8); x.rotate(0.6); x.fillRect(-5, -1.2, 10, 2.4); x.restore(); } }, [60, 2]),
    crowd: canvasTex(1024, 128, (x, w, h) => { x.fillStyle = '#161b22'; x.fillRect(0, 0, w, h); x.fillStyle = '#20262e'; x.fillRect(0, h - 26, w, 26); for (let i = 0; i < 70; i++) { const px = 8 + i * (w - 16) / 70 + (rnd() - 0.5) * 6; if (rnd() < 0.35) continue; const hue = [210, 0, 45, 120, 280, 30][rnd() * 6 | 0], l = 22 + rnd() * 22 | 0; x.fillStyle = `hsl(${hue},${12 + rnd() * 30 | 0}%,${l}%)`; x.fillRect(px - 6, 52, 12, 46); x.fillStyle = `hsl(25,${20 + rnd() * 20 | 0}%,${28 + rnd() * 25 | 0}%)`; x.beginPath(); x.arc(px, 44, 6.5, 0, 7); x.fill(); } }, [14, 1]),
    foam: canvasTex(128, 64, (x, w, h) => { x.fillStyle = '#f3c330'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(150,105,10,${(rnd() * 0.18).toFixed(2)})`; x.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); } }),
    glow: canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }),
  };

  // ---------------- field (manual section 3) ----------------
  const mats = {
    carpet: new THREE.MeshStandardMaterial({ map: TEX.carpet, roughness: 0.97, metalness: 0 }),
    floor: new THREE.MeshStandardMaterial({ color: col(0x23272c), roughness: 0.9, metalness: 0.05 }),
    wood: new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.72 }),
    woodDark: new THREE.MeshStandardMaterial({ map: TEX.wood, color: col(0xc9b29a), roughness: 0.72 }),
    ply: new THREE.MeshStandardMaterial({ map: TEX.ply, roughness: 0.78, side: THREE.DoubleSide }),
    alu: new THREE.MeshStandardMaterial({ color: col(0xb8c0c9), roughness: 0.3, metalness: 0.85 }),
    plate: new THREE.MeshStandardMaterial({ map: TEX.diamond, roughness: 0.38, metalness: 0.75 }),
    sheet: new THREE.MeshStandardMaterial({ color: col(0x8e969f), roughness: 0.35, metalness: 0.8, side: THREE.DoubleSide }),
    poly: new THREE.MeshStandardMaterial({ color: col(0xd6e8f5), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }),
    white: new THREE.MeshStandardMaterial({ color: col(0xf2f2f2), roughness: 0.7 }),
    blue: new THREE.MeshStandardMaterial({ color: col(COL.blue), roughness: 0.6 }), red: new THREE.MeshStandardMaterial({ color: col(COL.red), roughness: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: col(0x1b1e22), roughness: 0.6 }),
    divider: new THREE.MeshStandardMaterial({ color: col(0x2a2f36), roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  };
  const box = (w, h, d, m, x, y, z, opt = {}) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.position.set(x, y, z); g.castShadow = !!opt.cast; g.receiveShadow = opt.recv !== false; (opt.parent || scene).add(g); return g; };
  const tape = (x0, x1, z0, z1, m) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), m); g.rotation.x = -Math.PI / 2; g.position.set((x0 + x1) / 2, 0.003, (z0 + z1) / 2); g.receiveShadow = true; scene.add(g); return g; };
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.L, FIELD.W), mats.carpet); carpet.rotation.x = -Math.PI / 2; carpet.position.set(CX, 0, CZ); carpet.receiveShadow = true; scene.add(carpet);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 110), mats.floor); ground.rotation.x = -Math.PI / 2; ground.position.set(CX, -0.01, CZ); ground.receiveShadow = true; scene.add(ground);
  // ALLIANCE ZONE tint (follows the SHIFT pattern)
  const tintMat = [new THREE.MeshBasicMaterial({ color: col(COL.blue), transparent: true, opacity: 0.06, depthWrite: false }), new THREE.MeshBasicMaterial({ color: col(COL.red), transparent: true, opacity: 0.06, depthWrite: false })];
  for (const [i, x] of [[0, CX / 2], [1, CX * 1.5]]) { const t = new THREE.Mesh(new THREE.PlaneGeometry(CX, FIELD.W), tintMat[i]); t.rotation.x = -Math.PI / 2; t.position.set(x, 0.002, CZ); scene.add(t); }
  // CENTER LINE, ROBOT STARTING LINES, HUB PROTECTED ZONE tape, DEPOT tape
  tape(CX - TAPE / 2, CX + TAPE / 2, 0, FIELD.W, mats.white);
  tape(START_X.blue - TAPE / 2, START_X.blue + TAPE / 2, 0, FIELD.W, mats.blue);
  tape(START_X.red - TAPE / 2, START_X.red + TAPE / 2, 0, FIELD.W, mats.red);
  tape(CX - HUB.half - TAPE, CX - HUB.half, CZ - HUB.half, CZ + HUB.half, mats.blue);
  tape(CX + HUB.half, CX + HUB.half + TAPE, CZ - HUB.half, CZ + HUB.half, mats.red);
  for (const [x0, s, m] of [[0, 1, mats.blue], [FIELD.L, -1, mats.red]]) {
    const xa = x0, xb = x0 + s * (DEPOT.d + 2 * DEPOT.tape), z0 = CZ - DEPOT.w / 2 - DEPOT.tape, z1 = CZ + DEPOT.w / 2 + DEPOT.tape;
    tape(Math.min(xa, xb), Math.max(xa, xb), z0, z0 + DEPOT.tape, m); tape(Math.min(xa, xb), Math.max(xa, xb), z1 - DEPOT.tape, z1, m);
    const xe = x0 + s * (DEPOT.d + DEPOT.tape); tape(Math.min(xe, xe + s * DEPOT.tape), Math.max(xe, xe + s * DEPOT.tape), z0, z1, m);
  }
  // guardrails: 20 in polycarbonate between aluminium extrusions
  for (const z of [0, FIELD.W]) {
    const s = z === 0 ? -1 : 1;
    box(FIELD.L, FIELD.guardH, 0.012, mats.poly, CX, FIELD.guardH / 2, z + s * 0.006, { recv: false });
    box(FIELD.L, 0.045, 0.05, mats.alu, CX, FIELD.guardH, z + s * 0.025); box(FIELD.L, 0.05, 0.05, mats.alu, CX, 0.025, z + s * 0.025);
    for (let x = 0.3; x < FIELD.L; x += 1.5) box(0.045, FIELD.guardH, 0.08, mats.alu, x, FIELD.guardH / 2, z + s * 0.06);
  }
  // ALLIANCE WALLS: diamond plate, polycarbonate, top rail, DRIVER STATION shelves
  for (const [x, all] of [[0, 'blue'], [FIELD.L, 'red']]) {
    const s = x === 0 ? -1 : 1;
    box(0.04, 36.8 * IN, FIELD.W, mats.plate, x + s * 0.02, 36.8 * IN / 2, CZ, { cast: true });
    box(0.012, 42 * IN, FIELD.W, mats.poly, x + s * 0.01, 36.8 * IN + 21 * IN, CZ, { recv: false });
    box(0.06, 0.05, FIELD.W, mats.alu, x + s * 0.03, FIELD.wallH, CZ);
    box(0.02, 0.1, FIELD.W, all === 'blue' ? mats.blue : mats.red, x + s * 0.045, 36.8 * IN - 0.07, CZ, { recv: false });
    for (const dz of [-1.6, 1.6]) box(0.31, 0.03, 69 * IN, mats.alu, x + s * 0.2, 36.8 * IN, CZ + dz);
  }
  // HUB: wood frame, AprilTag band, sheet-metal funnel, divider, LED strips showing which alliance owns each side
  const hubLed = { blue: null, red: null, flash: { blue: 0, red: 0 } };
  (function () {
    const h = HUB, cx = h.cx, cz = h.cz, post = 3.5 * IN, o = { cast: true };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(post, h.boxTop, post, mats.woodDark, cx + sx * (h.half - post / 2), h.boxTop / 2, cz + sz * (h.half - post / 2), o);
    box(2 * h.half, 10.7 * IN, 2 * h.half - 0.02, mats.wood, cx, 10.7 * IN / 2, cz, o);
    box(2 * h.half, 10 * IN, 2 * h.half, mats.wood, cx, 44 * IN, cz, o);
    box(2 * h.half + 0.01, 1.5 * IN, 2 * h.half + 0.01, mats.woodDark, cx, h.boxTop - 0.75 * IN, cz, o);
    const tagTex = id => canvasTex(64, 64, (x) => { x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#000'; x.fillRect(6, 6, 52, 52); let s = id * 2654435761 >>> 0; x.fillStyle = '#fff'; for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { s = (s * 1103515245 + 12345) >>> 0; if (s & 0x10000) x.fillRect(14 + i * 6, 14 + j * 6, 6, 6); } });
    for (const [sx, ids] of [[-1, [25, 26]], [1, [9, 10]]]) ids.forEach((id, k) => {
      const t = tagTex(id); t.magFilter = THREE.NearestFilter;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(8.1 * IN, 8.1 * IN), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      m.position.set(cx + sx * (h.half + 0.004), 44 * IN, cz + (k ? 1 : -1) * 7 * IN); m.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(m);
    });
    const fun = new THREE.Mesh(new THREE.CylinderGeometry(h.circ, h.circ * 0.5, h.rim - h.boxTop, 6, 1, true), mats.sheet);
    fun.position.set(cx, (h.rim + h.boxTop) / 2, cz); fun.castShadow = true; scene.add(fun);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(h.circ, 0.014, 6, 6), mats.alu); lip.rotation.x = Math.PI / 2; lip.rotation.z = Math.PI / 2; lip.position.set(cx, h.rim, cz); scene.add(lip);
    const div = new THREE.Mesh(new THREE.PlaneGeometry(2 * h.circ, h.dividerTop - h.boxTop), mats.divider); div.rotation.y = Math.PI / 2; div.position.set(cx, (h.dividerTop + h.boxTop) / 2, cz); scene.add(div);
    box(0.02, 0.6, 0.02, mats.black, cx, h.dividerTop + 0.3, cz);
    for (const side of ['blue', 'red']) {
      const sx = side === 'blue' ? -1 : 1, m = new THREE.MeshStandardMaterial({ color: col(0x111111), emissive: col(COL[side]), emissiveIntensity: 2, roughness: 0.4 });
      hubLed[side] = m;
      for (const y of [h.boxTop + 0.012, 10.7 * IN + 0.012]) {
        box(0.025, 0.025, 2 * h.half, m, cx + sx * (h.half + 0.014), y, cz, { recv: false });
        for (const sz of [-1, 1]) box(h.half, 0.025, 0.025, m, cx + sx * h.half / 2, y, cz + sz * (h.half + 0.014), { recv: false });
      }
    }
  })();
  // BUMP: two 15-degree plywood ramps meeting on the CENTER LINE
  (function () {
    const g = new THREE.BufferGeometry(), x0 = CX - BUMP.halfDepth, x1 = CX + BUMP.halfDepth, z0 = BUMP.z0, z1 = BUMP.z1, h = BUMP.h;
    const p = [x0, 0, z0, CX, h, z0, CX, h, z1, x0, 0, z1, x1, 0, z0, x1, 0, z1];
    const uv = []; for (let i = 0; i < p.length; i += 3) uv.push((p[i] - x0) * 1.6, p[i + 2] * 0.55);
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 2, 1, 0, 3, 2, 4, 1, 2, 4, 2, 5, 0, 1, 4, 3, 5, 2]); g.computeVertexNormals();
    TEX.ply.wrapS = TEX.ply.wrapT = THREE.RepeatWrapping;
    const m = new THREE.Mesh(g, mats.ply); m.receiveShadow = true; m.castShadow = true; scene.add(m);
    box(0.03, 0.012, z1 - z0, mats.alu, CX, h + 0.004, (z0 + z1) / 2);
  })();
  // TRENCH: feet frames, uprights and the arm (2x4s)
  (function () {
    const t = TRENCH, s = 3.5 * IN, th = 1.5 * IN, o = { cast: true };
    for (const [za, zb] of [[t.z0, t.z0 + t.post], [t.z1 - t.post, t.z1]]) {
      box(2 * t.halfDepth, th, s, mats.wood, CX, th / 2, za + s / 2, o); box(2 * t.halfDepth, th, s, mats.wood, CX, th / 2, zb - s / 2, o);
      box(s, th, zb - za, mats.wood, CX - t.halfDepth + s / 2, th / 2, (za + zb) / 2, o); box(s, th, zb - za, mats.wood, CX + t.halfDepth - s / 2, th / 2, (za + zb) / 2, o);
    }
    box(2 * t.armHalf, t.tall, s, mats.woodDark, CX, t.tall / 2, t.z0 + s / 2, o);
    box(2 * t.armHalf, t.armTop, s, mats.woodDark, CX, t.armTop / 2, t.z1 - s / 2, o);
    box(2 * t.armHalf, t.armTop - t.armBottom, t.z1 - t.z0, mats.wood, CX, (t.armTop + t.armBottom) / 2, (t.z0 + t.z1) / 2, o);
  })();

  // ---------------- arena: stands, lighting truss, scoreboard screens ----------------
  const crowd = new THREE.Group(); scene.add(crowd);
  (function () {
    const seat = new THREE.MeshStandardMaterial({ map: TEX.crowd, color: col(0xb0b4ba), roughness: 0.95 }), concrete = new THREE.MeshStandardMaterial({ color: col(0x2a2e34), roughness: 0.95 });
    for (const side of [-1, 1]) {
      const z0 = side < 0 ? -3.4 : FIELD.W + 3.4;
      for (let r = 0; r < 10; r++) box(FIELD.L + 8, 0.42, 0.86, seat, CX, 0.21 + r * 0.42, z0 + side * (r * 0.86 + 0.43), { parent: crowd });
      box(FIELD.L + 8, 5.2, 0.3, concrete, CX, 2.6, z0 + side * 9.1, { parent: crowd });
    }
    for (const [x, c] of [[-6.5, COL.blue], [FIELD.L + 6.5, COL.red]]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.W + 12, 7), new THREE.MeshStandardMaterial({ color: col(0x161b22), roughness: 0.9 }));
      wall.position.set(x, 3.5, CZ); wall.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(wall);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.W + 12, 0.25), new THREE.MeshBasicMaterial({ color: col(c) }));
      strip.position.set(x + (x < 0 ? 0.02 : -0.02), 2.4, CZ); strip.rotation.y = wall.rotation.y; scene.add(strip);
      box(3.2, 0.12, FIELD.W + 2, concrete, x < 0 ? -1.7 : FIELD.L + 1.7, 0.06, CZ);
    }
    const truss = new THREE.MeshStandardMaterial({ color: col(0x3a414b), roughness: 0.5, metalness: 0.6 }), lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2.2) });
    for (const z of [CZ - 3.2, CZ + 3.2]) { box(FIELD.L + 6, 0.25, 0.25, truss, CX, 9.2, z); for (let x = 1; x < FIELD.L; x += 2.4) box(0.8, 0.08, 0.35, lamp, x, 9.05, z, { recv: false }); }
    for (let x = 0; x <= FIELD.L; x += FIELD.L / 4) box(0.2, 0.2, 7, truss, x, 9.25, CZ);
  })();
  const jumbo = { c: document.createElement('canvas') };
  jumbo.c.width = 1024; jumbo.c.height = 576; jumbo.ctx = jumbo.c.getContext('2d');
  jumbo.tex = new THREE.CanvasTexture(jumbo.c); jumbo.tex.encoding = THREE.sRGBEncoding;
  for (const side of [-1, 1]) {
    const z = side < 0 ? -5.4 : FIELD.W + 5.4;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), new THREE.MeshBasicMaterial({ map: jumbo.tex, toneMapped: false }));
    scr.position.set(CX, 6.6, z); scr.rotation.y = side < 0 ? 0 : Math.PI; scene.add(scr);
    box(6.7, 3.9, 0.2, mats.black, CX, 6.6, z + side * 0.11);
  }
  function drawJumbo() {
    const x = jumbo.ctx, w = 1024, h = 576, g = W.game; if (!g.score) return;
    x.fillStyle = '#05070a'; x.fillRect(0, 0, w, h);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#f6c443'; x.font = '700 46px "Saira Condensed", "Arial Narrow", sans-serif'; x.fillText('IRISH 2026  ·  BUILT', w / 2, 58);
    for (const [all, bx, c] of [['blue', 40, '#1d4ed8'], ['red', w - 400, '#b91c1c']]) {
      x.fillStyle = c; x.fillRect(bx, 110, 360, 330);
      x.fillStyle = '#fff'; x.font = '800 190px "Saira Condensed", "Arial Narrow", sans-serif'; x.fillText(String(g.score[all].total), bx + 180, 260);
      x.font = '600 34px "IBM Plex Mono", monospace'; x.fillText('FUEL ' + (g.score[all].autoFuel + g.score[all].teleFuel), bx + 180, 400);
    }
    const c = Math.ceil(g.clock() - 1e-6);
    x.fillStyle = '#fff'; x.font = '800 120px "Saira Condensed", "Arial Narrow", sans-serif'; x.fillText(Math.floor(c / 60) + ':' + String(c % 60).padStart(2, '0'), w / 2, 240);
    x.fillStyle = '#9aa7b6'; x.font = '700 38px "Saira Condensed", "Arial Narrow", sans-serif'; x.fillText(g.period().name, w / 2, 330);
    x.fillStyle = '#e8edf3'; x.font = '600 30px "IBM Plex Sans", sans-serif';
    x.fillText(g.swapped() ? 'Swapped: BLUE scores from the RED half' : 'Each alliance scores from its own half', w / 2, 500);
    jumbo.tex.needsUpdate = true;
  }

  // ---------------- robot visuals ----------------
  let irishTemplate = null;
  function decodeMesh() {
    const M = window.ROBOT_MESH, h = M.header;
    const raw = atob(M.b64), bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const buf = bytes.buffer, parts = []; let maxX = 0;
    for (const c of h.chunks) {
      const q = new Uint16Array(buf, c.pOff, c.nv * 3), ix = new Uint16Array(buf, c.iOff, c.ni), pos = new Float32Array(c.nv * 3);
      const spin = /^spind+$/.test(c.group) ? h.spinAxes[+c.group.slice(4)] : null, isIn = c.group === 'intake' || !!spin;
      const oy = spin ? spin.y : h.pivot.y, oz = spin ? spin.z : h.pivot.z;
      for (let i = 0; i < c.nv; i++) {
        const X = h.min[0] + q[i * 3] / 65535 * h.span[0], Y = h.min[1] + q[i * 3 + 1] / 65535 * h.span[1], Z = h.min[2] + q[i * 3 + 2] / 65535 * h.span[2];
        if (isIn) { pos[i * 3] = (Y - oy) * IN; pos[i * 3 + 1] = (Z - oz) * IN; pos[i * 3 + 2] = X * IN; if (Y > IRISH.bumper.y1) maxX = Math.max(maxX, Math.abs(X)); }
        else { pos[i * 3] = (Y - IRISH.yc) * IN; pos[i * 3 + 1] = Z * IN; pos[i * 3 + 2] = X * IN; }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(ix, 1)); g.computeVertexNormals();
      parts.push({ g, c, mat: c.group === 'bumper' ? null : cadMat(c) });
    }
    IRISH.spin = (h.spinAxes || []).map(a => { let best = null, bd = 1e9; for (const p of IRISH.intake.path) if (p[0] < 0.3 && Math.abs(p[1] - a.y) < bd) { bd = Math.abs(p[1] - a.y); best = p; } return Object.assign({}, a, { dir: best && best[2] > a.z ? 1 : -1 }); });
    IRISH.intakeHalfW = maxX * IN; IRISH.captureHalfW = 11 * IN; IRISH.intake.stowDeg = h.stowAngleDeg; IRISH.fuelSlots = h.fuelSlots; IRISH.cadInfo = h;
    irishTemplate = parts;
  }
  // physically based look from the Onshape appearance colour: aluminium, plastics, wood, polycarbonate
  function cadMat(c) {
    const [r, g, b] = c.color.map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
    const base = { color: col((c.color[0] << 16) | (c.color[1] << 8) | c.color[2]), side: THREE.DoubleSide, flatShading: true };
    if (c.alpha < 1) return new THREE.MeshStandardMaterial(Object.assign(base, { transparent: true, opacity: Math.min(c.alpha, 0.35), roughness: 0.06, metalness: 0, depthWrite: false, envMapIntensity: 1.5 }));
    if (sat < 0.14 && mx > 0.5) return new THREE.MeshStandardMaterial(Object.assign(base, { metalness: 0.8, roughness: 0.3 }));
    if (mx < 0.22) return new THREE.MeshStandardMaterial(Object.assign(base, { metalness: 0.1, roughness: 0.55 }));
    if (r > g && g > b && sat > 0.25) return new THREE.MeshStandardMaterial(Object.assign(base, { metalness: 0, roughness: 0.72 }));
    return new THREE.MeshStandardMaterial(Object.assign(base, { metalness: 0.3, roughness: 0.45 }));
  }
  const labelSprite = (text, all, w = 0.62) => {
    const t = canvasTex(256, 64, (x) => { x.fillStyle = all === 'blue' ? 'rgba(29,78,216,.92)' : 'rgba(185,28,28,.92)'; x.beginPath(); if (x.roundRect) x.roundRect(2, 2, 252, 60, 14); else x.rect(2, 2, 252, 60); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 34px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 34); });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(w, w / 4, 1); s.renderOrder = 10; return s;
  };
  function buildIrish(rb) {
    const root = new THREE.Group(); root.rotation.order = 'YZX';
    const h = window.ROBOT_MESH.header;
    const pivot = new THREE.Group(); pivot.position.set((h.pivot.y - IRISH.yc) * IN, h.pivot.z * IN, 0); root.add(pivot);
    const noodle = new THREE.MeshStandardMaterial({ color: col(COL[rb.alliance]), roughness: 0.85, flatShading: true });
    // roller shafts of the team's module spin on their own axes inside the folding arm
    const spinners = (IRISH.spin || []).map(a => { const g = new THREE.Group(); g.position.set((a.y - h.pivot.y) * IN, (a.z - h.pivot.z) * IN, 0); pivot.add(g); return { g, dir: a.dir, r: a.r }; });
    for (const { g, c, mat } of irishTemplate) {
      const mesh = new THREE.Mesh(g, c.group === 'bumper' ? noodle : mat); mesh.castShadow = true; mesh.receiveShadow = S().quality === 'high';
      const sp = /^spind+$/.test(c.group) ? spinners[+c.group.slice(4)] : null;
      (sp ? sp.g : c.group === 'intake' ? pivot : root).add(mesh);
    }
    const you = labelSprite('YOU', rb.alliance, 0.5); you.position.set(0, 0.95, 0); root.add(you);
    root.userData = { pivot, label: you, isPlayer: true, spinners };
    return root;
  }
  function buildGeneric(rb) {
    const root = new THREE.Group(); root.rotation.order = 'YZX';
    const sp = rb.spec, L = 2 * sp.hl, Wd = 2 * sp.hw, nr = 1.3 * IN;
    const noodle = new THREE.MeshStandardMaterial({ color: col(COL[rb.alliance]), roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: col(0x1c2127), roughness: 0.55, metalness: 0.2 });
    const rubber = new THREE.MeshStandardMaterial({ color: col(0x15181b), roughness: 0.85 });
    const poly = new THREE.MeshStandardMaterial({ color: col(0xd6e8f5), roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const add = (geo, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.rotation.z = rz; o.castShadow = true; root.add(o); return o; };
    for (const yy of [3.2 * IN, 5.8 * IN]) {
      for (const s of [-1, 1]) {
        add(new THREE.CylinderGeometry(nr, nr, Wd - 2 * nr, 14), noodle, s * (L / 2 - nr), yy, 0, Math.PI / 2, 0);
        add(new THREE.CylinderGeometry(nr, nr, L - 2 * nr, 14), noodle, 0, yy, s * (Wd / 2 - nr), 0, Math.PI / 2);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.SphereGeometry(nr, 12, 8), noodle, sx * (L / 2 - nr), yy, sz * (Wd / 2 - nr));
    }
    const fl = L - 4 * nr, fw = Wd - 4 * nr;
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(fl, 2 * IN, 1 * IN), mats.alu, 0, 4.5 * IN, s * fw / 2); add(new THREE.BoxGeometry(1 * IN, 2 * IN, fw), mats.alu, s * fl / 2, 4.5 * IN, 0); }
    add(new THREE.BoxGeometry(fl, 0.2 * IN, fw), dark, 0, 2.4 * IN, 0);
    for (const x of [-0.36, 0, 0.36]) for (const z of [-1, 1]) add(new THREE.CylinderGeometry(3 * IN, 3 * IN, 1.5 * IN, 18), rubber, x * fl, 3 * IN, z * (fw / 2 - 1.2 * IN), Math.PI / 2, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(13 * IN, 13 * IN, 0.25 * IN), mats.alu, -4 * IN, 12 * IN, s * 6.5 * IN);
    const fly = add(new THREE.CylinderGeometry(2 * IN, 2 * IN, 12.5 * IN, 16), dark, -6 * IN, 15 * IN, 0, Math.PI / 2, 0);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(9 * IN, 0.6 * IN, 12.5 * IN), dark); hood.position.set(-2.5 * IN, 19 * IN, 0); hood.rotation.z = -0.45; hood.castShadow = true; root.add(hood);
    add(new THREE.BoxGeometry(12 * IN, 6 * IN, 16 * IN), poly, 6 * IN, 10 * IN, 0);
    const roller = add(new THREE.CylinderGeometry(1.1 * IN, 1.1 * IN, Wd - 4 * nr, 14), rubber, L / 2 + 1.3 * IN, 3.2 * IN, 0, Math.PI / 2, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(5 * IN, 4 * IN, 0.25 * IN), mats.alu, L / 2 - 0.5 * IN, 4 * IN, s * (Wd / 2 - 2.6 * nr));
    const lab = labelSprite(rb.label, rb.alliance); lab.position.set(0, 0.85, 0); root.add(lab);
    root.userData = { label: lab, roller, fly };
    return root;
  }
  const robotVis = new Map();
  function rebuildRobots() {
    for (const v of robotVis.values()) scene.remove(v);
    robotVis.clear();
    for (const rb of W.robots) { const v = rb.spec === IRISH ? buildIrish(rb) : buildGeneric(rb); scene.add(v); robotVis.set(rb, v); }
    applyLabels();
  }

  // ---------------- FUEL, effects ----------------
  const fuelMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(FUEL.r, 24, 16), new THREE.MeshStandardMaterial({ map: TEX.foam, roughness: 0.82 }), 260);
  fuelMesh.castShadow = true; fuelMesh.receiveShadow = true; fuelMesh.frustumCulled = false; scene.add(fuelMesh);
  const tmpM = new THREE.Matrix4(), hid = new THREE.Matrix4().makeScale(0, 0, 0), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
  // FUEL inside the team robot, in robot-frame inches. In the module and the drum they follow the real paths exactly;
  // on the ramp and in the lanes they roll from spot to spot.
  const heldVis = new Map();
  let fuelDt = 0;
  function heldTargets(rb) {
    const out = [];
    for (const tr of rb.transit) out.push([tr.b, transitLocal(rb, tr), true]);
    for (const b of rb.hopper) out.push([b, b.slot !== null && b.slot !== undefined ? slotLocal(HOPPER_SLOTS[b.slot]) : [b.land ? b.land[0] : 0, b.land ? b.land[1] : 24, rampZ(b.land ? b.land[1] : 24) + 1], false]);
    for (const b of rb.staged) { const L = LANES[b.lane === 1 ? 1 : 0]; out.push([b, [L.x, L.y, L.z], false]); }
    for (const f of rb.firing || []) out.push([f.b, fireLocal(f.t / IRISH.shooter.fireTime, LANES[f.lane].x), true]);
    return out;
  }
  function drawFuel() {
    const balls = W.fuel.balls, dt = fuelDt; fuelMesh.count = Math.min(260, balls.length);
    const held = new Map();
    for (const rb of W.robots) if (rb.spec === IRISH) {
      for (const [b, tgt, snap] of heldTargets(rb)) {
        let p = heldVis.get(b);
        if (!p || snap) p = tgt.slice();
        else {
          // roll toward the spot: quick at first, settling gently
          const d = [tgt[0] - p[0], tgt[1] - p[1], tgt[2] - p[2]], dist = Math.hypot(d[0], d[1], d[2]);
          if (dist > 1e-3) { const step = Math.min(dist, dt * (14 + dist * 7)); for (let k = 0; k < 3; k++) p[k] += d[k] / dist * step; }
        }
        heldVis.set(b, p);
        held.set(b, [rb.toWorld(p[0], p[1], p[2]), p]);
      }
    }
    for (const b of heldVis.keys()) if (!held.has(b)) heldVis.delete(b);
    for (let i = 0; i < fuelMesh.count; i++) {
      const b = balls[i];
      if (b.state === F_FIELD) { const a = b.ox === undefined ? 1 : renderAlpha, x = lerp(b.ox === undefined ? b.x : b.ox, b.x, a), y = lerp(b.oy === undefined ? b.y : b.oy, b.y, a), z = lerp(b.oz === undefined ? b.z : b.oz, b.z, a); tmpE.set(x * 3.1, z * 2.7, 0); tmpQ.setFromEuler(tmpE); tmpP.set(x, y, z); tmpM.compose(tmpP, tmpQ, tmpS); }
      else if (b.state === F_HELD && held.has(b)) { const [w, p] = held.get(b); tmpE.set(p[1] / 2.955, p[0] / 2.955, 0); tmpQ.setFromEuler(tmpE); tmpP.set(w[0], w[1], w[2]); tmpM.compose(tmpP, tmpQ, tmpS); }
      else tmpM.copy(hid);
      fuelMesh.setMatrixAt(i, tmpM);
    }
    fuelMesh.instanceMatrix.needsUpdate = true;
  }
  const fx = [];
  for (let i = 0; i < 60; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; scene.add(s); fx.push({ s, v: [0, 0, 0], life: 0 }); }
  function burst(x, y, z, color, n) {
    for (let k = 0; k < n; k++) {
      const f = fx.find(e => e.life <= 0); if (!f) return;
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 1.8;
      f.s.position.set(x, y, z); f.v = [Math.cos(a) * sp, 1.5 + Math.random() * 2, Math.sin(a) * sp]; f.life = 0.7; f.s.material.color = col(color); f.s.visible = true;
    }
  }
  function stepFx(dt) {
    for (const f of fx) {
      if (f.life <= 0) continue;
      f.life -= dt; f.v[1] -= 5 * dt;
      f.s.position.x += f.v[0] * dt; f.s.position.y += f.v[1] * dt; f.s.position.z += f.v[2] * dt;
      const k = Math.max(0, f.life / 0.7); f.s.scale.setScalar(0.08 + 0.22 * k); f.s.material.opacity = k; if (f.life <= 0) f.s.visible = false;
    }
    for (const side of ['blue', 'red']) {
      const owner = W.game.score ? W.game.creditFor(side, W.t) : side;
      hubLed[side].emissive = col(COL[owner]); hubLed.flash[side] *= Math.exp(-dt * 5); hubLed[side].emissiveIntensity = 1.6 + hubLed.flash[side] * 6;
    }
  }
  W.onScoreFx = (b, side, all, mine) => { burst(b.x, HUB.rim, b.z, COL[all], mine ? 14 : 8); hubLed.flash[side] = 1; Sound.score(mine); if (mine) { rumble(0, 0.45, 90); crowdBoost = Math.min(1, crowdBoost + 0.35); if (Math.random() < 0.35) Sound.cheer(crowdBoost); } };
  W.onFoulFx = rb => { if (rb.isPlayer) rumble(0.9, 0.6, 320); };
  let renderAlpha = 1;
  // trails behind the player's shots (last ~0.6 s of flight)
  const TRAIL_N = 36, trails = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(TRAIL_N * 3); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col(COL.fuel), transparent: true, opacity: 0.55, depthWrite: false })); line.frustumCulled = false; line.visible = false; scene.add(line);
    trails.push({ line, pos, n: 0, b: null });
  }
  function stepTrails() {
    const on = S().trail && state !== 'menu';
    for (const tr of trails) if (tr.b && (!on || tr.b.state !== F_FIELD || W.t - tr.b.launchT > 3 || tr.b.y < 0.12)) { tr.b = null; tr.line.visible = false; }
    if (!on) return;
    for (const b of W.fuel.balls) if (b.state === F_FIELD && b.shooter && b.shooter.isPlayer && W.t - b.launchT < 0.5 && b.y > 0.3 && !trails.some(t => t.b === b)) { const t = trails.find(x => !x.b); if (t) { t.b = b; t.n = 0; } }
    for (const tr of trails) if (tr.b) {
      if (tr.n === TRAIL_N) tr.pos.copyWithin(0, 3); else tr.n++;
      const i = (tr.n - 1) * 3; tr.pos[i] = tr.b.x; tr.pos[i + 1] = tr.b.y; tr.pos[i + 2] = tr.b.z;
      tr.line.geometry.setDrawRange(0, tr.n); tr.line.geometry.attributes.position.needsUpdate = true; tr.line.visible = tr.n > 1;
    }
  }
  // aim preview: where a shot would go right now (green = into the HUB)
  const ARC_N = 90, arcPos = new Float32Array(ARC_N * 3), arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  const arcMat = new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, dashSize: 0.12, gapSize: 0.08, depthWrite: false });
  const arcLine = new THREE.Line(arcGeo, arcMat); arcLine.frustumCulled = false; arcLine.visible = false; scene.add(arcLine);
  function drawArc(P) {
    const g = W.game, show = S().arc && state === 'run' && P.count() > 0 && g.enabled && !g.isAuto() && P.shot && (S().mode !== 'match' || g.inZone(P));
    arcLine.visible = !!show; if (!show) return;
    const sh = IRISH.shooter, p = P.toWorld(0, sh.exitY, sh.exitZ), el = sh.launchDeg * DEG + P.pitch;
    const v = sh.kExit * (P.shot.rpm * 2 * Math.PI / 60) * sh.Rw, ch = Math.cos(el);
    let x = p[0], y = p[1], z = p[2], vx = P.fx * ch * v + P.vx, vy = Math.sin(el) * v, vz = P.fz * ch * v + P.vz, n = 0, hit = false;
    const sx = -P.fz, sz = P.fx, dt = 0.02;
    for (; n < ARC_N; n++) {
      arcPos[n * 3] = x; arcPos[n * 3 + 1] = y; arcPos[n * 3 + 2] = z;
      if (y < 0.05 || (n > 3 && hexDist(x, z) < 0 && y < HUB.rim)) { hit = hexDist(x, z) < 0 && y < HUB.rim; n++; break; }
      if (Math.abs(x - HUB.cx) < HUB.half && Math.abs(z - HUB.cz) < HUB.half && y < HUB.boxTop) { n++; break; }
      const sp = Math.hypot(vx, vy, vz), c = FUEL.k * FUEL.cl * sp;
      vx += (-FUEL.k * FUEL.cd * sp * vx - c * sz * vy) * dt; vy += (-GRAV - FUEL.k * FUEL.cd * sp * vy + c * (sz * vx - sx * vz)) * dt; vz += (-FUEL.k * FUEL.cd * sp * vz + c * sx * vy) * dt;
      x += vx * dt; y += vy * dt; z += vz * dt;
    }
    arcGeo.setDrawRange(0, n); arcGeo.attributes.position.needsUpdate = true; arcLine.computeLineDistances();
    arcMat.color = col(hit ? 0x34d399 : 0xffffff); arcMat.opacity = hit ? 0.9 : 0.45;
  }
  // arrow over the robot pointing where to go (the new ALLIANCE ZONE after a swap, the STARTING LINE in END GAME)
  const arrow = new THREE.Group();
  (function () {
    const m = new THREE.MeshStandardMaterial({ color: col(COL.fuel), emissive: col(COL.fuel), emissiveIntensity: 0.8, roughness: 0.4 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.36, 10), m); shaft.rotation.z = Math.PI / 2; shaft.position.x = -0.1;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 16), m); head.rotation.z = -Math.PI / 2; head.position.x = 0.18;
    arrow.add(shaft, head); arrow.visible = false; scene.add(arrow);
  })();
  function arrowTarget(P) {
    const g = W.game; if (!g.enabled || g.isAuto()) return null;
    if (S().mode === 'match' && W.t > MATCH.end - 15 && !obbTouchesXStrip(P.mainBox(), START_X[P.alliance] - TAPE / 2, START_X[P.alliance] + TAPE / 2)) return [START_X[P.alliance], clamp(P.z, 0.7, FIELD.W - 0.7)];
    const zs = g.zoneSign(P.alliance);
    if (Math.sign(P.x - CX) === zs) return null;
    const bumpZ = (BUMP.z0 + BUMP.z1) / 2, trenchZ = (TRENCH.z0 + TRENCH.post + TRENCH.z1 - TRENCH.post) / 2;
    const zc = Math.abs(P.z - bumpZ) < Math.abs(P.z - trenchZ) ? bumpZ : trenchZ;
    return Math.abs(P.x - CX) > 1.0 ? [CX - zs * 0.6, zc] : [CX + zs * 2.0, zc];
  }

  // ---------------- input ----------------
  const keys = new Set(), edges = new Set();
  let padPrev = [], padPrevAct = {};
  const inp = { l: 0, r: 0, kbT: 0, kbR: 0, kbRR: 0, intake: false, stow: false, outtake: false, shoot: false, prespin: false, preset: 3, slow: false };
  function getPad() { let ps = []; try { ps = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return null; } for (const p of ps) if (p && p.connected && p.mapping === 'standard') return p; for (const p of ps) if (p && p.connected) return p; return null; }
  Controls.getPad = getPad; Controls.settings = W.settings;
  const DRIVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyI', 'KeyK', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', e => {
    if (Controls.handleKey(e)) return;
    if (e.target && e.target.tagName === 'SELECT') return;
    if (!e.repeat) edges.add(e.code); keys.add(e.code);
    const bound = DRIVE_KEYS.concat(...Object.values(Controls.binds.keys));
    if ((state === 'run' || state === 'countdown') && bound.includes(e.code)) e.preventDefault();
    if (S().input === 'controller' && (state === 'run' || state === 'countdown') && (DRIVE_KEYS.includes(e.code) || Controls.keyDown('shoot', new Set([e.code])) || Controls.keyDown('intake', new Set([e.code])))) { setSetting('input', 'keyboard'); toast('Switched to keyboard controls'); }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('gamepadconnected', e => { toast('Controller connected: ' + (e.gamepad.id || '').replace(/\(.*\)/, '').trim().slice(0, 36)); if (S().input !== 'controller') setSetting('input', 'controller'); updatePadStat(); });
  window.addEventListener('gamepaddisconnected', () => { toast('Controller disconnected', 'warn'); updatePadStat(); });
  const dz = v => Math.abs(v) < 0.1 ? 0 : (v - Math.sign(v) * 0.1) / 0.9;
  const sq = v => Math.sign(v) * v * v;
  function pollInput(dt) {
    const pad = getPad(), st = S();
    const capturing = Controls.pollCapture(pad);
    const pe = new Set();
    if (pad) {
      const now = pad.buttons.map(b => b.pressed || b.value > 0.4);
      now.forEach((p, i) => { if (p && !padPrev[i]) pe.add(i); }); padPrev = now;
      if ((pe.size || pad.axes.some(a => Math.abs(a) > 0.5)) && st.input !== 'controller' && !capturing && state !== 'loading') { setSetting('input', 'controller'); toast('Switched to controller controls'); }
    }
    if (capturing) { edges.clear(); for (const a of CONTROL_ACTIONS) padPrevAct[a.id] = true; return; }
    const padNow = {};
    for (const a of CONTROL_ACTIONS) padNow[a.id] = Controls.padValue(pad, a.id) > (a.id === 'intake' || a.id === 'shoot' ? 0.3 : 0.5);
    const down = id => Controls.keyDown(id, keys) || padNow[id];
    const edge = id => Controls.keyEdge(id, edges) || (padNow[id] && !padPrevAct[id]);
    const k = c => keys.has(c), e = c => edges.has(c);
    inp.slow = down('slow');
    const kThr = (k('KeyW') || (st.drive !== 'tank' && k('ArrowUp')) ? 1 : 0) - (k('KeyS') || (st.drive !== 'tank' && k('ArrowDown')) ? 1 : 0);
    const kTurn = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    const kRight = (k('ArrowUp') || k('KeyI') ? 1 : 0) - (k('ArrowDown') || k('KeyK') ? 1 : 0);
    const slew = (cur, tgt, rate) => cur + clamp(tgt - cur, -rate * dt, rate * dt);
    inp.kbT = slew(inp.kbT, kThr, 4.5); inp.kbR = slew(inp.kbR, kTurn, 6); inp.kbRR = slew(inp.kbRR, kRight, 4.5);
    const sThr = dz(Controls.axis(pad, 'throttle'));
    const sTurn = st.drive === 'arcade1' ? dz(pad ? pad.axes[0] || 0 : 0) : dz(Controls.axis(pad, 'turn'));
    const sRight = dz(Controls.axis(pad, 'right'));
    let l, r; const scale = inp.slow ? 0.45 : 1, ts = st.turnScale;
    if (st.drive === 'tank' && (sThr || sRight)) { l = sq(sThr) * scale; r = sq(sRight) * scale; }
    else if (st.drive === 'tank') { l = inp.kbT * scale; r = inp.kbRR * scale; }
    else {
      // sticks are eased like the keys so the robot never lurches
      inp.pT = slew(inp.pT || 0, sThr ? sq(sThr) : 0, 7); inp.pR = slew(inp.pR || 0, sTurn ? sq(sTurn) : 0, 10);
      const thr = Math.abs(inp.pT) > 0.004 ? inp.pT : inp.kbT;
      const trn = Math.abs(inp.pR) > 0.004 ? inp.pR : inp.kbR * 0.8;
      // turn feedforward: the smallest input already beats the drop-center wheel scrub (about 0.26 output)
      const tOut = Math.abs(trn) > 0.01 ? Math.sign(trn) * lerp(0.26, ts, Math.min(1, Math.abs(trn))) : 0;
      l = (thr + tOut) * scale; r = (thr - tOut) * scale;
      const m = Math.max(1, Math.abs(l), Math.abs(r)); l /= m; r /= m;
    }
    inp.l = l; inp.r = r;
    inp.intake = down('intake'); inp.shoot = down('shoot'); inp.outtake = down('outtake'); inp.stow = down('stow');
    if (edge('prespin')) inp.prespin = !inp.prespin;
    ['preset1', 'preset2', 'preset3', 'preset4'].forEach((id, i) => { if (edge(id)) inp.preset = i; });
    if (edge('camera') && state !== 'menu') cycleCamera();
    if (edge('pause') || e('KeyP')) togglePause();
    if (state === 'run' && edge('reset') && S().mode !== 'match') { W.game.resetPlayer(); toast('Robot back on the STARTING LINE', 'info', 1.2); }
    if (state === 'run' && edge('refill') && S().mode === 'practice') { W.game.refillPlayer(10); toast('Loaded 10 FUEL', 'info', 1.0); }
    if (e('KeyM')) $('map').hidden = !$('map').hidden;
    if (state === 'menu' && $('settings').hidden && (pe.has(0) || pe.has(9))) startMatch('match');
    else if (state === 'results' && pe.has(0)) startMatch(S().mode);
    padPrevAct = padNow;
    edges.clear();
  }
  function rumble(strong, weak, ms) { const p = getPad(); try { if (p && p.vibrationActuator) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* not supported */ } }

  // ---------------- sound ----------------
  Sound.volume = S().volume === undefined ? 0.7 : S().volume; Sound.enabled = S().sound !== false;
  let crowdBoost = 0;
  W.sfx = kind => {
    if (kind === 'tick') Sound.tick(); else if (kind === 'shift') Sound.shiftHorn(); else if (kind === 'shot') Sound.shot();
    else if (kind === 'pick') Sound.pickup(); else if (kind === 'foul') Sound.foul(); else if (kind === 'end') Sound.endHorn();
    else if (kind === 'count') Sound.count(); else if (kind === 'start') Sound.go();
  };
  const V2 = new THREE.Vector3();
  W.onBounce = (b, v) => { if (state === 'run') Sound.thud(v, camera.position.distanceTo(V2.set(b.x, b.y, b.z))); };
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { Sound.init(); Sound.click(); } });

  // ---------------- cameras ----------------
  const CAMS = ['follow', 'driver', 'overhead'], CAM_NAMES = { follow: 'Follow', driver: 'Driver station', overhead: 'Overhead' };
  const cam = { mode: S().camera || 'follow', yaw: 0, dist: 3.5, h: 1.6, orbit: 0, tilt: 0, dragging: false, lastDrag: -9, shake: 0, menuA: 0.8 };
  const camLook = new THREE.Vector3(CX, 0, CZ), camPos = new THREE.Vector3(CX - 6, 4, CZ), V = new THREE.Vector3();
  function cycleCamera() { cam.mode = CAMS[(CAMS.indexOf(cam.mode) + 1) % CAMS.length]; $('bCam').textContent = 'Camera: ' + CAM_NAMES[cam.mode]; applyLabels(); toast('Camera: ' + CAM_NAMES[cam.mode], 'info', 1.1); }
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { if (state !== 'run' && state !== 'countdown') return; cam.dragging = true; cam.px = e.clientX; cam.py = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
  cv.addEventListener('pointermove', e => { if (!cam.dragging) return; cam.orbit -= (e.clientX - cam.px) * 0.006; cam.tilt = clamp(cam.tilt + (e.clientY - cam.py) * 0.006, -1.0, 3); cam.px = e.clientX; cam.py = e.clientY; cam.lastDrag = performance.now() / 1000; });
  cv.addEventListener('pointerup', () => { cam.dragging = false; cam.lastDrag = performance.now() / 1000; });
  cv.addEventListener('wheel', e => { if (state === 'menu') return; e.preventDefault(); cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 1.6, 10); }, { passive: false });
  cv.addEventListener('dblclick', () => { cam.orbit = 0; cam.tilt = 0; cam.dist = 3.5; });
  function updateCamera(dt) {
    const P = W.player; if (!P) return;
    const blue = S().alliance === 'blue';
    camera.up.set(0, 1, 0);
    if (state === 'menu' || state === 'loading') {
      cam.menuA += dt * 0.2;
      const r = 3.0, wide = window.innerWidth > 1100 ? 1 : 0;
      camera.position.set(P.x + Math.cos(cam.menuA) * r, 1.15, P.z + Math.sin(cam.menuA) * r);
      const rx = -Math.sin(cam.menuA), rz = Math.cos(cam.menuA);
      camera.lookAt(P.x + rx * 0.9 * wide, 0.32, P.z + rz * 0.9 * wide);
      if (camera.fov !== 42) { camera.fov = 42; camera.updateProjectionMatrix(); }
      camPos.copy(camera.position); cam.yaw = P.th; return;
    }
    if (cam.mode === 'free') return;   // debugging / screenshots
    let fov = 60;
    if (cam.mode === 'follow') {
      if (!cam.dragging && performance.now() / 1000 - cam.lastDrag > 1.4) { cam.orbit *= Math.exp(-dt * 2.2); cam.tilt *= Math.exp(-dt * 2.2); }
      cam.yaw += wrapAng(P.th + cam.orbit - cam.yaw) * (1 - Math.exp(-dt * 4));
      const fx = Math.cos(cam.yaw), fz = Math.sin(cam.yaw), hh = cam.h + cam.tilt * 0.9 + (cam.dist - 3.5) * 0.25;
      V.set(P.x - fx * cam.dist, P.y + hh, P.z - fz * cam.dist);
      camPos.lerp(V, 1 - Math.exp(-dt * 10));
      camLook.lerp(V.set(P.x + fx * 1.4, P.y + 0.35, P.z + fz * 1.4), 1 - Math.exp(-dt * 12));
      fov = 60 + 6 * Math.min(1, Math.hypot(P.vx, P.vz) / 5);
    } else if (cam.mode === 'driver') {
      const zr = blue ? 1 : -1, zs = (S().station == 2 ? 1 : -1) * 1.6 * zr;
      camPos.set(blue ? -0.55 : FIELD.L + 0.55, 1.72, CZ + zs);
      camLook.lerp(V.set(lerp(P.x, CX, 0.12), 0.15, lerp(P.z, CZ, 0.12)), 1 - Math.exp(-dt * 7)); fov = 50;
    } else {
      fov = 50; const tv = Math.tan(25 * DEG), hgt = Math.max((FIELD.L / 2 + 0.7) / tv, (FIELD.W / 2 + 0.7) / (tv * camera.aspect));
      camPos.set(CX, hgt, CZ); camLook.set(CX, 0, CZ); camera.up.set(blue ? 1 : -1, 0, 0);
    }
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = cam.mode === 'follow' ? camera.fov + (fov - camera.fov) * Math.min(1, dt * 4) : fov; camera.updateProjectionMatrix(); }
    camera.position.copy(camPos);
    if (cam.shake > 0.002) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake *= Math.exp(-dt * 12); }
    camera.lookAt(camLook);
  }

  // ---------------- HUD ----------------
  const fmt = s => { s = Math.ceil(s - 1e-6); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const dots = $('rDots'); for (let i = 0; i < 10; i++) dots.appendChild(document.createElement('i'));
  function toast(text, kind = 'info', dur = 1.8) { if (!W.game.toasts) W.game.toasts = []; W.game.toasts.push({ text, kind, wall: performance.now() + dur * 1000 }); if (W.game.toasts.length > 4) W.game.toasts.shift(); }
  const setSt = (id, cls, txt) => { const el = $(id); el.className = 'st ' + cls; el.querySelector('span').textContent = txt; };
  let hudT = 0, slowT = 0;
  function updateHud(dt) {
    hudT -= dt; if (hudT > 0) return; hudT = 1 / 20;
    const g = W.game, st = S(), P = W.player, p = g.period();
    const sb = g.score.blue, sr = g.score.red;
    $('sBlue').textContent = sb.total; $('sRed').textContent = sr.total;
    const sub = s => `FUEL ${s.autoFuel + s.teleFuel}` + (s.foulPts ? ` · FOUL +${s.foulPts}` : '') + (s.leave ? ` · LEAVE ${s.leave}` : '') + (s.park ? ` · PARK ${s.park}` : '');
    $('sBlueSub').textContent = sub(sb); $('sRedSub').textContent = sub(sr);
    $('clock').textContent = state === 'countdown' ? fmt(g.clock()) : fmt(g.clock()); $('period').textContent = state === 'countdown' ? 'GET READY' : p.name;
    $('pbar').style.width = (100 * clamp((W.t - p.t0) / (p.t1 - p.t0), 0, 1)) + '%';
    const tm = $('tlMark'); if (tm) tm.style.left = (100 * clamp(W.t / MATCH.end, 0, 1)) + '%';
    const mine = P.alliance, zs = g.zoneSign(mine), near = (mine === 'blue') === (zs < 0);
    const chip = $('zoneChip'); chip.textContent = near ? 'NEAR HALF' : 'FAR HALF'; chip.style.background = zs < 0 ? 'var(--blue)' : 'var(--red)';
    $('zoneText').textContent = p.disabled ? (p.over ? 'Match over' : 'Robots disabled') : g.isAuto() ? (st.auto === 'manual' ? 'AUTO: you are driving (practice only)' : 'AUTO: your routine is driving') : `Score from the ${near ? 'near' : 'far'} half into the ${zs < 0 ? 'BLUE' : 'RED'} side of the HUB`;
    let tn = p.t1, q = p; for (let i = 0; i < 8 && !q.over; i++) { const nx = g.period(q.t1 + 0.01); if (nx.swap !== p.swap || nx.over) { tn = q.t1; break; } q = nx; tn = q.t1; }
    const left = tn - W.t; $('zoneNext').textContent = p.over || state === 'countdown' ? '' : left < 200 ? `swap in ${Math.ceil(left)}s` : '';
    $('zone').classList.toggle('warnswap', !p.disabled && left <= 5 && left > 0);
    tintMat[0].color = col(COL[g.swapped() ? 'red' : 'blue']); tintMat[1].color = col(COL[g.swapped() ? 'blue' : 'red']);
    const n = P.count();
    $('rFuel').innerHTML = n + '<small>/10</small>';
    [...dots.children].forEach((d, i) => { d.className = i < Math.min(n, 10) ? (n > 10 ? 'over' : 'on') : ''; });
    if (P.jam) setSt('stIntake', 'bad', 'Jammed on BUMP');
    else if (P.assist === 'full') setSt('stIntake', 'warn', 'Full: 10 FUEL');
    else if (P.intakePos <= 0.04) setSt('stIntake', P.rollers > 0 ? 'fuel' : P.rollers < 0 ? 'warn' : 'ok', P.rollers > 0 ? 'Intaking' : P.rollers < 0 ? 'Outtaking' : 'Deployed');
    else if (P.intakePos >= 0.96) setSt('stIntake', '', 'Stowed');
    else setSt('stIntake', 'warn', 'Moving');
    const rpm = P.drumW * 60 / (2 * Math.PI), tgt = P.shot ? P.shot.rpm : 0, spinning = P.cmd.shoot || P.cmd.prespin;
    setSt('stShooter', P.ready ? 'ok' : spinning ? 'warn' : '', P.ready ? `Ready · ${Math.round(rpm)} rpm` : spinning ? `Spinning · ${Math.round(rpm)}` : 'Idle');
    const ae = Math.abs((P.aimErr || 0) / DEG), gap = P.gap !== undefined ? `${Math.max(0, P.gap).toFixed(1)} ft` : '';
    setSt('stAim', ae < 2 ? 'ok' : ae < 8 ? 'warn' : '', ae < 2 ? `On target · ${gap}` : `${P.aimErr > 0 ? 'Right' : 'Left'} ${ae.toFixed(0)}° · ${gap}`);
    const inZone = st.mode !== 'match' || g.inZone(P);
    setSt('stZone', inZone ? 'ok' : 'bad', st.mode !== 'match' ? 'Practice' : inZone ? 'In your zone' : 'Out of zone');
    $('rDrum').style.width = clamp(rpm / 4200 * 100, 0, 100) + '%'; $('rDrum').style.background = P.ready ? 'var(--ok)' : 'var(--muted)';
    $('rDrumT').style.left = clamp(tgt / 4200 * 100, 0, 99) + '%';
    $('rSpeed').textContent = (Math.hypot(P.vx, P.vz) / FT).toFixed(1) + ' ft/s';
    $('prompt').innerHTML = promptHtml(P, g);
    const nowMs = performance.now();
    g.toasts = (g.toasts || []).filter(t => (t.wall ? t.wall > nowMs : t.until > W.t) && state !== 'results');
    $('toasts').innerHTML = g.toasts.slice(-3).map(t => `<div class="${t.kind}">${t.text}</div>`).join('');
    $('feed').innerHTML = g.feed.slice(0, 5).map(f => `<div class="${f.kind || ''}">${f.clock} · ${f.text}</div>`).join('');
    drawMap();
    slowT -= 1 / 20; if (slowT <= 0) { slowT = 0.25; drawJumbo(); }
  }
  function promptHtml(P, g) {
    const st = S(), gl = id => Controls.glyph(id, st.input), p = g.period();
    if (state === 'countdown' || p.over) return '';
    if (p.disabled) return 'Robots disabled';
    if (g.isAuto() && st.auto !== 'manual') return 'AUTO: your robot is running its routine';
    const n = P.count(), inZone = st.mode !== 'match' || g.inZone(P);
    if (st.mode === 'match' && W.t > MATCH.end - 15 && !obbTouchesXStrip(P.mainBox(), START_X[P.alliance] - TAPE / 2, START_X[P.alliance] + TAPE / 2)) return 'END GAME: park on your STARTING LINE for +2 (follow the arrow)';
    if (!inZone) return 'Get to your ALLIANCE ZONE: over the BUMP or under the TRENCH (follow the arrow)';
    if (P.jam) return 'The deployed intake is hitting the BUMP: back up and let it stow';
    if (P.assist === 'aiming') return `${gl('shoot')} Aiming at the HUB…`;
    if (P.assist === 'spinning') return `${gl('shoot')} Spinning up the drum…`;
    if (n >= 10) return `${gl('shoot')} Hold to shoot: you are full`;
    if (n > 0) return `${gl('shoot')} Hold to shoot${st.assists !== 'off' ? ' (aims for you)' : ''}&nbsp;&nbsp;·&nbsp;&nbsp;${gl('intake')} Intake more`;
    return `${gl('intake')} Hold to intake: drive through FUEL at 3+ ft/s`;
  }
  // minimap: own ALLIANCE WALL at the bottom
  const mc = $('mapc'), mx = mc.getContext('2d');
  function drawMap() {
    const blue = S().alliance === 'blue', Wp = mc.width, Hp = mc.height, g = W.game;
    const P = (x, z) => [blue ? z / FIELD.W * Wp : (FIELD.W - z) / FIELD.W * Wp, blue ? Hp - x / FIELD.L * Hp : x / FIELD.L * Hp];
    mx.clearRect(0, 0, Wp, Hp);
    const sw = g.swapped();
    const half = (x0, x1, c) => { const a = P(x0, 0), b = P(x1, FIELD.W); mx.fillStyle = c; mx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); };
    half(0, CX, sw ? 'rgba(239,68,68,.18)' : 'rgba(59,130,246,.18)'); half(CX, FIELD.L, sw ? 'rgba(59,130,246,.18)' : 'rgba(239,68,68,.18)');
    const rect = (x0, x1, z0, z1, c, stroke) => { const a = P(x0, z0), b = P(x1, z1); const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]); if (stroke) { mx.strokeStyle = c; mx.lineWidth = 3; mx.strokeRect(x, y, w, h); } else { mx.fillStyle = c; mx.fillRect(x, y, w, h); } };
    rect(CX - BUMP.halfDepth, CX + BUMP.halfDepth, BUMP.z0, BUMP.z1, 'rgba(216,189,146,.55)');
    rect(CX - TRENCH.halfDepth, CX + TRENCH.halfDepth, TRENCH.z0, TRENCH.z0 + TRENCH.post, 'rgba(169,134,92,.9)');
    rect(CX - TRENCH.halfDepth, CX + TRENCH.halfDepth, TRENCH.z1 - TRENCH.post, TRENCH.z1, 'rgba(169,134,92,.9)');
    rect(CX - 0.05, CX + 0.05, TRENCH.z0, TRENCH.z1, 'rgba(169,134,92,.7)');
    rect(CX - HUB.half, CX + HUB.half, CZ - HUB.half, CZ + HUB.half, '#cfd6de');
    rect(START_X.blue - 0.04, START_X.blue + 0.04, 0, FIELD.W, '#3b82f6'); rect(START_X.red - 0.04, START_X.red + 0.04, 0, FIELD.W, '#ef4444');
    rect(CX - 0.02, CX + 0.02, 0, FIELD.W, 'rgba(255,255,255,.6)');
    rect(0, DEPOT.d, CZ - DEPOT.w / 2, CZ + DEPOT.w / 2, '#3b82f6', true); rect(FIELD.L - DEPOT.d, FIELD.L, CZ - DEPOT.w / 2, CZ + DEPOT.w / 2, '#ef4444', true);
    mx.fillStyle = '#f6c443';
    for (const b of W.fuel.balls) if (b.state === F_FIELD) { const [x, y] = P(b.x, b.z); mx.beginPath(); mx.arc(x, y, b.y > 0.3 ? 2.5 : 3.6, 0, 7); mx.fill(); }
    for (const rb of W.robots) {
      const cs = obbCorners(rb.mainBox()).map(c => P(c[0], c[1]));
      mx.beginPath(); cs.forEach((c, i) => i ? mx.lineTo(c[0], c[1]) : mx.moveTo(c[0], c[1])); mx.closePath();
      mx.fillStyle = rb.alliance === 'blue' ? '#3b82f6' : '#ef4444'; mx.fill();
      if (rb.isPlayer) { mx.strokeStyle = '#fff'; mx.lineWidth = 4; mx.stroke(); }
      const a = P(rb.x, rb.z), b = P(rb.x + rb.fx * 0.75, rb.z + rb.fz * 0.75);
      mx.strokeStyle = '#fff'; mx.lineWidth = 3; mx.beginPath(); mx.moveTo(a[0], a[1]); mx.lineTo(b[0], b[1]); mx.stroke();
    }
    mx.strokeStyle = 'rgba(255,255,255,.35)'; mx.lineWidth = 2; mx.strokeRect(1, 1, Wp - 2, Hp - 2);
  }

  // ---------------- settings, menus ----------------
  const NUMERIC = ['turnScale', 'fuelBonus', 'station', 'volume'], BOOL = ['defense', 'gate', 'labels', 'sound', 'arc', 'trail', 'fps'];
  const parseVal = (k, v) => BOOL.includes(k) ? v === true || v === 'true' : NUMERIC.includes(k) ? +v : v;
  function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(W.settings)); } catch (e) { /* ignore */ } }
  function setSetting(k, v) {
    const old = W.settings[k]; W.settings[k] = parseVal(k, v); saveSettings(); syncUI();
    if (old === W.settings[k]) return;
    if (k === 'quality') applyQuality();
    if (k === 'camera') { cam.mode = W.settings.camera; $('bCam').textContent = 'Camera: ' + CAM_NAMES[cam.mode]; applyLabels(); }
    if (k === 'labels') applyLabels();
    if (k === 'volume') Sound.setVolume(W.settings.volume);
    if (k === 'sound') Sound.setEnabled(W.settings.sound);
    if (k === 'fps') $('fps').hidden = !W.settings.fps;
    if ((k === 'alliance' || k === 'ai' || k === 'start') && state === 'menu') { W.game.reset(); rebuildRobots(); }
  }
  function syncUI() {
    document.querySelectorAll('[data-set]').forEach(el => {
      const v = String(W.settings[el.dataset.set]);
      if (el.tagName === 'SELECT') { el.value = v; if (el.selectedIndex < 0) el.selectedIndex = 0; }
      else el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === v));
    });
    $('bInput').textContent = 'Input: ' + (S().input === 'controller' ? 'Controller' : 'Keyboard');
    $('bMute').textContent = S().sound ? 'Sound: On' : 'Sound: Off';
    $('cheat').innerHTML = cheatHtml(S().input); $('cheat2').innerHTML = cheatHtml(S().input);
    updatePadStat();
  }
  document.querySelectorAll('select[data-set]').forEach(el => el.addEventListener('change', () => setSetting(el.dataset.set, el.value)));
  document.querySelectorAll('.seg[data-set]').forEach(el => el.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setSetting(el.dataset.set, b.dataset.val); }));
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('#settings .tab').forEach(t => { t.hidden = t.dataset.tab !== b.dataset.tab; }); });
  function cheatHtml(mode) {
    const gl = id => Controls.glyph(id, mode), assists = S().assists !== 'off';
    const drive = mode === 'controller'
      ? (S().drive === 'tank' ? `${Controls.stickGlyph('throttle')} ${Controls.stickGlyph('right')}` : S().drive === 'arcade1' ? '<span class="g gs">Left stick</span>' : `${Controls.stickGlyph('throttle')} <span class="note">drive</span> ${Controls.stickGlyph('turn')} <span class="note">turn</span>`)
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <span class="note">or arrows</span>';
    const rows = [['Drive', drive], [assists ? 'Shoot (aims for you)' : 'Shoot', gl('shoot')], ['Intake', gl('intake')], ['Outtake', gl('outtake')], ['Slow / precise', gl('slow')]];
    if (!assists) rows.push(['Stow intake', gl('stow')], ['Pre-spin drum', gl('prespin')]);
    rows.push(['Reset robot (practice, drills)', gl('reset')], ['Load 10 FUEL (practice)', gl('refill')]);
    rows.push(['Camera', gl('camera') + (mode === 'keyboard' ? ' <span class="note">wheel zooms</span>' : '')], ['Pause', gl('pause')]);
    return `<h3>${mode === 'controller' ? 'Controller' : 'Keyboard'} controls</h3>` + rows.map(([a, k]) => `<span>${a}</span><span class="keys">${k}</span>`).join('');
  }
  function updatePadStat() {
    const p = getPad(), el = $('padStat'); if (!el) return;
    el.classList.toggle('ok', !!p);
    el.querySelector('span').textContent = p ? 'Connected: ' + (((p.id || '').replace(/\(.*\)/, '').trim().slice(0, 40)) || 'controller') : S().input === 'controller' ? 'No controller found: plug one in and press any button' : 'Plug in a controller and press any button to use it';
  }
  function applyQuality() {
    const q = QUALITY[S().quality] || QUALITY.high;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio)); resize();
    const on = q.shadow > 0;
    if (renderer.shadowMap.enabled !== on || (on && sun.shadow.mapSize.x !== q.shadow)) {
      renderer.shadowMap.enabled = on; sun.castShadow = on;
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      if (on) sun.shadow.mapSize.set(q.shadow, q.shadow);
      scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
    }
    crowd.visible = q.crowd;
  }
  function applyLabels() { for (const [rb, v] of robotVis) if (v.userData.label) v.userData.label.visible = rb.isPlayer ? cam.mode !== 'follow' && S().labels && state !== 'menu' : S().labels; }
  function fillSpec() {
    const h = IRISH.cadInfo || {};
    const rows = [
      ['CAD', `${h.parts || 940} Onshape parts; the ${h.intakeParts || 186}-part intake folds ${IRISH.intake.stowDeg}° on its real pivot`],
      ['Size', `AM14U5 ${IRISH.frame.L} x ${IRISH.frame.W} in frame; ${(2 * IRISH.hl / IN).toFixed(1)} x ${(2 * IRISH.hw / IN).toFixed(1)} in with noodle bumpers; ${IRISH.topIn} in tall`],
      ['Weight', `${IRISH.massLb.toFixed(0)} lb with battery and bumpers`],
      ['Drive', '4 CIM, Toughbox Mini 10.71:1 (from the CAD gears), 6 in HiGrip: about 10 ft/s on the field, turns about 350°/s in place'],
      ['Intake', 'Team 22 in module on a NEO + 25:1 pivot; needs about 3 ft/s approach'],
      ['Hopper', 'Passive ramp: about 1.5 FUEL/s to the shooter; 3 FUEL preload'],
      ['Shooter', '2-wide drum, fixed 72° hood: 2,085 rpm at the HUB wall to 3,438 rpm at 10 ft'],
    ];
    $('spec').innerHTML = rows.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  }
  function showScreen(id) { for (const s of ['menu', 'pause', 'results', 'settings']) $(s).hidden = s !== id; $('hud').hidden = !(state === 'run' || state === 'countdown' || state === 'pause' || state === 'results'); }
  let settingsFrom = 'menu';
  function openSettings() { settingsFrom = state; $('settings').hidden = false; Controls.render($('ctl')); }
  function closeSettings() { Controls.cancel(); $('settings').hidden = true; if (settingsFrom === 'menu') { W.game.reset(); rebuildRobots(); } }
  let cd = 0, goT = 0;
  function startMatch(mode) {
    if (mode) setSetting('mode', mode);
    Sound.init(); crowdBoost = 0; buildTimeline();
    cam.mode = S().camera || 'follow'; $('bCam').textContent = 'Camera: ' + CAM_NAMES[cam.mode];
    W.game.reset(); state = 'countdown'; rebuildRobots();
    Object.assign(inp, { prespin: false, preset: 3 });
    const P = W.player; cam.yaw = P.th; cam.orbit = 0; cam.tilt = 0;
    camPos.set(P.x - Math.cos(P.th) * 3.5, 1.8, P.z - Math.sin(P.th) * 3.5); camLook.set(P.x, 0.3, P.z);
    cd = 3; goT = 0; showScreen(null); $('countdown').hidden = false; $('countdown').className = ''; $('cdNum').textContent = '3'; $('cdTip').textContent = tipText(); W.sfx('count');
  }
  function togglePause() {
    if (!$('settings').hidden) return;
    if (state === 'run') { state = 'pause'; showScreen('pause'); }
    else if (state === 'pause') { state = 'run'; showScreen(null); }
  }
  function toMenu() { state = 'menu'; W.game.reset(); rebuildRobots(); showScreen('menu'); $('countdown').hidden = true; }
  W.onFinish = () => { state = 'results'; showResults(); };
  function showResults() {
    if (W.game.drill) return showDrillResults();
    const g = W.game, st = S(), mine = st.alliance, opp = otherAlliance(mine), a = g.score[mine], b = g.score[opp], P = W.player;
    const head = a.total > b.total ? `${mine.toUpperCase()} WINS` : a.total < b.total ? `${opp.toUpperCase()} WINS` : 'TIE';
    $('resHead').textContent = `${head}  ${g.score.blue.total} - ${g.score.red.total}`;
    $('resHead').style.color = a.total >= b.total ? 'var(--ok)' : 'var(--bad)';
    const row = (k, f) => `<tr><td>${k}</td><td>${f(g.score.blue)}</td><td>${f(g.score.red)}</td></tr>`;
    const acc = P.stats.shots ? Math.round(100 * P.stats.made / P.stats.shots) : 0;
    const swaps = g.swapLog.length ? (g.swapLog.reduce((s, x) => s + x, 0) / g.swapLog.length).toFixed(1) + ' s' : '-';
    $('resBody').innerHTML = `
      <div><h2>Score</h2><table><tr><th></th><th style="color:var(--blue)">BLUE</th><th style="color:var(--red)">RED</th></tr>
      ${row('AUTO FUEL (4 each)', s => `${s.autoFuel} · ${s.autoFuel * 4}`)}${row('TELEOP FUEL (2 each)', s => `${s.teleFuel} · ${s.teleFuel * 2}`)}
      ${row('LEAVE', s => s.leave)}${row('PARK', s => s.park)}${row('Penalty points received', s => s.foulPts)}${row('<b>Total</b>', s => `<b>${s.total}</b>`)}
      ${row('AUTO BONUS RP', s => s.rp.auto)}${row(`FUEL BONUS RP (${st.fuelBonus})`, s => s.rp.fuel)}${row('CONNECTION RP', s => s.rp.connection)}${row('Win / tie RP', s => s.rp.result)}${row('<b>Ranking points</b>', s => `<b>${s.rp.sum}</b>`)}
      </table></div>
      <div><h2>Your driving</h2><table>
      <tr><td>FUEL collected</td><td>${P.stats.collected}</td></tr><tr><td>Shots / scored for you</td><td>${P.stats.shots} / ${P.stats.made} (${acc}%)</td></tr>
      <tr><td>Points from your shots</td><td>${P.stats.points}</td></tr><tr><td>LEAVE / PARK</td><td>${P.stats.leave ? 'yes' : 'no'} / ${P.stats.parked ? 'yes' : 'no'}</td></tr>
      <tr><td>Average time to reach your new zone after a swap</td><td>${swaps}</td></tr><tr><td>Fouls you caused</td><td>${P.stats.fouls}</td></tr>
      </table>
      <p class="note">${a.fouls.length ? 'Fouls: ' + a.fouls.map(f => `${f.rule} (${f.who}, ${fmt(f.t)})`).join(', ') : 'No fouls against your alliance.'}</p></div>`;
    showScreen('results');
  }
  function showDrillResults() {
    const g = W.game, P = W.player, kind = g.drill.kind, mine = P.alliance, scored = g.score[mine].autoFuel + g.score[mine].teleFuel;
    const acc = P.stats.shots ? Math.round(100 * P.stats.made / P.stats.shots) : 0, key = 'irish-sim-best-' + kind;
    let best = 0; try { best = +localStorage.getItem(key) || 0; if (scored > best) localStorage.setItem(key, String(scored)); } catch (e) { /* storage blocked */ }
    $('resHead').textContent = (kind === 'drill-shoot' ? 'Shooting drill: ' : 'Intake drill: ') + scored + ' FUEL';
    $('resHead').style.color = scored > best ? 'var(--fuel)' : 'var(--fg)';
    $('resBody').innerHTML = `<div><h2>Result</h2><table>
      <tr><td>FUEL scored</td><td><b>${scored}</b>${scored > best ? ' · new best' : best ? ' · best ' + best : ''}</td></tr>
      <tr><td>Shots / made</td><td>${P.stats.shots} / ${P.stats.made} (${acc}%)</td></tr>
      <tr><td>FUEL picked up</td><td>${P.stats.collected}</td></tr>
      <tr><td>Time</td><td>${g.drill.len} s</td></tr></table></div>
      <div><h2>Next</h2><p class="note">${kind === 'drill-shoot' ? 'The robot refills to 10 each time it empties. Try different distances: the drum needs about 2.5 s to spin up from rest, so keep FUEL in the robot to keep it pre-spun.' : 'Drive through FUEL at 3+ ft/s with the intake down, then shoot from your half. The ramp feeds the shooter at about 1.5 FUEL/s, so shoot while you collect.'}</p></div>`;
    showScreen('results');
  }
  $('bPlay').onclick = () => startMatch('match'); $('bPractice').onclick = () => startMatch('practice');
  $('bDrillShoot').onclick = () => startMatch('drill-shoot'); $('bDrillIntake').onclick = () => startMatch('drill-intake');
  $('bMute').onclick = () => setSetting('sound', !S().sound);
  $('bFull').onclick = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => toast('Fullscreen is not available here', 'warn')); } catch (e) { toast('Fullscreen is not available here', 'warn'); } };
  window.addEventListener('blur', () => { if (state === 'run') togglePause(); });
  // ---- tips, timeline ----
  const TIPS = [
    'Hold shoot and the robot turns to the HUB and waits until the drum is ready.',
    'Drive through FUEL with the intake down: the rollers pull it in.',
    'Every SHIFT your ALLIANCE ZONE swaps halves: watch the yellow arrow and the timeline.',
    'The deployed intake jams on the BUMP. Let it stow, or drive under the TRENCH.',
    'The ramp feeds the shooter at about 1.5 FUEL/s: shoot while you collect.',
    'Keep FUEL in the robot to keep the drum spinning; spin-up from rest takes about 2.5 s.',
    'END GAME: park any part of your bumpers on your STARTING LINE for +2.',
    'Mouse wheel zooms the follow camera; drag to look around; C changes the camera.',
    'The dashed line is where a shot would land right now. Green means it goes in.',
  ];
  const tipText = () => TIPS[Math.floor(Math.random() * TIPS.length)];
  const SHORT = { 'AUTO': 'AUTO', 'AUTO SCORING': '', 'TRANSITION SHIFT': 'T', 'SHIFT 1': 'S1', 'SHIFT 2': 'S2', 'SHIFT 3': 'S3', 'SHIFT 4': 'S4', 'END GAME': 'END' };
  function buildTimeline() {
    const el = $('timeline'); if (S().mode !== 'match') { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = MATCH.periods.map(p => `<i class="${p.swap ? 'sw' : ''}${p.disabled ? ' dis' : ''}" style="flex:${p.t1 - p.t0}" title="${p.name}">${SHORT[p.name] || ''}</i>`).join('') + '<b id="tlMark"></b>';
  }
  $('bAgain').onclick = () => startMatch(S().mode); $('bRestart').onclick = () => startMatch(S().mode);
  $('bResume').onclick = togglePause; $('bQuit').onclick = toMenu; $('bQuit2').onclick = toMenu;
  $('bSettings').onclick = openSettings; $('bSettings2').onclick = openSettings; $('bCloseSet').onclick = closeSettings;
  $('bCam').onclick = cycleCamera; $('bPause').onclick = () => { if (state === 'run' || state === 'pause') togglePause(); };
  $('bInput').onclick = () => { setSetting('input', S().input === 'controller' ? 'keyboard' : 'controller'); toast(S().input === 'controller' ? 'Controller controls' + (getPad() ? '' : ': plug one in and press any button') : 'Keyboard controls'); };
  const renderControls = () => { if (!$('settings').hidden) Controls.render($('ctl')); $('cheat').innerHTML = cheatHtml(S().input); $('cheat2').innerHTML = cheatHtml(S().input); };
  Controls.listeners.push(renderControls);

  // ---------------- loop ----------------
  const DT = 1 / 120; let acc = 0, last = performance.now(), padT = 0, fpsN = 0, fpsT = 0, lastIntakeTarget, lastJam = false;
  function physics(dt) {
    const g = W.game, st = S(), P = W.player;
    for (const r of W.robots) { const p = r.p0 || (r.p0 = {}); p.x = r.x; p.z = r.z; p.th = r.th; p.y = r.y; p.pitch = r.pitch; }
    for (const b of W.fuel.balls) { b.ox = b.x; b.oy = b.y; b.oz = b.z; }
    W.t += dt; g.update(dt);
    const en = g.enabled;
    if (g.isAuto() && st.auto !== 'manual') runAuto(W, P, dt);
    else if (en) playerAssist(W, P, inp, dt);
    else { stopDrive(P); P.cmd.shoot = P.cmd.intake = P.cmd.outtake = false; P.feedOk = null; }
    for (const r of W.robots) if (!r.isPlayer) aiUpdate(W, r, dt);
    const v0 = Math.hypot(P.vx, P.vz);
    for (const r of W.robots) { r.enabled = en; r.stepDrive(dt, en); if (r.spec === IRISH) stepIrish(W, r, dt, en); else stepAiMech(W, r, dt, en); }
    for (const r of W.robots) resolveStatic(r);
    const rs = W.robots;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (resolveRobots(rs[i], rs[j])) g.onRobotContact(rs[i], rs[j]);
    const hit = v0 - Math.hypot(P.vx, P.vz); if (hit > 1.0) { cam.shake = Math.min(0.08, hit * 0.03); rumble(0.6, 0.35, 140); Sound.clank(hit); }
    fuelStep(W, dt / 2); fuelStep(W, dt / 2);
  }
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05); last = Math.max(last, now);
    pollInput(dt);
    if (state === 'countdown') {
      const before = Math.ceil(cd); cd -= dt; const after = Math.ceil(cd);
      if (cd <= 0) { state = 'run'; goT = 0.7; $('cdNum').textContent = 'GO'; $('countdown').className = 'go'; W.sfx('start'); }
      else { $('cdNum').textContent = after; if (after !== before) W.sfx('count'); }
    } else if (goT > 0) { goT -= dt; if (goT <= 0) $('countdown').hidden = true; }
    if (state === 'run' && !W._freeze) { acc += dt; let n = 0; while (acc >= DT && n < 6) { physics(DT); acc -= DT; n++; } if (n === 6) acc = 0; }
    const P = W.player;
    // render between the last two physics steps so motion is smooth at any frame rate
    renderAlpha = state === 'run' && !W._freeze ? clamp(acc / DT, 0, 1) : 1;
    const saved = [];
    if (P && renderAlpha < 1) for (const r of W.robots) if (r.p0) {
      saved.push([r, r.x, r.z, r.th, r.y, r.pitch]); const a = renderAlpha, p = r.p0;
      r.x = lerp(p.x, r.x, a); r.z = lerp(p.z, r.z, a); r.th = p.th + wrapAng(r.th - p.th) * a; r.y = lerp(p.y, r.y, a); r.pitch = lerp(p.pitch, r.pitch, a);
    }
    fpsN++; fpsT += dt; if (fpsT >= 0.5) { $('fps').textContent = Math.round(fpsN / fpsT) + ' fps'; fpsN = 0; fpsT = 0; }
    if (P) {
      if (state === 'menu') P.intakePos = 0.5 + 0.5 * Math.cos(now / 1000 * 0.7);
      if (P.intakeTarget !== lastIntakeTarget) { if (lastIntakeTarget !== undefined && state === 'run') Sound.deploy(P.intakeTarget > 0.5); lastIntakeTarget = P.intakeTarget; }
      if (P.jam && !lastJam && state === 'run') Sound.jam(); lastJam = P.jam;
      crowdBoost *= Math.exp(-dt * 0.6);
      Sound.update({ active: state === 'run' || state === 'countdown', speed: Math.hypot(P.vx, P.vz), effort: (Math.abs(P.cmd.l) + Math.abs(P.cmd.r)) / 2, drumRpm: P.drumW * 60 / (2 * Math.PI), rollers: P.rollers, crowd: state === 'menu' || state === 'loading' ? 0.006 : 0.016 + 0.03 * crowdBoost });
      for (const [rb, v] of robotVis) {
        v.position.set(rb.x, rb.y, rb.z); v.rotation.set(0, -rb.th, rb.pitch);
        if (v.userData.pivot) v.userData.pivot.rotation.z = rb.intakePos * IRISH.intake.stowDeg * DEG;
        if (v.userData.roller && rb.rollers > 0) v.userData.roller.rotation.y += dt * 30;
        if (v.userData.spinners && rb.rollers) for (const s of v.userData.spinners) s.g.rotation.z += s.dir * Math.sign(rb.rollers) * dt * 2.2 / Math.max(0.6, s.r);
        if (v.userData.fly && rb.cmd.shoot) v.userData.fly.rotation.y += dt * 60;
      }
      const tgt = state === 'run' ? arrowTarget(P) : null;
      arrow.visible = !!tgt;
      if (tgt) { arrow.position.set(P.x, P.y + 1.15 + 0.05 * Math.sin(now / 160), P.z); arrow.rotation.y = -Math.atan2(tgt[1] - P.z, tgt[0] - P.x); }
      fuelDt = dt; drawFuel(); stepFx(dt); stepTrails(); drawArc(P); updateCamera(dt);
      if (state !== 'menu' && state !== 'loading') updateHud(dt);
    }
    padT -= dt; if (padT <= 0) { padT = 0.5; if (state === 'menu') updatePadStat(); }
    renderer.render(scene, camera);
    for (const [r, x, z, th, y, pitch] of saved) { r.x = x; r.z = z; r.th = th; r.y = y; r.pitch = pitch; }
    requestAnimationFrame(frame);
  }
  W._dbg = { physics, render: () => renderer.render(scene, camera), renderer, scene, camera, cam, inp, start: m => startMatch(m), poll: dt => pollInput(dt), hud: () => { hudT = 0; updateHud(1); drawFuel(); updateCamera(1); }, frame: t => frame(t), state: () => state, setSetting, openSettings, toMenu };

  // ---------------- boot ----------------
  try {
    decodeMesh(); buildShotExtension(); buildAiTable(); fillSpec();
    W.game.reset(); rebuildRobots(); applyQuality(); syncUI(); renderControls();
    $('bCam').textContent = 'Camera: ' + CAM_NAMES[cam.mode]; $('fps').hidden = !S().fps;
    $('loading').hidden = true; state = 'menu'; showScreen('menu');
  } catch (err) {
    $('loading').querySelector('.ldb').textContent = 'Could not load: ' + err.message; console.error(err);
  }
  requestAnimationFrame(frame);
})();
