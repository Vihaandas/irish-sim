// Build the simulator's robot mesh from the two Onshape glTF exports (Rev F, deployed + stowed).
// - parts whose geometry moves between the poses and fit one rotation about the intake pivot -> "intake" group
// - every part is decimated by vertex clustering, merged by colour, quantized to uint16 and written as
//   sim/robot_mesh.js (window.ROBOT_MESH = {header, b64}) so the page also works from file://.
// Robot frame (inches): X across (+ right), Y fore-aft (rear frame edge = 0), Z up from carpet.
const fs = require('fs'), path = require('path');
const RAW = process.env.MESH_RAW || path.join(__dirname, '..', 'raw');
const OUT = process.env.MESH_OUT || path.join(__dirname, '..', 'robot_mesh.js');
const IN = 0.0254;
const PIVOT = { y: 31.0, z: 8.8 };              // README: pivot on the wood towers (Y 31.0, Z 8.8)
const CELL_FRAC = +(process.argv[2] || 14);      // cluster cell = part diagonal / CELL_FRAC
const CELL_MIN = +(process.argv[3] || 0.07), CELL_MAX = +(process.argv[4] || 0.35); // inches

function load(name) {
  const g = JSON.parse(fs.readFileSync(path.join(RAW, name + '.gltf'), 'utf8'));
  const uri = g.buffers[0].uri; const buf = Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  const acc = i => {
    const a = g.accessors[i], bv = g.bufferViews[a.bufferView];
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const n = a.count * (a.type === 'VEC3' ? 3 : 1);
    const C = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
    const out = new C(n); const src = Buffer.from(buf.buffer, buf.byteOffset + off, n * C.BYTES_PER_ELEMENT);
    for (let k = 0; k < n; k++) out[k] = C === Float32Array ? src.readFloatLE(k * 4) : C === Uint32Array ? src.readUInt32LE(k * 4) : src.readUInt16LE(k * 2);
    return out;
  };
  return g.nodes.map(nd => {
    const prims = g.meshes[nd.mesh].primitives;
    const parts = prims.map(p => {
      const pos = acc(p.attributes.POSITION), idx = acc(p.indices);
      const m = g.materials[p.material]; const c = m.pbrMetallicRoughness.baseColorFactor;
      return { pos, idx, color: c.slice(0, 3), alpha: c[3], metallic: m.pbrMetallicRoughness.metallicFactor || 0 };
    });
    return { name: nd.name, id: (nd.extensions && nd.extensions.PTC_onshape_metadata || {}).id, parts };
  });
}

const all = load('deployed'), sto = load('stowed');
const bbox = pos => { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], pos[i + k]); b[k + 3] = Math.max(b[k + 3], pos[i + k]); } return b; };
// reference FUEL in the CAD hopper / shooter queue -> slots where carried FUEL are drawn
const fuelSlots = all.filter(p => /^REF - FUEL/.test(p.name)).map(p => { const b = bbox(p.parts[0].pos); return { name: p.name, c: [0, 1, 2].map(k => +((b[k] + b[k + 3]) / 2 / IN).toFixed(2)) }; });
const dep = all.filter(p => !/^REF/i.test(p.name));
console.log('parts', dep.length, sto.length, 'fuel slots', fuelSlots.length);
// bumper outline from the CAD bumpers (BP-*)
const bumpBox = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
for (const p of dep.filter(q => /^BP-/.test(q.name))) for (const pr of p.parts) { const b = bbox(pr.pos); for (let k = 0; k < 3; k++) { bumpBox[k] = Math.min(bumpBox[k], b[k] / IN); bumpBox[k + 3] = Math.max(bumpBox[k + 3], b[k + 3] / IN); } }
console.log('bumper box (in)', bumpBox.map(x => +x.toFixed(2)));
const stoById = new Map(sto.map(p => [String(p.id), p]));

// classify: compare bounding boxes (tessellation order can differ between exports)
let moving = 0, rigid = 0, angles = [], nonrigid = [];
const IN_ = IN, py = PIVOT.y * IN, pz = PIVOT.z * IN;
const allPos = p => { const arrs = p.parts.map(q => q.pos); const n = arrs.reduce((s, x) => s + x.length, 0); const o = new Float32Array(n); let k = 0; for (const x of arrs) { o.set(x, k); k += x.length; } return o; };
const rotBox = (pos, th) => { const c = Math.cos(th), sn = Math.sin(th), b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) { const ay = pos[i + 1] - py, az = pos[i + 2] - pz; const v = [pos[i], ay * c - az * sn + py, ay * sn + az * c + pz];
    for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], v[k]); b[k + 3] = Math.max(b[k + 3], v[k]); } } return b; };
const boxErr = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i]))) / IN_;
for (const p of dep) {
  let s = stoById.get(String(p.id));
  p.group = 'fixed';
  const A = allPos(p), ba = bbox(A);
  if (!s || boxErr(ba, bbox(allPos(s))) >= 0.02) {
    // ids are not stable for every part: match by name, preferring an unmoved twin, else a rotated twin
    const twins = sto.filter(q => q.name === p.name);
    const same = twins.find(q => boxErr(ba, bbox(allPos(q))) < 0.02);
    if (same) continue;
    const rb = rotBox(A, 132.5 * Math.PI / 180);
    const rot = twins.find(q => boxErr(rb, bbox(allPos(q))) < 0.12);
    if (rot) s = rot; else if (!s) { p.missing = true; continue; }
  }
  const B = allPos(s), bb = bbox(B);
  if (boxErr(ba, bb) < 0.02) continue;
  moving++;
  // search the angle that best maps the deployed box onto the stowed box
  let best = [1e9, 0];
  for (let d = 125; d <= 140; d += 0.5) { const e = boxErr(rotBox(A, d * Math.PI / 180), bb); if (e < best[0]) best = [e, d]; }
  if (best[0] < 0.12) { p.group = 'intake'; rigid++; angles.push(best[1]); }
  else nonrigid.push([p.name, +best[0].toFixed(2), best[1]]);
}
const avg = angles.reduce((s, x) => s + x, 0) / (angles.length || 1);
console.log('moving', moving, 'rigid about pivot', rigid, 'angle avg', avg.toFixed(2), 'min', Math.min(...angles).toFixed(2), 'max', Math.max(...angles).toFixed(2));
console.log('non-rigid movers (kept at deployed pose):', nonrigid.slice(0, 40));
console.log('missing in stowed', dep.filter(p => p.missing).length, 'topology differs', dep.filter(p => p.diffTopo).map(p => p.name).slice(0, 20));

// decimate by vertex clustering (per part), in inches
function cluster(pos, idx, cell) {
  const map = new Map(), vx = [], remap = new Int32Array(pos.length / 3), acc = [];
  for (let i = 0, v = 0; i < pos.length; i += 3, v++) {
    const x = pos[i] / IN, y = pos[i + 1] / IN, z = pos[i + 2] / IN;
    const key = Math.round(x / cell) + ',' + Math.round(y / cell) + ',' + Math.round(z / cell);
    let id = map.get(key);
    if (id === undefined) { id = acc.length; map.set(key, id); acc.push([0, 0, 0, 0]); }
    const A = acc[id]; A[0] += x; A[1] += y; A[2] += z; A[3]++; remap[v] = id;
  }
  const out = []; const seen = new Set();
  for (let t = 0; t < idx.length; t += 3) {
    const a = remap[idx[t]], b = remap[idx[t + 1]], c = remap[idx[t + 2]];
    if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((p, q) => p - q).join(',') + (a < b ? 1 : 0);
    if (seen.has(k)) continue; seen.add(k); out.push(a, b, c);
  }
  return { verts: acc.map(A => [A[0] / A[3], A[1] / A[3], A[2] / A[3]]), tris: out };
}

// spinning parts of the intake module (rollers, flex wheels, pulleys, shafts): round in Y-Z, axis along X.
// Each axis becomes its own group so the sim can spin it while the intake runs.
const SPIN_RE = /flex wheel|silicone sleeve|polycarbonate core|pulley|shaft|roller|spacer|collar|retaining washer|shaft end screw|hub radial/i;
const NOSPIN_RE = /NEO|motor|bearing|SPARK|plate|arm|pad|standoff|tie|tube|belt|key/i;
let spinAxes = [];
for (const p of dep) {
  if (p.group !== 'intake' || !SPIN_RE.test(p.name) || NOSPIN_RE.test(p.name)) continue;
  const b = bbox(allPos(p)), dy = (b[4] - b[1]) / IN, dz = (b[5] - b[2]) / IN;
  if (Math.abs(dy - dz) > 0.2 || dy > 3.6) continue;
  const cy = (b[1] + b[4]) / 2 / IN, cz = (b[2] + b[5]) / 2 / IN;
  let ax = spinAxes.find(a => Math.hypot(a.y - cy, a.z - cz) < 0.3);
  if (!ax) spinAxes.push(ax = { y: cy, z: cz, r: 0, n: 0, names: new Set() });
  ax.n++; ax.r = Math.max(ax.r, dy / 2); ax.names.add(p.name.replace(/_d+$/, ''));
  p.spinAxis = spinAxes.indexOf(ax);
}
// keep real roller axes (r >= 0.5 in); small parts (hub screws) join the roller they sit on; motor shafts etc. stay static
{
  const major = spinAxes.filter(a => a.r >= 0.5);
  for (const p of dep) if (p.spinAxis !== undefined) {
    const a = spinAxes[p.spinAxis];
    if (a.r >= 0.5) { p.spinAxis = major.indexOf(a); continue; }
    const near = major.map((m, i) => [Math.hypot(m.y - a.y, m.z - a.z), i]).sort((u, v) => u[0] - v[0])[0];
    p.spinAxis = near && near[0] < 1.2 ? near[1] : undefined;
  }
  spinAxes = major;
}
console.log('spin axes', spinAxes.map(a => [+a.y.toFixed(2), +a.z.toFixed(2), +a.r.toFixed(2), a.n, [...a.names].slice(0, 4).join(' | ')]));
const groups = {};            // key = group|color -> {verts:[], tris:[]}
let triIn = 0, triOut = 0; const lb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
for (const p of dep) for (const pr of p.parts) {
  const b = bbox(pr.pos); const diag = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / IN;
  const cell = Math.min(CELL_MAX, Math.max(CELL_MIN, diag / CELL_FRAC));
  const r = cluster(pr.pos, pr.idx, cell);
  triIn += pr.idx.length / 3; triOut += r.tris.length / 3;
  if (!r.tris.length) continue;
  const col = pr.color.map(c => Math.round(c * 255));
  const grp = p.spinAxis !== undefined ? 'spin' + p.spinAxis : p.group === 'fixed' && /^BP-05/.test(p.name) ? 'bumper' : p.group;
  const key = grp + '|' + col.join(',') + '|' + (pr.alpha < 1 ? 't' : 'o');
  const G = groups[key] || (groups[key] = { group: grp, color: col, transparent: pr.alpha < 1, alpha: pr.alpha, verts: [], tris: [] });
  const base = G.verts.length; for (const v of r.verts) { G.verts.push(v); for (let k = 0; k < 3; k++) { lb[k] = Math.min(lb[k], v[k]); lb[k + 3] = Math.max(lb[k + 3], v[k]); } }
  for (const t of r.tris) G.tris.push(t + base);
}
console.log('triangles', triIn, '->', triOut, 'groups', Object.keys(groups).length, 'bbox in', lb.map(x => +x.toFixed(2)));

// pack: split each group into chunks of <= 65535 verts, uint16 quantized positions + uint16 indices
const span = [0, 1, 2].map(k => lb[k + 3] - lb[k]);
const chunks = []; const bufs = []; let off = 0;
const push = arr => { const b = Buffer.from(arr.buffer); bufs.push(b); const o = off; off += b.length; if (off % 4) { const pad = 4 - off % 4; bufs.push(Buffer.alloc(pad)); off += pad; } return o; };
for (const G of Object.values(groups)) {
  let start = 0;
  while (start < G.tris.length) {
    // greedy: take triangles until unique vertex count would exceed 65535
    const local = new Map(), lv = [], li = [];
    let t = start;
    for (; t < G.tris.length; t += 3) {
      const need = [G.tris[t], G.tris[t + 1], G.tris[t + 2]].filter(v => !local.has(v)).length;
      if (lv.length + need > 65535) break;
      for (let k = 0; k < 3; k++) { const v = G.tris[t + k]; let id = local.get(v); if (id === undefined) { id = lv.length; local.set(v, id); lv.push(G.verts[v]); } li.push(id); }
    }
    start = t;
    const q = new Uint16Array(lv.length * 3);
    lv.forEach((v, i) => { for (let k = 0; k < 3; k++) q[i * 3 + k] = Math.round((v[k] - lb[k]) / span[k] * 65535); });
    const ix = new Uint16Array(li);
    chunks.push({ group: G.group, color: G.color, transparent: G.transparent, alpha: G.alpha, nv: lv.length, ni: li.length, pOff: push(q), iOff: push(ix) });
  }
}
const bin = Buffer.concat(bufs);
const header = { units: 'in', frame: 'X right, Y forward (rear frame edge 0), Z up from carpet', min: lb.slice(0, 3), span,
  bumperBox: bumpBox.map(x => +x.toFixed(3)), fuelSlots, spinAxes: spinAxes.map(a => ({ y: +a.y.toFixed(3), z: +a.z.toFixed(3), r: +a.r.toFixed(3), parts: a.n, names: [...a.names] })), pivot: PIVOT, stowAngleDeg: +avg.toFixed(2), chunks, source: 'Onshape "Robot Rev E - deployed" / "stowed" (Rev F), exported ' + new Date().toISOString().slice(0, 10),
  parts: dep.length, intakeParts: dep.filter(p => p.group === 'intake').length, trianglesSource: triIn, triangles: triOut };
fs.writeFileSync(OUT, '// Generated by tools/build_mesh.js from the team Onshape CAD. Do not edit.\nwindow.ROBOT_MESH=' + JSON.stringify({ header, b64: bin.toString('base64') }) + ';\n');
fs.writeFileSync(path.join(RAW, 'mesh_report.json'), JSON.stringify({ header: { ...header, chunks: chunks.length }, nonrigid, intake: dep.filter(p => p.group === 'intake').map(p => p.name) }, null, 1));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1e6).toFixed(2), 'MB; chunks', chunks.length);
