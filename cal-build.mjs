import { homedir } from "node:os";
// Fig 3: a boresight bench. An IMU and a GNSS receiver with its antenna sit on a breadboard; beside them the lidar
// scanner stands on a tip-tilt plate (two adjuster knobs and a pivot ball) on a heading turntable driven by a
// micrometer against a return spring. The scanner's pointer rod shows where it really looks; a reticle ring marks
// where the IMU says it looks. The screws set the true boresight; calibration estimates it from the strips alone.
import { pathToFileURL } from "node:url";
import { prismPaths as prismWith } from "./parts.mjs";
import { BENCH, poseOf, partsOf, drawPart, spindleOf, coilOf, coilSvg, thimbleTicks, knurlLines, frames } from "./cal-parts.mjs";
import { CAL } from "./cal-model.mjs";

// the anatomy skill, whose kit the build imports and inlines
const SKILL = process.env.ANATOMY_SKILL ?? `${homedir()}/.agents/skills/anatomy`;
const k = await import(pathToFileURL(`${SKILL}/kit/iso-kit.mjs`).href);
const G = await import(pathToFileURL(`${SKILL}/kit/lathe.mjs`).href);
const { tubePieces, tubeSvg } = await import(pathToFileURL(`${SKILL}/kit/tube.mjs`).href);
const A = await import(pathToFileURL(`${SKILL}/kit/audit.mjs`).href);

export const CW = 600;
export const CH = 440;
const AZIMUTH = 45;
const ELEVATION = 30;
const B = BENCH;
const { c: C, micro: MI, pad: PAD } = B;

const hull = [];
for (const x of [-120, 120]) for (const y of [-75, 75]) for (const z of [-6, 8]) hull.push([x, y, z]);
for (let i = 0; i < 12; i++) hull.push([-87 + 14 * Math.cos((i * Math.PI) / 6), -52 + 14 * Math.sin((i * Math.PI) / 6), 70]);
hull.push([B.reticle.x, -22, 61 + B.reticle.rOut], [26, -46, 86], [26, 2, 86], [MI.ratchet.s1 + 6, PAD.y, PAD.z + 5]);
const P = k.fitProjection(hull, CW, CH, { pad: 20, azimuth: AZIMUTH, elevation: ELEVATION });
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const pctx = { at, pathOf: k.pathOf, toneOf: G.toneOf, V, P };
const prismPaths = (F, poly, s0, s1) => prismWith(F, poly, s0, s1, pctx);
const ctx = { at, pathOf: k.pathOf, V, prism: prismPaths, turned: (F, profile, opts) => G.solidOf(profile, F, P, opts), solid: k.solidSvg, line: k.lineSvg, dots: k.dotsSvg };
const alongX = (y, z) => G.frameOf([0, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const alongY = (x, z) => G.frameOf([x, 0, z], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
const alongZ = (x, y) => G.frameOf([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const circle = (cx, cy, z, r, n = 24) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI), z]);
const screw = (p, size = 0.55) => Dots([at(p)], { size, tone: "lo" });
const screwRing = (x, y, z, r = 1.3) => Ln(path3(circle(x, y, z, r, 16), true), { tone: "faint" }) + screw([x, y, z]);

// ---------------------------------------------------------------- recorder helpers
let R = null;
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "bench", ...rest });
}
function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.4, steps = 2, bevel = 0, extra = "", inner = "", ground = false, wrap } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = R.solid(A.slab(plan, z0, z1 - z0, { name, ground }, steps));
  const svg = S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra;
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], wrap ? wrap(svg) : svg, [shape]);
  return plan;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bevel = 0, steps, ground = false, wrap } = {}) {
  const paths = G.solidOf(profile, F, P, { bevel, ...(steps ? { steps } : {}) });
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = R.solid(A.solid(F, profile, { name, ground }));
  const svg = S(paths, { tone: "mid", ...style, inner }) + extra;
  put(name, G.add3(F.o, G.mul3(F.a, mid)), wrap ? wrap(svg) : svg, [shape]);
}
function ring(name, F, s0, s1, rIn, rOut, style = {}, { extra = "", wrap, hole = null } = {}) {
  const shape = R.solid(A.ring(F, s0, s1, rIn, rOut, { name }));
  const band = S(G.ringBand(s0, s1, rIn, rOut, F, P, hole ? { hole } : {}), { tone: "mid", ...style });
  const svg = (hole ? `<g fill-rule="evenodd">${band}</g>` : band) + extra;
  put(name, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), wrap ? wrap(svg) : svg, [shape]);
}
const CABLES = [];
function cable(name, points, r, { bend = 4 } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  const total = G.pathLength(route);
  const SHELL = Math.max(1.6, r * 2.4);
  const gaps = [[0, SHELL], [total - SHELL, total]];
  R.route(name, route, r, { gaps, limp: true, rims: [r * 1.9, r * 1.9], piece: "bench" });
  CABLES.push(name);
  tubePieces(route, r, P, { maxLength: 14, spacing: Math.max(0.6, Math.min(1.6, r)), gaps }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone: "mid" }), [A.tube(piece.points, piece.radii)], { bias: 0.05, route: name, chunk: index }),
  );
  [0, 1].forEach((index) => {
    const end = index ? route[route.length - 1] : route[0];
    const tangent = G.tangentAlong(route, index ? total : 0);
    const F = G.frameAlong(end, tangent);
    const [s0, s1] = index ? [-SHELL, 0] : [0, SHELL];
    const shape = R.solid(A.disc(F, s0, s1, r * 1.9, { name: `${name}.shell${index}`, owner: name }));
    put(`${name}.shell${index}`, G.add3(end, G.mul3(tangent, (s0 + s1) / 2)), S(G.disc(s0, s1, r * 1.9, F, P, { steps: 20, bevel: 0.2 }), { tone: "mid" }), [shape], { bias: 0.15 });
  });
}
const sphereProfile = (s, r, n = 14) => [[s - r, 0.01], ...Array.from({ length: n - 1 }, (_, i) => {
  const a = (Math.PI * (i + 1)) / n;
  return [s - r * Math.cos(a), r * Math.sin(a), 1];
}), [s + r, 0.01]];

// ---------------------------------------------------------------- the bench
function define() {
  R = A.recorder(P);
  const BX = { x0: -120, x1: 120, y0: -75, y1: 75 };
  // base: a breadboard plate on four feet, a groove round its top, corner screws and a grid of tapped holes
  {
    const plan = { x: BX.x0, y: BX.y0, w: 240, d: 150, r: 6 };
    const groove = path3(k.ringOf ? k.ringOf({ x: BX.x0 + 4, y: BX.y0 + 4, w: 232, d: 142, r: 3 }, 6).map(([x, y]) => [x, y, 8]) : [], true);
    const holes = [];
    for (let x = -100; x <= 100; x += 25) for (let y = -50; y <= 50; y += 25) holes.push(path3(circle(x, y, 8, 1.5, 14), true));
    const corners = [[BX.x0 + 9, BX.y0 + 9], [BX.x1 - 9, BX.y0 + 9], [BX.x1 - 9, BX.y1 - 9], [BX.x0 + 9, BX.y1 - 9]];
    const inner = Ln(groove, { tone: "faint" }) + Ln(holes.join(""), { tone: "faint" }) + corners.map(([x, y]) => screwRing(x, y, 8, 2)).join("") + Ln(k.sideSeam(plan, 3, P, 4), { tone: "faint" });
    box("base", [BX.x0, BX.y0, 0], [BX.x1, BX.y1, 8], { tone: "lo", halo: true }, { r: 6, steps: 4, bevel: 0.8, inner });
    for (const [x, y] of [[BX.x0 + 16, BX.y0 + 16], [BX.x1 - 16, BX.y0 + 16], [BX.x1 - 16, BX.y1 - 16], [BX.x0 + 16, BX.y1 - 16]])
      turned(`foot.${x > 0 ? "r" : "l"}${y > 0 ? "f" : "b"}`, alongZ(x, y), [[-6, 6.2], [-1.2, 7], [0, 7]], { tone: "lo" }, { bevel: 0.4, ground: true });
  }
  // label plate and lever-arm ruler, both inlays on the top
  {
    const L = { x0: -36, x1: 4, y0: 56, y1: 70 };
    const rules = [60.5, 63.5, 66.5].map((y, i) => Ln(path3([[L.x0 + 4, y, 8.6], [i === 2 ? -16 : L.x1 - 4, y, 8.6]]), { tone: "lo", free: true })).join("");
    const dots = [[L.x0 + 1.8, L.y0 + 1.8], [L.x1 - 1.8, L.y0 + 1.8], [L.x1 - 1.8, L.y1 - 1.8], [L.x0 + 1.8, L.y1 - 1.8]].map(([x, y]) => screw([x, y, 8.6], 0.42)).join("");
    box("label", [L.x0, L.y0, 8], [L.x1, L.y1, 8.6], { tone: "mid", flat: true }, { r: 0.8, inner: rules + dots });
    const T = k.topTicks(-33, 11, 2, 5, -84, 8.5, [1.6, 3.2], P, "y");
    box("ruler", [-84, -35, 8], [-78, 12, 8.5], { tone: "mid", flat: true }, { r: 0.3, inner: Ln(T.minor, { tone: "lo" }) + Ln(T.major, { tone: "mid" }) });
  }
  // IMU: the reference the boresight is measured from; engraved axes on its lid, ears bolted to the plate
  {
    const I = { x0: -96, x1: -44, y0: 14, y1: 66, z1: 52 };
    const plan = { x: I.x0, y: I.y0, w: I.x1 - I.x0, d: I.y1 - I.y0, r: 2 };
    const o = [(I.x0 + I.x1) / 2, (I.y0 + I.y1) / 2, I.z1];
    const arrow = (dir) => {
      const [dx, dy] = dir;
      const [nx, ny] = [-dy, dx];
      const p = (s, w) => [o[0] + dx * s + nx * w, o[1] + dy * s + ny * w, I.z1];
      return Ln(path3([p(3.4, 0), p(13, 0)]), { tone: "mid" }) + `<path class="cb-arrow" d="${path3([p(16.5, 0), p(12.6, 1.8), p(12.6, -1.8)], true)}"/>`;
    };
    const lid = Ln(path3(circle(o[0], o[1], I.z1, 3.4, 28), true), { tone: "mid" }) + Dots([at(o)], { size: 0.9, tone: "hi" }) + arrow([1, 0]) + arrow([0, 1]);
    const screws = [[I.x0 + 4, I.y0 + 4], [I.x1 - 4, I.y0 + 4], [I.x1 - 4, I.y1 - 4], [I.x0 + 4, I.y1 - 4]].map(([x, y]) => screwRing(x, y, I.z1, 1.4)).join("");
    box("imu", [I.x0, 14, 8], [I.x1, I.y1, I.z1], { tone: "mid" }, { r: 2, steps: 3, bevel: 1, inner: Ln(k.sideSeam(plan, 45, P, 3), { tone: "faint" }) + lid + screws });
    for (const [y0, y1] of [[18, 26], [54, 62]]) box(`imu.ear${y0}`, [I.x1, y0, 8], [I.x1 + 7, y1, 12], { tone: "lo" }, { r: 0.8, bevel: 0.4, extra: screwRing(I.x1 + 3.6, (y0 + y1) / 2, 12, 1.4) });
    const rules = [32.5, 29.5, 26.5].map((z, i) => Ln(path3([[-85, 66.6, z], [i === 2 ? -74 : -63, 66.6, z]]), { tone: "lo", free: true })).join("");
    box("imu.label", [-88, 66, 22], [-60, 66.6, 37], { tone: "mid" }, { r: 0.2, inner: rules + [[-86.4, 35.4], [-61.6, 35.4], [-61.6, 23.6], [-86.4, 23.6]].map(([x, z]) => screw([x, 66.6, z], 0.4)).join("") });
    turned("imu.conn", alongX(40, 13), [[I.x1, 4.2], [I.x1 + 1.4, 4.2], [I.x1 + 1.4, 3], [I.x1 + 6, 3]], { tone: "mid" }, { bevel: 0.3 });
  }
  // GNSS receiver, its mast and antenna; the ruler measures the lever arm from the antenna to the IMU
  {
    const Q = { x0: -112, x1: -62, y0: -68, y1: -36, z1: 26 };
    const plan = { x: Q.x0, y: Q.y0, w: Q.x1 - Q.x0, d: Q.y1 - Q.y0, r: 2 };
    const leds = Dots([at([-70, Q.y1, 19]), at([-75, Q.y1, 19])], { size: 0.9, tone: "hi" }) + Ln(path3([[-108, Q.y1, 19], [-82, Q.y1, 19]]), { tone: "faint", free: true });
    const screws = [[Q.x0 + 4, Q.y0 + 4], [Q.x1 - 4, Q.y0 + 4], [Q.x1 - 4, Q.y1 - 4], [Q.x0 + 4, Q.y1 - 4]].map(([x, y]) => screwRing(x, y, Q.z1, 1.3)).join("");
    box("gnss", [Q.x0, Q.y0, 8], [Q.x1, Q.y1, Q.z1], { tone: "mid" }, { r: 2, steps: 3, bevel: 0.8, inner: Ln(k.sideSeam(plan, 13, P, 3), { tone: "faint" }) + screws + leds });
    turned("gnss.conn", alongX(-52, 13), [[Q.x1, 4.2], [Q.x1 + 1.4, 4.2], [Q.x1 + 1.4, 3], [Q.x1 + 6, 3]], { tone: "mid" }, { bevel: 0.3 });
    const M = alongZ(-87, -52);
    turned("mast.flange", M, [[Q.z1, 5.2], [Q.z1 + 2, 5.2]], { tone: "lo" }, { bevel: 0.4, extra: [0, 1, 2, 3].map((i) => screw([-87 + 3.8 * Math.cos(i * Math.PI / 2 + 0.785), -52 + 3.8 * Math.sin(i * Math.PI / 2 + 0.785), Q.z1 + 2], 0.38)).join("") });
    turned("mast", M, [[Q.z1 + 2, 2], [64, 2]], { tone: "mid" });
    turned("antenna", M, [[64, 14], [67.4, 14], [69.2, 11.6], [70, 8.4]], { tone: "hi" }, { bevel: 0.5, steps: 48, extra: Ln(path3(circle(-87, -52, 70, 5, 32), true), { tone: "faint" }) + Dots([at([-87, -52, 70])], { size: 0.9, tone: "lo" }) });
    cable("cable", [[-38, 40, 13], [-28, 40, 13], [-28, -52, 13], [-56, -52, 13]], 1.0, { bend: 6 });
  }
  // heading turntable: a graduated ring on the plate, the platter turning in it
  {
    const T = k.radialTicks(C[0], C[1], B.ring.r - 0.4, 120, 5, B.ring.z1, [2, 3.2], P);
    const zero = Ln(path3([[C[0] + B.platter.r + 0.2, C[1], B.ring.z1], [C[0] + B.ring.r - 0.4, C[1], B.ring.z1]]), { tone: "hi" });
    turned("ring", alongZ(C[0], C[1]), [[B.ring.z0, B.ring.r], [B.ring.z1, B.ring.r]], { tone: "lo" }, { bevel: 0.6, steps: 72, extra: Ln(T.minor, { tone: "lo" }) + Ln(T.major, { tone: "mid" }) + zero });
    turned("ball", alongZ(C[0], C[1]), sphereProfile(C[2], B.ball), { tone: "hi" });
  }
  // the moving assembly, at rest; the page redraws every [data-move] host from the same parts
  const rest = poseOf({ roll: 0, pitch: 0, heading: 0 }, CAL.EXAG);
  for (const part of partsOf(rest)) {
    const svg = `<g data-move="${part.name}">${drawPart(part, ctx)}</g>`;
    if (part.kind === "prism") {
      const shape = R.solid(A.prism(part.F, part.poly, part.s0, part.s1, { name: part.name }));
      const cx = part.poly.reduce((a, p) => a + p[0], 0) / part.poly.length;
      const cy = part.poly.reduce((a, p) => a + p[1], 0) / part.poly.length;
      const mid = G.add3(G.add3(G.add3(part.F.o, G.mul3(part.F.a, (part.s0 + part.s1) / 2)), G.mul3(part.F.u, cx)), G.mul3(part.F.v, cy));
      put(part.name, mid, svg, [shape]);
    } else {
      const shape = R.solid(A.solid(part.F, part.profile, { name: part.name }));
      const mid = (part.profile[0][0] + part.profile[part.profile.length - 1][0]) / 2;
      put(part.name, G.add3(part.F.o, G.mul3(part.F.a, mid)), svg, [shape]);
    }
  }
  // micrometer: a block, a graduated barrel, and a thimble, cap and ratchet that slide with the spindle
  {
    const F = alongX(PAD.y, PAD.z);
    const [b0, b1] = MI.block;
    const top = [[b0 + 2, 36], [b1 - 2, 36], [b1 - 2, 48], [b0 + 2, 48]].map(([x, y]) => screwRing(x, y, 32, 1.1)).join("");
    box("micro.block", [b0, 34, 8], [b1, 50, 32], { tone: "mid" }, { r: 1, bevel: 0.6, inner: top });
    turned("micro.lock", alongY(53, 28), [[50, 2.6], [51.2, 2.6], [51.2, 1.8], [54, 1.8], [54, 3], [56, 3]], { tone: "lo" }, { bevel: 0.2 });
    const ang = Math.atan2(V[2], V[1]);
    const line = [];
    const ticks = [];
    const onBarrel = (x, a) => [x, PAD.y + (MI.barrel.r + 0.02) * Math.cos(a), PAD.z + (MI.barrel.r + 0.02) * Math.sin(a)];
    line.push(path3([onBarrel(MI.barrel.s0, ang), onBarrel(MI.barrel.s1, ang)]));
    for (let x = MI.barrel.s0 + 1, i = 1; x < MI.barrel.s1 - 0.5; x += 1, i++) ticks.push(path3([onBarrel(x, ang), onBarrel(x, ang + (i % 5 === 0 ? 0.62 : 0.36))]));
    turned("micro.barrel", F, [[MI.barrel.s0, MI.barrel.r], [MI.barrel.s1, MI.barrel.r]], { tone: "mid" }, { inner: Ln(line.join(""), { tone: "mid" }) + Ln(ticks.join(""), { tone: "lo" }) });
    const slide = (name) => (svg) => `<g data-slide="thimble">${name === "micro.thimble" ? svg.replace(/$/, `<g data-move="thimble-ticks">${thimbleTicks(0, ctx)}</g>`) : svg}</g>`;
    ring("micro.thimble", F, MI.thimble.s0, MI.thimble.s1, MI.thimble.rIn, MI.thimble.rOut, { tone: "mid" }, { wrap: slide("micro.thimble") });
    turned("micro.cap", F, [[MI.cap[0], MI.thimble.rOut], [MI.cap[1], MI.thimble.rOut - 0.6]], { tone: "mid" }, { bevel: 0.3, wrap: slide("micro.cap") });
    const knurl = knurlLines(F, MI.ratchet.r, MI.ratchet.s0, MI.ratchet.s1, 20, V).map((seg) => path3(seg)).join("");
    turned("micro.ratchet", F, [[MI.ratchet.s0, MI.ratchet.r], [MI.ratchet.s1, MI.ratchet.r]], { tone: "hi" }, { bevel: 0.4, inner: Ln(knurl, { tone: "lo" }), wrap: slide("micro.ratchet") });
    const sp = spindleOf(rest);
    turned("spindle", sp.F, sp.profile, { tone: "hi" }, { wrap: (svg) => `<g data-move="spindle">${svg}</g>` });
  }
  // the return spring: a post on the plate and a coil to the back of the arm
  {
    const [px, py] = B.spring.post;
    const F = alongZ(px, py);
    turned("spring.washer", F, [[8, 3.6], [9.4, 3.6]], { tone: "lo" }, { bevel: 0.3 });
    turned("spring.post", F, [[9.4, B.spring.postR], [PAD.z + 5, B.spring.postR], [PAD.z + 6, B.spring.postR - 0.6]], { tone: "mid" });
    const coil = coilOf(rest);
    put("spring.coil", [(coil.from + coil.to) / 2, PAD.y, PAD.z], `<g data-move="coil">${coilSvg(coil, ctx)}</g>`, [A.tube(coil.pts, B.spring.wire)]);
  }
  // the reticle: where the IMU says the scanner looks; the pointer's ball sits in its centre when the mount is true
  {
    const { x: rx, rIn, rOut, w } = B.reticle;
    const F = alongZ(rx, -22);
    turned("reticle.foot", F, [[8, 6.2], [10.5, 6.2]], { tone: "lo" }, { bevel: 0.4, extra: [0, Math.PI].map((a) => screw([rx + 4.4 * Math.cos(a + 0.6), -22 + 4.4 * Math.sin(a + 0.6), 10.5], 0.42)).join("") });
    turned("reticle.post", F, [[10.5, 1.6], [61 - rOut, 1.6]], { tone: "mid" });
    const face = rx + w / 2;
    const notch = [0, 1, 2, 3].map((i) => {
      const a = (i * Math.PI) / 2;
      return path3([[face, -22 + rIn * Math.cos(a), 61 + rIn * Math.sin(a)], [face, -22 + rOut * Math.cos(a), 61 + rOut * Math.sin(a)]]);
    }).join("");
    ring("reticle", alongX(-22, 61), rx - w / 2, face, rIn, rOut, { tone: "mid" }, { extra: Ln(notch, { tone: "hi" }), hole: [face, rIn] });
  }
  return R;
}

export function buildCal() {
  define();
  A.settle(R, P);
  R.items.sort((a, b) => a.key - b.key);
  return R;
}
export { P as CP };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
export function calHtml() {
  const R = buildCal();
  const front = R.items.map((item) => `<g class="it" data-name="${item.name}">${item.svg}</g>`).join("");
  const label = "A boresight bench: an IMU and a GNSS receiver with its antenna on a breadboard, and beside them the lidar scanner on a tip-tilt plate with two adjuster knobs, over a turntable set by a micrometer against a return spring. A pointer rod on the scanner's window shows where it really looks; a reticle ring shows where the IMU thinks it looks.";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg cb-svg" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${esc(label)}">${front}<g class="cb-est" data-est></g></svg>`;
  const stage = `<div class="iso-stage cb-stage" tabindex="0" role="group" aria-label="The boresight bench. Drag the three screw sliders below to set how the scanner is really mounted; press Solve to calibrate from the strips alone."><span class="cb-said" aria-live="polite"></span>${svg}<div class="cb-exag" aria-hidden="true">Mount drawn ×${CAL.EXAG}</div></div>`;
  const side = `<div class="hd-side cb-side"><div class="hd-panel"><div class="hd-panel-head"><span>Strips, plan · height difference</span><span data-part="map-note"></span></div><canvas class="cb-map" width="420" height="300" aria-label="Plan of the survey area: the flight lines, three buildings, and where the strips disagree in height"></canvas><div class="cb-key"><span><i class="k-a"></i>Line A</span><span><i class="k-b"></i>Line B</span><span data-only="full"><i class="k-c"></i>Line C</span><span class="k-ramp">ΔZ<i class="k-lo"></i>−20 cm<i class="k-mid"></i>0<i class="k-hi"></i>+20 cm</span></div></div><div class="hd-panel"><div class="hd-panel-head"><span>Profiles through the roofs</span><span data-part="prof-note"></span></div><canvas class="cb-prof" data-prof="along" width="420" height="120" aria-label="Profile 1 across the barn"></canvas><canvas class="cb-prof" data-prof="across" width="420" height="120" aria-label="Profile 2 across the house"></canvas></div></div>`;
  const slider = (key, label, range) => `<div class="hd-row cb-row"><span class="hd-row-label">${label}</span><input class="cb-range" type="range" data-key="${key}" min="${-range}" max="${range}" step="0.01" value="0" aria-label="${label} screw, degrees"><output class="cb-out" data-out="${key}">0.00°</output></div>`;
  const controls = `<div class="hd-controls cb-controls">
<div class="hd-group" role="group" aria-label="Mount screws"><div class="hd-group-title">Mount screws · the truth</div>${slider("roll", "Roll", CAL.range.roll)}${slider("pitch", "Pitch", CAL.range.pitch)}${slider("heading", "Heading", CAL.range.heading)}</div>
<div class="hd-group" role="group" aria-label="Flight pattern"><div class="hd-group-title">Flight pattern</div><div class="hd-seg" role="radiogroup" aria-label="Flight pattern" data-key="pattern"><button type="button" role="radio" data-value="pair">Opposite pair</button><button type="button" role="radio" data-value="full">+ Cross line</button></div><p class="cb-note" data-part="pattern-note"></p></div>
<div class="hd-group" role="group" aria-label="Calibration"><div class="hd-group-title">Calibration · the estimate</div><div class="cb-buttons"><button type="button" class="cb-btn cb-solve" data-act="solve">Solve</button><button type="button" class="cb-btn" data-act="misalign"><svg class="cb-icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M1.5 3.5h2.2l4.1 5h2.7M1.5 8.5h2.2l4.1-5h2.7M9 2l1.5 1.5L9 5M9 7l1.5 1.5L9 10"/></svg>Misalign</button><button type="button" class="cb-btn" data-act="reset"><svg class="cb-icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.4 4.3A4 4 0 1 1 2.6 8.1M2.1 1.6v2.9h2.9"/></svg>Reset</button></div><table class="cb-table"><thead><tr><th></th><th>Screws</th><th>Estimate</th><th>Error</th></tr></thead><tbody>${["roll", "pitch", "heading"].map((key) => `<tr data-row="${key}"><th>${key[0].toUpperCase() + key.slice(1)}</th><td data-cell="true">—</td><td data-cell="est">—</td><td data-cell="err">—</td></tr>`).join("")}</tbody></table></div>
</div>`;
  const DATA = { W: CW, H: CH, P, V, E: CAL.EXAG, slide: k.axisVector(P, [1, 0, 0]) };
  return { stage, side, controls, DATA, items: R.items.length, solids: R.solids.length, R };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { items, solids, R } = calHtml();
  console.log(`bench: ${items} items, ${solids} solids, scale ${KS.toFixed(3)}, cables ${CABLES.length}`);
  A.auditOrExit(R, P, {});
}
void frames;
