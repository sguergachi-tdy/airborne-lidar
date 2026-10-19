// Pure truth model of the lidar head in Fig 2: scanners, lasers, detectors and the multiple-pulses-in-the-air timing.
// Aircraft frame: x along track (forward), y across track, z up. The head looks down through a window in its floor.
const C = 299792458;
const DEG = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a) => mul(a, 1 / Math.hypot(a[0], a[1], a[2]));
const reflect = (d, n) => add(d, mul(n, -2 * dot(d, n)));
// Snell's law as vectors: n faces against d; eta = n1 / n2
export function refract(d, n, eta) {
  const ci = -dot(n, d);
  const k = 1 - eta * eta * (1 - ci * ci);
  if (k < 0) return null;
  return unit(add(mul(d, eta), mul(n, eta * ci - Math.sqrt(k))));
}

export const FLIGHT = { alt: 150, speed: 55 };
export const FLASH_RATE = 2000;

// The incoming beam travels +y into the scanner; the rest-pose mirror normal looks back along -y and down.
const N0 = unit([0, -1, -1]);
const E1 = [1, 0, 0];
const E2 = unit([0, -1, 1]);

const tri = (u) => {
  const f = ((u % 1) + 1) % 1;
  return f < 0.5 ? -1 + 4 * f : 3 - 4 * f;
};

export const SCANNERS = {
  galvo: {
    id: "galvo",
    name: "Galvo mirror",
    rate: 50,
    // oscillation frequency, Hz: each cycle sweeps two lines, one each way
    rates: [20, 30, 50, 70],
    unit: "Hz",
    half: 18,
    // a galvanometer is driven with a near-triangle, rounded at the turnarounds where the mirror must stop and reverse
    pose(t, f = this.rate) {
      const s = Math.sin(2 * Math.PI * f * t);
      const theta = this.half * DEG * (Math.asin(0.985 * s) / Math.asin(0.985));
      return { theta, on: true, d: [0, Math.sin(theta), -Math.cos(theta)] };
    },
    lines: (S, N, f = S.rate) => 2 * f,
    duty: () => 1,
  },
  polygon: {
    id: "polygon",
    name: "Polygon",
    rate: 50,
    // turns a second: each facet sweeps one line per turn
    rates: [25, 50, 100, 150],
    unit: "rev/s",
    half: 30,
    // a facet turned by phi deflects the beam by 2 phi; the window passes +-half and the corners between facets are dark
    pose(t, N, f = this.rate) {
      const turn = 2 * Math.PI * f * t;
      const facet = (2 * Math.PI) / N;
      const local = ((((turn + facet / 2) % facet) + facet) % facet) - facet / 2;
      const theta = 2 * local;
      return { turn, theta, on: Math.abs(theta) <= this.half * DEG, d: [0, Math.sin(theta), -Math.cos(theta)] };
    },
    lines: (S, N, f = S.rate) => f * N,
    duty: (S, N) => Math.min(1, (2 * S.half) / (720 / N)),
  },
  palmer: {
    id: "palmer",
    name: "Palmer (nutating)",
    rate: 25,
    // turns a second: each ellipse crosses the track twice
    rates: [10, 25, 50, 100],
    unit: "rev/s",
    tilt: 7,
    // the mirror's normal sweeps a cone of half-angle tilt about the rest normal; the reflected beam traces an ellipse
    pose(t, f = this.rate) {
      const a = 2 * Math.PI * f * t;
      const b = this.tilt * DEG;
      const n = unit(add(mul(N0, Math.cos(b)), add(mul(E1, Math.sin(b) * Math.cos(a)), mul(E2, Math.sin(b) * Math.sin(a)))));
      return { turn: a, n, on: true, d: reflect([0, 1, 0], n) };
    },
    lines: (S, N, f = S.rate) => 2 * f,
    duty: () => 1,
  },
  risley: {
    id: "risley",
    name: "Risley prisms",
    rate: 20,
    // turns a second of the first prism; the second turns at ratio times this
    rates: [5, 10, 20, 40],
    unit: "rev/s",
    wedge: 18,
    glass: 1.5,
    // two wedge prisms turning about the vertical beam; the beam is refracted at all four faces
    pose(t, ratio = -1, phase = 0, f = this.rate) {
      // the first wedge starts deviating the beam across the track, so a counter-rotating pair at phase 0 scans a cross-track line
      const a1 = 2 * Math.PI * f * t + Math.PI / 2;
      // the wedges face each other, so phase 0 is set half a turn apart, where their deviations add
      const a2 = ratio * (a1 - Math.PI / 2) + Math.PI / 2 + Math.PI + phase * DEG;
      const w = this.wedge * DEG;
      const tilt = (a) => [Math.sin(w) * Math.cos(a), Math.sin(w) * Math.sin(a), Math.cos(w)];
      let d = [0, 0, -1];
      d = refract(d, [0, 0, 1], 1 / this.glass);
      d = refract(d, tilt(a1), this.glass);
      d = d && refract(d, tilt(a2), 1 / this.glass);
      d = d && refract(d, [0, 0, 1], this.glass);
      return { turn: a1, turn2: a2, on: !!d, d: d ?? [0, 0, -1] };
    },
    lines: (S, N, f = S.rate) => 2 * f,
    duty: () => 1,
  },
  flash: {
    id: "flash",
    name: "Flash (no scan)",
    rate: 0,
    rates: [],
    unit: "",
    half: 8,
    grid: 32,
    pose() {
      return { on: true, d: [0, 0, -1] };
    },
    lines: () => 0,
    duty: () => 1,
  },
};

export const LASERS = {
  yag: { id: "yag", name: "1064 nm Nd:YAG", nm: 1064, width: 5e-9, ink: "ir", eyeSafe: false, water: "surface" },
  fibre: { id: "fibre", name: "1550 nm Er fibre", nm: 1550, width: 3e-9, ink: "ir", eyeSafe: true, water: "absorbed" },
  green: { id: "green", name: "532 nm green", nm: 532, width: 1.5e-9, ink: "green", eyeSafe: false, water: "bottom" },
};

export const DETECTORS = {
  discrete: { id: "discrete", name: "Discrete returns", note: "APD, constant-fraction trigger, time-to-digital counter" },
  waveform: { id: "waveform", name: "Full waveform", note: "APD sampled at 1 GS/s" },
  photon: { id: "photon", name: "Single photon", note: "SPAD array, photon histogram" },
};

export const PRFS = [100e3, 250e3, 500e3, 1e6, 2e6, 4e6];
export const FACETS = [3, 4, 5, 6, 7, 8];
export const RATIOS = [-1, 1, -0.9, 0.9, -1.5];

export const defaults = { scanner: "galvo", facets: 4, ratio: -1, phase: 0, laser: "yag", prf: 250e3, detector: "discrete", rate: 50, rx: "inject", nav: "ins" };

// The scan frequency in use: the chosen one if this scanner offers it, else the scanner's own default.
export function rateOf(cfg) {
  const S = SCANNERS[cfg.scanner];
  return S.rates.includes(cfg.rate) ? cfg.rate : S.rate;
}

export function poseOf(cfg, t) {
  const S = SCANNERS[cfg.scanner];
  const f = rateOf(cfg);
  if (cfg.scanner === "polygon") return S.pose(t, cfg.facets, f);
  if (cfg.scanner === "risley") return S.pose(t, cfg.ratio, cfg.phase, f);
  return S.pose(t, f);
}

// Where the beam lands on flat ground, in metres, relative to the point under the aircraft at time t.
export function groundOf(d, alt = FLIGHT.alt) {
  if (d[2] >= -1e-6) return null;
  const s = alt / -d[2];
  return [d[0] * s, d[1] * s];
}

// ---------------------------------------------------------------- navigation: where the aircraft is and which way it points
// Light turbulence, as a sum of incommensurate sines (rad, m). The map stretches distance flown ×12, so gusts are
// sped up by the same factor: their wavelength on the ground stays true (a 0.3 Hz roll at 55 m/s is 183 m of track).
export const GUST = 12;
const GUSTS = {
  roll: [[1.9, 0.19, 0.3], [0.9, 0.43, 1.7], [0.35, 1.1, 4.1]],
  pitch: [[0.9, 0.23, 2.2], [0.45, 0.61, 0.6], [0.2, 1.4, 3.3]],
  yaw: [[1.3, 0.11, 5.1], [0.5, 0.37, 2.8]],
  da: [[2.2, 0.05, 1.1], [0.6, 0.17, 3.9]],
  dx: [[3.2, 0.06, 4.4], [0.8, 0.21, 0.2]],
  dh: [[1.0, 0.09, 2.6], [0.3, 0.31, 5.5]],
};
const wave = (terms, t) => terms.reduce((sum, [a, f, p]) => sum + a * Math.sin(2 * Math.PI * f * t + p), 0);
export function attitudeOf(t) {
  const g = t * GUST;
  return { roll: wave(GUSTS.roll, g) * DEG, pitch: wave(GUSTS.pitch, g) * DEG, yaw: wave(GUSTS.yaw, g) * DEG, da: wave(GUSTS.da, g), dx: wave(GUSTS.dx, g), dh: wave(GUSTS.dh, g) };
}
// aircraft frame to local level: yaw about z, then pitch about y, then roll about x (the along-track axis)
export function rotate(d, { roll, pitch, yaw }) {
  const [cr, sr, cp, sp, cy, sy] = [Math.cos(roll), Math.sin(roll), Math.cos(pitch), Math.sin(pitch), Math.cos(yaw), Math.sin(yaw)];
  const x1 = d[0];
  const y1 = cr * d[1] - sr * d[2];
  const z1 = sr * d[1] + cr * d[2];
  const x2 = cp * x1 + sp * z1;
  const z2 = -sp * x1 + cp * z1;
  return [cy * x2 - sy * y1, sy * x2 + cy * y1, z2];
}
export const NAVS = {
  ins: { id: "ins", name: "GNSS + IMU", note: "position from GNSS, attitude from the IMU, blended in a Kalman filter" },
  gnss: { id: "gnss", name: "GNSS only", note: "position known, attitude assumed level" },
  none: { id: "none", name: "None", note: "flight plan assumed, attitude assumed level" },
};
// One shot georeferenced: where the beam really lands (truth) and where the processing puts it (seen), in metres
// [along, cross] from the planned point under the aircraft. The range is always measured; what changes is how much
// of the aircraft's position and attitude is known when that range is turned into a point.
export function georef(d, t, nav = "ins", alt = FLIGHT.alt) {
  const att = attitudeOf(t);
  const w = rotate(d, att);
  if (w[2] >= -1e-6) return null;
  const range = (alt + att.dh) / -w[2];
  const truth = [att.da + w[0] * range, att.dx + w[1] * range];
  const seen = nav === "ins" ? truth : nav === "gnss" ? [att.da + d[0] * range, att.dx + d[1] * range] : [d[0] * range, d[1] * range];
  return { truth, seen, range, w, att };
}

// The time the pattern takes to repeat (or one representative cycle), in seconds.
export function cycleOf(cfg) {
  const S = SCANNERS[cfg.scanner];
  if (cfg.scanner === "flash") return 0.05;
  const f = rateOf(cfg);
  if (cfg.scanner === "polygon") return 1 / f;
  if (cfg.scanner === "risley") {
    const r = Math.abs(cfg.ratio);
    const den = Math.abs(r - Math.round(r)) < 1e-6 ? 1 : 10;
    return den / f;
  }
  return 1 / f;
}

// The truth table for one configuration: what the 2D view and readout quote.
export function factsOf(cfg) {
  const S = SCANNERS[cfg.scanner];
  const L = LASERS[cfg.laser];
  const v = FLIGHT.speed;
  const H = FLIGHT.alt;
  let ys = [];
  let xs = [];
  const span = cycleOf(cfg);
  for (let i = 0; i <= 2000; i++) {
    const p = poseOf(cfg, (i / 2000) * span);
    if (!p.on) continue;
    const g = groundOf(p.d, H);
    if (g) xs.push(g[0]), ys.push(g[1]);
  }
  if (cfg.scanner === "flash") {
    const e = H * Math.tan(S.half * DEG);
    xs = [-e, e];
    ys = [-e, e];
  }
  const swath = Math.max(...ys) - Math.min(...ys);
  const reach = Math.max(...xs) - Math.min(...xs);
  const scanRate = rateOf(cfg);
  const lines = S.lines(S, cfg.facets, scanRate);
  const duty = S.duty(S, cfg.facets);
  const shots = cfg.prf * duty;
  const range = H;
  // a flash laser spreads each pulse over the whole array, so it needs far more energy per pulse and fires far less often
  const frames = cfg.scanner === "flash" ? Math.min(cfg.prf, FLASH_RATE) : 0;
  const rate = frames || cfg.prf;
  const unambiguous = C / (2 * rate);
  const inAir = Math.floor((2 * range * rate) / C) + 1;
  const density = cfg.scanner === "flash" ? (frames * S.grid * S.grid) / (v * swath) : swath > 0.5 ? shots / (v * swath) : NaN;
  return {
    scanRate,
    frames,
    swath,
    reach,
    lines,
    lineSpacing: lines ? v / lines : 0,
    duty,
    shots,
    perLine: lines ? shots / lines : 0,
    density,
    unambiguous,
    inAir,
    footprint: H * 0.25e-3 * (cfg.laser === "fibre" ? 2 : 1),
    rangeRes: (C * L.width) / 2,
    period: 1 / rate,
  };
}

// What one pulse sends back from the surface it lands on, as a sum of gaussians in range. `hit` says what is under the
// spot: { kind: "tree" | "roof" | "road" | "grass" | "water", height, q (0 at a crown's centre, 1 at its rim), edge,
// depth, glint, bed }. Every echo scatters from shot to shot: speckle in its strength, the leaves the pulse happens to
// meet, the ground's own small relief.
export function echoesFor(cfg, hit, rnd = Math.random) {
  const L = LASERS[cfg.laser];
  const H = FLIGHT.alt;
  const leaf = { 532: 0.12, 1064: 0.55, 1550: 0.32 }[L.nm];
  const soil = { 532: 0.18, 1064: 0.34, 1550: 0.4 }[L.nm];
  const grass = { 532: 0.08, 1064: 0.45, 1550: 0.26 }[L.nm];
  const asphalt = { 532: 0.06, 1064: 0.11, 1550: 0.13 }[L.nm];
  const roof = { 532: 0.24, 1064: 0.42, 1550: 0.38 }[L.nm];
  const sp = (lo, hi) => lo + (hi - lo) * rnd();
  const k = () => sp(0.72, 1.28);
  const g = H + sp(-0.25, 0.25);
  const out = [];
  if (hit.kind === "tree") {
    // a domed crown: lower and thinner toward its rim, where more pulses slip through to the ground
    const top = hit.height * (1 - 0.3 * hit.q ** 2);
    const caught = rnd() > 0.06 + 0.5 * hit.q ** 2;
    if (caught) out.push({ r: H - top + sp(0, 0.9), a: 0.85 * leaf * (1 - 0.35 * hit.q) * k(), s: sp(0.5, 1.3), what: "canopy" });
    if (rnd() < 0.65) out.push({ r: H - top * sp(0.3, 0.65), a: 0.32 * leaf * k(), s: sp(0.4, 1), what: "branches" });
    if (rnd() < 0.3) out.push({ r: g - sp(0.8, 1.8), a: 0.25 * grass * k(), s: 0.3, what: "shrub" });
    out.push({ r: g, a: soil * (caught ? sp(0.2, 0.7) : sp(0.6, 0.95)) * k(), s: 0.05, what: "ground" });
  } else if (hit.kind === "roof") {
    const r = H - hit.height + sp(-0.1, 0.1);
    // a spot across the eave lands partly on the roof and partly on the ground beside the wall
    if (hit.edge) {
      const f = sp(0.25, 0.75);
      out.push({ r, a: roof * f * k(), s: 0.05, what: "roof edge" });
      out.push({ r: g, a: soil * (1 - f) * k(), s: 0.05, what: "ground" });
    } else out.push({ r, a: roof * k(), s: 0.05, what: "roof" });
  } else if (hit.kind === "road") {
    out.push({ r: g, a: asphalt * k(), s: 0.05, what: "road" });
  } else if (hit.kind === "grass") {
    out.push({ r: g - sp(0, 0.15), a: grass * k(), s: sp(0.08, 0.2), what: "grass" });
  } else if (hit.kind === "water") {
    // infrared only comes back as a near-vertical glint, and how much depends on the ripples under the spot
    if (L.water !== "bottom" && !hit.glint) return out;
    const surface = { yag: 0.1, fibre: 0.02, green: 0.16 }[cfg.laser];
    out.push({ r: H + sp(-0.05, 0.05), a: surface * (L.water === "bottom" ? k() : sp(0.4, 2.4)), s: 0.05, what: "water surface" });
    if (L.water === "bottom") {
      const depth = hit.depth * sp(0.92, 1.08);
      // light slows to c/1.33 in water, so the bottom echo arrives as if 1.33 times deeper, after a round trip of attenuation
      out.push({ r: H + depth * 1.33, a: 0.42 * Math.exp(-2 * 0.12 * depth) * k(), s: 0.25, what: hit.bed ?? "bottom" });
      out.push({ r: H + 0.45 * depth * 1.33, a: 0.05 * sp(0.7, 1.2), s: 0.4 * depth, what: "water column" });
    }
  }
  return out.sort((a, b) => a.r - b.r);
}

// The analog signal at range r: each surface blurred by the pulse's own length.
export function signalAt(cfg, echoes, r) {
  const L = LASERS[cfg.laser];
  const sp = (C * L.width) / 2 / 2.355;
  let y = 0;
  for (const e of echoes) {
    const s = Math.hypot(sp, e.s);
    y += (e.a * (sp / s)) * Math.exp(-0.5 * ((r - e.r) / s) ** 2);
  }
  return y;
}

// What a discrete-return board reports: a constant-fraction trigger above threshold with a dead time of about one pulse.
export function discreteOf(cfg, echoes, { from, to, step = 0.02, threshold = 0.04, signal = (r) => signalAt(cfg, echoes, r) } = {}) {
  const L = LASERS[cfg.laser];
  const dead = (C * L.width) / 2 * 1.2;
  const out = [];
  let prev = 0;
  let last = -1e9;
  let rising = false;
  let peak = null;
  for (let r = from; r <= to; r += step) {
    const y = signal(r);
    if (y > prev && y > threshold && r - last > dead) rising = true;
    if (rising && y < prev) {
      peak = { r: r - step, a: prev };
      out.push(peak);
      last = r;
      rising = false;
    }
    prev = y;
  }
  return out.slice(0, 4);
}

// How many returns one pulse yields, cheaply enough for every point on the map: the same threshold and dead time as
// discreteOf, read at each surface's own range (two surfaces closer than the dead time count once).
export function returnsOf(cfg, echoes, threshold = 0.04) {
  const dead = ((C * LASERS[cfg.laser].width) / 2) * 1.2;
  let n = 0;
  let last = -1e9;
  for (const e of echoes) {
    if (e.r - last <= dead || signalAt(cfg, echoes, e.r) <= threshold) continue;
    n++;
    last = e.r;
  }
  return Math.min(4, n);
}

// A deterministic noise source so the photon histogram is the same on every load.
export function hash(n) {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// Single-photon counting: each shot detects at most a few photons; the histogram over many shots rebuilds the profile.
export function photonsOf(cfg, echoes, { from, to, bins = 160, shots = 400, sun = 0.004, seed = 1 } = {}) {
  const width = (to - from) / bins;
  const counts = new Array(bins).fill(0);
  const rate = Array.from({ length: bins }, (_, i) => signalAt(cfg, echoes, from + (i + 0.5) * width) * 0.5 + sun);
  for (let s = 0; s < shots; s++) {
    for (let i = 0; i < bins; i++) {
      if (hash(seed * 7919 + s * 131 + i) < rate[i]) {
        counts[i]++;
        // after a click the SPAD is blind for its dead time
        i += 3;
      }
    }
  }
  return { counts, width };
}

export const physics = { C, DEG };
