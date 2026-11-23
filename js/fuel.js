// FUEL: staging (manual 4.3.2), ball physics, HUB scoring/exits, robot pushing and intake capture.
'use strict';
const F_FIELD = 0, F_HELD = 1, F_HUB = 2, F_OUT = 3;

class FuelWorld {
  constructor() { this.balls = []; this.grid = new Map(); }
  add(x, y, z) { const b = { i: this.balls.length, x, y, z, vx: 0, vy: 0, vz: 0, state: F_FIELD, spinT: 0, sx: 0, sy: 0, sz: 0, shooter: null, launchT: -1, hubT: 0, outT: 0, rest: 0 }; this.balls.push(b); return b; }
  // 48 FUEL in each DEPOT (5 x 8 on the carpet + 8 on top), the rest are preloads handed to robots
  stage() {
    this.balls.length = 0;
    const R = FUEL.r, p = 6.0 * IN;
    for (const side of ['blue', 'red']) {
      const sx = side === 'blue' ? 1 : -1, x0 = side === 'blue' ? 0 : FIELD.L;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 8; i++) this.add(x0 + sx * (R + 0.2 * IN + j * p), R, CZ - 24 * IN + R + i * p + 0.05 * IN);
      const tops = [[0, 1], [0, 4], [1, 2], [1, 5], [2, 0], [2, 3], [2, 6], [3, 3]];
      for (const [j, i] of tops) this.add(x0 + sx * (R + 0.2 * IN + (j + 0.5) * p), R + R * 1.414, CZ - 24 * IN + R + (i + 0.5) * p);
    }
  }
  giveTo(robot, n) {
    for (let k = 0; k < n; k++) { const b = this.add(robot.x, 0.3, robot.z); b.state = F_HELD; b.owner = robot; }
    return this.balls.slice(-n);
  }
}

// ---- FUEL physics ----
function fuelStep(W, dt) {
  const balls = W.fuel.balls, R = FUEL.r, now = W.t;
  // HUB exits and out-of-field returns
  for (const b of balls) {
    if (b.state === F_HUB && now >= b.hubT) hubExit(b);
    else if (b.state === F_OUT && now >= b.outT) {
      b.state = F_FIELD; b.x = clamp(b.x, 0.3, FIELD.L - 0.3); b.z = clamp(b.z, 0.3, FIELD.W - 0.3); b.y = terrainH(b.x, b.z) + R + 0.02; b.vx = b.vy = b.vz = 0;
    }
  }
  for (const b of balls) {
    if (b.state !== F_FIELD) continue;
    // forces
    const v = Math.hypot(b.vx, b.vy, b.vz);
    let ax = -FUEL.k * FUEL.cd * v * b.vx, ay = -GRAV - FUEL.k * FUEL.cd * v * b.vy, az = -FUEL.k * FUEL.cd * v * b.vz;
    if (b.spinT > 0) {   // backspin lift: CL * (spin axis x v)
      b.spinT -= dt; const c = FUEL.k * FUEL.cl * v;
      ax += c * (b.sy * b.vz - b.sz * b.vy) / Math.max(v, 1e-6) * v; ay += c * (b.sz * b.vx - b.sx * b.vz) / Math.max(v, 1e-6) * v; az += c * (b.sx * b.vy - b.sy * b.vx) / Math.max(v, 1e-6) * v;
    }
    b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
    const px = b.x, py = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    // ground / BUMP ramps
    const h = terrainH(b.x, b.z);
    if (b.y < h + R) {
      const s = terrainSlopeX(b.x, b.z); const nl = Math.hypot(s, 1), nx = -s / nl, ny = 1 / nl;
      const pen = (h + R - b.y) * ny; b.x += nx * pen; b.y += ny * pen;
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { const e = vn < -0.8 ? 0.42 : 0; b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; if (vn < -0.9 && W.onBounce) W.onBounce(b, -vn); }
      // rolling resistance on carpet
      const tx = b.vx - nx * (b.vx * nx + b.vy * ny), tz = b.vz, ts = Math.hypot(tx, tz);
      if (ts > 1e-4) { const dec = Math.min(ts, 0.7 * dt) / ts; b.vx -= tx * dec; b.vz -= tz * dec; }
    }
    // field boundary: ALLIANCE WALLS (tall) and guardrails (20 in)
    if (b.z < R && b.y < FIELD.guardH + R * 0.4) { b.z = R; if (b.vz < 0) b.vz *= -0.45; }
    if (b.z > FIELD.W - R && b.y < FIELD.guardH + R * 0.4) { b.z = FIELD.W - R; if (b.vz > 0) b.vz *= -0.45; }
    if (b.x < R && b.y < FIELD.wallH) { b.x = R; if (b.vx < 0) b.vx *= -0.45; }
    if (b.x > FIELD.L - R && b.y < FIELD.wallH) { b.x = FIELD.L - R; if (b.vx > 0) b.vx *= -0.45; }
    if (b.x < -0.3 || b.x > FIELD.L + 0.3 || b.z < -0.3 || b.z > FIELD.W + 0.3 || (b.y < 0 && (b.z < 0 || b.z > FIELD.W))) {
      b.state = F_OUT; b.outT = now + 3; W.game && W.game.onFuelOut(b); continue;
    }
    // static boxes (HUB body, TRENCH arm/posts/feet)
    for (const s of FUEL_BOXES) sphereBox(b, s, R);
    // HUB opening, rim and divider
    hubInteract(W, b, px, py);
  }
  // ball-ball contacts (spatial hash)
  const cell = 2 * R, grid = W.fuel.grid; grid.clear();
  for (const b of balls) if (b.state === F_FIELD) {
    const k = Math.floor(b.x / cell) * 4096 + Math.floor(b.z / cell);
    let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(b);
  }
  for (const b of balls) {
    if (b.state !== F_FIELD) continue;
    const ix = Math.floor(b.x / cell), iz = Math.floor(b.z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get((ix + dx) * 4096 + iz + dz); if (!a) continue;
      for (const c of a) {
        if (c.i <= b.i) continue;
        const ex = c.x - b.x, ey = c.y - b.y, ez = c.z - b.z, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 >= 4 * R * R || d2 < 1e-10) continue;
        const d = Math.sqrt(d2), nx = ex / d, ny = ey / d, nz = ez / d, pen = 2 * R - d;
        b.x -= nx * pen / 2; b.y -= ny * pen / 2; b.z -= nz * pen / 2; c.x += nx * pen / 2; c.y += ny * pen / 2; c.z += nz * pen / 2;
        const vn = (c.vx - b.vx) * nx + (c.vy - b.vy) * ny + (c.vz - b.vz) * nz;
        if (vn < 0) { const j = -(1 + 0.3) * vn / 2; b.vx -= j * nx; b.vy -= j * ny; b.vz -= j * nz; c.vx += j * nx; c.vy += j * ny; c.vz += j * nz; }
      }
    }
  }
  // robots push FUEL; intakes capture it
  for (const rb of W.robots) robotFuel(W, rb, dt);
}

function sphereBox(b, s, R) {
  const qx = clamp(b.x, s.x0, s.x1), qy = clamp(b.y, s.y0, s.y1), qz = clamp(b.z, s.z0, s.z1);
  let dx = b.x - qx, dy = b.y - qy, dz = b.z - qz, d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= R * R) return false;
  let nx, ny, nz, pen;
  if (d2 > 1e-10) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; nz = dz / d; pen = R - d; }
  else { // centre inside: push out the shortest way
    const o = [[b.x - s.x0, -1, 0, 0], [s.x1 - b.x, 1, 0, 0], [b.y - s.y0, 0, -1, 0], [s.y1 - b.y, 0, 1, 0], [b.z - s.z0, 0, 0, -1], [s.z1 - b.z, 0, 0, 1]].sort((p, q) => p[0] - q[0])[0];
    nx = o[1]; ny = o[2]; nz = o[3]; pen = o[0] + R;
  }
  b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vy -= 1.4 * vn * ny; b.vz -= 1.4 * vn * nz; }
  return true;
}

function hubInteract(W, b, px, py) {
  const R = FUEL.r;
  if (Math.abs(b.x - HUB.cx) > HUB.circ + R || Math.abs(b.z - HUB.cz) > HUB.circ + R || b.y > HUB.dividerTop + R) return;
  const hd = hexDist(b.x, b.z);
  // divider on the CENTER LINE (inside the hex, from the box top up to its top edge)
  if (hd < 0 && b.y < HUB.dividerTop + R && b.y > HUB.boxTop) {
    const dx = b.x - HUB.cx;
    if (Math.abs(dx) < R) {
      const side = Math.sign(px - HUB.cx) || Math.sign(dx) || 1;
      if (b.y <= HUB.dividerTop) { b.x = HUB.cx + side * R; if (b.vx * side < 0) b.vx *= -0.3; }
      else { const dd = Math.hypot(dx, b.y - HUB.dividerTop); if (dd < R) { const nx = dx / dd, ny = (b.y - HUB.dividerTop) / dd; b.x += nx * (R - dd); b.y += ny * (R - dd); const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny; } } }
    }
  }
  // rim edge (a hexagonal lip at 72 in)
  if (hd > -R && hd < R && Math.abs(b.y - HUB.rim) < R) {
    const dd = Math.hypot(hd, b.y - HUB.rim);
    if (dd < R && !(hd < 0 && b.y < HUB.rim)) {
      const e = 1e-4; const gx = (hexDist(b.x + e, b.z) - hexDist(b.x - e, b.z)) / (2 * e), gz = (hexDist(b.x, b.z + e) - hexDist(b.x, b.z - e)) / (2 * e);
      const gl = Math.hypot(gx, gz) || 1; const nh = hd / dd, ny = (b.y - HUB.rim) / dd;
      const nx = gx / gl * nh, nz = gz / gl * nh, pen = R - dd;
      b.x += nx * pen; b.y += ny * pen; b.z += nz * pen;
      const vn = b.vx * nx + b.vy * ny + b.vz * nz; if (vn < 0) { b.vx -= 1.35 * vn * nx; b.vy -= 1.35 * vn * ny; b.vz -= 1.35 * vn * nz; }
    }
  }
  // through the opening: scored
  if (hd < -0.2 * R && b.y < HUB.rim - 0.3 * R && b.y > HUB.boxTop - 0.1) {
    const side = b.x < HUB.cx ? 'blue' : 'red';
    b.state = F_HUB; b.hubT = W.t + 1.1 + Math.random() * 1.2; b.spinT = 0;
    W.game && W.game.onHubScore(b, side);
  } else if (b.y > HUB.boxTop && b.y < HUB.rim && hd > 0 && hd < R && py >= HUB.rim) {
    // fell beside the lip: handled by the rim; nothing else
  }
}

function hubExit(b) {
  const R = FUEL.r, side = Math.random() < 0.5 ? -1 : 1;
  b.state = F_FIELD; b.x = HUB.cx + side * (HUB.half + R + 0.01); b.z = HUB.cz + (Math.random() - 0.5) * 0.8; b.y = HUB.exitY;
  const sp = 1.0 + Math.random() * 1.8, a = (Math.random() - 0.5) * 1.3;
  b.vx = side * sp * Math.cos(a); b.vz = sp * Math.sin(a); b.vy = 0.3; b.shooter = null; b.spinT = 0;
}

// ---- robots vs FUEL ----
function robotFuel(W, rb, dt) {
  const R = FUEL.r, top = rb.y + rb.spec.topIn * IN;
  const boxes = rb.boxes();
  const fx = rb.fx, fz = rb.fz;
  const vfR = rb.vx * fx + rb.vz * fz;
  const cap = rb.spec === IRISH ? Math.min(IRISH.hopper.physicalMax, rb.capLimit || 99) : rb.spec.ai.capacity;
  const intaking = rb.rollers > 0 && rb.enabled !== false;
  for (const b of W.fuel.balls) {
    if (b.state !== F_FIELD) continue;
    const dx0 = b.x - rb.x, dz0 = b.z - rb.z; if (dx0 * dx0 + dz0 * dz0 > 1.6) continue;
    if (b.y - R > top) continue;
    if (b.shooter === rb && W.t - b.launchT < 0.6) continue;   // our own shot leaving the shooter
    const lx = dx0 * fx + dz0 * fz, lz = -dx0 * fz + dz0 * fx;
    // smooth intake: the spinning pickup roller draws FUEL in front of it toward the middle of the module
    if (intaking && rb.spec === IRISH && W.settings.intakeModel !== 'cad' && rb.deployed() && rb.count() < cap && b.y < 0.3) {
      const front = rb.spec.hl + (IRISH.intake.tipY - IRISH.bumper.y1) * IN, reach = 0.5;
      if (lx > front - 0.03 && lx < front + reach && Math.abs(lz) < (IRISH.captureHalfW || 0.28) + 0.24) {
        const [pvx, pvz] = rb.pointVel(b.x, b.z), pull = 0.35 + 1.1 * (1 - (lx - front) / reach), side = -Math.sign(lz) * Math.min(Math.abs(lz) * 5, 1.0);
        const tvx = pvx - fx * pull - fz * side, tvz = pvz - fz * pull + fx * side, k = Math.min(1, dt * 9);
        b.vx += (tvx - b.vx) * k; b.vz += (tvz - b.vz) * k;
      }
    }
    // intake capture
    if (intaking && rb.count() < cap && b.y < 0.32) {
      let inZone = false;
      if (rb.spec === IRISH) {
        const ext = (IRISH.intake.tipY - IRISH.bumper.y1) * IN;
        inZone = rb.deployed() && lx > rb.spec.hl - 0.04 && lx < rb.spec.hl + ext + R + 0.012 && Math.abs(lz) < (IRISH.captureHalfW || 0.28);
      } else inZone = lx > rb.spec.hl - 0.03 && lx < rb.spec.hl + R + 0.05 && Math.abs(lz) < rb.spec.ai.intakeHalfW;
      if (inZone) {
        const approach = vfR - (b.vx * fx + b.vz * fz);
        let take = true;
        if (rb.spec === IRISH && W.settings.intakeModel === 'cad' && approach < IRISH.intake.minApproach) {
          // team sim: below ~3 ft/s the front roller tends to push the ball instead of pulling it in
          take = Math.random() < IRISH.intake.slowCaptureRate * dt * 2;
        }
        if (take) { captureBall(W, rb, b); continue; }
      }
    }
    // push the ball out of each robot box
    for (const bx of boxes) {
      const ox = b.x - bx.cx, oz = b.z - bx.cz;
      const ux = ox * bx.fx + oz * bx.fz, uz = -ox * bx.fz + oz * bx.fx;
      const btop = bx.intake ? rb.y + 9 * IN : top;
      if (b.y - R > btop) continue;
      const cx = clamp(ux, -bx.hl, bx.hl), cz = clamp(uz, -bx.hw, bx.hw);
      let ddx = ux - cx, ddz = uz - cz, d = Math.hypot(ddx, ddz);
      if (d >= R) continue;
      if (d < 1e-6) {
        // centre over the box: land on top (or drop into the open hopper)
        if (rb.spec === IRISH && !bx.intake && hopperCatch(W, rb, b, ux, uz)) break;
        if (b.y > btop - R * 0.5) { b.y = btop + R; if (b.vy < 0) b.vy *= -0.3; const [pvx, pvz] = rb.pointVel(b.x, b.z); b.vx = lerp(b.vx, pvx, 0.2); b.vz = lerp(b.vz, pvz, 0.2); continue; }
        const ex = bx.hl - Math.abs(ux), ez = bx.hw - Math.abs(uz);
        if (ex < ez) { ddx = Math.sign(ux) || 1; ddz = 0; d = -ex; } else { ddx = 0; ddz = Math.sign(uz) || 1; d = -ez; }
        const l = Math.hypot(ddx, ddz); ddx /= l; ddz /= l;
      } else { ddx /= d; ddz /= d; }
      const nx = ddx * bx.fx - ddz * bx.fz, nz = ddx * bx.fz + ddz * bx.fx, pen = R - d;
      b.x += nx * pen; b.z += nz * pen;
      const [pvx, pvz] = rb.pointVel(b.x, b.z);
      const rvx = b.vx - pvx, rvz = b.vz - pvz, vn = rvx * nx + rvz * nz;
      if (vn < 0) { b.vx -= 1.35 * vn * nx; b.vz -= 1.35 * vn * nz; }
    }
  }
}
// a FUEL that drops into the open hopper from above stays in the robot (G408 E counts it after 3 s)
function hopperCatch(W, rb, b, ux, uz) {
  const yF = ux / IN + IRISH.yc, xR = uz / IN;
  if (yF > 17 && yF < 31 && Math.abs(xR) < 14.5 && b.vy < 0 && b.y > rb.y + 0.33 && rb.count() < IRISH.hopper.physicalMax) {
    b.state = F_HELD; b.owner = rb; b.vx = b.vy = b.vz = 0; irishHopperAdd(rb, b, xR, yF); W.game && W.game.onCatch(rb, b); return true;
  }
  return false;
}
function captureBall(W, rb, b) {
  b.state = F_HELD; b.owner = rb; b.vx = b.vy = b.vz = 0; b.spinT = 0;
  if (rb.spec === IRISH) {
    // start the ball on the team sim's path at the point that matches where it touched the pickup roller
    const dx = b.x - rb.x, dz = b.z - rb.z;
    const ly = (dx * rb.fx + dz * rb.fz) / IN + IRISH.yc, lx = (-dx * rb.fz + dz * rb.fx) / IN, lz = (b.y - rb.y) / IN;
    const t0 = Math.min(intakePathTimeAtY(ly), IRISH.intake.pathEnd - 0.25), p0 = intakePathAt(t0), x0 = clamp(lx, -8, 8);
    rb.transit.push({ b, t: 0, t0, x0, off: [lx - x0, ly - p0[0], lz - p0[1]], dur: IRISH.intake.pathEnd - t0 });
  } else rb.hopper.push(b);
  rb.stats.collected++;
  W.game && W.game.onCollect(rb, b);
}

// ---- launching ----
function launchBall(W, b, rb, pos, vel, spinAxis) {
  b.state = F_FIELD; b.owner = null; b.x = pos[0]; b.y = pos[1]; b.z = pos[2];
  b.vx = vel[0]; b.vy = vel[1]; b.vz = vel[2];
  b.sx = spinAxis[0]; b.sy = spinAxis[1]; b.sz = spinAxis[2]; b.spinT = spinAxis[0] || spinAxis[2] ? 4 : 0;
  b.shooter = rb; b.launchT = W.t; rb.stats.shots++;
}
