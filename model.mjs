// Pure truth model of a galvo-scanned, time-of-flight airborne lidar over a small scene.
// World units: x along track, y across track, z up. ALT units above the ground = 150 m.
export const LIDAR = (() => {
  const alt = 220;
  const metres = 150;
  const unit = metres / alt;
  const c = 299792458;
  const half = 18;
  const prf = 250000;
  const scanHz = 50;
  const speed = 55;
  const vis = { speed: 9, sweep: 0.8, pulse: 1 / 50, from: -104, to: 104 };
  const swath = 2 * metres * Math.tan((half * Math.PI) / 180);
  const sweepsPerUnitTrue = (2 * scanHz) / (speed / unit);
  const sweepsPerUnitVis = 1 / (vis.speed * vis.sweep);
  return {
    alt,
    metres,
    unit,
    c,
    half,
    halfRad: (half * Math.PI) / 180,
    prf,
    scanHz,
    speed,
    divergence: 0.25e-3,
    wavelength: 1064,
    pulseWidth: 5e-9,
    pulseMetres: c * 5e-9,
    period: 1 / prf,
    maxRange: c / (2 * prf),
    // bullet time: the drawing slows to one microsecond per second to show single pulses
    dilation: 1e6,
    unitsPerMicro: (c * 1e-6) / unit,
    vis,
    swath,
    lineSpacing: speed / (2 * scanHz),
    pulsesPerSweep: prf / (2 * scanHz),
    density: prf / (speed * swath),
    sweepDecimation: sweepsPerUnitTrue / sweepsPerUnitVis,
    pulseDecimation: prf / (2 * scanHz) / (vis.sweep / vis.pulse),
    slow: (speed / unit) / vis.speed,
    scanSlow: scanHz / (1 / (2 * vis.sweep)),
  };
})();

export const SCENE = (() => {
  const tile = { x: -132, y: -96, w: 264, d: 192, r: 6 };
  const road = { y0: -7, y1: 7 };
  const building = (x0, x1, y0, y1, eave, ridge, over) => ({ x0, x1, y0, y1, eave, ridge, over });
  const buildings = [building(-30, -2, -46, -24, 11, 18.5, 1.6), building(44, 58, 22, 32, 6.5, 10.5, 1.0)];
  const tree = (x, y, cz, r) => ({ x, y, cz, r, trunk: 1.1 });
  const trees = [
    tree(-74, 30, 23, 8.5),
    tree(-58, 44, 19, 7),
    tree(-88, 14, 21, 7.5),
    tree(22, -44, 25, 9),
    tree(40, -58, 20, 7),
    tree(76, 34, 22, 8),
    tree(-46, -60, 18, 6.5),
    tree(92, -26, 21, 7.5),
  ];
  return { tile, road, buildings, trees };
})();

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function planesOf(b) {
  const ym = (b.y0 + b.y1) / 2;
  const half = (b.y1 - b.y0) / 2;
  const pitch = (b.ridge - b.eave) / half;
  const low = b.eave - b.over * pitch;
  const box = [
    [-1, 0, 0, -b.x0],
    [1, 0, 0, b.x1],
    [0, -1, 0, -b.y0],
    [0, 1, 0, b.y1],
    [0, 0, -1, 0],
    [0, 0, 1, b.eave],
  ];
  const a = b.ridge - low;
  const w = ym - (b.y0 - b.over);
  const roof = [
    [-1, 0, 0, -(b.x0 - b.over)],
    [1, 0, 0, b.x1 + b.over],
    [0, 0, -1, -low],
    [0, -a / Math.hypot(a, w), w / Math.hypot(a, w), (w * low - a * (b.y0 - b.over)) / Math.hypot(a, w)],
    [0, a / Math.hypot(a, w), w / Math.hypot(a, w), (w * low + a * (b.y1 + b.over)) / Math.hypot(a, w)],
  ];
  return { box, roof, low };
}

function convex(o, d, planes) {
  let near = -1e9;
  let far = 1e9;
  let normal = null;
  for (const [nx, ny, nz, k] of planes) {
    const n = [nx, ny, nz];
    const denom = dot(n, d);
    const dist = k - dot(n, o);
    if (Math.abs(denom) < 1e-12) {
      if (dist < 0) return null;
      continue;
    }
    const t = dist / denom;
    if (denom < 0) {
      if (t > near) {
        near = t;
        normal = n;
      }
    } else if (t < far) far = t;
  }
  if (near > far || far < 0 || near < 0) return null;
  return { t: near, n: normal };
}

function sphere(o, d, c, r) {
  const oc = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
  const b = dot(oc, d);
  const q = dot(oc, oc) - r * r;
  const h = b * b - q;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  if (t < 0) return null;
  const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  return { t, n: [(p[0] - c[0]) / r, (p[1] - c[1]) / r, (p[2] - c[2]) / r] };
}

export function inTile(x, y, pad = 0) {
  const T = SCENE.tile;
  const cx = T.x + T.w / 2;
  const cy = T.y + T.d / 2;
  const qx = Math.abs(x - cx) - (T.w / 2 - T.r - pad);
  const qy = Math.abs(y - cy) - (T.d / 2 - T.r - pad);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - T.r <= 0;
}

export const SURFACE = {
  grass: { name: "ground", amp: 0.62 },
  road: { name: "road", amp: 0.3 },
  roof: { name: "roof", amp: 0.5 },
  wall: { name: "wall", amp: 0.42 },
  canopy: { name: "canopy", amp: 0.48 },
};

// First hit along a ray, skipping tree canopies when solid is set (the part of a pulse that passes through the leaves).
export function cast(o, d, { through = false } = {}) {
  let best = null;
  const take = (hit, kind, owner = "ground") => {
    if (hit && (!best || hit.t < best.t)) best = { ...hit, kind, owner };
  };
  SCENE.buildings.forEach((b, index) => {
    const { box, roof } = planesOf(b);
    take(convex(o, d, box), "wall", `b${index}`);
    const r = convex(o, d, roof);
    if (r) take(r, Math.abs(r.n[2]) > 0.3 ? "roof" : "wall", `b${index}`);
  });
  if (!through) SCENE.trees.forEach((t, index) => take(sphere(o, d, [t.x, t.y, t.cz], t.r), "canopy", `t${index}`));
  if (d[2] < 0) {
    const t = -o[2] / d[2];
    const x = o[0] + d[0] * t;
    const y = o[1] + d[1] * t;
    if (inTile(x, y)) take({ t, n: [0, 0, 1] }, y > SCENE.road.y0 && y < SCENE.road.y1 ? "road" : "grass");
  }
  if (!best) return null;
  best.p = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
  return best;
}

export const tri = (u) => {
  const f = ((u % 2) + 2) % 2;
  return f < 1 ? -1 + 2 * f : 3 - 2 * f;
};
export const timeAt = (x) => (x - LIDAR.vis.from) / LIDAR.vis.speed;
export const xAt = (t) => LIDAR.vis.from + LIDAR.vis.speed * t;
export const angleAt = (t) => LIDAR.halfRad * tri(t / LIDAR.vis.sweep);

// The returns of one pulse fired at along-track x with scan angle theta (radians, + toward +y).
export function returnsOf(x, theta, y0 = 0) {
  const o = [x, y0, LIDAR.alt];
  const d = [0, Math.sin(theta), -Math.cos(theta)];
  const first = cast(o, d);
  if (!first) return [];
  const out = [{ ...first, ...SURFACE[first.kind] }];
  if (first.kind === "canopy") {
    const last = cast(o, d, { through: true });
    if (last) out.push({ ...last, ...SURFACE[last.kind], amp: SURFACE[last.kind].amp * 0.55 });
    out[0].amp = SURFACE.canopy.amp * 0.8;
  }
  return out.map((r) => {
    const metres = r.t * LIDAR.unit;
    return { ...r, metres, tof: (2 * metres) / LIDAR.c };
  });
}

export function pulseAt(index) {
  const t = index * LIDAR.vis.pulse;
  const x = xAt(t);
  const theta = angleAt(t);
  return { index, t, x, theta, returns: returnsOf(x, theta) };
}

export function readoutOf(x) {
  const theta = angleAt(timeAt(x));
  const r = returnsOf(x, theta);
  const deg = Math.abs((theta * 180) / Math.PI).toFixed(1).padStart(4, "\u2007");
  if (!r.length) return `${theta < 0 ? "−" : "+"}${deg}° · no return`;
  const first = r[0];
  const tof = (first.tof * 1e6).toFixed(3);
  const tail = r.length > 1 ? ` · ${r.length} returns` : "";
  return `${theta < 0 ? "−" : "+"}${deg}° · ${tof} µs → ${first.metres.toFixed(1).padStart(5, "\u2007")} m · ${first.name}${tail}`;
}
