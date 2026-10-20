import { homedir } from "node:os";
// Fig 2: the lidar head on its optical bench, seen through a loupe. Every swappable part (scanner, laser, detector)
// is defined per configuration; each configuration is settled on its own, and the page draws the union of all items
// in one global order that agrees with every configuration's true depth order.
import { pathToFileURL } from "node:url";
import { HEADX, galvoPoly, polygonPoly } from "./head-parts.mjs";
import { prismPaths as prismWith } from "./parts.mjs";
import { SCANNERS as HMS } from "./head-model.mjs";

// the anatomy skill, whose kit the build imports and inlines
const SKILL = process.env.ANATOMY_SKILL ?? `${homedir()}/.agents/skills/anatomy`;
const k = await import(pathToFileURL(`${SKILL}/kit/iso-kit.mjs`).href);
const G = await import(pathToFileURL(`${SKILL}/kit/lathe.mjs`).href);
const { tubePieces, tubeSvg } = await import(pathToFileURL(`${SKILL}/kit/tube.mjs`).href);
const A = await import(pathToFileURL(`${SKILL}/kit/audit.mjs`).href);
const { glCamera } = await import(pathToFileURL(`${SKILL}/kit/gl.mjs`).href);

export const HW = 600;
export const HH = 600;
const AZIMUTH = 40;
const ELEVATION = 30;
const ZB = HEADX.zb;
const LY = -50;
const PORT = { x: 26, y: 40 };
export const LOUPE = { cx: HW / 2, cy: HH / 2, r: HW / 2 - 18 };
const FAN = -150;

const hull = [];
for (const x of [-142, 112]) for (const y of [-132, 58]) for (const z of [-24, 98]) hull.push([x, y, z]);
hull.push([0, 0, FAN], [0, 40, FAN + 20], [0, -40, FAN + 20]);
let P = null;
for (let pad = 30; pad < 300; pad += 4) {
  P = k.fitProjection(hull, HW, HH, { pad, azimuth: AZIMUTH, elevation: ELEVATION });
  const worst = Math.max(...hull.slice(0, 8).map((p) => Math.hypot(k.iso(p, P)[0] - LOUPE.cx, k.iso(p, P)[1] - LOUPE.cy)));
  if (worst < LOUPE.r - 8) break;
}
export const HP = P;
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const ctx = { at, pathOf: k.pathOf, toneOf: G.toneOf, V, P };
const prismPaths = (F, poly, s0, s1) => prismWith(F, poly, s0, s1, ctx);
const XF = G.frameOf([0, 0, ZB], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const alongX = (y, z) => G.frameOf([0, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const alongZ = (x, y) => G.frameOf([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const DOWNY = G.frameAlong([0, 0, ZB], [0, -1, 0]);
// biaxial: the pulse meets the scan element TXB to one side of the axis, and the telescope's own aperture looks back
// along the other side, at BX, so the two share the scanner but no optic
const TXB = -9;
const BX = 3;
const BIAXF = G.frameAlong([BX, 0, ZB], [0, -1, 0]);
const txOf = (rx) => (rx === "biaxial" ? TXB : 0);
// where the incoming beam stops and the live outgoing beam takes over
const y0Of = (rx) => (rx === "biaxial" ? -1.5 : 0);
const PF = G.frameOf(HEADX.polygon.axis, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const PALMER_AXIS = G.unit3([0, 1, 1]);
const PALF = G.frameAlong([0, 0, ZB], PALMER_AXIS);
// the holed (scraper) mirror at 45° on the shared axis, and the telescope it feeds along +x
export const HOLED = (() => {
  const c = [0, -32, ZB];
  const n = G.unit3([1, 1, 0]);
  const u = G.unit3([1, -1, 0]);
  const pu = 19;
  const pn = -3.75;
  return { c, n, u, a: 18, b: 11, hole: 3, cell: [21, 12.5, 2], post: [c[0] + u[0] * pu + n[0] * pn, c[1] + u[1] * pu + n[1] * pn], cellBottom: ZB - 12.5, F: G.frameAlong(c, [1, 0, 0]) };
})();
const rrect = (w, h, r, m = 5) => {
  const out = [];
  for (const [cx, cy, a0] of [[w - r, h - r, 0], [-w + r, h - r, 90], [-w + r, -h + r, 180], [w - r, -h + r, 270]])
    for (let i = 0; i <= m; i++) {
      const a = ((a0 + (90 * i) / m) * Math.PI) / 180;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  return out;
};
let CFG = {};
function planeMatrix(o, ex, ey) {
  const p0 = at(o);
  const px = at(G.add3(o, ex));
  const py = at(G.add3(o, ey));
  const v = (x) => x.toFixed(4);
  return `matrix(${v(px[0] - p0[0])} ${v(px[1] - p0[1])} ${v(py[0] - p0[0])} ${v(py[1] - p0[1])} ${p0[0].toFixed(2)} ${p0[1].toFixed(2)})`;
}

// ---------------------------------------------------------------- recorder helpers, bound to the configuration being defined
let R = null;
let WHEN = "";
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "bench", when: WHEN, ...rest });
}
const record = (shape) => R.solid(shape);
function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.4, steps = 2, bevel = 0, extra = "", inner = "", bias = 0, ground = false } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name, ground }, steps));
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function prism(name, F, poly, s0, s1, style = {}, { extra = "", inner = "", bias = 0, live = "" } = {}) {
  const shape = record(A.prism(F, poly, s0, s1, { name }));
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const centre = G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  const drawn = S(prismPaths(F, poly, s0, s1), { tone: "mid", ...style, inner }) + extra;
  put(name, centre, live ? `<g data-live="${live}">${drawn}</g>` : drawn, [shape], { bias });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, steps, bevel = 0, ground = false, live = "" } = {}) {
  const paths = G.solidOf(profile, F, P, { bevel, ...(steps ? { steps } : {}) });
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(A.solid(F, profile, { name, ground }));
  const drawn = S(paths, { tone: "mid", ...style, inner }) + extra;
  put(name, G.add3(F.o, G.mul3(F.a, mid)), live ? `<g data-live="${live}">${drawn}</g>` : drawn, [shape], { bias });
  return shape;
}
const disc = (name, F, s0, s1, r, style = {}, options = {}) => turned(name, F, [[s0, r], [s1, r]], style, options);
function ring(name, F, s0, s1, rIn, rOut, style = {}, { extra = "", bias = 0, steps } = {}) {
  const shape = record(A.ring(F, s0, s1, rIn, rOut, { name }));
  put(name, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), S(G.ringBand(s0, s1, rIn, rOut, F, P, steps ? { steps } : {}), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
function cable(name, points, r = 0.5, { tone = "mid", bend = 3, ends = [true, true], shells = [false, false], maxLength = 14, bias = 0.05 } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  const total = G.pathLength(route);
  const SHELL = Math.max(1.6, r * 2.4);
  const gaps = [...(shells[0] ? [[0, SHELL]] : []), ...(shells[1] ? [[total - SHELL, total]] : [])];
  R.route(name, route, r, { gaps, limp: true, rims: shells.map((on) => (on ? r * 1.9 : r)), piece: "bench" });
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.6, Math.min(1.6, r)), gaps }).forEach((piece, index) =>
    put(`${name}:${index}`, piece.mid, tubeSvg(piece, { tone }), [A.tube(piece.points, piece.radii)], { bias, route: name, chunk: index }),
  );
  [0, 1].forEach((index) => {
    const end = index ? route[route.length - 1] : route[0];
    if (shells[index]) {
      const tangent = G.tangentAlong(route, index ? total : 0);
      const F = G.frameAlong(end, tangent);
      const [s0, s1] = index ? [-SHELL, 0] : [0, SHELL];
      const shape = record(A.disc(F, s0, s1, r * 1.9, { name: `${name}.shell${index}`, owner: name }));
      put(`${name}.shell${index}`, G.add3(end, G.mul3(tangent, (s0 + s1) / 2)), S(G.disc(s0, s1, r * 1.9, F, P, { steps: 20, bevel: 0.2 }), { tone: "mid" }), [shape], { bias: bias + 0.1 });
    } else if (ends[index]) {
      const size = Math.max(0.5, r * KS * 0.9);
      put(`${name}.end${index}`, end, Dots([at(end)], { size, tone: "hi" }), [A.ball(end, size / KS, { name: `${name}.end${index}`, owner: name })], { bias: bias + 0.15 });
    }
  });
  return route;
}
// a beam segment: drawn, ordered by its true line, never recorded as a solid
function beam(name, points, { ink = "", live = "", extra = "" } = {}) {
  const mid = points[Math.floor(points.length / 2)];
  const d = `<path class="iso-line ln-beam hd-beam"${ink ? ` data-ink="${ink}"` : ""} d="${path3(points)}"/>`;
  put(name, mid, (live ? `<g data-live="${live}">${d}</g>` : d) + extra, [A.tube(points, 0.4)]);
}
// the outline of a round bundle of light from a to b on screen: the hull of its two end circles
function bundle(a, b, r) {
  const F = G.frameAlong(a, G.unit3(G.add3(b, G.mul3(a, -1))));
  const len = Math.hypot(...G.add3(b, G.mul3(a, -1)));
  const pts = [];
  for (const s of [0, len]) for (let i = 0; i < 48; i++) {
    const t = (i / 48) * 2 * Math.PI;
    pts.push(at(G.add3(G.add3(G.add3(F.o, G.mul3(F.a, s)), G.mul3(F.u, r * Math.cos(t))), G.mul3(F.v, r * Math.sin(t)))));
  }
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const side = (p, q, o) => (q[0] - p[0]) * (o[1] - p[1]) - (q[1] - p[1]) * (o[0] - p[0]);
  const half = (list) => list.reduce((h, p) => {
    while (h.length > 1 && side(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
    h.push(p);
    return h;
  }, []);
  const lower = half(pts);
  const upper = half(pts.slice().reverse());
  return k.pathOf([...lower.slice(0, -1), ...upper.slice(0, -1)], true);
}
// light is not a solid: it rides in a halo group, which the audit's shape-coverage check leaves out
const rxLight = (...parts) => `<g class="iso-halo hd-rxwrap"><path class="hd-rxlight" d="${parts.join("")}"/></g>`;
const screws = (plan, z, inset = 2.4, size = 0.45) => Dots(k.corners(plan, inset).map(([x, y]) => at([x, y, z])), { size, tone: "lo" });
const planOf = ([x0, y0], [x1, y1]) => ({ x: x0, y: y0, w: x1 - x0, d: y1 - y0 });
// lines drawn on the visible +x or +y face of a box, edge to edge
const onFaceY = (y, x0, x1, z) => path3([[x0, y, z], [x1, y, z]]);
const onFaceX = (x, y0, y1, z) => path3([[x, y0, z], [x, y1, z]]);
function when(tag, cfg, fn) {
  if (!matches(tag, cfg)) return;
  const prev = WHEN;
  WHEN = WHEN ? `${WHEN} ${tag}` : tag;
  fn();
  WHEN = prev;
}
export function matches(tag, cfg) {
  if (!tag) return true;
  return tag.split(" ").every((term) => {
    const [key, vals] = term.split(":");
    return vals.split("|").includes(String(cfg[key]));
  });
}

// ---------------------------------------------------------------- zoom detail: a half-section along the receive path
// The cut plane holds the telescope's axis and faces the viewer, so its edges are the body's own silhouette. Each part
// on the path draws its slice of one section drawing, clipped to its own outline, in a group shown only when zoomed.
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// s along the axis, t across it in the cut plane; light is a bundle of radius RB with the coaxial optic's shadow at h
const RB = 9;
const RXOPT = {
  holed: { F: HOLED.F, h: 3, sw: 22.5, sz: () => Infinity, so: [22.8, 25.6], sf: 40, baffles: [29.5, 34.5], sr: 46.5, filter: [49.2, 50.2], sl: 53.5, sd: 65.5 },
  inject: { F: DOWNY, h: 3.5, sw: -Infinity, sz: (det) => (det === "discrete" ? 119.5 : 120.5), so: [61.8, 65.6], sf: 86, baffles: [70.5, 75.5, 80.5], sr: 93.5, filter: [97.2, 98.2], sl: 102, sd: 114.5 },
  // its own smaller aperture, and nothing in front of it: no shadow in the echo
  biaxial: { F: BIAXF, rb: 6, h: 0, sw: -Infinity, sz: (det) => (det === "discrete" ? 119.5 : 120.5), so: [61.8, 65.6], sf: 86, baffles: [70.5, 75.5, 80.5], sr: 93.5, filter: [97.2, 98.2], sl: 102, sd: 114.5 },
};
function cutPlane(F) {
  const d = dot3(V, F.a);
  const n = G.unit3(G.add3(V, G.mul3(F.a, -d)));
  return { F, n, w: G.unit3(cross3(F.a, n)), sigma: Math.sign(d) };
}
const onCut = (C, s, t) => G.add3(G.add3(C.F.o, G.mul3(C.F.a, s)), G.mul3(C.w, t));
const cutPath = (C, pts) => k.pathOf(pts.map(([s, t]) => at(onCut(C, s, t))), true);
const cutPoly = (C, pts, cls) => `<path class="${cls}" d="${cutPath(C, pts)}"/>`;
// a band above and below the axis, t from t0 to t1
const pair = (C, s0, s1, t0, t1, cls) => cutPoly(C, [[s0, t0], [s1, t0], [s1, t1], [s0, t1]], cls) + cutPoly(C, [[s0, -t0], [s1, -t0], [s1, -t1], [s0, -t1]], cls);
const rectCut = (C, s0, s1, t, cls) => cutPoly(C, [[s0, -t], [s1, -t], [s1, t], [s0, t]], cls);
// a lens seen in section: two spherical faces sagging (thick − edge)/2 toward its rim
function lensCut(C, sc, r, thick, edge, cls = "hd-cut-glass") {
  const sag = (thick - edge) / 2;
  const front = [];
  const back = [];
  for (let i = 0; i <= 16; i++) {
    const t = -r + (2 * r * i) / 16;
    const q = sag * (t / r) ** 2;
    front.push([sc - thick / 2 + q, t]);
    back.push([sc + thick / 2 - q, t]);
  }
  return cutPoly(C, [...front, ...back.reverse()], cls);
}
function lightCut(C, o) {
  const { h, so, sf, sr, sl, sd, rb = RB } = o;
  const k1 = (sr - sf) / (sf - so[1]);
  const [Rr, hr] = [rb * k1, h * k1];
  const half = (sg) =>
    [
      [[so[0] - 30, h], [so[0] - 30, rb], [so[1], rb], [so[1], h]],
      [[so[1], h], [so[1], rb], [sf, 0]],
      [[sf, 0], [sr, Rr], [sr, hr]],
      [[sr, hr], [sr, Rr], [sl, Rr], [sl, hr]],
      [[sl, hr], [sl, Rr], [sd, 0]],
    ].map((p) => cutPoly(C, p.map(([s, t]) => [s, sg * t]), "hd-cone")).join("");
  return half(1) + half(-1);
}
// the telescope's own optics: objective doublet in its cell, baffles, field stop, relay lens, filter and focusing lens
function telescopeCut(C, o, bore) {
  const { so, sf, sr, sl, filter, baffles, rb = RB } = o;
  const Rc = rb + 0.8;
  const k1 = (sr - sf) / (sf - so[1]);
  const Rr = rb * k1 + 1;
  const cone = (s) => (rb * (sf - s)) / (sf - so[1]);
  let out = lightCut(C, o);
  // the objective: a biconvex crown element cemented to a flint meniscus, held between two retaining rings
  out += lensCut(C, so[0] + 1.3, Rc, 2.6, 0.8);
  out += cutPoly(C, Array.from({ length: 17 }, (_, i) => {
    const t = -Rc + (2 * Rc * i) / 16;
    return [so[0] + 2.6 - 0.9 * (t / Rc) ** 2, t];
  }).concat([[so[1], Rc], [so[1], -Rc]]), "hd-cut-flint");
  out += pair(C, so[0] - 0.8, so[0] - 0.1, Rc - 0.6, bore, "hd-cut-metal") + pair(C, so[1] + 0.1, so[1] + 0.8, Rc - 0.6, bore, "hd-cut-metal");
  out += pair(C, so[0] - 0.1, so[1] + 0.1, Rc + 0.1, bore, "hd-cut-metal");
  for (const b of baffles) out += pair(C, b, b + 0.5, cone(b) + 0.9, bore, "hd-cut-metal");
  // the field stop: a pinhole at the focus passes only light from the spot the laser lit
  out += pair(C, sf - 0.35, sf + 0.35, 0.45, bore, "hd-cut-metal");
  out += lensCut(C, sr, Rr, 1.6, 0.5) + pair(C, sr - 0.5, sr + 0.5, Rr - 0.3, bore, "hd-cut-metal");
  out += rectCut(C, filter[0], filter[1], Rr + 0.6, "hd-cut-filter") + pair(C, filter[0] - 0.4, filter[1] + 0.4, Rr + 0.6, bore, "hd-cut-metal");
  out += lensCut(C, sl, Rr, 1.6, 0.5) + pair(C, sl - 0.5, sl + 0.5, Rr - 0.3, bore, "hd-cut-metal");
  return out;
}
// a photodiode die on its submount and header, a bond wire from its top contact to a post
function dieCut(C, sd, { half = 0.9, header = 6, posts = 3.7 } = {}) {
  let out = rectCut(C, sd, sd + 0.35, half, "hd-die") + rectCut(C, sd + 0.35, sd + 1.1, half * 2, "hd-cut-sub") + rectCut(C, sd + 1.1, sd + 2.4, header, "hd-cut-metal");
  out += pair(C, sd - 0.4, sd + 1.1, posts - 0.3, posts + 0.3, "hd-cut-metal");
  out += pair(C, sd + 2.4, sd + 9, posts - 0.25, posts + 0.25, "hd-cut-metal");
  const wire = [[sd, 0.55], [sd - 0.9, 1.4], [sd - 1.1, 2.8], [sd - 0.4, posts]].map(([s, t]) => at(onCut(C, s, t)));
  out += `<path class="hd-wire" d="M${wire[0].map((v) => v.toFixed(2)).join(" ")}C${wire.slice(1).map((p) => p.map((v) => v.toFixed(2)).join(" ")).join(" ")}"/>`;
  return out + Dots([at(onCut(C, sd, 0.55)), at(onCut(C, sd - 0.4, posts))], { size: 0.35, tone: "hi" });
}
function detectorCut(C, o, det) {
  const { sd } = o;
  if (det === "discrete") return rectCut(C, sd - 2.4, sd - 1.8, 5.4, "hd-cut-glass") + dieCut(C, sd);
  if (det === "waveform") {
    // the APD in its own small can, then the transimpedance amplifier on a board right behind it
    let out = rectCut(C, sd - 2.6, sd - 2, 3.6, "hd-cut-glass") + pair(C, sd - 2.6, sd + 1.1, 3.6, 4.2, "hd-cut-metal") + dieCut(C, sd, { header: 4.4, posts: 2.6 });
    out += rectCut(C, sd + 3.4, sd + 4.2, 7.6, "hd-cut-pcb") + cutPoly(C, [[sd + 4.2, -2.2], [sd + 5.6, -2.2], [sd + 5.6, 2.2], [sd + 4.2, 2.2]], "hd-cut-chip");
    return out + pair(C, sd + 4.2, sd + 5, 4.2, 6.2, "hd-cut-chip");
  }
  // a single-photon array: microlenses over the SPAD die, a ceramic carrier on a two-stage Peltier cooler
  let out = rectCut(C, sd - 2.6, sd - 2, 6, "hd-cut-glass");
  const bumps = [];
  for (let i = 0; i < 10; i++) {
    const t0 = -4 + i * 0.8;
    for (let j = 0; j <= 6; j++) bumps.push([sd - 0.05 - 0.45 * Math.sin((j / 6) * Math.PI), t0 + (0.8 * j) / 6]);
  }
  out += cutPoly(C, [[sd, 4], [sd, -4], ...bumps], "hd-cut-glass");
  out += rectCut(C, sd, sd + 0.4, 4.2, "hd-die");
  out += `<path class="hd-cut-cell" d="${Array.from({ length: 9 }, (_, i) => `M${at(onCut(C, sd, -3.2 + i * 0.8)).map((v) => v.toFixed(2)).join(" ")}L${at(onCut(C, sd + 0.4, -3.2 + i * 0.8)).map((v) => v.toFixed(2)).join(" ")}`).join("")}"/>`;
  out += rectCut(C, sd + 0.4, sd + 1.4, 6, "hd-cut-sub") + rectCut(C, sd + 1.4, sd + 1.8, 5.4, "hd-cut-metal") + rectCut(C, sd + 2.9, sd + 3.3, 5.4, "hd-cut-metal");
  for (let i = 0; i < 8; i++) out += cutPoly(C, [[sd + 1.8, -4.8 + i * 1.3], [sd + 2.9, -4.8 + i * 1.3], [sd + 2.9, -4.1 + i * 1.3], [sd + 1.8, -4.1 + i * 1.3]], i % 2 ? "hd-cut-tec" : "hd-cut-metal");
  out += rectCut(C, sd + 3.3, sd + 4.4, 8, "hd-cut-metal") + rectCut(C, sd + 5.6, sd + 6.4, 11, "hd-cut-pcb");
  return out;
}
// Every part on the receive path records its slice; buildHead joins the slices of one design and detector into a
// single section drawn just after the last of those parts. Nothing behind the cut plane can hide the plane, so the
// section is one layer over the whole path, with an uncut lip at its near end and the cut face where it stops.
let SECTION = [];
export const SECTIONS = new Map();
function cut(profile, bore, { det = null, wall = 1.2, square = 0 } = {}) {
  SECTION.push({ profile, bore, wall, square, det });
  return "";
}
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
function sectionOf(rx, detector, parts, id) {
  const o = RXOPT[rx];
  const C = cutPlane(o.F);
  const slices = parts.map((p) => {
    let profile = p.profile;
    if (p.square) {
      const tmax = p.square / Math.max(...AXES.filter((e) => Math.abs(dot3(e, o.F.a)) < 0.5).map((e) => Math.abs(dot3(e, C.w))));
      profile = profile.map(([s]) => [s, tmax]);
    }
    const rAt = (s) => {
      for (let i = 1; i < profile.length; i++) {
        const [s0, r0] = profile[i - 1];
        const [s1, r1] = profile[i];
        if (s >= s0 && s <= s1 && s1 > s0) return r0 + ((r1 - r0) * (s - s0)) / (s1 - s0);
      }
      return profile[profile.length - 1][1];
    };
    return { ...p, profile, rAt, s0: profile[0][0], s1: profile[profile.length - 1][0] };
  });
  const sMin = Math.min(...slices.map((p) => p.s0));
  const sMax = Math.max(...slices.map((p) => p.s1));
  // the near end keeps a thin lip; the far end shows the face of what is left whole
  const [lo, hi] = C.sigma < 0 ? [sMin + 1.2, o.sz(detector)] : [o.sw, sMax - 0.8];
  const far = C.sigma < 0 ? hi : lo;
  const mirror = (pts) => [...pts, ...pts.slice().reverse().map(([s, t]) => [s, -t])];
  const bodies = [];
  const bores = [];
  for (const p of slices) {
    const a = Math.max(lo, p.s0);
    const b = Math.min(hi, p.s1);
    if (b <= a) continue;
    const outline = [[a, p.rAt(a)], ...p.profile.filter(([s]) => s > a && s < b), [b, p.rAt(b)]];
    bodies.push(cutPath(C, mirror(outline)));
    bores.push(cutPath(C, mirror(outline.map(([s, r]) => [s, Math.min(p.bore, r - p.wall)]))));
  }
  const union = bodies.join("");
  const hollow = bores.join("");
  let out = `<g class="hd-lod hd-section"><path class="hd-cut-edge" d="${union}"/><clipPath id="${id}"><path d="${union}"/></clipPath><g clip-path="url(#${id})">`;
  out += `<path class="hd-cut-wall" d="${union}"/><path class="hd-cut-hatch" d="${union}"/><path class="hd-cut-bedge" d="${hollow}"/><path class="hd-cut-bore" d="${hollow}"/>`;
  out += telescopeCut(C, o, slices.find((p) => p.det === null)?.bore ?? 12) + detectorCut(C, o, detector) + "</g>";
  // the face left at the far end of the cut: the half of that section on the viewer's side of the axis
  const holder = slices.filter((p) => far >= p.s0 && far <= p.s1).sort((p, q) => q.rAt(far) - p.rAt(far))[0];
  if (holder) {
    const centre = G.add3(o.F.o, G.mul3(o.F.a, far));
    let pts;
    if (holder.square) {
      const [e1, e2] = AXES.filter((e) => Math.abs(dot3(e, o.F.a)) < 0.5);
      const poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => G.add3(G.mul3(e1, i * holder.square), G.mul3(e2, j * holder.square)));
      pts = [];
      for (let i = 0; i < poly.length; i++) {
        const [p, q] = [poly[i], poly[(i + 1) % poly.length]];
        const [dp, dq] = [dot3(p, C.n), dot3(q, C.n)];
        if (dp >= 0) pts.push(p);
        if (dp * dq < 0) pts.push(G.add3(p, G.mul3(G.add3(q, G.mul3(p, -1)), dp / (dp - dq))));
      }
      pts = pts.map((p) => G.add3(centre, p));
    } else {
      const r = holder.rAt(far);
      const rin = C.sigma < 0 ? 0 : Math.min(holder.bore, r - holder.wall);
      const ring = (rr) => Array.from({ length: 33 }, (_, i) => {
        const a = (i / 32) * Math.PI;
        return G.add3(G.add3(centre, G.mul3(C.w, rr * Math.cos(a))), G.mul3(C.n, rr * Math.sin(a)));
      });
      pts = [...ring(r), ...(rin ? ring(rin).reverse() : [])];
    }
    out += `<path class="hd-cut-face" d="${k.pathOf(pts.map(at), true)}"/>`;
  }
  return `${out}</g>`;
}
// ---------------------------------------------------------------- the bench: shared by every configuration
function bench() {
  // four rubber isolators carry the plate, as the head would sit on its mount in the aircraft
  for (const [x, y] of [[-128, -118], [98, -118], [-128, 44], [98, 44]]) {
    const F = alongZ(x, y);
    const id = `${x < 0 ? "l" : "r"}${y < 0 ? "b" : "f"}`;
    turned(`iso.base.${id}`, F, [[-24, 9], [-21, 9]], { tone: "lo" }, { ground: true, bevel: 0.4, extra: Dots(G.dotsOf(F, -21, 7.2, 4, P, { phase: 0.4, all: true }), { size: 0.45, tone: "lo" }) });
    turned(`iso.rubber.${id}`, F, [[-21, 6.6], [-20.2, 7.5, 1], [-17.5, 8.1, 1], [-14.8, 7.5, 1], [-14, 6.6]], { tone: "lo" });
    turned(`iso.cap.${id}`, F, [[-14, 8.5], [-10, 8.5]], { tone: "mid" }, { bevel: 0.4 });
  }
  // the plate, cut round the window port: far bars and near bars are separate items so the glass sits between them
  {
    const sets = {
      far: [[[-140, -130], [110, -PORT.y]], [[-140, -PORT.y], [-PORT.x, 56]]],
      near: [[[PORT.x, -PORT.y], [110, 56]], [[-PORT.x, PORT.y], [PORT.x, 56]]],
    };
    for (const [part, bars] of Object.entries(sets)) {
      const shapes = bars.map(([a, b], i) => record(A.slab({ ...planOf(a, b), r: 0 }, -10, 10, { name: `plate.${part}${i}` }, 2)));
      const svg = bars.map(([a, b]) => S(k.slabOf({ ...planOf(a, b), r: 0 }, -10, 10, P, 2, 0.4), { tone: "lo", inner: Ln(k.sideSeam({ ...planOf(a, b), r: 0 }, -3, P, 2), { tone: "faint" }) })).join("");
      // 25 mm tapped holes, the breadboard's grid
      const holes = [];
      for (const [[x0, y0], [x1, y1]] of bars) for (let x = -127.5; x < 110; x += 25) for (let y = -117.5; y < 56; y += 25) if (x > x0 + 3 && x < x1 - 3 && y > y0 + 3 && y < y1 - 3) holes.push(at([x, y, 0]));
      const [[a0, a1], [b0, b1]] = bars[0];
      put(`plate.${part}`, [(a0 + b0) / 2, (a1 + b1) / 2, -5], svg + Dots(holes, { size: 0.55, tone: "faint" }), shapes);
    }
  }
  box("window.glass", [-PORT.x, -PORT.y, -7], [PORT.x, PORT.y, -4], { tone: "lo", className: "hd-glass" }, { r: 0 });
  // the retainer frame over the window: four strips that overhang the port by 2 mm, screwed down
  const strips = [
    [[-31, -45], [-24, 45]],
    [[24, -45], [31, 45]],
    [[-24, -45], [24, -38]],
    [[-24, 38], [24, 45]],
  ];
  strips.forEach(([a, b], i) => {
    const plan = planOf(a, b);
    const along = plan.w < plan.d;
    const dots = [-1, 0, 1].map((f) => (along ? [plan.x + plan.w / 2, plan.y + plan.d / 2 + f * (plan.d / 2 - 5)] : [plan.x + plan.w / 2 + f * (plan.w / 2 - 5), plan.y + plan.d / 2]));
    box(`window.strip${i}`, [a[0], a[1], 0], [b[0], b[1], 2], { tone: "mid" }, { r: 0.3, bevel: 0.3, extra: Dots(dots.map(([x, y]) => at([x, y, 2])), { size: 0.5, tone: "lo" }) });
  });
  // the far walls of the box, with stiffening ribs and bolts along the foot
  box("wall.x", [-140, -130, 0], [-136, 56, 96], { tone: "lo" }, { r: 0, extra: Dots(Array.from({ length: 9 }, (_, i) => at([-136, -118 + i * 20, 5])), { size: 0.45, tone: "mid" }) });
  box("wall.y", [-136, -130, 0], [110, -126, 96], { tone: "lo" }, { r: 0, extra: Dots(Array.from({ length: 12 }, (_, i) => at([-124 + i * 20, -126, 5])), { size: 0.45, tone: "mid" }) });
  for (const y of [-100, -20, 36]) box(`wall.x.rib${y}`, [-136, y - 1.5, 0], [-133, y + 1.5, 96], { tone: "lo" }, { r: 0 });
  for (const x of [-100, -40, 100]) box(`wall.y.rib${x}`, [x - 1.5, -126, 0], [x + 1.5, -123, 96], { tone: "lo" }, { r: 0 });
  box("wall.x.lip", [-140, -130, 96], [-133, 56, 98], { tone: "mid" }, { r: 0, extra: Dots(Array.from({ length: 10 }, (_, i) => at([-136.5, -120 + i * 19.5, 98])), { size: 0.4, tone: "lo" }) });
  box("wall.y.lip", [-133, -130, 96], [110, -123, 98], { tone: "mid" }, { r: 0, extra: Dots(Array.from({ length: 13 }, (_, i) => at([-122 + i * 19, -126.5, 98])), { size: 0.4, tone: "lo" }) });
  // the near walls, cut down to a lip so the bench can be seen
  box("lip.x", [106, -126, 0], [110, 56, 12], { tone: "lo" }, { r: 0, extra: Dots(Array.from({ length: 9 }, (_, i) => at([110, -116 + i * 21, 6])), { size: 0.4, tone: "mid" }) });
  box("lip.y", [-136, 52, 0], [106, 56, 12], { tone: "lo" }, { r: 0, extra: Dots(Array.from({ length: 12 }, (_, i) => at([-126 + i * 21, 56, 6])), { size: 0.4, tone: "mid" }) });
  // bulkhead connectors through the far wall: power in, data out
  for (const x of [60, 84]) {
    const F = G.frameOf([x, -126, 70], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
    turned(`bulk${x}.flange`, F, [[0, 8], [2, 8]], { tone: "mid" }, { bevel: 0.3, extra: Dots(G.dotsOf(F, 2, 6.6, 4, P, { phase: Math.PI / 4, all: true }), { size: 0.45, tone: "lo" }) });
    turned(`bulk${x}.body`, F, [[2, 5.4], [12, 5.4]], { tone: "lo" });
    turned(`bulk${x}.nut`, F, [[12, 6.6], [18, 6.6]], { tone: "mid" }, { bevel: 0.3, extra: Ln(G.ribsOf(F, 12.4, 17.6, 6.6, 18, P, { seams: true }), { tone: "lo" }) });
  }
  // a desiccant cartridge and a pressure relief valve on the side wall
  {
    const F = G.frameOf([-136, 20, 70], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    turned("dry.flange", F, [[0, 10], [2.5, 10]], { tone: "mid" }, { bevel: 0.3, extra: Dots(G.dotsOf(F, 2.5, 8.4, 6, P, { all: true }), { size: 0.45, tone: "lo" }) });
    turned("dry.body", F, [[2.5, 7.5], [9, 7.5], [9, 6.8], [10, 6.8]], { tone: "mid", inner: Ln(G.ribsOf(F, 3, 8.5, 7.5, 22, P), { tone: "faint" }) });
    turned("dry.window", F, [[10, 4.6], [10.6, 4.6]], { tone: "hi" });
    const Q = G.frameOf([-136, -10, 80], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    turned("relief.base", Q, [[0, 5.5], [2, 5.5]], { tone: "mid" }, { bevel: 0.3 });
    turned("relief.body", Q, [[2, 3.4], [8, 3.4]], { tone: "lo" });
    turned("relief.cap", Q, [[8, 4.6], [11, 4.6]], { tone: "mid" }, { bevel: 0.3, extra: Ln(G.ribsOf(Q, 8.3, 10.7, 4.6, 14, P), { tone: "lo" }) });
  }
  // a label plate on the bench, three rule lines
  {
    const L = { x: -126, y: 30, w: 34, d: 18, r: 1 };
    box("label", [L.x, L.y, 0], [L.x + L.w, L.y + L.d, 0.6], { tone: "lo" }, { r: 1, extra: Ln([0, 1, 2].map((i) => k.lineOnTop([L.x + 4, L.y + 5 + i * 4], [L.x + L.w - 4 - (i === 2 ? 9 : 0), L.y + 5 + i * 4], 0.6, P)).join(""), { tone: "lo", free: true }) + screws(L, 0.6, 1.8, 0.4) });
  }
  // the IMU, bolted to the same bench as the scanner so the angle between them never changes; its axes are engraved
  // on the lid, and its cable leaves through a bulkhead in the side wall to the GNSS/INS computer; flown without an
  // IMU, all of it comes out
  when("nav:ins", CFG, () => {
    const M = { x: -90, y: -2, w: 36, d: 30, r: 0.8 };
    const pins = [at([-72, 0, 3]), at([-72, 26, 3])];
    box("imu.plate", [M.x, M.y, 0], [M.x + M.w, M.y + M.d, 3], { tone: "lo" }, { r: 0.8, bevel: 0.3, extra: screws(M, 3, 2.2, 0.45) + Dots(pins, { size: 0.6, tone: "mid" }) });
    const B = { x: -86, y: 2, w: 28, d: 22, r: 1.2 };
    const [ox, oy, zt] = [-80, 8, 27];
    const axes = Ln(k.lineOnTop([ox, oy], [ox + 9, oy], zt, P) + k.lineOnTop([ox, oy], [ox, oy + 9], zt, P), { tone: "hi" }) + Dots([at([ox, oy, zt]), at([ox + 9, oy, zt]), at([ox, oy + 9, zt])], { size: 0.55, tone: "hi" });
    box("imu.body", [B.x, B.y, 3], [B.x + B.w, B.y + B.d, zt], { tone: "mid" }, { r: 1.2, bevel: 0.5, inner: Ln(k.sideSeam(B, 22, P, 4), { tone: "faint" }), extra: screws(B, zt, 2.4, 0.5) + axes });
    const F = alongX(13, 16);
    turned("imu.socket", F, [[-89, 3.4], [-86, 3.4]], { tone: "lo" }, { bevel: 0.2 });
  });
  // and the bulkhead it leaves by
  when("nav:ins", CFG, () => {
    const F = G.frameOf([-136, 13, 16], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
    turned("bulkimu.flange", F, [[0, 7], [2, 7]], { tone: "mid" }, { bevel: 0.3, extra: Dots(G.dotsOf(F, 2, 5.6, 4, P, { phase: Math.PI / 4, all: true }), { size: 0.45, tone: "lo" }) });
    turned("bulkimu.body", F, [[2, 4.6], [10, 4.6]], { tone: "lo" });
    turned("bulkimu.nut", F, [[10, 5.6], [15, 5.6]], { tone: "mid" }, { bevel: 0.3, extra: Ln(G.ribsOf(F, 10.4, 14.6, 5.6, 16, P, { seams: true }), { tone: "lo" }) });
    cable("cable.imu", [[-121, 13, 16], [-89, 13, 16]], 1, { shells: [false, true], ends: [false, false] });
  });

  // the beam expander on its pedestal, and the injection mirror that turns the beam to the scanner
  box("expander.ped", [-28, -54, 0], [-16, -46, 42], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([-25, -46, 3]), at([-19, -46, 3])], { size: 0.45, tone: "mid" }) });
  {
    const F = alongX(LY, ZB);
    turned("expander", F, [[-34, 6], [-31, 6], [-31, 8.5], [-29.5, 8.5], [-29.5, 8], [-14, 8], [-14, 6.5], [-12, 6.5]], { tone: "mid" }, {
      extra: Ln(G.ribsOf(F, -29, -24, 8, 22, P, { seams: true }), { tone: "lo" }) + Ln(G.arcOf(F, -12, 4.2, P), { tone: "hi" }),
    });
  }
  {
    const c = [0, LY];
    const t = [Math.SQRT1_2, Math.SQRT1_2];
    const n = [-Math.SQRT1_2, Math.SQRT1_2];
    const pt = (a, b) => [c[0] + t[0] * a - n[0] * b, c[1] + t[1] * a - n[1] * b];
    const poly = [pt(5, 0), pt(-5, 0), pt(-5, 2.2), pt(5, 2.2)];
    const ZF = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    const post = [c[0] - n[0] * 1.1, c[1] - n[1] * 1.1];
    const PF0 = alongZ(post[0], post[1]);
    when("rx:inject|holed", CFG, () => {
      turned("inject.foot", PF0, [[0, 5], [3, 5]], { tone: "lo" }, { bevel: 0.3 });
      turned("inject.post", PF0, [[3, 1.6], [44, 1.6]], { tone: "mid" });
      prism("inject.mirror", ZF, poly, 44, 56, { tone: "hi" });
    });
    // biaxial: a small fold mirror off to one side turns the beam to the scanner, clear of the telescope's view
    when("rx:biaxial", CFG, () => {
      const c2 = [TXB, LY];
      const q = (a, b) => [c2[0] + t[0] * a - n[0] * b, c2[1] + t[1] * a - n[1] * b];
      const P2 = alongZ(c2[0] - n[0] * 0.8, c2[1] - n[1] * 0.8);
      turned("txfold.foot", P2, [[0, 4], [3, 4]], { tone: "lo" }, { bevel: 0.3 });
      turned("txfold.post", P2, [[3, 1.2], [45, 1.2]], { tone: "mid" });
      prism("txfold.mirror", ZF, [q(2.6, 0), q(-2.6, 0), q(-2.6, 1.6), q(2.6, 1.6)], 45, 55, { tone: "hi" });
    });
  }
  // the receiving telescope behind the injection mirror, in two clamp rings on pedestals
  when("rx:inject", CFG, () => {
    const F = DOWNY;
    const tube = (name, profile, style, options = {}) => turned(name, F, profile, style, { ...options, extra: (options.extra ?? "") + cut(profile, 16.6) });
    tube("scope.tube", [[60, 20], [65, 20], [65, 18.5], [66, 18.5]], { tone: "lo" }, {
      extra: Ln(G.arcOf(F, 60, 16.6, P), { tone: "mid" }) + Ln(G.ribsOf(F, 60.4, 64.6, 20, 28, P, { seams: true }), { tone: "faint" }),
    });
    tube("scope.mid", [[72, 18.5], [92, 18.5]], { tone: "lo" });
    tube("scope.rear", [[98, 18.5], [104, 18.5], [104, 16], [108, 16]], { tone: "lo" });
    for (const [i, s] of [[0, 66], [1, 92]]) {
      tube(`scope.ring${i}`, [[s, 21.5], [s + 6, 21.5]], { tone: "mid" }, { bevel: 0.4, extra: Dots(G.dotsOf(F, s + 3, 21.5, 6, P, { phase: 0.3 }), { size: 0.45, tone: "lo" }) });
      box(`scope.ped${i}`, [-8, -s - 6, 0], [8, -s, 28.5], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([-5, -s, 3]), at([5, -s, 3])], { size: 0.45, tone: "mid" }) });
    }
  });
  // or: a biaxial receiver, its own telescope beside the transmit path, looking at the other half of the scan element
  when("rx:biaxial", CFG, () => {
    const F = BIAXF;
    const tube = (name, profile, style, options = {}) => turned(name, F, profile, style, { ...options, extra: (options.extra ?? "") + cut(profile, 11.4) });
    tube("scope.tube", [[60, 14], [65, 14], [65, 12.8], [66, 12.8]], { tone: "lo" }, {
      extra: Ln(G.arcOf(F, 60, 11.4, P), { tone: "mid" }) + Ln(G.ribsOf(F, 60.4, 64.6, 14, 24, P, { seams: true }), { tone: "faint" }),
    });
    tube("scope.mid", [[72, 12.8], [92, 12.8]], { tone: "lo" });
    tube("scope.rear", [[98, 12.8], [104, 12.8], [104, 12], [108, 12]], { tone: "lo" });
    for (const [i, s] of [[0, 66], [1, 92]]) {
      tube(`scope.ring${i}`, [[s, 15], [s + 6, 15]], { tone: "mid" }, { bevel: 0.4, extra: Dots(G.dotsOf(F, s + 3, 15, 6, P, { phase: 0.3 }), { size: 0.45, tone: "lo" }) });
      box(`scope.ped${i}`, [BX - 7, -s - 6, 0], [BX + 7, -s, ZB - 15], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([BX - 4, -s, 3]), at([BX + 4, -s, 3])], { size: 0.45, tone: "mid" }) });
    }
  });
  // or: a holed (scraper) mirror on the shared axis; the pulse leaves through its hole, the echo reflects off the
  // annulus into a telescope along +x
  when("rx:holed", CFG, () => {
    const { c, n, u, a, b, hole } = HOLED;
    const F = G.frameOf(c, n, u, [0, 0, 1]);
    const ellipse = (ra, rb, m = 48) => Array.from({ length: m }, (_, i) => [ra * Math.cos((i / m) * 2 * Math.PI), rb * Math.sin((i / m) * 2 * Math.PI)]);
    const onFace = (pu, pv) => G.add3(G.add3(c, G.mul3(u, pu)), [0, 0, pv]);
    const holeD = `${k.pathOf(ellipse(hole * Math.SQRT2, hole, 32).map(([pu, pv]) => at(onFace(pu, pv))), true)}`;
    const [cw, ch, cr] = HOLED.cell;
    prism("holed.cell", F, rrect(cw, ch, cr), -5.5, -2, { tone: "mid" }, { extra: Dots([[-cw + 2.4, ch - 2.4], [cw - 2.4, ch - 2.4]].map(([pu, pv]) => at(G.add3(onFace(pu, pv), G.mul3(n, -2)))), { size: 0.45, tone: "lo" }) });
    prism("holed.mirror", F, ellipse(a, b), -2, 0, { tone: "hi", lit: true }, { extra: `<path class="hd-hole" d="${holeD}"/>` });
    const [px, py] = HOLED.post;
    box("holed.foot", [px - 4, py - 5, 0], [px + 4, py + 2, 3], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([px - 2.4, py + 2, 1.5]), at([px + 2.4, py + 2, 1.5])], { size: 0.4, tone: "mid" }) });
    turned("holed.post", alongZ(px, py), [[3, 1.4], [HOLED.cellBottom, 1.4]], { tone: "mid" });
    const T = HOLED.F;
    const tube = (name, profile, style, options = {}) => turned(name, T, profile, style, { ...options, extra: (options.extra ?? "") + cut(profile, 12.4) });
    tube("scope.tube", [[20, 15], [26, 15], [26, 13.8], [32, 13.8]], { tone: "lo" }, { extra: Ln(G.ribsOf(T, 20.4, 25.6, 15, 28, P, { seams: true }), { tone: "faint" }) });
    tube("scope.mid", [[38, 13.8], [46, 13.8]], { tone: "lo" });
    tube("scope.rear", [[52, 13.8], [55, 13.8], [55, 11.5], [59, 11.5]], { tone: "lo" });
    for (const [i, s] of [[0, 32], [1, 46]]) {
      tube(`scope.ring${i}`, [[s, 16.5], [s + 6, 16.5]], { tone: "mid" }, { bevel: 0.4, extra: Dots(G.dotsOf(T, s + 3, 16.5, 6, P, { phase: 0.3 }), { size: 0.45, tone: "lo" }) });
      box(`scope.ped${i}`, [s, -34, 0], [s + 6, -30, ZB - 16.5], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([s + 3, -30, 3])], { size: 0.45, tone: "mid" }) });
    }
  });
  // the receiver board on standoffs, with the data connector from the far wall
  {
    for (const [x, y] of [[38, -116], [94, -116], [38, -76], [94, -76]]) turned(`rx.standoff${x},${y}`, alongZ(x, y), [[0, 2.2], [8, 2.2]], { tone: "mid" });
    const B = { x: 34, y: -120, w: 64, d: 48, r: 1 };
    box("rx.board", [34, -120, 8], [98, -72, 9.6], { tone: "lo" }, { r: 1, extra: screws(B, 9.6, 4, 0.55) + Ln([0, 1, 2, 3].map((i) => k.lineOnTop([46, -90 + i * 3], [96, -90 + i * 3], 9.6, P)).join(""), { tone: "faint" }) });
    box("rx.conn", [80, -104, 9.6], [88, -96, 13.6], { tone: "mid" }, { r: 0.4 });
    box("rx.jack", [38, -118, 9.6], [44, -112, 13], { tone: "mid" }, { r: 0.4 });
    cable("cable.data", [[84, -108, 70], [84, -100, 70], [84, -100, 13.6]], 1.1, { shells: [false, true], bend: 6, ends: [false, false] });
    // the GNSS receiver's pulse-per-second: an SMA through its own small bulkhead, so every shot is stamped in GPS time;
    // flown without GNSS there is no GPS time to stamp, so it comes out
    when("nav:ins|gnss", CFG, () => {
      box("rx.pps", [37, -93, 9.6], [43, -87, 13], { tone: "mid" }, { r: 0.4 });
      turned("rx.ppsbarrel", alongZ(40, -90), [[13, 1.7], [14.2, 1.7], [14.2, 1.4], [17, 1.4]], { tone: "mid" }, { bevel: 0.2 });
      const F = G.frameOf([40, -126, 70], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
      turned("bulkpps.flange", F, [[0, 5], [1.6, 5]], { tone: "mid" }, { bevel: 0.3, extra: Dots(G.dotsOf(F, 1.6, 3.9, 4, P, { phase: Math.PI / 4, all: true }), { size: 0.4, tone: "lo" }) });
      turned("bulkpps.body", F, [[1.6, 3], [10, 3]], { tone: "lo" });
      turned("bulkpps.nut", F, [[10, 3.8], [14, 3.8]], { tone: "mid" }, { bevel: 0.2, extra: Ln(G.ribsOf(F, 10.3, 13.7, 3.8, 12, P, { seams: true }), { tone: "lo" }) });
      cable("cable.pps", [[40, -112, 70], [40, -90, 70], [40, -90, 17]], 0.8, { shells: [false, true], bend: 5, ends: [false, false] });
    });
  }
  // the power supply: finned case, fed from the other bulkhead, feeding the scanner drive
  {
    box("psu", [40, -66, 0], [100, -36, 24], { tone: "mid" }, { r: 0.8, bevel: 0.5, extra: Ln(k.sideSeam({ x: 40, y: -66, w: 60, d: 30, r: 0.8 }, 6, P, 4), { tone: "faint" }) + screws({ x: 40, y: -66, w: 60, d: 30 }, 24, 2.4, 0.5) });
    for (const x of [44, 49.5, 55, 63.4, 68.9, 74.4, 79.9, 85.4]) box(`psu.fin${x}`, [x, -62, 24], [x + 1.6, -46, 29], { tone: "lo" }, { r: 0 });
    box("psu.led", [92, -40, 24], [96, -38, 25], { tone: "hi" }, { r: 0.3 });
    cable("cable.power", [[60, -108, 70], [60, -51, 70], [60, -51, 24]], 1.3, { shells: [false, true], bend: 7, ends: [false, false] });
    cable("cable.drive", [[92, -36, 12], [92, -22, 12]], 0.9, { shells: [true, true], bend: 3 });
  }
  // the scanner's drive box: one per scanner, same footprint, same feed
  box("drive", [64, -22, 0], [104, 20, 20], { tone: "mid" }, {
    r: 0.8,
    bevel: 0.5,
    extra: Ln(k.sideSeam({ x: 64, y: -22, w: 40, d: 42, r: 0.8 }, 5, P, 4), { tone: "faint" }) + screws({ x: 64, y: -22, w: 40, d: 42 }, 20, 2.4, 0.5) + Ln(onFaceY(20, 68, 100, 15), { tone: "faint" }),
  });
  // beams that never move: expander to the injection mirror to the scanner
  // the echo comes back up the shared axis as a wide bundle; the injection mirror shades its centre
  when("rx:inject", CFG, () => beam("beam.inject", [[-12, LY, ZB], [0, LY, ZB], [0, 0, ZB]], { extra: rxLight(bundle([0, -6, ZB], [0, -60, ZB], 9), bundle([0, LY, ZB], [0, -60, ZB], 3.5)) }));
  // biaxial: the pulse runs up one side to the scanner; the echo comes back down the other, whole
  when("rx:biaxial", CFG, () => {
    beam("beam.inject", [[-12, LY, ZB], [TXB, LY, ZB], [TXB, y0Of("biaxial"), ZB]]);
    // the echo has its own item, ordered by its true width, so it lands on the telescope's front face
    put("beam.echo", [BX, -33, ZB], rxLight(bundle([BX, -6, ZB], [BX, -60, ZB], 6)), [A.tube([[BX, -6, ZB], [BX, -59.4, ZB]], 6)]);
  });
  // through the cell's bore and out of the hole in the mirror's face; the echo's rim reflects off the annulus into
  // the telescope and its centre falls back through the hole
  when("rx:holed", CFG, () => {
    beam("beam.inject", [[-12, LY, ZB], [0, LY, ZB], [0, -40.6, ZB]]);
    beam("beam.hole", [[0, -31.4, ZB], [0, 0, ZB]], { extra: rxLight(bundle([0, -6, ZB], [0, HOLED.c[1], ZB], 9)) + rxLight(bundle([0, HOLED.c[1], ZB], [20, HOLED.c[1], ZB], 9), bundle([0, HOLED.c[1], ZB], [20, HOLED.c[1], ZB], HOLED.hole)) });
  });
}
// ---------------------------------------------------------------- the lasers
const faceY = (o, text, size = 3.6, anchor = "middle") => k.faceTextSvg(planeMatrix(o, [1, 0, 0], [0, 0, -1]), text, { size, tone: "lo", anchor });
function solidLaser(x1, text) {
  // a DPSS head: body on two feet, cooling fins on top, a thermistor lead and a label on the near face
  const x0 = -128;
  const feet = [[x0 + 8, x0 + 18], [x1 - 12, x1 - 2]];
  feet.forEach(([a, b], i) => box(`laser.foot${i}`, [a, -66, 0], [b, -34, 30], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([(a + b) / 2, -34, 3]), at([(a + b) / 2, -66 + 3, 30])], { size: 0.45, tone: "mid" }) }));
  const plan = { x: x0, y: -64, w: x1 - x0, d: 28, r: 1.2 };
  box("laser.body", [x0, -64, 30], [x1, -36, 66], { tone: "mid" }, {
    r: 1.2,
    bevel: 0.6,
    extra: Ln(k.sideSeam(plan, 58, P, 4), { tone: "faint" }) + faceY([(x0 + x1) / 2, -36, 46], text) + Ln(onFaceY(-36, x0 + 6, x1 - 6, 52), { tone: "faint", free: true }),
  });
  const fins = Math.floor((x1 - x0 - 16) / 8);
  for (let i = 0; i < fins; i++) box(`laser.fin${i}`, [x0 + 6 + i * 8, -62, 66], [x0 + 8 + i * 8, -38, 72], { tone: "lo" }, { r: 0 });
  // the driver: diode current and TEC, cabled to the head's far face
  box("laser.driver", [-126, -112, 0], [-70, -84, 30], { tone: "mid" }, {
    r: 0.8,
    bevel: 0.5,
    extra: Ln(k.sideSeam({ x: -126, y: -112, w: 56, d: 28, r: 0.8 }, 7, P, 4), { tone: "faint" }) + screws({ x: -126, y: -112, w: 56, d: 28 }, 30, 2.4, 0.5) + Dots([at([-80, -84, 22]), at([-76, -84, 22])], { size: 0.6, tone: "hi" }),
  });
  cable("laser.cable", [[-95, -84, 18], [-95, -72, 18], [-95, -72, 40], [-95, -64, 40]], 0.9, { shells: [true, true], bend: 3 });
}
function lasers(cfg) {
  when("laser:yag", cfg, () => {
    solidLaser(-50, "Nd:YAG  1064 nm");
    box("yag.qswitch", [-60, -60, 66], [-51, -40, 75], { tone: "mid" }, { r: 0.5, bevel: 0.3, extra: screws({ x: -60, y: -60, w: 9, d: 20 }, 75, 1.6, 0.4) });
    turned("yag.nozzle", alongX(LY, ZB), [[-50, 6], [-44, 6], [-44, 5], [-40, 5]], { tone: "mid" }, { extra: Ln(G.arcOf(alongX(LY, ZB), -40, 2.6, P), { tone: "hi" }) });
  });
  when("laser:green", cfg, () => {
    solidLaser(-80, "Nd:YAG ×2  532 nm");
    // the doubling crystal in its oven: 1064 nm in, 532 nm out
    box("green.oven", [-74, -60, 0], [-62, -40, 60], { tone: "mid" }, { r: 0.6, bevel: 0.4, extra: Ln(k.sideSeam({ x: -74, y: -60, w: 12, d: 20, r: 0.6 }, 44, P, 2), { tone: "faint" }) + screws({ x: -74, y: -60, w: 12, d: 20 }, 60, 1.8, 0.4) });
    // the dichroic passes green, turns the leftover infrared into a dump
    const c = [-52, LY];
    const t = [Math.SQRT1_2, -Math.SQRT1_2];
    const n = [Math.SQRT1_2, Math.SQRT1_2];
    const pt = (a, b) => [c[0] + t[0] * a + n[0] * b, c[1] + t[1] * a + n[1] * b];
    const ZF = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
    const post = [c[0] + n[0] * 1.1, c[1] + n[1] * 1.1];
    turned("green.dfoot", alongZ(post[0], post[1]), [[0, 4.5], [3, 4.5]], { tone: "lo" }, { bevel: 0.3 });
    turned("green.dpost", alongZ(post[0], post[1]), [[3, 1.5], [45, 1.5]], { tone: "mid" });
    prism("green.dichroic", ZF, [pt(4, 0), pt(-4, 0), pt(-4, 2.2), pt(4, 2.2)], 45, 55, { tone: "hi" });
    const D = G.frameAlong([-52, 0, ZB], [0, -1, 0]);
    box("green.dumpped", [-58, -76, 0], [-46, -64, 43], { tone: "lo" }, { r: 0.4, bevel: 0.3 });
    turned("green.dump", D, [[62, 5], [64, 5], [64, 7], [76, 7], [76, 6], [78, 6]], { tone: "lo" }, { extra: Ln(G.ribsOf(D, 65, 75, 7, 20, P, { seams: true }), { tone: "faint" }) + Ln(G.arcOf(D, 62, 3, P), { tone: "mid" }) });
    // the aperture that cleans the beam
    turned("green.apfoot", alongZ(-42, LY), [[0, 4.5], [3, 4.5]], { tone: "lo" }, { bevel: 0.3 });
    turned("green.appost", alongZ(-42, LY), [[3, 1.5], [43, 1.5]], { tone: "mid" });
    ring("green.aperture", alongX(LY, ZB), -44, -40, 2, 7, { tone: "mid" }, { extra: Dots(G.dotsOf(alongX(LY, ZB), -40, 5, 4, P, { phase: Math.PI / 4, all: true }), { size: 0.4, tone: "lo" }) });
    beam("beam.ir", [[-80, LY, ZB], [-74, LY, ZB]], { ink: "ir" });
    beam("beam.green", [[-62, LY, ZB], [-52, LY, ZB]], { ink: "green" });
    beam("beam.green2", [[-48.7, LY, ZB], [-44, LY, ZB]], { ink: "green" });
    beam("beam.dump", [[-52, LY, ZB], [-52, -62, ZB]], { ink: "ir" });
  });
  when("laser:fibre", cfg, () => {
    // the fibre spool: the gain fibre wound on a drum, flanged, pumped by the amplifier box
    const F = alongZ(-96, -50);
    turned("fibre.flange0", F, [[0, 24], [3, 24]], { tone: "lo" }, { ground: true, bevel: 0.4 });
    turned("fibre.hub", F, [[3, 16], [23, 16]], { tone: "mid", inner: Ln(Array.from({ length: 9 }, (_, i) => G.arcOf(F, 5 + i * 2, 16, P)).join(""), { tone: "lo" }) });
    turned("fibre.flange1", F, [[23, 24], [26, 24]], { tone: "lo" }, { bevel: 0.4, extra: Dots(G.dotsOf(F, 26, 19, 6, P, { all: true }), { size: 0.5, tone: "mid" }) + Dots([at([-96, -50, 26])], { size: 1.2, tone: "lo" }) });
    box("fibre.amp", [-126, -112, 0], [-70, -84, 30], { tone: "mid" }, {
      r: 0.8,
      bevel: 0.5,
      extra: Ln(k.sideSeam({ x: -126, y: -112, w: 56, d: 28, r: 0.8 }, 7, P, 4), { tone: "faint" }) + screws({ x: -126, y: -112, w: 56, d: 28 }, 30, 2.4, 0.5) + faceY([-98, -84, 20], "Er fibre  1550 nm", 3.4),
    });
    box("fibre.vblock", [-56, -54, 0], [-44, -46, 45], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([-50, -46, 3]), at([-50, -46, 40])], { size: 0.45, tone: "mid" }) });
    turned("fibre.collimator", alongX(LY, ZB), [[-58, 4], [-52, 4], [-52, 5], [-44, 5], [-44, 4], [-40, 4]], { tone: "mid" }, { extra: Ln(G.ribsOf(alongX(LY, ZB), -51.5, -44.5, 5, 18, P, { seams: true }), { tone: "lo" }) + Ln(G.arcOf(alongX(LY, ZB), -40, 2.4, P), { tone: "hi" }) });
    cable("fibre.feed", [[-70, -90, 15], [-64, -90, 15], [-64, -56, 15], [-64, -56, 50], [-64, LY, 50], [-58, LY, 50]], 0.6, { bend: 3, shells: [true, false] });
    cable("fibre.lead", [[-96, -66, 13], [-96, -84, 13]], 0.6, { bend: 2 });
  });
  when("laser:diode", cfg, () => {
    // a pulsed laser diode: the emitter in a TO-can pressed into a finned aluminium block, its pulser board screwed to
    // the block's face so the current loop stays short, and a threaded aspheric collimator held on a V-block
    const F = alongX(LY, ZB);
    box("diode.riser", [-80, -60, 0], [-66, -40, 36], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([-73, -40, 4]), at([-73, -40, 32])], { size: 0.45, tone: "mid" }) });
    box("diode.sink", [-84, -64, 36], [-62, -36, 64], { tone: "mid" }, { r: 0.8, bevel: 0.5, inner: Ln(k.sideSeam({ x: -84, y: -64, w: 22, d: 28, r: 0.8 }, 40, P, 4), { tone: "faint" }) });
    for (let i = 0; i < 5; i++) box(`diode.fin${i}`, [-82 + i * 4.4, -62, 64], [-80.4 + i * 4.4, -38, 70], { tone: "lo" }, { r: 0 });
    const board = [[-81, 40], [-65, 40], [-81, 60], [-65, 60]].map(([x, z]) => at([x, -34.4, z]));
    box("diode.board", [-83, -36, 38], [-63, -34.4, 62], { tone: "lo" }, { r: 0.3, extra: Dots(board, { size: 0.45, tone: "mid" }) + k.faceTextSvg(planeMatrix([-73, -34.4, 56], [1, 0, 0], [0, 0, -1]), "PLD  905 nm", { size: 2.4, tone: "mid", anchor: "middle" }) });
    for (let i = 0; i < 3; i++) box(`diode.cap${i}`, [-80.5 + i * 3.2, -34.4, 42], [-78.5 + i * 3.2, -33, 47], { tone: "mid" }, { r: 0.2 });
    box("diode.fet", [-71, -34.4, 43], [-66, -33, 48], { tone: "mid" }, { r: 0.2, extra: Dots([at([-68.5, -33, 45.5])], { size: 0.35, tone: "hi" }) });
    turned("diode.can", F, [[-62, 4.6], [-61, 4.6], [-61, 3.2], [-58, 3.2]], { tone: "mid" }, { bevel: 0.2 });
    turned("diode.lens", F, [[-58, 4.6], [-46, 4.6], [-46, 5.4], [-44, 5.4], [-44, 4], [-40, 4]], { tone: "mid" }, {
      extra: Ln(G.ribsOf(F, -57.5, -46.5, 4.6, 18, P, { seams: true }), { tone: "lo" }) + Ln(G.ribsOf(F, -45.8, -44.2, 5.4, 24, P, { seams: true }), { tone: "lo" }) + Ln(G.arcOf(F, -40, 2.4, P), { tone: "hi" }),
    });
    box("diode.vblock", [-56, -54, 0], [-48, -46, 45.4], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([-52, -46, 3]), at([-52, -46, 42])], { size: 0.45, tone: "mid" }) });
    box("diode.driver", [-126, -112, 0], [-70, -84, 30], { tone: "mid" }, {
      r: 0.8,
      bevel: 0.5,
      extra: Ln(k.sideSeam({ x: -126, y: -112, w: 56, d: 28, r: 0.8 }, 7, P, 4), { tone: "faint" }) + screws({ x: -126, y: -112, w: 56, d: 28 }, 30, 2.4, 0.5) + faceY([-98, -84, 20], "Diode  905 nm", 3.4) + Dots([at([-121, -84, 22]), at([-117, -84, 22])], { size: 0.6, tone: "hi" }),
    });
    cable("diode.cable", [[-74, -84, 16], [-74, -72, 16], [-74, -72, 46], [-74, -64, 46]], 0.9, { shells: [true, true], bend: 3 });
  });
  beam("beam.a", [[-40, LY, ZB], [-34, LY, ZB]]);
}
// ---------------------------------------------------------------- the scanners
const ZF0 = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
function motorCable(name, from, x = 70, y = from[1]) {
  cable(name, [from, [x, y, from[2]], [x, y, 20]], 0.7, { shells: [true, true], bend: 4 });
}
function scanners(cfg) {
  when("scanner:galvo", cfg, () => {
    const { from, to } = HEADX.galvo;
    prism("galvo.mirror", XF, galvoPoly(0), from, to, { tone: "hi", lit: true }, { live: "galvo" });
    const F = alongX(0, ZB);
    turned("galvo.shaft", F, [[to, 2.2], [16, 2.2]], { tone: "mid" });
    turned("galvo.motor", F, [[16, 8], [18, 8], [18, 10], [44, 10], [44, 9], [50, 9]], { tone: "mid" }, { extra: Ln(G.ribsOf(F, 20, 42, 10, 26, P, { seams: true }), { tone: "faint" }) + Ln(G.arcOf(F, 31, 10, P), { tone: "lo" }) });
    turned("galvo.encoder", F, [[50, 8], [56, 8], [56, 6.5], [57, 6.5]], { tone: "lo" }, { extra: Dots(G.dotsOf(F, 57, 4.6, 4, P, { all: true }), { size: 0.4, tone: "mid" }) });
    box("galvo.block", [32, -8, 0], [46, 8, 40], { tone: "lo" }, { r: 0.5, bevel: 0.4, extra: Dots([at([35, 8, 4]), at([43, 8, 4]), at([46, -4, 36]), at([46, 4, 36])], { size: 0.45, tone: "mid" }) });
    box("galvo.plug", [51, -3, 58], [55, 3, 61], { tone: "mid" }, { r: 0.3 });
    motorCable("galvo.cable", [55, 0, 59.5]);
  });
  for (const N of [3, 4, 5, 6, 7, 8]) {
    when(`scanner:polygon facets:${N}`, cfg, () => {
      const { from, to } = HEADX.polygon;
      prism(`poly${N}.body`, PF, polygonPoly(N, 0), from, to, { tone: "hi", lit: true }, { live: "poly" });
    });
  }
  when("scanner:polygon", cfg, () => {
    const F = PF;
    const [, y, z] = HEADX.polygon.axis;
    turned("poly.hub", F, [[HEADX.polygon.to, 3], [14, 3]], { tone: "mid" });
    turned("poly.motor", F, [[14, 9], [16, 9], [16, 12], [44, 12], [44, 10], [48, 10]], { tone: "mid" }, { extra: Ln(G.ribsOf(F, 18, 42, 12, 30, P, { seams: true }), { tone: "faint" }) + Dots(G.dotsOf(F, 48, 7, 4, P, { all: true }), { size: 0.45, tone: "lo" }) });
    box("poly.block", [32, y - 8.5, 0], [46, y + 8.5, z - 12], { tone: "lo" }, { r: 0.5, bevel: 0.4, extra: Dots([at([35, y + 8.5, 4]), at([43, y + 8.5, 4])], { size: 0.45, tone: "mid" }) });
    motorCable("poly.cable", [48, y, z]);
  });
  when("scanner:palmer", cfg, () => {
    const F = PALF;
    disc("palmer.mirror", F, 0, HEADX.palmer.thick, HEADX.palmer.r, { tone: "hi", lit: true }, { live: "palmer" });
    turned("palmer.hub", F, [[HEADX.palmer.thick, 4.5], [6, 4.5]], { tone: "mid" }, { live: "palmer-hub" });
    turned("palmer.motor", F, [[6, 9], [8, 9], [8, 10], [36, 10], [36, 8], [40, 8]], { tone: "mid" }, { extra: Ln(G.ribsOf(F, 10, 34, 10, 26, P, { seams: true }), { tone: "faint" }) });
    box("palmer.arm", [10, 13, 63], [51, 21, 71], { tone: "lo" }, { r: 0.4, bevel: 0.3, extra: Dots([at([40, 21, 67]), at([16, 21, 67])], { size: 0.45, tone: "mid" }) });
    box("palmer.column", [33, 11, 0], [45, 23, 63], { tone: "lo" }, { r: 0.5, bevel: 0.4, extra: Dots([at([36, 23, 4]), at([42, 23, 4])], { size: 0.45, tone: "mid" }) });
    motorCable("palmer.cable", [51, 17, 67], 72);
  });
  // a fixed fold mirror sends the beam straight down into the wedges or the diffuser
  when("scanner:risley|flash", cfg, () => {
    prism("fold.mirror", XF, galvoPoly(0), HEADX.galvo.from, HEADX.galvo.to, { tone: "hi" });
    box("fold.arm", [-36, -3, 49], [-13, 3, 54], { tone: "mid" }, { r: 0.3, bevel: 0.2 });
    box("fold.column", [-46, -6, 0], [-36, 6, 62], { tone: "lo" }, { r: 0.5, bevel: 0.4, extra: Dots([at([-36, -3, 4]), at([-36, 3, 4]), at([-36, 0, 58])], { size: 0.45, tone: "mid" }) });
  });
  when("scanner:risley", cfg, () => {
    const F = ZF0;
    // index marks that turn with each prism ride on their hosts, so the reader sees two rates
    turned("risley.ring1", F, [[2, 32], [14, 32]], { tone: "mid" }, { extra: Ln(G.ribsOf(F, 3, 13, 32, 90, P, { seams: true }), { tone: "lo" }) + `<g data-live="mark1"><circle class="hd-mark" r="1.4" cx="${at([32, 0, 8])[0].toFixed(2)}" cy="${at([32, 0, 8])[1].toFixed(2)}"/></g>` });
    turned("risley.ring2", F, [[14, 30], [26, 30]], { tone: "mid" }, { extra: Ln(G.ribsOf(F, 15, 25, 30, 84, P, { seams: true }), { tone: "lo" }) });
    disc("risley.wedge2", F, 26, 26.8, 10, { tone: "hi", lit: true, className: "hd-glass" }, { extra: `<g data-live="mark2"><path class="iso-line hd-wedge" d="${path3([[9, 0, 26.8], [-9, 0, 26.8]])}"/><circle class="hd-mark" r="1.4" cx="${at([-9, 0, 26.8])[0].toFixed(2)}" cy="${at([-9, 0, 26.8])[1].toFixed(2)}"/></g>` });
    box("risley.shim", [32, -26, 0], [60, 30, 2], { tone: "lo" }, { r: 0.6, extra: screws({ x: 32, y: -26, w: 28, d: 56 }, 2, 2.4, 0.45) });
    const m1 = [38 * Math.cos(0.436), 38 * Math.sin(0.436)];
    const m2 = [36 * Math.cos(-0.436), 36 * Math.sin(-0.436)];
    turned("risley.motor1", alongZ(...m1), [[2, 6], [28, 6], [28, 4], [30, 4]], { tone: "mid" }, { extra: Ln(G.ribsOf(alongZ(...m1), 4, 26, 6, 22, P, { seams: true }), { tone: "faint" }) });
    turned("risley.post2", alongZ(...m2), [[2, 3], [14, 3]], { tone: "lo" });
    turned("risley.motor2", alongZ(...m2), [[14, 6], [32, 6], [32, 4], [34, 4]], { tone: "mid" }, { extra: Ln(G.ribsOf(alongZ(...m2), 16, 30, 6, 22, P, { seams: true }), { tone: "faint" }) });
    cable("risley.cable1", [[...m1, 30], [...m1, 38], [72, m1[1], 38], [72, m1[1], 20]], 0.7, { shells: [true, true], bend: 4 });
    cable("risley.cable2", [[...m2, 34], [...m2, 40], [76, m2[1], 40], [76, m2[1], 20]], 0.7, { shells: [true, true], bend: 3 });
  });
  when("scanner:flash", cfg, () => {
    const F = ZF0;
    turned("flash.ring", F, [[2, 30], [10, 30]], { tone: "mid" }, { extra: Dots(G.dotsOf(F, 10, 26, 8, P, { all: true }), { size: 0.5, tone: "lo" }) });
    disc("flash.diffuser", F, 10, 10.8, 12, { tone: "hi", lit: true, className: "hd-frost" });
  });
  // the outgoing beam: rebuilt each frame in the page
  const [tx, y0] = [txOf(CFG.rx), y0Of(CFG.rx)];
  const head = y0 ? [[tx, y0, ZB], [tx, 0, ZB]] : [[tx, 0, ZB]];
  const tail = [...head, matches("scanner:risley", cfg) ? [tx, 0, 26.8] : matches("scanner:flash", cfg) ? [tx, 0, 10.8] : [tx, 0, -4]];
  WHEN = `scanner:${cfg.scanner} rx:${tx ? "biaxial" : "inject|holed"}`;
  beam("beam.out", tail, { live: "out" });
  WHEN = "";
}
// ---------------------------------------------------------------- the detectors, behind the telescope
// the SMA and its coax under the package: inject mode drops at the far wall, holed mode runs back along the PSU's top
function coax(name, z, block = true) {
  const holed = CFG.rx === "holed";
  const xb = CFG.rx === "biaxial" ? BX : 0;
  const [x, y] = holed ? [67, -32] : [xb, -116];
  if (block) box(`${name}.sma`, [x - 2.5, y - 2.5, z - 3], [x + 2.5, y + 2.5, z], { tone: "mid" }, { r: 0.3 });
  const z0 = block ? z - 3 : z;
  const route = holed ? [[x, y, z0], [x, y, 31.5], [x, -116, 31.5], [41, -116, 31.5], [41, -116, 13]] : [[xb, -116, z0], [xb, -116, 24], [41, -116, 24], [41, -116, 13]];
  cable(name, route, 0.8, { shells: [true, true], bend: holed ? 3.5 : 5 });
}
function chip(name, [x0, y0], [x1, y1], h = 1.4, tone = "lo", extra = "") {
  const pins = [];
  for (let x = x0 + 1.2; x < x1 - 0.6; x += 1.6) pins.push(at([x, y1, 9.6 + 0.3]));
  box(name, [x0, y0, 9.6], [x1, y1, 9.6 + h], { tone }, { r: 0.3, extra: Dots(pins, { size: 0.3, tone: "mid" }) + extra });
}
function detectors(cfg) {
  const holed = CFG.rx === "holed";
  const biax = CFG.rx === "biaxial";
  const F = holed ? HOLED.F : biax ? BIAXF : DOWNY;
  const s0 = holed ? 59 : 108;
  const tag = `rx:${CFG.rx}`;
  const optic = (fn) => when(tag, CFG, fn);
  const xc = (det, profile, bore, options = {}) => cut(profile, bore, { det, wall: 0.6, ...options });
  when("detector:discrete", cfg, () => {
    optic(() => {
      turned("det.flange", F, [[s0, 12], [s0 + 4, 12]], { tone: "mid" }, { bevel: 0.3, extra: Dots(G.dotsOf(F, s0 + 4, 10, 4, P, { phase: Math.PI / 4 }), { size: 0.45, tone: "lo" }) + xc("discrete", [[s0, 12], [s0 + 4, 12]], 5.4) });
      turned("det.can", F, [[s0 + 4, 7], [s0 + 12, 7], [s0 + 12, 5], [s0 + 13, 5]], { tone: "hi" }, { extra: Ln(G.arcOf(F, s0 + 10, 7, P), { tone: "mid" }) + xc("discrete", [[s0 + 4, 7], [s0 + 12, 7], [s0 + 12, 5], [s0 + 13, 5]], 6.4) });
      coax("det.coax", ZB - 7);
    });
    chip("det.cfd", [48, -112], [58, -100]);
    chip("det.tdc", [62, -112], [74, -100], 1.6, "mid");
  });
  when("detector:waveform", cfg, () => {
    optic(() => {
      turned("det.flange", F, [[s0, 14], [s0 + 3, 14]], { tone: "mid" }, { bevel: 0.3, extra: Dots(G.dotsOf(F, s0 + 3, 12, 6, P), { size: 0.45, tone: "lo" }) + xc("waveform", [[s0, 14], [s0 + 3, 14]], 4.2) });
      turned("det.body", F, [[s0 + 3, 10], [s0 + 14, 10]], { tone: "hi" }, { extra: Ln(G.ribsOf(F, s0 + 4, s0 + 13, 10, 24, P, { seams: true }), { tone: "faint" }) + xc("waveform", [[s0 + 3, 10], [s0 + 14, 10]], 9) });
      coax("det.coax", ZB - 10);
    });
    chip("det.adc", [48, -114], [60, -100], 1.8, "mid");
    for (let i = 0; i < 4; i++) box(`det.adcfin${i}`, [49 + i * 3, -112, 11.4], [50 + i * 3, -102, 15], { tone: "lo" }, { r: 0 });
    chip("det.fpga", [63, -116], [77, -102], 1.6, "mid");
    for (const x of [50, 58, 66]) chip(`det.ddr${x}`, [x, -80], [x + 6, -75], 1.2);
  });
  when("detector:photon", cfg, () => {
    optic(() => {
      turned("det.flange", F, [[s0, 14], [s0 + 2, 14]], { tone: "mid" }, { bevel: 0.3, extra: Dots(G.dotsOf(F, s0 + 2, 12, 6, P), { size: 0.45, tone: "lo" }) + xc("photon", [[s0, 14], [s0 + 2, 14]], 6) });
      const spad = xc("photon", [[s0 + 2, 0], [s0 + 14, 0]], 99, { square: 12, wall: 1.2 });
      if (holed) {
        box("det.spad", [61, -44, 38], [73, -20, 62], { tone: "hi" }, { r: 0.6, bevel: 0.4, extra: Ln(k.sideSeam({ x: 61, y: -44, w: 12, d: 24, r: 0.6 }, 44, P, 2), { tone: "faint" }) + spad });
        for (let i = 0; i < 6; i++) box(`det.tec${i}`, [63, -42 + i * 4, 62], [71, -40.5 + i * 4, 66], { tone: "lo" }, { r: 0 });
      } else {
        const x0 = biax ? BX : 0;
        box("det.spad", [x0 - 12, -122, 38], [x0 + 12, -110, 62], { tone: "hi" }, { r: 0.6, bevel: 0.4, extra: Ln(k.sideSeam({ x: x0 - 12, y: -122, w: 24, d: 12, r: 0.6 }, 44, P, 2), { tone: "faint" }) + spad });
        for (let i = 0; i < 6; i++) box(`det.tec${i}`, [x0 - 10 + i * 4, -120, 62], [x0 - 8.5 + i * 4, -112, 66], { tone: "lo" }, { r: 0 });
      }
      coax("det.coax", 38, false);
    });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) chip(`det.tdc${i}${j}`, [48 + i * 9, -114 + j * 8], [55 + i * 9, -108 + j * 8], 1.2, j ? "lo" : "mid");
  });
}

// ---------------------------------------------------------------- configurations: one per scanner variant, lasers and detectors cycled through them
const SCAN_CFGS = [
  { scanner: "galvo" },
  ...[3, 4, 5, 6, 7, 8].map((facets) => ({ scanner: "polygon", facets })),
  { scanner: "palmer" },
  { scanner: "risley" },
  { scanner: "flash" },
];
const LASER_IDS = ["yag", "fibre", "green", "diode"];
const DET_IDS = ["discrete", "waveform", "photon"];
export const CONFIGS = [];
for (const rx of ["inject", "holed", "biaxial"])
  SCAN_CFGS.forEach((s, i) => {
    for (let j = 0; j < 3; j++) CONFIGS.push({ facets: 4, ...s, laser: LASER_IDS[(i + j) % LASER_IDS.length], detector: DET_IDS[(i + 2 * j) % 3], rx });
  });
const tagOf = (cfg) => `${cfg.scanner}${cfg.scanner === "polygon" ? cfg.facets : ""}/${cfg.laser}/${cfg.detector}/${cfg.rx}`;

export function define(cfg) {
  R = A.recorder(P);
  WHEN = "";
  CFG = { rx: "inject", nav: "ins", ...cfg };
  SECTION = [];
  bench();
  lasers(cfg);
  scanners(cfg);
  detectors(cfg);
  R.section = SECTION;
  return R;
}
const idOf = (item) => `${item.name}|${item.when || ""}`;
const EXTRA = [];
export function orderAll(configs = CONFIGS, { log = false } = {}) {
  const all = new Map();
  const edges = new Map();
  const per = [];
  for (const cfg of configs) {
    const started = Date.now();
    const R = define(cfg);
    R.items.forEach((item) => (item.base = item.key));
    A.settle(R, P);
    const { pairs, least } = R.settled.overlaps;
    let cycles = 0;
    for (const pair of pairs) {
      const aFront = pair.front[0].area >= least;
      const bFront = pair.front[1].area >= least;
      if (aFront && bFront) {
        cycles++;
        continue;
      }
      const [front, back] = aFront ? [pair.a, pair.b] : [pair.b, pair.a];
      const id = `${idOf(R.items[back])}>${idOf(R.items[front])}`;
      const weight = pair.front[aFront ? 0 : 1].area;
      edges.set(id, Math.max(edges.get(id) ?? 0, weight));
    }
    R.items.forEach((item) => {
      const id = idOf(item);
      if (!all.has(id)) all.set(id, item);
    });
    for (const [back, front] of EXTRA) {
      const b = R.items.find((item) => item.name === back);
      const f = R.items.find((item) => item.name === front);
      if (b && f) edges.set(`${idOf(b)}>${idOf(f)}`, 1e9);
    }
    per.push({ cfg, R, cycles });
    if (log) console.log(`settle ${tagOf(cfg)}: ${R.items.length} items · ${pairs.length} overlaps · ${cycles} cycles · ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  // Kahn's sort over the union of rules, ties broken by true depth at rest
  const ids = [...all.keys()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const outs = ids.map(() => []);
  const ins = ids.map(() => 0);
  const list = [...edges.entries()].map(([id, weight]) => {
    const [b, f] = id.split(">");
    return { b: index.get(b), f: index.get(f), weight, on: true };
  });
  list.forEach((edge) => (outs[edge.b].push(edge), ins[edge.f]++));
  const base = ids.map((id) => all.get(id).base);
  const order = [];
  const done = ids.map(() => false);
  const broken = [];
  while (order.length < ids.length) {
    let pick = -1;
    for (let i = 0; i < ids.length; i++) if (!done[i] && ins[i] === 0 && (pick < 0 || base[i] < base[pick])) pick = i;
    if (pick < 0) {
      // a cycle in the union: drop the weakest live edge into the shallowest blocked item
      const live = list.filter((edge) => edge.on && !done[edge.b] && !done[edge.f]);
      const victim = live.reduce((low, edge) => (edge.weight < low.weight ? edge : low));
      victim.on = false;
      ins[victim.f]--;
      broken.push(`${ids[victim.b]} > ${ids[victim.f]} (${victim.weight.toFixed(2)})`);
      continue;
    }
    done[pick] = true;
    order.push(pick);
    for (const edge of outs[pick]) if (edge.on) ins[edge.f]--;
  }
  const rank = new Map(order.map((i, r) => [ids[i], r]));
  if (log) console.log(`order: ${ids.length} items · ${list.length} rules · ${broken.length} broken${broken.length ? "\n  " + broken.join("\n  ") : ""}`);
  return { items: order.map((i) => all.get(ids[i])), rank, per, broken };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const only = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
  const configs = only ? CONFIGS.filter((cfg) => tagOf(cfg).includes(only)) : CONFIGS;
  const { per, rank, broken } = orderAll(configs, { log: true });
  if (process.argv.includes("--audit")) {
    let failed = broken.length;
    for (const { cfg, R } of per) {
      R.settled.items.forEach((item) => (item.key = rank.get(idOf(item))));
      console.log(`\n=== ${tagOf(cfg)}`);
      A.auditOrExit(R, P);
      if (process.exitCode) failed++, (process.exitCode = 0);
    }
    console.log(failed ? `\nhead audit failed in ${failed} configuration${failed === 1 ? "" : "s"}` : "\nhead audit passed");
    if (failed) process.exitCode = 1;
  }
}
// ---------------------------------------------------------------- each scanner alone, for the guide's table
// the same parts, camera and depth rules as the figure, without the bench, the drive box or its cables
export const THUMB_CFGS = { galvo: { scanner: "galvo" }, polygon: { scanner: "polygon", facets: 6 }, palmer: { scanner: "palmer" }, risley: { scanner: "risley" }, flash: { scanner: "flash" } };
export function thumbRecorder(id) {
  R = A.recorder(P);
  WHEN = "";
  CFG = { rx: "inject", ...THUMB_CFGS[id] };
  SECTION = [];
  scanners(CFG);
  return R;
}
export function scannerThumbs() {
  const pad = 3;
  const drawn = Object.keys(THUMB_CFGS).map((id) => {
    const R = thumbRecorder(id);
    A.settle(R, P);
    const items = R.settled.items.filter((item) => !/\.cable/.test(item.name)).sort((a, b) => a.key - b.key);
    const boxes = items.map((item) => A.markupBox(item.svg)).filter(Boolean);
    const box = [0, 1, 2, 3].map((i) => (i < 2 ? Math.min : Math.max)(...boxes.map((b) => b[i])));
    const body = items
      .map((item) => `<g>${item.svg}</g>`)
      .join("")
      .replace(/ data-live="[^"]*"/g, "")
      .replace(/iso-line ln-beam hd-beam/g, "iso-line gd-scan-beam");
    return { id, box, body };
  });
  // each cropped to itself, all drawn at one scale: the widest is 150 px across
  const scale = 104 / Math.max(...drawn.map(({ box }) => box[2] - box[0] + 2 * pad));
  return Object.fromEntries(
    drawn.map(({ id, box, body }) => {
      const [x0, y0, w, h] = [box[0] - pad, box[1] - pad, box[2] - box[0] + 2 * pad, box[3] - box[1] + 2 * pad];
      return [id, `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg gd-scan-svg" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" style="width:${(w * scale).toFixed(0)}px" aria-hidden="true">${body}</svg>`];
    }),
  );
}
// ---------------------------------------------------------------- the page: every item of every configuration, in one order
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
function cachedOrder() {
  const hash = createHash("sha1").update(["head-build.mjs", "head-parts.mjs", "parts.mjs"].map((f) => readFileSync(join(HERE, f), "utf8").split("// ---------------------------------------------------------------- each scanner alone")[0]).join("|")).digest("hex");
  const file = join(HERE, ".head-order.json");
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    if (saved.hash === hash) return new Map(saved.rank);
  }
  const { rank } = orderAll(CONFIGS, { log: true });
  writeFileSync(file, JSON.stringify({ hash, rank: [...rank] }));
  return rank;
}
// the settings, in four groups; each scanner's own settings sit in a panel nested under the scanner choice
const SCANNER = { key: "scanner", label: "Scanner", options: [["galvo", "Galvo"], ["polygon", "Polygon"], ["palmer", "Palmer"], ["risley", "Risley"], ["flash", "Flash"]] };
const SUB = [
  { key: "facets", label: "Facets", options: [3, 4, 5, 6, 7, 8].map((n) => [n, String(n)]), only: "scanner:polygon" },
  // scan frequency: what one turn or swing means differs by scanner, so each offers its own real range
  ...["galvo", "polygon", "palmer"].map((id) => ({ key: "rate", label: "Scan freq", unit: HMS[id].unit === "Hz" ? "Hz" : "rev/s", options: HMS[id].rates.map((f) => [f, String(f)]), only: `scanner:${id}` })),
];
const GROUPS = [
  { title: "Laser", rows: [{ key: "laser", label: "Wavelength", options: [["yag", "1064 nm"], ["fibre", "1550 nm"], ["green", "532 nm"], ["diode", "905 nm"]] }, { key: "prf", label: "Pulse rate (PRF)", options: [[100e3, "100k"], [250e3, "250k"], [500e3, "500k"], [1e6, "1M"], [2e6, "2M"], [4e6, "4M"]] }] },
  { title: "Receiver", rows: [{ key: "detector", label: "Detection", options: [["discrete", "Discrete"], ["waveform", "Waveform"], ["photon", "Photon"]] }, { key: "rx", label: "Optical layout", options: [["inject", "Injection"], ["holed", "Holed"], ["biaxial", "Biaxial"]] }] },
  { title: "Navigation", rows: [{ key: "nav", label: "Position and attitude", options: [["ins", "GNSS + IMU"], ["gnss", "GNSS only"], ["none", "None"]] }] },
];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const segOf = (b) => `<div class="hd-seg" role="radiogroup" aria-label="${esc(b.label)}" data-key="${b.key}">${b.options.map(([v, l]) => `<button type="button" role="radio" data-value="${esc(v)}">${l}</button>`).join("")}</div>`;
const controlsHtml = () => {
  const sub = SUB.map((b) => `<div class="hd-row" data-only="${b.only}"><span class="hd-row-label">${b.label}</span>${segOf(b)}${b.unit ? `<span class="hd-unit">${b.unit}</span>` : ""}</div>`).join("");
  // the Risley pair: each prism's own speed (the second signed, against the first's direction) and the phase between them
  const slide = (key, label, min, max, step, value, aria, unit = "") => `<div class="hd-row" data-only="scanner:risley"><span class="hd-row-label">${label}</span><input class="hd-phase" data-slide="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${aria}"><output class="hd-phase-out" data-out="${key}"></output>${unit ? `<span class="hd-unit">${unit}</span>` : ""}</div>`;
  const r = HMS.risley.rate;
  const phase = slide("rate1", "Prism 1", 1, 40, 1, r, "First prism speed, turns a second", "rev/s") + slide("rate2", "Prism 2", -40, 40, 1, -r, "Second prism speed, turns a second; negative turns the other way", "rev/s") + slide("phase", "Phase", 0, 360, 5, 0, "Second prism phase, degrees", "deg");
  const flash = `<div class="hd-row hd-sub-note" data-only="scanner:flash">No moving scanner: each pulse lights a whole ${HMS.flash.grid}×${HMS.flash.grid} frame.</div>`;
  const scanner = `<div class="hd-group hd-group-scan" role="group" aria-label="Scanner"><div class="hd-group-title">Scanner</div>${segOf(SCANNER)}<div class="hd-sub"><div class="hd-sub-title" data-part="sub-title"></div>${sub}${phase}${flash}</div></div>`;
  const rest = GROUPS.map((g) => `<div class="hd-group" role="group" aria-label="${g.title}"><div class="hd-group-title">${g.title}</div>${g.rows.map((b) => `<div class="hd-field"><span class="hd-field-label">${b.label}</span>${segOf(b)}</div>`).join("")}</div>`).join("");
  return `<div class="hd-controls">${scanner}${rest}</div>`;
};
export function buildHead() {
  const rank = cachedOrder();
  const items = new Map();
  for (const cfg of CONFIGS) for (const item of define(cfg).items) if (!items.has(idOf(item))) items.set(idOf(item), item);
  const missing = [...items.keys()].filter((id) => !rank.has(id));
  if (missing.length) throw new Error(`no order for ${missing.join(", ")}`);
  const sorted = [...items.values()].sort((a, b) => rank.get(idOf(a)) - rank.get(idOf(b)));
  // one section per design and receiver, slotted right after the last part on its receive path
  const PATH = /^(scope\.(tube|ring\d|mid|rear)|det\.(flange|can|body|spad|tec\d))$/;
  const after = new Map();
  for (const cfg of CONFIGS) {
    const full = { rx: "inject", ...cfg };
    const tag = `rx:${full.rx} detector:${full.detector}`;
    if (after.has(tag)) continue;
    const parts = define(cfg).section;
    const last = sorted.reduce((m, item, i) => (PATH.test(item.name) && matches(item.when, full) ? i : m), -1);
    after.set(tag, { at: last, svg: sectionOf(full.rx, full.detector, parts, `hd-sec-${full.rx}-${full.detector}`) });
  }
  const front = sorted.map((item, i) => {
    const g = `<g class="it"${item.when ? ` data-when="${item.when}"` : ""} data-name="${item.name}">${item.svg}</g>`;
    return g + [...after].filter(([, s]) => s.at === i).map(([tag, s]) => `<g class="it hd-sec" data-when="${tag}">${s.svg}</g>`).join("");
  }).join("");
  const { cx, cy, r } = LOUPE;
  const clip = `<clipPath id="hd-clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`;
  const backSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg hd-layer hd-back" viewBox="0 0 ${HW} ${HH}" role="img" aria-label="A close-up through a magnifying loupe of the lidar head on its optical bench: laser, beam expander, injection mirror, the scanner, the receiving telescope and its detector, the IMU bolted beside them, the receiver board with its GNSS time input and the power supply, over the window in the floor of the box."><circle class="hd-lens" cx="${cx}" cy="${cy}" r="${r}"/>${Ln(Array.from({ length: 11 }, (_, i) => {
    const y = cy - r + (i + 0.5) * ((2 * r) / 11);
    const half = Math.sqrt(r * r - (y - cy) * (y - cy));
    return `M${(cx - half).toFixed(1)} ${y.toFixed(1)}H${(cx + half).toFixed(1)}`;
  }).join(""), { tone: "faint", className: "hd-grid" })}</svg>`;
  const hatch = `<pattern id="hd-hatch" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path class="hd-hatch-ln" d="M0 0V2.4"/></pattern>`;
  const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg hd-layer hd-front" viewBox="0 0 ${HW} ${HH}" aria-hidden="true"><defs>${clip}${hatch}</defs><g clip-path="url(#hd-clip)">${front}</g></svg>`;
  // the loupe's bezel: a knurled ring, a glint, and the magnification engraved on it
  const ticks = Array.from({ length: 120 }, (_, i) => {
    const a = (i / 120) * 2 * Math.PI;
    const r0 = r + 3;
    const r1 = r + (i % 10 ? 7 : 10);
    return `M${(cx + r0 * Math.cos(a)).toFixed(1)} ${(cy + r0 * Math.sin(a)).toFixed(1)}L${(cx + r1 * Math.cos(a)).toFixed(1)} ${(cy + r1 * Math.sin(a)).toFixed(1)}`;
  }).join("");
  // the glint is a highlight on the bezel's inner bevel, not on the glass
  const rg = r + 2.5;
  const pg = (deg) => `${(cx + rg * Math.cos((deg * Math.PI) / 180)).toFixed(1)} ${(cy + rg * Math.sin((deg * Math.PI) / 180)).toFixed(1)}`;
  const glint = `M${pg(200)}A${rg} ${rg} 0 0 1 ${pg(250)}`;
  const bezel = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg hd-layer hd-bezel" viewBox="0 0 ${HW} ${HH}" aria-hidden="true"><circle class="hd-rim" cx="${cx}" cy="${cy}" r="${r + 6.5}"/><path class="hd-knurl" d="${ticks}"/><circle class="hd-rim-in" cx="${cx}" cy="${cy}" r="${r}"/><path class="hd-glint" d="${glint}"/><text class="hd-mag" x="${cx}" y="${(cy + r + 24).toFixed(1)}" text-anchor="middle" data-part="mag">A</text></svg>`;
  const stage = `<div class="iso-stage hd-stage" tabindex="0" role="group" aria-label="The lidar head, magnified. Choose a scanner, laser, pulse rate, receiver and navigation with the settings below; the scope shows what the last pulse hit on the map; click or press Space to pause."><span class="hd-said" aria-live="polite"></span>${backSvg}<canvas class="hd-layer hd-gl" aria-hidden="true"></canvas>${frontSvg}${bezel}<div class="hd-paused" aria-hidden="true"><b>Simulation paused</b><span>click or Space to resume</span></div></div>`;
  const controls = controlsHtml();
  const side = `<div class="hd-side"><div class="hd-panel"><div class="hd-panel-head"><span>Scan pattern, top-down</span><span data-part="map-note"></span></div><canvas class="hd-map" width="400" height="448" aria-label="Top-down view: the aircraft and the pattern its scanner draws on the ground"></canvas></div><div class="hd-panel"><div class="hd-panel-head"><span class="hd-rx-title">Receiver<svg class="hd-xhair" viewBox="0 0 13 13" width="13" height="13" role="img" aria-label="returns from the crosshair on the map"><title>Returns from the crosshair on the map</title><path d="M0.5 6.5h3.5M9 6.5h3.5M6.5 0.5v3.5M6.5 9v3.5"/></svg></span><span data-part="scope-note"></span></div><canvas class="hd-scope" width="400" height="182" aria-label="The detector's signal for one pulse"></canvas></div></div>`;
  const DATA = {
    W: HW,
    H: HH,
    P,
    V,
    camera: glCamera(P),
    loupe: LOUPE,
    zb: ZB,
    ly: LY,
    fan: FAN,
    port: PORT,
    palmerAxis: PALMER_AXIS,
    risley: { r1: 32, r2: 30, z1: 8, z2: 26.8 },
    holed: { c: HOLED.c, a: HOLED.a, b: HOLED.b, hole: HOLED.hole },
    // where the zoom ring looks first: the middle of each design's receive path
    focus: { holed: at([42, -32, ZB]), inject: at([0, -88, ZB]), biaxial: at([BX, -88, ZB]) },
    // where the pulse meets the scan element, and where the incoming beam hands over to the live one
    tx: { inject: [0, 0], holed: [0, 0], biaxial: [TXB, y0Of("biaxial")] },
  };
  return { stage, controls, side, DATA, items: sorted.length };
}
