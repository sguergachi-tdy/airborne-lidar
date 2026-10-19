// Truth model for Fig 3: two or three flight lines over three buildings, every point placed by the lidar equation
//   p = g(t) + R_nav(t) · ( l + R_bore · ρ · u(θ) )
// Body frame: x forward, y left, z up. Map frame: x east, y north, z up. Metres, radians, seconds.
// The screws on the mount set the true boresight; processing uses the calibrated estimate. Calibration solves the
// estimate from the strips alone: plane fits on roofs and ground patches seen by more than one line.
export const CAL = (() => {
  const H = 400;
  const speed = 60;
  const half = 20;
  const scanHz = 50;
  const prf = 400e3;
  const shown = 16;
  return {
    H,
    speed,
    half,
    halfRad: (half * Math.PI) / 180,
    scanHz,
    prf,
    shown,
    noise: 0.025,
    // measured offsets, body frame (x forward, y left, z up): antenna phase centre to the IMU, IMU to the scanner;
    // georeferencing uses their sum, from the antenna to the scanner's origin
    leverGnss: [0.22, 0.46, -1.32],
    leverScan: [0.32, -0.3, 0.06],
    lever: [0.54, 0.16, -1.26],
    win: { x0: -70, x1: 70, y0: -45, y1: 45 },
    lines: {
      // opposite lines see every roof between them on the same side, so pitch and heading trade off; a cross line
      // looks at the same roofs from 90 degrees and pulls them apart
      pair: [
        { id: "A", axis: "x", at: -70, dir: 1, phase: 0.3 },
        { id: "B", axis: "x", at: 70, dir: -1, phase: 2.1 },
      ],
      full: [
        { id: "A", axis: "x", at: -70, dir: 1, phase: 0.3 },
        { id: "B", axis: "x", at: 70, dir: -1, phase: 2.1 },
        { id: "C", axis: "y", at: -20, dir: 1, phase: 4.0 },
      ],
    },
    // a long barn with its ridge across the track, a house with its ridge along it, a flat-roofed shed
    buildings: [
      { id: "barn", x0: -40, x1: -18, y0: -32, y1: 32, eave: 6, ridge: 11.5, axis: "y" },
      { id: "house", x0: 10, x1: 48, y0: 10, y1: 28, eave: 5, ridge: 9.5, axis: "x" },
      { id: "shed", x0: 22, x1: 46, y0: -36, y1: -16, eave: 7, ridge: 7, axis: "flat" },
    ],
    profiles: {
      along: { axis: "x", at: 0, half: 1.5, from: -62, to: -2, z0: -2, z1: 14 },
      across: { axis: "y", at: 28, half: 1.5, from: -6, to: 44, z0: -2, z1: 12 },
    },
    // what each screw can reach, degrees; the drawing turns the mount EXAG times as far so you can see it
    range: { roll: 0.5, pitch: 0.5, heading: 1.0 },
    EXAG: 5,
    cell: 20,
  };
})();

const D2R = Math.PI / 180;

// rotations: R = Rz(k) · Ry(p) · Rx(r), as a flat 9-array, row-major
export function rot(r, p, k) {
  const [cr, sr, cp, sp, ck, sk] = [Math.cos(r), Math.sin(r), Math.cos(p), Math.sin(p), Math.cos(k), Math.sin(k)];
  return [ck * cp, ck * sp * sr - sk * cr, ck * sp * cr + sk * sr, sk * cp, sk * sp * sr + ck * cr, sk * sp * cr - ck * sr, -sp, cp * sr, cp * cr];
}
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

// the aircraft over one line: position of the antenna and attitude, with gentle real-world motion the INS measures
export function navAt(line, t) {
  const w = (f, a, ph) => a * Math.sin(2 * Math.PI * f * t + ph + line.phase);
  const s = (line.dir > 0 ? -88 : 88) + line.dir * CAL.speed * t;
  const c = line.at + w(0.09, 0.8, 0.4);
  const g = line.axis === "x" ? [s, c, CAL.H + w(0.13, 0.5, 1.1)] : [-c, s, CAL.H + w(0.13, 0.5, 1.1)];
  const base = (line.axis === "x" ? 0 : Math.PI / 2) + (line.dir > 0 ? 0 : Math.PI);
  const heading = base + w(0.11, 0.35 * D2R, 0.2);
  const R = rot(w(0.23, 1.6 * D2R, 0), w(0.17, 0.9 * D2R, 2.3), heading);
  return { g, R };
}

export const scanAt = (t) => {
  const f = (t * CAL.scanHz) % 1;
  return CAL.halfRad * (f < 0.5 ? 4 * f - 1 : 3 - 4 * f);
};

// the scene as convex solids: planes [nx, ny, nz, d] with n · p <= d inside; each plane tagged with its surface
function solidsOf() {
  return CAL.buildings.map((b) => {
    const planes = [
      [[-1, 0, 0, -b.x0], "wall"],
      [[1, 0, 0, b.x1], "wall"],
      [[0, -1, 0, -b.y0], "wall"],
      [[0, 1, 0, b.y1], "wall"],
    ];
    if (b.axis === "flat") planes.push([[0, 0, 1, b.eave], `${b.id}:roof`]);
    else {
      const [lo, hi] = b.axis === "y" ? [b.x0, b.x1] : [b.y0, b.y1];
      const m = (lo + hi) / 2;
      const s = (b.ridge - b.eave) / ((hi - lo) / 2);
      const n = (sgn) => (b.axis === "y" ? [sgn * s, 0, 1] : [0, sgn * s, 1]);
      planes.push([[...n(1), b.ridge + s * m], `${b.id}:roof+`], [[...n(-1), b.ridge - s * m], `${b.id}:roof-`]);
    }
    return { b, planes };
  });
}
const SOLIDS = solidsOf();

// first surface a ray meets: buildings, then the ground
export function cast(o, d) {
  let best = { t: -o[2] / d[2], surface: "ground" };
  for (const { planes } of SOLIDS) {
    let t0 = 0;
    let t1 = Infinity;
    let hit = null;
    for (const [[nx, ny, nz, dd], tag] of planes) {
      const den = nx * d[0] + ny * d[1] + nz * d[2];
      const num = dd - (nx * o[0] + ny * o[1] + nz * o[2]);
      if (Math.abs(den) < 1e-12) {
        if (num < 0) t0 = Infinity;
        continue;
      }
      const t = num / den;
      if (den < 0) {
        if (t > t0) (t0 = t), (hit = tag);
      } else if (t < t1) t1 = t;
    }
    if (t0 <= t1 && hit && t0 < best.t) best = { t: t0, surface: hit };
  }
  return best;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the shots that land in the window, for one line: time, scan angle and a fixed noise draw per shot
export function shotsOf(line, seed) {
  const { win, prf, shown, H } = CAL;
  const rand = rng(seed);
  const dt = shown / prf;
  const t1 = 176 / CAL.speed;
  const out = { t: [], theta: [], noise: [] };
  for (let t = 0; t < t1; t += dt) {
    const theta = scanAt(t);
    const { g, R } = navAt(line, t);
    // ground point with no boresight error, only to skip shots far outside the window
    const u = mv(R, [0, Math.sin(theta), -Math.cos(theta)]);
    const s = -g[2] / u[2];
    const x = g[0] + s * u[0];
    const y = g[1] + s * u[1];
    const u1 = rand();
    const u2 = rand();
    if (x < win.x0 - 6 || x > win.x1 + 6 || y < win.y0 - 6 || y > win.y1 + 6) continue;
    out.t.push(t);
    out.theta.push(theta);
    out.noise.push(Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2));
  }
  void H;
  return { line, t: Float64Array.from(out.t), theta: Float64Array.from(out.theta), noise: Float64Array.from(out.noise) };
}

const cellOf = (x, y) => `ground:${Math.floor(x / CAL.cell)}:${Math.floor(y / CAL.cell)}`;

// the true flight: the mount's real boresight sets where each pulse goes; the range is what the receiver measures
export function measure(shots, bore) {
  const B = rot(bore.roll * D2R, bore.pitch * D2R, bore.heading * D2R);
  const n = shots.t.length;
  const rho = new Float64Array(n);
  const truth = new Float64Array(n * 3);
  const surface = new Array(n);
  for (let i = 0; i < n; i++) {
    const { g, R } = navAt(shots.line, shots.t[i]);
    const th = shots.theta[i];
    const o = mv(R, CAL.lever).map((c, k) => c + g[k]);
    const d = mv(R, mv(B, [0, Math.sin(th), -Math.cos(th)]));
    const hit = cast(o, d);
    rho[i] = hit.t + CAL.noise * shots.noise[i];
    const p = [o[0] + hit.t * d[0], o[1] + hit.t * d[1], o[2] + hit.t * d[2]];
    truth.set(p, i * 3);
    surface[i] = hit.surface === "ground" ? cellOf(p[0], p[1]) : hit.surface;
  }
  return { shots, rho, truth, surface };
}

// processing: the same equation with the calibrated boresight in place of the true one
export function georef(m, est, out, step = 1) {
  const B = rot(est.roll * D2R, est.pitch * D2R, est.heading * D2R);
  const { shots, rho } = m;
  const n = shots.t.length;
  const xyz = out ?? new Float64Array(n * 3);
  for (let i = 0; i < n; i += step) {
    const { g, R } = navAt(shots.line, shots.t[i]);
    const th = shots.theta[i];
    const s = mv(B, [0, rho[i] * Math.sin(th), -rho[i] * Math.cos(th)]);
    const p = mv(R, [CAL.lever[0] + s[0], CAL.lever[1] + s[1], CAL.lever[2] + s[2]]);
    xyz[i * 3] = g[0] + p[0];
    xyz[i * 3 + 1] = g[1] + p[1];
    xyz[i * 3 + 2] = g[2] + p[2];
  }
  return xyz;
}

// plane z = a x + b y + c through a set of points, by least squares about their centroid
function planeOf(xs, ys, zs) {
  const n = xs.length;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < n; i++) (mx += xs[i]), (my += ys[i]), (mz += zs[i]);
  (mx /= n), (my /= n), (mz /= n);
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - mx, y = ys[i] - my, z = zs[i] - mz;
    (sxx += x * x), (sxy += x * y), (syy += y * y), (sxz += x * z), (syz += y * z);
  }
  const det = sxx * syy - sxy * sxy || 1e-9;
  const a = (sxz * syy - syz * sxy) / det;
  const b = (syz * sxx - sxz * sxy) / det;
  return { a, b, c: mz - a * mx - b * my, k: 1 / Math.sqrt(1 + a * a + b * b) };
}

// strip-to-strip residuals: every point's distance to the plane the other strips fit to the same surface
const SOLVE_STEP = 3;
function residuals(ms, est) {
  const groups = new Map();
  ms.forEach((m, s) => {
    const xyz = georef(m, est, null, SOLVE_STEP);
    for (let i = 0; i < m.shots.t.length; i += SOLVE_STEP) {
      const tag = m.surface[i];
      if (tag === "wall") continue;
      let g = groups.get(tag);
      if (!g) groups.set(tag, (g = ms.map(() => ({ x: [], y: [], z: [] }))));
      g[s].x.push(xyz[i * 3]);
      g[s].y.push(xyz[i * 3 + 1]);
      g[s].z.push(xyz[i * 3 + 2]);
    }
  });
  const r = [];
  for (const [, g] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const seen = g.map((p, s) => (p.x.length >= 12 ? s : -1)).filter((s) => s >= 0);
    if (seen.length < 2) continue;
    for (const s of seen) {
      const xs = [], ys = [], zs = [];
      for (const o of seen) if (o !== s) xs.push(...g[o].x), ys.push(...g[o].y), zs.push(...g[o].z);
      const q = planeOf(xs, ys, zs);
      const p = g[s];
      for (let i = 0; i < p.x.length; i++) r.push((p.z[i] - (q.a * p.x[i] + q.b * p.y[i] + q.c)) * q.k);
    }
  }
  return r;
}

export const rmsOf = (r) => Math.sqrt(r.reduce((a, v) => a + v * v, 0) / Math.max(1, r.length));
export const stripRms = (ms, est) => rmsOf(residuals(ms, est));

// how far the processed points sit from where the pulses really landed
export function absoluteRms(ms, clouds) {
  let sum = 0, n = 0;
  ms.forEach((m, s) => {
    const xyz = clouds[s];
    for (let i = 0; i < m.shots.t.length; i += 2) {
      const dx = xyz[i * 3] - m.truth[i * 3], dy = xyz[i * 3 + 1] - m.truth[i * 3 + 1], dz = xyz[i * 3 + 2] - m.truth[i * 3 + 2];
      (sum += dx * dx + dy * dy + dz * dz), n++;
    }
  });
  return Math.sqrt(sum / Math.max(1, n));
}

// Levenberg–Marquardt on roll, pitch and heading from the strips alone; a direction the overlap cannot see stays
// where it started, which is what happens to pitch and heading with only an opposite pair
const KEYS = ["roll", "pitch", "heading"];
export function solve(ms, start, { iterations = 6 } = {}) {
  let est = { ...start };
  const h = 1e-3;
  for (let it = 0; it < iterations; it++) {
    const r0 = residuals(ms, est);
    const J = KEYS.map((key) => {
      const r1 = residuals(ms, { ...est, [key]: est[key] + h });
      return r1.map((v, i) => (v - r0[i]) / h);
    });
    const A = KEYS.map((_, i) => KEYS.map((__, j) => J[i].reduce((a, v, n) => a + v * J[j][n], 0)));
    const g = KEYS.map((_, i) => -J[i].reduce((a, v, n) => a + v * r0[n], 0));
    const top = Math.max(...A.map((row, i) => row[i]));
    A.forEach((row, i) => (row[i] += 1e-3 * top + 1e-9));
    const dx = solve3(A, g);
    est = Object.fromEntries(KEYS.map((key, i) => [key, est[key] + dx[i]]));
    if (Math.max(...dx.map(Math.abs)) < 1e-5) break;
  }
  return est;
}
function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[3] / row[i]);
}

// what one screw's error does on the ground, for the guide: shift in metres at the flying height
export const shiftOf = (deg, distance = CAL.H) => distance * Math.tan(deg * D2R);
