// Fig 3's moving assembly, shared by the build (Node, at rest, for the audit) and the page (rebuilt as the screws
// turn). World units are millimetres on the bench: x forward (the scanner's boresight pointer), y left, z up. The
// heading stage turns about the vertical through the pivot ball; the tip-tilt plate turns about the ball itself.
// No imports: the page inlines this module and passes its own drawing helpers in `ctx`.
export const BENCH = {
  c: [30, -18, 30.5],
  ball: 3.5,
  base: { x: -120, y: -75, w: 240, d: 150, r: 6, z: 8 },
  ring: { r: 46, z0: 8, z1: 16 },
  platter: { r: 42, z0: 16, z1: 22 },
  plate: { x0: -5, x1: 65, y0: -53, y1: 17 },
  lower: [22, 27],
  upper: [34, 40],
  knob: { r: 5, h: 8, pitch: 0.5 },
  screws: { roll: [26, 11], pitch: [59, -18] },
  scanner: { x0: 2, x1: 50, y0: -46, y1: 2, z0: 43, z1: 82 },
  axis: { y: -22, z: 61 },
  rod: { from: 55, to: 98, r: 1.1, ball: 2.4 },
  arm: { x0: 26, x1: 34, y0: 19, y1: 48, z0: 22, z1: 27 },
  pad: { y: 42, z: 24.5, s0: 34, s1: 35.2, r: 2.4 },
  micro: { pitch: 0.5, block: [48, 58], barrel: { r: 3.4, s0: 58, s1: 84 }, thimble: { rIn: 3.45, rOut: 5.2, s0: 70, s1: 92 }, cap: [92, 94], ratchet: { r: 3.2, s0: 94, s1: 99 }, spindle: 1.5 },
  spring: { post: [0, 42], postR: 2, from: 2.3, r: 2.4, wire: 0.3 },
  reticle: { x: 100.4, rIn: 11, rOut: 13.5, w: 2 },
};

const D2R = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
function rotOf(r, p, k) {
  const [cr, sr, cp, sp, ck, sk] = [Math.cos(r), Math.sin(r), Math.cos(p), Math.sin(p), Math.cos(k), Math.sin(k)];
  return [ck * cp, ck * sp * sr - sk * cr, ck * sp * cr + sk * sr, sk * cp, sk * sp * sr + ck * cr, sk * sp * cr - ck * sr, -sp, cp * sr, cp * cr];
}
const about = (M, c) => ({ p: (q) => add(c, mv(M, sub(q, c))), d: (v) => mv(M, v) });

// the pose of each group for a true boresight (degrees), drawn `E` times as far so a tenth of a degree can be seen
export function poseOf(bore, E) {
  const r = bore.roll * E * D2R;
  const p = bore.pitch * E * D2R;
  const k = bore.heading * E * D2R;
  const { c, pad, arm, knob, screws, upper } = BENCH;
  const h = about(rotOf(0, 0, k), c);
  const t = about(rotOf(r, p, k), c);
  // the micrometer spindle follows the arm's pad; the spring fills the gap behind the arm
  const dx = h.p([pad.s1, pad.y, pad.z])[0] - pad.s1;
  const back = h.p([arm.x0, pad.y, pad.z])[0];
  // each adjuster has advanced as far as its corner of the plate has moved, at the thread's pitch
  const turnsOf = ([x, y]) => (t.p([x, y, upper[0]])[2] - h.p([x, y, upper[0]])[2]) / knob.pitch;
  return { h, t, dx, back, turns: { roll: turnsOf(screws.roll), pitch: turnsOf(screws.pitch), heading: dx / BENCH.micro.pitch } };
}

const F_X = (o) => ({ o, a: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] });
const F_Y = (o) => ({ o, a: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] });
const F_Z = (o) => ({ o, a: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] });
export const frames = { F_X, F_Y, F_Z };

// a plan rectangle with its corners cut, so the moving boxes read as machined rather than sharp
export function chamfered(x0, y0, x1, y1, c) {
  return [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
}
// a seam running round a prism's sides at height s: one segment per side, each drawn only when its side faces you
function seamOf(poly, s, F) {
  const P3 = ([x, y]) => add(add(add(F.o, mul(F.a, s)), mul(F.u, x)), mul(F.v, y));
  const area = poly.reduce((a, [x, y], i) => a + x * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * y, 0);
  const sgn = area > 0 ? 1 : -1;
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const n2 = [(q[1] - p[1]) * sgn, -(q[0] - p[0]) * sgn];
    return { pts: [P3(p), P3(q)], n: add(mul(F.u, n2[0]), mul(F.v, n2[1])), tone: "faint" };
  });
}
const boxPart = (name, [x0, y0, z0], [x1, y1, z1], c, extra = {}) => ({ name, kind: "prism", F: F_Z([0, 0, 0]), poly: chamfered(x0, y0, x1, y1, c), s0: z0, s1: z1, ...extra });
const up = [0, 0, 1];
const sphere = (s, r) => [[s - r, 0.01], ...Array.from({ length: 13 }, (_, i) => {
  const a = (Math.PI * (i + 1)) / 14;
  return [s - r * Math.cos(a), r * Math.sin(a), 1];
}), [s + r, 0.01]];

// every moving part at rest, in bench coordinates, with the group that carries it
function restParts() {
  const B = BENCH;
  const { c, plate, scanner: S, axis, rod, arm, pad } = B;
  const parts = [];
  // heading group: the platter with its index, its arm and pad, and the lower plate
  const ix = c[0] + B.platter.r;
  parts.push({
    name: "platter", group: "h", kind: "turned", F: F_Z([c[0], c[1], 0]), profile: [[B.platter.z0, B.platter.r], [B.platter.z1, B.platter.r]], opts: { bevel: 0.5 },
    shapes: [{ cls: "cb-index", pts: [[ix - 0.6, c[1] - 1.4, B.platter.z1], [ix - 0.6, c[1] + 1.4, B.platter.z1], [ix - 4.6, c[1], B.platter.z1]], n: up }],
    dots: [{ pts: [-18, 18].map((deg) => [c[0] + 39.4 * Math.cos(deg * D2R), c[1] + 39.4 * Math.sin(deg * D2R), B.platter.z1]), size: 0.5, tone: "lo", n: up }],
  });
  parts.push(boxPart("arm", [arm.x0, arm.y0, arm.z0], [arm.x1, arm.y1, arm.z1], 0.6, { group: "h", dots: [{ pts: [[30, 23, arm.z1], [30, 33, arm.z1]], size: 0.5, tone: "lo", n: up }] }));
  parts.push({ name: "pad", group: "h", kind: "turned", F: F_X([0, pad.y, pad.z]), profile: [[pad.s0, pad.r], [pad.s1, pad.r]], opts: { bevel: 0.25 }, tone: "hi" });
  const lowerPoly = chamfered(plate.x0, plate.y0, plate.x1, plate.y1, 1);
  parts.push({ ...boxPart("lower", [plate.x0, plate.y0, B.lower[0]], [plate.x1, plate.y1, B.lower[1]], 1, { group: "h", tone: "lo" }), lines: seamOf(lowerPoly, (B.lower[0] + B.lower[1]) / 2, F_Z([0, 0, 0])) });
  // tilt group: the upper plate with its adjusters, and everything bolted to it
  const corners = [[plate.x0 + 4, plate.y0 + 4], [plate.x1 - 4, plate.y0 + 4], [plate.x1 - 4, plate.y1 - 4], [plate.x0 + 4, plate.y1 - 4]];
  parts.push(boxPart("upper", [plate.x0, plate.y0, B.upper[0]], [plate.x1, plate.y1, B.upper[1]], 1, { group: "t", dots: [{ pts: corners.map(([x, y]) => [x, y, B.upper[1]]), size: 0.55, tone: "lo", n: up }] }));
  for (const key of ["roll", "pitch"]) {
    const [x, y] = B.screws[key];
    const s1 = B.upper[1] + B.knob.h;
    parts.push({ name: `${key}.knob`, group: "t", kind: "turned", F: F_Z([x, y, 0]), profile: [[B.upper[1], B.knob.r - 0.8], [B.upper[1] + 1.2, B.knob.r - 0.8], [B.upper[1] + 1.2, B.knob.r], [s1, B.knob.r]], opts: { bevel: 0.5 }, tone: "hi", knurl: { r: B.knob.r, s0: B.upper[1] + 1.2, s1, count: 28 }, index: { key, s: s1, r: B.knob.r * 0.6 } });
  }
  const foot = [S.x0 - 2, S.y0 - 2, S.x1 + 2, S.y1 + 2];
  parts.push(boxPart("scanner.foot", [foot[0], foot[1], B.upper[1]], [foot[2], foot[3], S.z0], 1, { group: "t", tone: "lo", dots: [{ pts: [[foot[0] + 1.1, foot[1] + 1.1], [foot[2] - 1.1, foot[1] + 1.1], [foot[2] - 1.1, foot[3] - 1.1], [foot[0] + 1.1, foot[3] - 1.1]].map(([x, y]) => [x, y, S.z0]), size: 0.45, tone: "lo", n: up }] }));
  const body = chamfered(S.x0, S.y0, S.x1, S.y1, 1.6);
  const label = { x0: 26, x1: 44, z0: 48, z1: 57 };
  parts.push({
    name: "scanner", group: "t", kind: "prism", F: F_Z([0, 0, 0]), poly: body, s0: S.z0, s1: S.z1,
    lines: [
      ...seamOf(body, 76, F_Z([0, 0, 0])),
      { pts: [[label.x0, S.y1, label.z0], [label.x1, S.y1, label.z0], [label.x1, S.y1, label.z1], [label.x0, S.y1, label.z1]], closed: true, n: [0, 1, 0], tone: "lo" },
      ...[54.2, 52, 49.8].map((z, i) => ({ pts: [[label.x0 + 1.6, S.y1, z], [i === 2 ? 35 : label.x1 - 1.6, S.y1, z]], n: [0, 1, 0], tone: "faint", free: true })),
    ],
    dots: [{ pts: [[S.x0 + 3, S.y0 + 3], [S.x1 - 3, S.y0 + 3], [S.x1 - 3, S.y1 - 3], [S.x0 + 3, S.y1 - 3]].map(([x, y]) => [x, y, S.z1]), size: 0.5, tone: "lo", n: up }],
  });
  // cooling fins on the cover, and a level vial whose bubble shows the roll
  for (let i = 0; i < 6; i++) {
    const y = -41 + i * 5.2;
    parts.push({ name: `fin${i}`, group: "t", kind: "prism", F: F_X([0, 0, 0]), poly: [[y - 0.6, S.z1], [y + 0.6, S.z1], [y + 0.6, S.z1 + 3.6], [y - 0.6, S.z1 + 3.6]], s0: 7, s1: 31, tone: "mid" });
  }
  parts.push(boxPart("vial", [37, -40, S.z1], [47, -4, S.z1 + 4], 0.8, { group: "t", vial: { x: 42, y0: -37, y1: -7, z: S.z1 + 4, w: 2.2 } }));
  // the window bezel on the front face, its glass, the pointer's hub, rod and ball
  const bz = { r: 12.5, s1: S.x1 + 2.2 };
  parts.push({ name: "bezel", group: "t", kind: "turned", F: F_X([0, axis.y, axis.z]), profile: [[S.x1, bz.r], [bz.s1, bz.r]], opts: { bevel: 0.5 }, tone: "mid", glass: { s: bz.s1, r: 9 }, dots: [{ pts: Array.from({ length: 6 }, (_, i) => [bz.s1, axis.y + 10.8 * Math.cos((i * Math.PI) / 3 + 0.5), axis.z + 10.8 * Math.sin((i * Math.PI) / 3 + 0.5)]), size: 0.42, tone: "lo", n: [1, 0, 0] }] });
  parts.push({ name: "hub", group: "t", kind: "turned", F: F_X([0, axis.y, axis.z]), profile: [[bz.s1, 3.4], [rod.from - 0.8, 3.4], [rod.from, 2.6]], opts: { bevel: 0.3 }, tone: "mid" });
  parts.push({ name: "rod", group: "t", kind: "turned", F: F_X([0, axis.y, axis.z]), profile: [[rod.from, rod.r], [rod.to, rod.r]], tone: "hi", lit: true });
  parts.push({ name: "tip", group: "t", kind: "turned", F: F_X([0, axis.y, axis.z]), profile: sphere(rod.to + rod.ball, rod.ball), tone: "hi", lit: true });
  parts.push({ name: "plug", group: "t", kind: "turned", F: F_Y([16, 0, 66]), profile: [[S.y1, 4.2], [S.y1 + 2, 4.2], [S.y1 + 2, 3.2], [S.y1 + 6.5, 3.2]], opts: { bevel: 0.3 }, tone: "lo", knurl: { r: 4.2, s0: S.y1, s1: S.y1 + 2, count: 18 } });
  return parts;
}
const REST = restParts();

// the adjuster shafts, seen in the gap between the plates: from the upper plate's underside down its tilted axis to
// the lower plate, where the tip rests
function shaftOf(key, pose) {
  const [x, y] = BENCH.screws[key];
  const top = pose.t.p([x, y, BENCH.upper[0]]);
  const a = pose.t.d([0, 0, 1]);
  const len = (top[2] - BENCH.lower[1]) / a[2];
  return { name: `${key}.shaft`, group: "t", kind: "turned", F: { o: top, a, u: pose.t.d([1, 0, 0]), v: pose.t.d([0, 1, 0]) }, profile: [[-len, 0.8], [-len + 0.6, 1.4], [0, 1.4]], tone: "mid" };
}

// the moving parts for a pose, placed in bench coordinates
export function partsOf(pose) {
  const out = [];
  for (const part of REST) {
    const T = pose[part.group];
    const F = { o: T.p(part.F.o), a: T.d(part.F.a), u: T.d(part.F.u), v: T.d(part.F.v) };
    const lines = part.lines?.map((l) => ({ ...l, pts: l.pts.map(T.p), n: l.n && T.d(l.n) }));
    const dots = part.dots?.map((d) => ({ ...d, pts: d.pts.map(T.p), n: d.n && T.d(d.n) }));
    const shapes = part.shapes?.map((s) => ({ ...s, pts: s.pts.map(T.p), n: s.n && T.d(s.n) }));
    const placed = { ...part, F, lines, dots, shapes };
    if (part.index) placed.index = { ...part.index, turns: pose.turns[part.index.key] };
    if (part.vial) placed.vial = { ...part.vial, T, roll: Math.asin(Math.max(-1, Math.min(1, T.d([0, 1, 0])[2]))) / D2R };
    out.push(placed);
    if (part.name === "lower") out.push(shaftOf("roll", pose), shaftOf("pitch", pose));
  }
  return out;
}

// the micrometer spindle, from the arm's pad to the block it slides out of
export function spindleOf(pose) {
  const { pad, micro } = BENCH;
  return { name: "spindle", kind: "turned", F: F_X([0, pad.y, pad.z]), profile: [[pad.s1 + pose.dx, micro.spindle], [micro.block[0], micro.spindle]], tone: "hi" };
}
// the return spring, a helix from its post to the back of the arm
export function coilOf(pose) {
  const { spring, pad } = BENCH;
  const from = spring.post[0] + spring.from;
  const to = pose.back;
  const turns = 9;
  const pts = [];
  for (let i = 0; i <= turns * 16; i++) {
    const f = i / (turns * 16);
    const a = f * turns * Math.PI * 2;
    pts.push([from + (to - from) * f, pad.y + spring.r * Math.cos(a), pad.z + spring.r * Math.sin(a)]);
  }
  return { from, to, turns, pts };
}

const pointOf = (F, s, r, ang) => add(add(F.o, mul(F.a, s)), add(mul(F.u, r * Math.cos(ang)), mul(F.v, r * Math.sin(ang))));
export function knurlLines(F, r, s0, s1, count, V, phase = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const ang = phase + (i / count) * Math.PI * 2;
    const n = add(mul(F.u, Math.cos(ang)), mul(F.v, Math.sin(ang)));
    if (dot(n, V) < 0.2) continue;
    out.push([pointOf(F, s0 + 0.4, r, ang), pointOf(F, s1 - 0.4, r, ang)]);
  }
  return out;
}

// one part as SVG; ctx = { at, pathOf, V, prism(F, poly, s0, s1), turned(F, profile, opts), solid, line, dots }
export function drawPart(part, ctx) {
  const { at, pathOf, V } = ctx;
  const faces = (n) => !n || dot(n, V) > 0.02;
  const paths = part.kind === "prism" ? ctx.prism(part.F, part.poly, part.s0, part.s1) : ctx.turned(part.F, part.profile, part.opts ?? {});
  const inner = [];
  for (const l of part.lines ?? []) if (faces(l.n)) inner.push(ctx.line(pathOf(l.pts.map(at), l.closed), { tone: l.tone ?? "faint", free: l.free }));
  if (part.knurl) for (const seg of knurlLines(part.F, part.knurl.r, part.knurl.s0, part.knurl.s1, part.knurl.count, V, (part.index?.turns ?? 0) * Math.PI * 2)) inner.push(ctx.line(pathOf(seg.map(at)), { tone: "lo" }));
  const out = [ctx.solid(paths, { tone: part.tone ?? "mid", lit: part.lit, inner: inner.join("") })];
  for (const s of part.shapes ?? []) if (faces(s.n)) out.push(`<path class="${s.cls}" d="${pathOf(s.pts.map(at), true)}"/>`);
  if (part.glass && faces(part.F.a)) {
    const ring = Array.from({ length: 40 }, (_, i) => pointOf(part.F, part.glass.s, part.glass.r, (i / 40) * Math.PI * 2));
    out.push(`<path class="cb-glass" d="${pathOf(ring.map(at), true)}"/>`);
  }
  if (part.vial) {
    const { x, y0, y1, z, w, T, roll } = part.vial;
    const slot = (a, b, r) => {
      const pts = [];
      for (let i = 0; i <= 8; i++) pts.push([x + r * Math.cos((i / 8) * Math.PI), b + r * Math.sin((i / 8) * Math.PI), z]);
      for (let i = 0; i <= 8; i++) pts.push([x - r * Math.cos((i / 8) * Math.PI), a - r * Math.sin((i / 8) * Math.PI), z]);
      return pts.map(T.p);
    };
    out.push(`<path class="cb-vial" d="${pathOf(slot(y0 + w, y1 - w, w).map(at), true)}"/>`);
    // the bubble runs to the high side: a couple of degrees of roll sends it to the end of the glass
    const mid = (y0 + y1) / 2;
    const travel = (y1 - y0) / 2 - w - 2.2;
    const b = mid - Math.max(-1, Math.min(1, roll / 2.5)) * travel;
    out.push(`<path class="cb-bubble" d="${pathOf(slot(b - 1.4, b + 1.4, w * 0.62).map(at), true)}"/>`);
    const mark = (y) => pathOf([[x - w, y, z], [x + w, y, z]].map(T.p).map(at));
    out.push(ctx.line(mark(mid - 2.6) + mark(mid + 2.6), { tone: "lo" }));
  }
  if (part.index) {
    const ang = part.index.turns * Math.PI * 2;
    out.push(ctx.dots([at(pointOf(part.F, part.index.s, part.index.r, ang))], { size: 0.85, tone: "hi" }));
  }
  for (const d of part.dots ?? []) if (faces(d.n)) out.push(ctx.dots(d.pts.map(at), { size: d.size, tone: d.tone }));
  return out.join("");
}

// the micrometer thimble's graduations: 50 lines round its front edge, turning with the spindle (rest coordinates;
// the page slides the whole thimble along x)
export function thimbleTicks(turns, ctx) {
  const { pad, micro } = BENCH;
  const F = F_X([0, pad.y, pad.z]);
  const segs = [];
  for (let i = 0; i < 50; i++) {
    const ang = turns * Math.PI * 2 + (i / 50) * Math.PI * 2;
    const n = add(mul(F.u, Math.cos(ang)), mul(F.v, Math.sin(ang)));
    if (dot(n, ctx.V) < 0.25) continue;
    const len = i % 10 === 0 ? 3.4 : i % 5 === 0 ? 2.4 : 1.4;
    segs.push(ctx.pathOf([pointOf(F, micro.thimble.s0, micro.thimble.rOut, ang), pointOf(F, micro.thimble.s0 + len, micro.thimble.rOut, ang)].map(ctx.at)));
  }
  return ctx.line(segs.join(""), { tone: "lo" });
}
export function coilSvg(coil, ctx) {
  return ctx.line(ctx.pathOf(coil.pts.map(ctx.at)), { tone: "mid", className: "cb-coil" }) + ctx.dots([coil.pts[0], coil.pts[coil.pts.length - 1]].map(ctx.at), { size: 0.55, tone: "hi" });
}
