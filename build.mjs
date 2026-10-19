import { homedir } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LIDAR, SCENE, planesOf, returnsOf, angleAt, readoutOf, timeAt } from "./model.mjs";
import { prismPaths as prismWith, mirrorPoly, MIRROR } from "./parts.mjs";
import { buildHead, scannerThumbs } from "./head-build.mjs";
import * as HMOD from "./head-model.mjs";
import { guideHtml } from "./guide.mjs";
import { calHtml, CP } from "./cal-build.mjs";
import * as CALMOD from "./cal-model.mjs";
import * as CALPARTS from "./cal-parts.mjs";

// the anatomy skill, whose kit the build imports and inlines
const SKILL = process.env.ANATOMY_SKILL ?? `${homedir()}/.agents/skills/anatomy`;
const k = await import(pathToFileURL(`${SKILL}/kit/iso-kit.mjs`).href);
const G = await import(pathToFileURL(`${SKILL}/kit/lathe.mjs`).href);
const { tubePieces, tubeSvg } = await import(pathToFileURL(`${SKILL}/kit/tube.mjs`).href);
const A = await import(pathToFileURL(`${SKILL}/kit/audit.mjs`).href);
const { glCamera } = await import(pathToFileURL(`${SKILL}/kit/gl.mjs`).href);
const { kitScript, glScript } = await import(pathToFileURL(`${SKILL}/scripts/inline-kit.mjs`).href);

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

const W = 720;
const H = 700;
const AZIMUTH = 58;
const ELEVATION = 32;
const TILE = SCENE.tile;
const SOIL = 16;
const FOOT = 5;
const FROM = LIDAR.vis.from;
const TO = LIDAR.vis.to;
const CRAFT = { x0: -96, x1: 76 };
// the fuselage section: a round hull about the axis y = 0, z = zc; angles in degrees from +y (near) towards +z (up)
const HULL = { zc: 226, ri: 74, ro: 78, skin: 0.6, top: 110, near: 340.5, far: 285 };
const yzOf = (r, deg) => [r * Math.cos((deg * Math.PI) / 180), HULL.zc + r * Math.sin((deg * Math.PI) / 180)];

const P = k.fitProjection(
  [
    ...k.boxCorners(TILE, -SOIL - FOOT, 0),
    ...[FROM, TO].flatMap((dx) => [
      ...Array.from({ length: 37 }, (_, i) => [CRAFT.x0 + dx, ...yzOf(HULL.ro + HULL.skin, i * 10)]),
      ...Array.from({ length: 25 }, (_, i) => [CRAFT.x1 + dx, ...yzOf(HULL.ro + HULL.skin, HULL.top + ((HULL.near - HULL.top) * i) / 24)]),
    ]),
  ],
  W,
  H,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const f2 = (v) => Math.round(v * 100) / 100;
const ctx = { at, pathOf: k.pathOf, toneOf: G.toneOf, V, P };
const prismPaths = (F, poly, s0, s1) => prismWith(F, poly, s0, s1, ctx);
const XF = G.frameOf([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const YF = G.frameOf([0, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
const ZF = G.frameOf([0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const facing = (n) => G.dot3(n, V) > 0.02;

// ---------------------------------------------------------------- back layer: the ground tile
const back = [];
const byDepth = (list, of) => [...list].sort((a, b) => k.depthOf(of(a), P) - k.depthOf(of(b), P));
back.push(`<path class="iso-halo" d="${k.haloOf(TILE, -SOIL - FOOT, SOIL, P)}"/>`);
for (const [x, y] of byDepth(k.corners(TILE, 22), ([x, y]) => [x, y, 0])) {
  back.push(S(k.cylinder(x, y, 8, -SOIL - FOOT, 1.8, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 6, -SOIL - FOOT + 1.8, FOOT - 1.8, P, 28), { tone: "mid" }));
}
back.push(`<g data-thing="ground">` + S(k.slabOf(TILE, -SOIL, SOIL, P, 8, 1.4), { tone: "lo", inner: Ln(k.sideSeam(TILE, -4, P, 8) + k.sideSeam(TILE, -10, P, 8), { tone: "faint" }) }) + `</g>`);

// field on the near side, its furrows end on the field's edge
const FIELD = { x: -34, y: 58, w: 84, d: 24 };
back.push(`<g data-thing="field">`, S(k.slabOf({ ...FIELD, r: 0 }, 0, 0.3, P, 2), { tone: "lo", flat: true, crease: "none" }));
back.push(Ln(Array.from({ length: 10 }, (_, i) => FIELD.y + 2.2 + i * 2.2).map((y) => k.lineOnTop([FIELD.x, y], [FIELD.x + FIELD.w, y], 0.3, P)).join(""), { tone: "faint" }));
back.push(Ln(k.planOutline({ ...FIELD, r: 0 }, 0.3, P, 2), { tone: "lo" }), `</g>`);

// the ruler: 1 m = 1/unit world units, minor tick every 2 m, major every 10 m
const M = 1 / LIDAR.unit;
const STRIP = { x: -96, y: 86, w: 100 * M + 8, d: 6, r: 1 };
back.push(`<g data-thing="ruler">`, S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
{
  const ticks = k.topTicks(0, 100 * M + 1e-6, 2 * M, 5, STRIP.y, 0.6, [1.8, 3.6], P);
  const shift = (d) => d.replace(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g, (_, a, b, c, e) => {
    const [dx, dy] = k.axisVector(P, [STRIP.x + 4, 0, 0]);
    return `M${f2(+a + dx)} ${f2(+b + dy)}L${f2(+c + dx)} ${f2(+e + dy)}`;
  });
  back.push(Ln(shift(ticks.minor), { tone: "lo" }), Ln(shift(ticks.major), { tone: "mid" }), `</g>`);
}
const LABEL = { x: 98, y: 62, w: 24, d: 22, r: 1.2 };
back.push(`<g data-thing="label">`, S(k.slabOf(LABEL, 0, 0.6, P, 3, 0.2), { tone: "lo" }));
back.push(Ln([0, 1, 2].map((i) => k.lineOnTop([LABEL.x + 4, LABEL.y + 6 + i * 5], [LABEL.x + LABEL.w - 4 - (i === 2 ? 6 : 0), LABEL.y + 6 + i * 5], 0.6, P)).join(""), { tone: "lo", free: true }));
back.push(Dots(k.corners(LABEL, 2).map(([x, y]) => at([x, y, 0.6])), { size: 0.45, tone: "lo" }), `</g>`);

// road along the flight line, with its centre dashes and a driveway to the house
const ROAD = { x: TILE.x + 0.6, y: SCENE.road.y0, w: TILE.w - 1.2, d: SCENE.road.y1 - SCENE.road.y0, r: 0 };
back.push(`<g data-thing="road">`, S(k.slabOf(ROAD, 0, 0.25, P, 2), { tone: "mid", flat: true }));
back.push(S(k.slabOf({ x: -20, y: -24, w: 8, d: 17, r: 0 }, 0, 0.25, P, 2), { tone: "mid", flat: true }));
back.push(Ln(Array.from({ length: 18 }, (_, i) => TILE.x + 8 + i * 14.4).map((x) => k.pathOf([[x, -0.45], [x + 7, -0.45], [x + 7, 0.45], [x, 0.45]].map(([a, b]) => at([a, b, 0.25])), true)).join(""), { tone: "lo" }));
back.push(Ln(k.lineOnTop([ROAD.x, ROAD.y + 1.6], [ROAD.x + ROAD.w, ROAD.y + 1.6], 0.25, P) + k.lineOnTop([ROAD.x, ROAD.y + ROAD.d - 1.6], [ROAD.x + ROAD.w, ROAD.y + ROAD.d - 1.6], 0.25, P), { tone: "faint" }), `</g>`);

// the fallback point cloud (shown when WebGL is off): a sparse set of the real hits
const FALLBACK = (() => {
  const hits = [];
  for (let t = 0; xAt(t) <= 30; t += LIDAR.vis.pulse * 3) {
    const x = FROM + LIDAR.vis.speed * t;
    for (const r of returnsOf(x, angleAt(t))) if (facing(r.n)) hits.push(r);
  }
  return hits;
})();
function xAt(t) {
  return FROM + LIDAR.vis.speed * t;
}
const cloudDots = (list) => list.length ? `<g class="ln-fallback">${Dots(list.map((r) => at(r.p)), { size: 0.75, tone: "hi" })}</g>` : "";
back.push(cloudDots(FALLBACK.filter((r) => r.owner === "ground")));

// buildings and trees, back to front
const things = [
  ...SCENE.buildings.map((b, index) => ({ kind: "b", b, index, c: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 0] })),
  ...SCENE.trees.map((t, index) => ({ kind: "t", t, index, c: [t.x, t.y, 0] })),
  { kind: "g", index: 0, c: [-118, 36, 0] },
];
for (const thing of byDepth(things, (it) => it.c)) {
  const owner = `${thing.kind}${thing.index}`;
  if (thing.kind === "b") {
    const b = thing.b;
    const { low } = planesOf(b);
    const o = b.over;
    const ym = (b.y0 + b.y1) / 2;
    const out = [];
    out.push(S(k.slabOf({ x: b.x0, y: b.y0, w: b.x1 - b.x0, d: b.y1 - b.y0, r: 0 }, 0, b.eave, P, 2), { tone: "mid" }));
    const lines = [];
    // door and windows on the near long wall (y1) and the near gable (x1): closed rectangles
    const onY = (x0, x1, z0, z1) => path3([[x0, b.y1, z0], [x1, b.y1, z0], [x1, b.y1, z1], [x0, b.y1, z1]], true);
    const onX = (y0, y1, z0, z1) => path3([[b.x1, y0, z0], [b.x1, y1, z0], [b.x1, y1, z1], [b.x1, y0, z1]], true);
    const len = b.x1 - b.x0;
    if (thing.index === 0) {
      lines.push(onY(-17, -13, 0, 7));
      for (const x of [b.x0 + 4, b.x0 + 11, b.x1 - 8]) lines.push(onY(x, x + 4, 4, 8));
      lines.push(onX(b.y0 + 4, b.y0 + 9, 4, 8), onX(b.y1 - 9, b.y1 - 4, 4, 8));
    } else {
      lines.push(onY(b.x0 + 2, b.x0 + len * 0.62, 0, 5));
      lines.push(onX(b.y0 + 3, b.y1 - 3, 2.5, 4.5));
    }
    out.push(Ln(lines.join(""), { tone: "lo" }));
    const roofPoly = [[b.y0 - o, low], [b.y1 + o, low], [ym, b.ridge]];
    out.push(S(prismPaths(XF, roofPoly, b.x0 - o, b.x1 + o), { tone: "mid" }));
    // roof courses run parallel to the ridge across the near slope, end to end
    const courses = [];
    for (let f = 0.2; f < 0.95; f += 0.2) {
      const y = b.y1 + o + (ym - b.y1 - o) * f;
      const z = low + (b.ridge - low) * f;
      courses.push(path3([[b.x0 - o, y, z], [b.x1 + o, y, z]]));
    }
    out.push(Ln(courses.join(""), { tone: "faint" }));
    out.push(cloudDots(FALLBACK.filter((r) => r.owner === owner)));
    back.push(`<g data-thing="${owner}">${out.join("")}</g>`);
  } else if (thing.kind === "g") {
    // GNSS base station: a survey tripod over a ground mark, a choke-ring antenna and its receiver case
    const [gx, gy] = thing.c;
    const out = [];
    out.push(Ln(k.ring(gx, gy, 0.9, 0, P, 16), { tone: "lo" }) + Dots([at([gx, gy, 0])], { size: 0.4, tone: "mid" }));
    const legs = [0.5, 2.6, 4.7].map((a) => {
      const foot = [gx + 7 * Math.cos(a), gy + 7 * Math.sin(a), 0];
      const top = [gx + 1.4 * Math.cos(a), gy + 1.4 * Math.sin(a), 11.2];
      return { foot, top, a };
    });
    const leg = ({ foot, top }) => {
      const axis = G.unit3([top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]]);
      const length = Math.hypot(top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]);
      const F = G.frameAlong(foot, axis);
      return S(G.solidOf([[0, 0.5], [length * 0.55, 0.5], [length * 0.55, 0.38], [length, 0.38]], F, P, { steps: 10 }), { tone: "lo" }) + Dots([at(foot)], { size: 0.45, tone: "lo" });
    };
    const behind = (l) => G.dot3([Math.cos(l.a), Math.sin(l.a), 0], V) < 0;
    for (const l of byDepth(legs.filter(behind), (l) => l.foot)) out.push(leg(l));
    const Z = G.frameAlong([gx, gy, 0], [0, 0, 1]);
    out.push(S(G.disc(11.2, 12.2, 2.3, Z, P, { steps: 24, bevel: 0.15 }), { tone: "mid" }));
    for (const l of byDepth(legs.filter((l) => !behind(l)), (l) => l.foot)) out.push(leg(l));
    out.push(S(G.disc(12.2, 13.1, 1.7, Z, P, { steps: 20 }), { tone: "lo" }));
    out.push(S(G.disc(13.1, 15.8, 0.5, Z, P, { steps: 10 }), { tone: "mid" }));
    out.push(S(G.solidOf([[15.8, 4.6], [17.3, 4.6], [17.3, 3.7]], Z, P, { steps: 32, bevel: 0.15 }), { tone: "lo", inner: Ln(k.ring(gx, gy, 4.15, 17.3, P, 40), { tone: "faint" }) }));
    out.push(S(G.solidOf([[17.3, 3.7], [18.2, 3.45, 1], [19.2, 2.6, 1], [19.75, 1.3, 1], [19.9, 0, 1]], Z, P, { steps: 32 }), { tone: "hi" }));
    back.push(`<g data-thing="gnss">${out.join("")}</g>`);
  } else {
    const t = thing.t;
    const out = [];
    out.push(S(k.cylinder(t.x, t.y, t.trunk, 0, t.cz - t.r * 0.6, P, 16), { tone: "lo" }));
    out.push(S(G.sphereOf([t.x, t.y, t.cz], t.r, P, { steps: 36 }), { tone: "mid" }));
    out.push(cloudDots(FALLBACK.filter((r) => r.owner === owner)));
    back.push(`<g data-thing="${owner}">${out.join("")}</g>`);
  }
}

// ---------------------------------------------------------------- front layer: the aircraft floor and the sensor
const R = A.recorder(P);
const record = R.solid;
function put(name, ref, svg, shapes = [], { bias = 0, ...rest } = {}) {
  return R.put({ name, at: ref, bias, svg, shapes, piece: "craft", ...rest });
}
function box(name, [x0, y0, z0], [x1, y1, z1], style = {}, { r = 0.4, steps = 2, bevel = 0, extra = "", inner = "", bias = 0, ground = false } = {}) {
  const plan = { x: x0, y: y0, w: x1 - x0, d: y1 - y0, r };
  const shape = record(A.slab(plan, z0, z1 - z0, { name, ground }, steps));
  put(name, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], S(k.slabOf(plan, z0, z1 - z0, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function prism(name, F, poly, s0, s1, style = {}, { extra = "", inner = "", bias = 0, ground = false } = {}) {
  const shape = record(A.prism(F, poly, s0, s1, { name, ground }));
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const centre = G.add3(G.add3(G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  put(name, centre, S(prismPaths(F, poly, s0, s1), { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
function turned(name, F, profile, style = {}, { extra = "", inner = "", bias = 0, steps, bevel = 0 } = {}) {
  const paths = G.solidOf(profile, F, P, { bevel, ...(steps ? { steps } : {}) });
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const shape = record(A.solid(F, profile, { name }));
  put(name, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "mid", ...style, inner }) + extra, [shape], { bias });
  return shape;
}
const disc = (name, F, s0, s1, r, style = {}, options = {}) => turned(name, F, [[s0, r], [s1, r]], style, options);
function ring(name, F, s0, s1, rIn, rOut, style = {}, { extra = "", bias = 0, steps } = {}) {
  const shape = record(A.ring(F, s0, s1, rIn, rOut, { name }));
  put(name, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), S(G.ringBand(s0, s1, rIn, rOut, F, P, steps ? { steps } : {}), { tone: "mid", ...style }) + extra, [shape], { bias });
  return shape;
}
const alongX = (y, z) => G.frameOf([0, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const alongY = (x, z) => G.frameOf([x, 0, z], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
const alongZ = (x, y) => G.frameOf([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
function planeMatrix(o, ex, ey) {
  const p0 = at(o);
  const px = at(G.add3(o, ex));
  const py = at(G.add3(o, ey));
  const v = (x) => x.toFixed(4);
  return `matrix(${v(px[0] - p0[0])} ${v(px[1] - p0[1])} ${v(py[0] - p0[0])} ${v(py[1] - p0[1])} ${p0[0].toFixed(2)} ${p0[1].toFixed(2)})`;
}

const CABLES = [];
function cable(name, points, r = 0.5, { tone = "mid", bend = 3, ends = [true, true], shells = [false, false], maxLength = 14, bias = 0.05 } = {}) {
  const route = G.fillet(points, Math.max(bend, r * 2.6), 10, { P, tube: r });
  const total = G.pathLength(route);
  const SHELL = Math.max(1.6, r * 2.4);
  const gaps = [...(shells[0] ? [[0, SHELL]] : []), ...(shells[1] ? [[total - SHELL, total]] : [])];
  R.route(name, route, r, { gaps, limp: true, rims: shells.map((on) => (on ? r * 1.9 : r)), piece: "craft" });
  CABLES.push(name);
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

// fuselage section: C-shaped frames where the skin is cut away, a full ring at the far end (a full ring at the near
// end would cross in front of the head), floor beams, the cabin floor, seat tracks and the near belly skin up to its
// cut. The far wall with its windows is in the back layer.
const { zc: ZC, ri: RI, ro: RO, skin: SKIN_T } = HULL;
const FZ = 192;
const STATIONS = [-94.4, -57, -19, 19, 57, 74.4];
const bandPoly = (r0, r1, d0, d1) => [yzOf(r0, d0), yzOf(r1, d0), yzOf(r1, d1), yzOf(r0, d1)];
for (const fx of STATIONS) {
  const end = fx === STATIONS[0];
  const [d0, d1, n] = end ? [HULL.near - 360, HULL.near, 32] : [HULL.top, HULL.near, 20];
  for (let i = 0; i < n; i++) {
    const a0 = d0 + ((d1 - d0) * i) / n;
    const a1 = d0 + ((d1 - d0) * (i + 1)) / n;
    const [ry, rz] = yzOf((RI + RO) / 2, (a0 + a1) / 2);
    prism(`frame${fx}.${i}`, XF, bandPoly(RI, RO, a0, a1), fx - 1.6, fx + 1.6, { tone: "lo" }, { extra: Dots([at([fx + 1.6, ry, rz])], { size: 0.45, tone: "lo" }), ground: true });
  }
  box(`floor.beam${fx}`, [fx - 1.6, -60, FZ - 8], [fx + 1.6, 60, FZ - 2], { tone: "lo" }, { r: 0, ground: true });
}
{
  const N = 8;
  const seam = 322;
  for (let i = 0; i < N; i++) {
    const a0 = 270 + ((HULL.near - 270) * i) / N;
    const a1 = 270 + ((HULL.near - 270) * (i + 1)) / N;
    const am = (a0 + a1) / 2;
    const n = [0, Math.cos((am * Math.PI) / 180), Math.sin((am * Math.PI) / 180)];
    const rim = (x, deg) => at([x, ...yzOf(RO + SKIN_T, deg)]);
    let extra = "";
    if (facing(n)) {
      extra += Dots(STATIONS.map((x) => rim(Math.min(CRAFT.x1 - 0.8, Math.max(CRAFT.x0 + 0.8, x)), am)), { size: 0.35, tone: "lo" });
      if (seam > a0 && seam <= a1) {
        extra += Ln(path3([[CRAFT.x0, ...yzOf(RO + SKIN_T, seam)], [CRAFT.x1, ...yzOf(RO + SKIN_T, seam)]]), { tone: "faint" });
        extra += Dots(Array.from({ length: 28 }, (_, j) => rim(CRAFT.x0 + 2.6 + j * 6.2, seam + 1)), { size: 0.3, tone: "lo" });
      }
    }
    prism(`skin.near${i}`, XF, bandPoly(RO, RO + SKIN_T, a0, a1), CRAFT.x0, CRAFT.x1, { tone: "lo", flat: true }, { extra, ground: true });
  }
}
const FLOOR = { x: CRAFT.x0, y: -64.5, w: CRAFT.x1 - CRAFT.x0, d: 129, r: 0 };
{
  const seams = [-57, 66].map((x) => k.lineOnTop([x, FLOOR.y], [x, FLOOR.y + FLOOR.d], FZ, P)).join("");
  const shape = record(A.slab(FLOOR, FZ - 2, 2, { name: "floor", ground: true }, 2));
  put("floor", [(CRAFT.x0 + CRAFT.x1) / 2, 0, FZ - 1], S(k.slabOf(FLOOR, FZ - 2, 2, P, 2), { tone: "lo" }) + Ln(seams, { tone: "faint" }) + Dots([-57, 66].flatMap((x) => [-60, -52, 52, 60].map((y) => at([x + 2, y, FZ]))), { size: 0.4, tone: "lo" }), [shape]);
}
const TRACK_Z = FZ + 1.4;
for (const [y0, y1] of [[-42, -38], [38, 42]]) {
  const holes = Array.from({ length: 16 }, (_, i) => at([CRAFT.x0 + 4 + i * 10.6, (y0 + y1) / 2, TRACK_Z]));
  box(`track${y0}`, [CRAFT.x0, y0, FZ], [CRAFT.x1, y1, TRACK_Z], { tone: "lo" }, { r: 0, extra: Ln(k.lineOnTop([CRAFT.x0, (y0 + y1) / 2], [CRAFT.x1, (y0 + y1) / 2], TRACK_Z, P), { tone: "faint" }) + Dots(holes, { size: 0.42, tone: "lo" }) });
}

// stabilised mount: an adapter plate bolted to both seat tracks, four bellows-booted levelling actuators, a cradle
const PLATE = { x: -54, y: -62, w: 116, d: 106, r: 2 };
const PLATE_Z = TRACK_Z + 2;
{
  const studs = [-48, -10, 28, 56].flatMap((x) => [-40, 40].map((y) => [x, y]));
  box("mount.plate", [PLATE.x, PLATE.y, TRACK_Z], [PLATE.x + PLATE.w, PLATE.y + PLATE.d, PLATE_Z], { tone: "lo" }, {
    r: 2,
    steps: 4,
    inner: Ln(k.sideSeam(PLATE, TRACK_Z + 1, P, 4), { tone: "faint" }),
    extra: Ln(studs.map(([x, y]) => k.ring(x, y, 1.2, PLATE_Z, P, 12)).join(""), { tone: "lo" }) + Dots(studs.map(([x, y]) => at([x, y, PLATE_Z])), { size: 0.45 }),
  });
}
const CRADLE_Z = 205;
const ACTUATORS = [[-44, -56], [52, -56], [-44, 22], [52, 22]];
for (const [x, y] of ACTUATORS) {
  const profile = [[PLATE_Z, 3.9], [PLATE_Z + 2.4, 3.9], [PLATE_Z + 2.4, 3.1]];
  const s0 = PLATE_Z + 2.4;
  const s1 = CRADLE_Z - 1.2;
  const folds = 8;
  for (let i = 0; i < folds; i++) {
    const r = i % 2 ? 3.1 : 3.6;
    const a = s0 + ((s1 - s0) * i) / folds;
    const b = s0 + ((s1 - s0) * (i + 1)) / folds;
    profile.push([a, r], [b, r]);
  }
  profile.push([s1, 3.1], [s1, 3.9], [CRADLE_Z, 3.9]);
  const clean = profile.filter((p, i) => i === 0 || p[0] !== profile[i - 1][0] || p[1] !== profile[i - 1][1]);
  turned(`mount.act${x},${y}`, alongZ(x, y), clean, { tone: "mid" });
}
box("mount.cradle", [-48, -60, CRADLE_Z], [56, 26, CRADLE_Z + 2], { tone: "lo" }, { r: 1.5, steps: 3 });
{
  const DRIVE = { x: 18, y: 31, w: 26, d: 10, r: 0.6 };
  box("mount.drive", [DRIVE.x, DRIVE.y, PLATE_Z], [DRIVE.x + DRIVE.w, DRIVE.y + DRIVE.d, PLATE_Z + 5.6], { tone: "mid" }, {
    r: 0.6,
    bevel: 0.4,
    extra:
      Ln([0, 1, 2].map((i) => k.lineOnTop([DRIVE.x + 3, DRIVE.y + 2.6 + i * 2.4], [DRIVE.x + 15 - (i === 2 ? 5 : 0), DRIVE.y + 2.6 + i * 2.4], PLATE_Z + 5.6, P)).join(""), { tone: "lo", free: true }) +
      Dots(k.corners(DRIVE, 1.1).map(([x, y]) => at([x, y, PLATE_Z + 5.6])), { size: 0.35, tone: "lo" }) +
      Dots([[38, 39], [41, 39]].map(([x, y]) => at([x, y, PLATE_Z + 5.6])), { size: 0.6, tone: "hi" }),
  });
}

// the sensor housing, cut open: floor, the two far walls whole, the two near walls cut to a sill and a corner,
// what is left of the lid, a nameplate, and bulkhead receptacles on the inside of the back wall
const CASE = { x: -50, y: -62, w: 108, d: 90, r: 1.5 };
const CASE_Z = CRADLE_Z + 2;
const FLOOR_Z = CASE_Z + 3;
const WALL = 1.4;
const SILL = FLOOR_Z + 4;
const LID = 238;
box("case.floor", [CASE.x, CASE.y, CASE_Z], [CASE.x + CASE.w, CASE.y + CASE.d, FLOOR_Z], { tone: "mid" }, {
  r: 1.5,
  steps: 3,
  bevel: 0.5,
  inner: Ln(k.sideSeam(CASE, CASE_Z + 1.5, P, 3), { tone: "faint" }),
});
const X0 = CASE.x;
const X1 = CASE.x + CASE.w;
const Y0 = CASE.y;
const Y1 = CASE.y + CASE.d;
box("case.wall-y", [X0, Y0, FLOOR_Z], [X1, Y0 + WALL, LID], { tone: "mid" }, { r: 0 });
box("case.wall-x", [X0, Y0 + WALL, FLOOR_Z], [X0 + WALL, Y1, LID], { tone: "mid" }, { r: 0 });
box("case.sill+y", [X0 + WALL, Y1 - WALL, FLOOR_Z], [X1 - WALL, Y1, SILL], { tone: "mid" }, { r: 0 });
box("case.sill+x", [X1 - WALL, Y0 + WALL, FLOOR_Z], [X1, Y1, SILL], { tone: "mid" }, { r: 0 });
const YW = G.frameOf([0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
prism("case.corner+y", YW, [[X0 + WALL, SILL], [X0 + 26, SILL], [X0 + 10, LID], [X0 + WALL, LID]], Y1 - WALL, Y1, { tone: "mid" });
{
  const plate = { y0: Y0 + 4, y1: Y0 + 15.5, z0: SILL + 2.5, z1: SILL + 11 };
  const rules = [0, 1, 2].map((i) => path3([[X1 + 0.4, plate.y0 + 2, plate.z1 - 2.2 - i * 2.2], [X1 + 0.4, plate.y1 - 2 - (i === 2 ? 3 : 0), plate.z1 - 2.2 - i * 2.2]])).join("");
  prism("case.corner+x", XF, [[Y0 + WALL, SILL], [Y0 + 26, SILL], [Y0 + 10, LID], [Y0 + WALL, LID]], X1 - WALL, X1, { tone: "mid" });
  box("case.plate", [X1, plate.y0, plate.z0], [X1 + 0.4, plate.y1, plate.z1], { tone: "lo" }, {
    r: 0,
    extra: Ln(rules, { tone: "lo", free: true }) + Dots([[plate.y0 + 1, plate.z1 - 1], [plate.y1 - 1, plate.z1 - 1], [plate.y0 + 1, plate.z0 + 1], [plate.y1 - 1, plate.z0 + 1]].map(([y, z]) => at([X1 + 0.4, y, z])), { size: 0.3, tone: "lo" }),
  });
}
box("case.lid-y", [X0, Y0, LID], [X1, Y0 + 10, LID + 1.6], { tone: "mid" }, {
  r: 0,
  extra: Dots(Array.from({ length: 12 }, (_, i) => at([X0 + 4 + i * 9.1, Y0 + 5, LID + 1.6])), { size: 0.4, tone: "lo" }),
});
box("case.lid-x", [X0, Y0 + 10, LID], [X0 + 10, Y1, LID + 1.6], { tone: "mid" }, {
  r: 0,
  extra: Dots(Array.from({ length: 8 }, (_, i) => at([X0 + 5, Y0 + 18 + i * 9.4, LID + 1.6])), { size: 0.4, tone: "lo" }),
});
const RECEPTACLES = { encoder: [0, 220], imu: [14, 213], data: [23, 214.1], power: [-56, 216] };
for (const [name, [y, z]] of Object.entries(RECEPTACLES)) {
  box(`case.socket.${name}`, [X0 + WALL, y - 2, z - 2], [X0 + WALL + 1, y + 2, z + 2], { tone: "lo" }, {
    r: 0,
    extra: Dots([[y - 1.3, z + 1.3], [y + 1.3, z - 1.3]].map(([py, pz]) => at([X0 + WALL + 1, py, pz])), { size: 0.3, tone: "lo" }),
  });
}

// exit window in the housing floor
ring("window.ring", alongZ(0, 0), FLOOR_Z, 211.2, 5.4, 7, { tone: "mid" }, { extra: Dots(Array.from({ length: 6 }, (_, i) => i * Math.PI / 3 + 0.3).filter((a) => facing([Math.cos(a), Math.sin(a), 0.6])).map((a) => at([6.2 * Math.cos(a), 6.2 * Math.sin(a), 211.2])), { size: 0.35, tone: "lo" }) });
{
  const shape = record(A.slab({ x: -5.3, y: -5.3, w: 10.6, d: 10.6, r: 5.3 }, 211.1, 0.1, { name: "window.glass" }, 10));
  put("window.glass", [0, 0, 210.9], `<path class="ln-glass" d="${k.ring(0, 0, 5.4, 211.2, P, 40)}"/>` + Ln(k.ring(0, 0, 5.4, 211.2, P, 40), { tone: "lo" }), [shape]);
}

// galvo: pedestal, clamp, motor, nose, hub (the shaft), encoder, cap and gland
box("galvo.pedestal", [-24, -6, 210], [-15, 6, 213.7], { tone: "lo" }, { r: 0.6, extra: Dots([[-22.5, -4.5], [-16.5, -4.5], [-22.5, 4.5], [-16.5, 4.5]].map(([x, y]) => at([x, y, 213.7])), { size: 0.35, tone: "lo" }) });
const GX = alongX(0, 220);
const motorF = GX;
disc("galvo.motor", motorF, -30, -23, 5.5, { tone: "mid" }, { bevel: 0.3 });
disc("galvo.motor2", motorF, -16, -9, 5.5, { tone: "mid" }, { bevel: 0.3 });
disc("galvo.clamp", GX, -23, -16, 6.3, { tone: "lo" }, { extra: Dots([at([-19.5, 0, 226.3])], { size: 0.4, tone: "lo" }) });
turned("galvo.nose", GX, [[-9, 3.6], [-7.4, 3.6]], { tone: "lo" });
turned("galvo.hub", GX, [[-7.4, 2.2], [-5.6, 2.2]], { tone: "hi" });
turned("galvo.encoder", GX, [[-36.5, 6.4], [-30, 6.4]], { tone: "lo" }, { bevel: 0.5, extra: Ln(G.arcOf(GX, -33.2, 6.4, P), { tone: "faint" }) });
turned("galvo.cap", GX, [[-37.5, 3.5], [-36.5, 3.5]], { tone: "mid" });
turned("galvo.gland", GX, [[-39, 1.4], [-37.5, 1.4]], { tone: "lo" });

// receiver: lens cell with spider and injection mirror, barrel on a cradle, filter, APD can, APD board
const RX = alongY(0, 220);
box("rx.pedestal", [-4, -25.5, 210], [4, -22.5, 211], { tone: "lo" }, { r: 0.3 });
turned("rx.lens", RX, [[-26, 9], [-22, 9]], { tone: "mid" }, {
  bevel: 0.5,
  extra:
    Ln(path3(Array.from({ length: 41 }, (_, i) => [6.6 * Math.cos((i / 40) * Math.PI * 2), -22, 220 + 6.6 * Math.sin((i / 40) * Math.PI * 2)]), true), { tone: "lo" }) +
    Ln([90, 210, 330].map((d) => (d * Math.PI) / 180).map((a) => path3([[0.5 * Math.cos(a), -22, 220 + 0.5 * Math.sin(a)], [6.6 * Math.cos(a), -22, 220 + 6.6 * Math.sin(a)]])).join(""), { tone: "lo" }),
});
disc("rx.stalk", RX, -22, -19.92, 0.5, { tone: "lo" });
{
  const n = G.unit3([1, 1, 0]);
  const F = G.frameAlong([0, -19.5, 220], n);
  disc("rx.inject", F, -0.42, 0.18, 2.2, { tone: "hi" });
}
box("rx.cradle", [-5, -40, 210], [5, -32, 213.8], { tone: "lo" }, { r: 0.5 });
turned("rx.barrel", RX, [[-44, 6.2], [-26, 6.2]], { tone: "mid" }, { extra: Ln([-41, -29].map((s) => G.arcOf(RX, s, 6.2, P)).join(""), { tone: "faint" }) });
turned("rx.filter", RX, [[-46, 7], [-44, 7]], { tone: "lo" });
turned("rx.apd", RX, [[-51, 4.4], [-46, 4.4]], { tone: "hi" });
box("rx.board", [-7, -53.5, 210], [7, -51, 229], { tone: "lo" }, {
  r: 0,
  extra: Dots([[-5.5, 227.5], [5.5, 227.5], [-5.5, 212], [5.5, 212]].map(([x, z]) => at([x, -51, z])), { size: 0.35, tone: "lo" }),
});

// transmitter: laser head with fins and label, beam expander, T0 photodiode on its post
box("tx.laser", [14, -27, 210], [44, -12, 227], { tone: "mid" }, {
  r: 0.8,
  bevel: 0.5,
  inner: Ln(k.sideSeam({ x: 14, y: -27, w: 30, d: 15, r: 0.8 }, 213, P, 2), { tone: "faint" }),
  extra:
    Ln([0, 1, 2].map((i) => path3([[24 + i * 0, -12, 223 - i * 2.4], [38 - (i === 2 ? 6 : 0), -12, 223 - i * 2.4]])).join(""), { tone: "lo", free: true }) +
    Ln(path3([[22, -12, 225], [40, -12, 225], [40, -12, 217], [22, -12, 217]], true), { tone: "lo" }),
});
for (let i = 0; i < 7; i++) box(`tx.fin${i}`, [16 + i * 4, -26, 227], [17.2 + i * 4, -13, 230], { tone: "lo" }, { r: 0 });
const TXF = G.frameOf([0, -19.5, 220], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
turned("tx.expander", TXF, [[7, 1.6], [8.6, 1.6], [8.6, 2.2], [14, 2.2]], { tone: "mid" });
disc("t0.post", alongZ(10.5, -13.75), 210, 218.6, 0.7, { tone: "lo" });
turned("t0.diode", alongY(10.5, 220), [[-15.5, 1.4], [-12.6, 1.4], [-12.6, 0.9], [-12, 0.9]], { tone: "hi" });

// timing electronics: board on standoffs with FPGA, TDC, ADC, crystal, header and SMA
const PCB = { x: 8, y: 2, w: 32, d: 16, r: 0.6 };
for (const [x, y] of k.corners(PCB, 1.5)) disc(`pcb.standoff${x},${y}`, alongZ(x, y), 210, 211.6, 0.7, { tone: "lo" });
box("pcb", [PCB.x, PCB.y, 211.6], [PCB.x + PCB.w, PCB.y + PCB.d, 212.6], { tone: "lo" }, {
  r: 0.6,
  extra:
    Ln([4, 7, 10, 13].map((y) => k.lineOnTop([PCB.x + 2, PCB.y + y], [PCB.x + 12, PCB.y + y], 212.6, P)).join(""), { tone: "faint", free: true }) +
    Dots(k.corners(PCB, 1.5).map(([x, y]) => at([x, y, 212.6])), { size: 0.4, tone: "mid" }),
});
box("pcb.fpga", [22, 6, 212.6], [30, 14, 213.8], { tone: "mid" }, { r: 0.3, extra: Ln(k.planOutline(k.insetPlan({ x: 22, y: 6, w: 8, d: 8, r: 0.3 }, 1.2), 213.8, P, 2), { tone: "faint" }) });
box("pcb.tdc", [14, 9, 212.6], [19, 14, 213.4], { tone: "mid" }, { r: 0.2 });
box("pcb.adc", [14, 4, 212.6], [19, 7.5, 213.4], { tone: "mid" }, { r: 0.2 });
box("pcb.xtal", [31.5, 4, 212.6], [34, 6, 213.6], { tone: "hi" }, { r: 0.6 });
box("pcb.header", [35.5, 7, 212.6], [38.5, 15, 214.8], { tone: "mid" }, { r: 0.2, extra: Dots([8.5, 10.5, 12.5].map((y) => at([37, y, 214.8])), { size: 0.35, tone: "lo" }) });
disc("pcb.sma", alongZ(10.5, 5), 212.6, 215.4, 1.1, { tone: "hi" });

// IMU block with its connector
box("imu", [-32, 8, 210], [-18, 20, 217], { tone: "mid" }, {
  r: 0.6,
  bevel: 0.4,
  extra: Ln(k.planOutline(k.insetPlan({ x: -32, y: 8, w: 14, d: 12, r: 0.6 }, 2), 217, P, 2), { tone: "faint" }) + Dots(k.corners({ x: -32, y: 8, w: 14, d: 12 }, 1.2).map(([x, y]) => at([x, y, 217])), { size: 0.35, tone: "lo" }),
});

// the navigation computer on an equipment tray on the near seat track: GNSS/INS, logger and the operator's live display
// in one box, with the monitor on its stand
const TRAY = { x: -94, y: 30, w: 34, d: 30, r: 0.8 };
const DCU_Z = TRACK_Z + 2;
box("tray", [TRAY.x, TRAY.y, TRACK_Z], [TRAY.x + TRAY.w, TRAY.y + TRAY.d, DCU_Z], { tone: "lo" }, {
  r: 0.8,
  steps: 3,
  extra: Ln([-90, -64].map((x) => k.ring(x, 40, 1.1, DCU_Z, P, 12)).join(""), { tone: "lo" }) + Dots([-90, -64].map((x) => at([x, 40, DCU_Z])), { size: 0.45 }),
});
const DCU = { x0: -91, x1: -64, y0: 32, y1: 57, z1: DCU_Z + 14 };
box("nav.computer", [DCU.x0, DCU.y0, DCU_Z], [DCU.x1, DCU.y1, DCU.z1], { tone: "mid" }, {
  r: 0.8,
  bevel: 0.5,
  extra:
    Ln([0, 1, 2, 3, 4].map((i) => path3([[DCU.x1, 36 + i * 2.2, DCU_Z + 11], [DCU.x1, 36.8 + i * 2.2, DCU_Z + 11], [DCU.x1, 36.8 + i * 2.2, DCU_Z + 4], [DCU.x1, 36 + i * 2.2, DCU_Z + 4]], true)).join("") + path3([[DCU.x1, 34.4, DCU_Z + 12.2], [DCU.x1, 46.4, DCU_Z + 12.2], [DCU.x1, 46.4, DCU_Z + 2.8], [DCU.x1, 34.4, DCU_Z + 2.8]], true), { tone: "lo" }) +
    Dots([[52.5, DCU_Z + 11], [55, DCU_Z + 11]].map(([y, z]) => at([DCU.x1, y, z])), { size: 0.7, tone: "hi" }),
});
box("nav.stand", [-81, 49, DCU.z1], [-75, 53, DCU.z1 + 2], { tone: "lo" }, { r: 0.3 });
const MON = { x0: -91, x1: -65, y0: 48, y1: 54, z0: DCU.z1 + 2, z1: DCU.z1 + 20 };
const SCREEN = { o: [MON.x0 + 2, MON.y1 + 0.05, MON.z1 - 2], u: 22, v: 13 };
// the scope: row a is the whole pulse period (T0, echo, next T0); row b zooms on the echo gate
const SCOPE = { a: { y: 6.3, t0: -0.25, t1: 4.95, u0: 1, u1: 21, spike: 3, height: 4.2, sigma: 0.16 }, b: { y: 11.6, t0: 0.86, t1: 1.07, u0: 1, u1: 21, height: 6, sigma: 0.28 } };
const uA = (t) => SCOPE.a.u0 + ((t - SCOPE.a.t0) / (SCOPE.a.t1 - SCOPE.a.t0)) * (SCOPE.a.u1 - SCOPE.a.u0);
box("nav.monitor", [MON.x0, MON.y0, MON.z0], [MON.x1, MON.y1, MON.z1], { tone: "lo" }, { r: 0.6, bevel: 0.4, extra: `<g data-part="screen-host"></g>` });

// cables inside the housing end on the bulkhead receptacles; one harness (ranges, encoder, IMU out; PPS in) runs out
// through the near corner to the navigation computer
const SOCK = X0 + WALL + 1;
cable("cable.apd", [[3, -53.5, 225], [3, -57.5, 225], [48, -57.5, 225], [48, 11, 225], [37, 11, 225], [37, 11, 214.8]], 0.55, { shells: [true, false], bend: 2 });
cable("cable.t0", [[10.5, -12, 220], [10.5, 5, 220], [10.5, 5, 215.4]], 0.45);
cable("cable.encoder", [[-39, 0, 220], [SOCK, 0, 220]], 0.6, { shells: [false, true] });
box("pcb.jack", [20.5, 14.5, 212.6], [27.5, 18, 215.6], { tone: "mid" }, { r: 0.3, extra: Ln(k.lineOnTop([20.5, 16.2], [27.5, 16.2], 215.6, P), { tone: "faint" }) });
cable("cable.data", [[24, 18, 214.1], [24, 23, 214.1], [SOCK, 23, 214.1]], 0.7, { shells: [true, true], bend: 2.2 });
cable("cable.imu", [[-32, 14, 213], [SOCK, 14, 213]], 0.55, { shells: [true, true] });
cable("cable.power", [[30, -27, 216], [30, -56, 216], [SOCK, -56, 216]], 0.8, { shells: [true, true] });
box("case.gland", [-47, Y1, 219], [-41, Y1 + 1, 225], { tone: "lo" }, { r: 0.3 });
box("nav.socket", [DCU.x1, 48, DCU_Z + 2], [DCU.x1 + 1, 52, DCU_Z + 6], { tone: "lo" }, { r: 0.3 });
cable("cable.harness", [[-44, Y1 + 1, 222], [-44, 50, 222], [-44, 50, DCU_Z + 4], [DCU.x1 + 1, 50, DCU_Z + 4]], 0.9, { shells: [true, true], bend: 4 });

// navigation: a GNSS antenna on a riveted doubler just below the crown cut, its coax through a lightning arrestor and
// down the inside of the far wall and across the floor to the navigation computer, which blends GNSS fixes with the IMU
// and sends a pulse per second back up the harness to the timing board
const NAV = { x: -66, deg: 118, coax: 75.6 };
{
  const r0 = RO + SKIN_T;
  const half = 4.4;
  const rivets = [NAV.x - 5.4, NAV.x + 5.4].flatMap((x) => [NAV.deg - half + 0.9, NAV.deg + half - 0.9].map((d) => at([x, ...yzOf(r0 + 0.6, d)])));
  const doubler = prism("gnss.doubler", XF, bandPoly(r0, r0 + 0.6, NAV.deg - half, NAV.deg + half), NAV.x - 6.4, NAV.x + 6.4, { tone: "lo" }, { ground: true, extra: Dots(rivets, { size: 0.3, tone: "lo" }) });
  const nrm = [0, Math.cos((NAV.deg * Math.PI) / 180), Math.sin((NAV.deg * Math.PI) / 180)];
  const F = G.frameAlong([NAV.x, ...yzOf(r0 + 0.6, NAV.deg)], nrm);
  const screws = [0.6, 2.2, 3.8, 5.4].map((a) => G.add3(G.add3(G.add3(F.o, G.mul3(F.a, 0.6)), G.mul3(F.u, 3.95 * Math.cos(a))), G.mul3(F.v, 3.95 * Math.sin(a))));
  // the base is a saddle: each generator starts where it meets the doubler's curved outer face
  const pointAt = (s, t) => G.add3(G.add3(G.add3(F.o, G.mul3(F.a, s)), G.mul3(F.u, 4.2 * Math.cos(t))), G.mul3(F.v, 4.2 * Math.sin(t)));
  const outside = (p) => Math.hypot(p[1], p[2] - ZC) > r0 + 0.6;
  const start = (t) => {
    let lo = -2;
    let hi = 0.6;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (outside(pointAt(mid, t))) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const low = Math.min(...Array.from({ length: 48 }, (_, i) => start((i / 48) * Math.PI * 2)));
  put("gnss.base", G.add3(F.o, G.mul3(F.a, 0.3)), S(G.saddleOf(F, 4.2, start, 0.6, P), { tone: "lo" }) + Dots(screws.map(at), { size: 0.3, tone: "lo" }), [record(A.disc(F, low - 0.05, 0.6, 4.2, { name: "gnss.base", seated: true, cut: [doubler] }))]);
  turned("gnss.dome", F, [[0.6, 3.7], [1.3, 3.55, 1], [2.1, 2.95, 1], [2.75, 1.9, 1], [3.1, 0.9, 1], [3.2, 0, 1]], { tone: "hi" });
  const face = (d) => [NAV.x - 1.6, NAV.x + 1.6].map((x) => at([x, ...yzOf(RO - 3.6, d)]));
  prism("gnss.arrestor", XF, bandPoly(RO - 3.6, RO, 127, 134), NAV.x - 2.6, NAV.x + 2.6, { tone: "mid" }, { ground: true, extra: Dots([...face(128.2), ...face(132.8)], { size: 0.3, tone: "lo" }) });
}
{
  const arc = Array.from({ length: 11 }, (_, i) => 134 + ((197.8 - 134) * i) / 10).map((d) => [NAV.x, ...yzOf(NAV.coax, d)]);
  const [, ya, za] = arc[arc.length - 1];
  const zf = TRACK_Z + 2.2;
  cable("cable.gnss", [...arc, [NAV.x, ya + 6, za], [NAV.x, ya + 6, zf], [NAV.x, DCU.y0 - 8, zf], [NAV.x, DCU.y0 - 8, zf + 7], [NAV.x, DCU.y0, zf + 7]], 0.6, { shells: [true, true], bend: 3 });
}

// the scan mirror (rebuilt per frame in the page) and the beam inside the head
const MF = G.frameOf([0, 0, 220], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const mirrorSvg = (theta) => S(prismPaths(MF, mirrorPoly(theta), MIRROR.from, MIRROR.to), { tone: "hi", lit: true });
{
  const shape = record(A.prism(MF, mirrorPoly(0), MIRROR.from, MIRROR.to, { name: "mirror" }));
  put("mirror", [0, 0, 220], `<g data-part="mirror">${mirrorSvg(0)}</g>`, [shape]);
}
const BEAM = [[7, -19.5, 220], [0, -19.5, 220], [0, 0, 220], [0, 0, 211.2]];
put("beam", [0, -9, 220], `<g data-part="beam"><path class="iso-line ln-beam" data-tone="red" d="${path3(BEAM)}"/><g class="ln-spot">${Dots([at(BEAM[3])], { size: 0.55, tone: "hi" })}</g></g>`, [A.tube(BEAM, 0.3)]);

A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);
const front = R.items.map((item) => `<g class="it" data-name="${item.name}">${item.svg}</g>`);

// the display picture, drawn in the plane of the monitor face
const screenItem = (() => {
  const M2 = planeMatrix(SCREEN.o, [1, 0, 0], [0, 0, -1]);
  const grid = [0.25, 0.5, 0.75].map((f) => `M0 ${f2(SCREEN.v * f)}H${SCREEN.u}`).join("") + [5.5, 11, 16.5].map((u) => `M${u} 0V${SCREEN.v}`).join("");
  return [
    `<g transform="${M2}"><clipPath id="ln-screen"><rect x="0" y="0" width="${SCREEN.u}" height="${SCREEN.v}" rx="0.6"/></clipPath>`,
    `<rect class="ln-screen" x="0" y="0" width="${SCREEN.u}" height="${SCREEN.v}" rx="0.6"/>`,
    `<g clip-path="url(#ln-screen)"><path class="ln-grid" d="${grid}"/>`,
    `<path class="ln-trace" data-part="trace" d=""/>`,
    `<circle class="ln-cursor" data-part="cursor" cx="2" cy="${SCOPE.a.y}" r="0.42" opacity="0"/>`,
    `<text class="ln-text" data-part="tof" x="0.9" y="2.1">0.000 µs</text>`,
    `<text class="ln-text" data-part="range" x="21.1" y="2.1" text-anchor="end">0.0 m</text>`,
    `<text class="ln-text ln-text-sm" x="11.4" y="5.4" text-anchor="middle">${(LIDAR.period * 1e6).toFixed(0)} µs · ${LIDAR.prf / 1000} kHz</text>`,
    `<path class="ln-gate" d="M${f2(uA(0))} 6.75V7.35M${f2(uA(4))} 6.75V7.35M${f2(uA(0))} 7.05H${f2(uA(4))}"/>`,
    `<path class="ln-gate" d="M${SCOPE.b.u0} 12.2V12.8M${SCOPE.b.u1} 12.2V12.8M${SCOPE.b.u0} 12.5H${SCOPE.b.u1}"/>`,
    `</g><rect class="ln-screen-rim" x="0" y="0" width="${SCREEN.u}" height="${SCREEN.v}" rx="0.6"/></g>`,
  ].join("");
})();
const frontBody = front.join("").replace(`<g data-part="screen-host"></g>`, screenItem);

// the same scope, flat and large under the drawing: row a is one pulse period, row b the echo gate in metres
const BIG = { w: 640, h: 322, a: { x0: 44, x1: 616, top: 58, base: 140, k: 20 }, b: { x0: 44, x1: 616, top: 206, base: 278, k: 14 } };
const bigScope = (() => {
  const { a, b } = BIG;
  const PER = LIDAR.period * 1e6;
  const M_PER_US = 299.792458 / 2;
  const xa = (t) => a.x0 + ((t - SCOPE.a.t0) / (SCOPE.a.t1 - SCOPE.a.t0)) * (a.x1 - a.x0);
  const xb = (t) => b.x0 + ((t - SCOPE.b.t0) / (SCOPE.b.t1 - SCOPE.b.t0)) * (b.x1 - b.x0);
  const grid = [];
  for (let t = 0; t <= SCOPE.a.t1; t += 0.5) grid.push(`M${f2(xa(t))} ${a.top}V${a.base + 8}`);
  for (const f of [0.25, 0.5, 0.75]) grid.push(`M${a.x0} ${f2(a.top + (a.base + 8 - a.top) * f)}H${a.x1}`);
  const r0 = Math.ceil(SCOPE.b.t0 * M_PER_US);
  const r1 = Math.floor(SCOPE.b.t1 * M_PER_US);
  for (let r = Math.ceil(r0 / 5) * 5; r <= r1; r += 5) grid.push(`M${f2(xb(r / M_PER_US))} ${b.top}V${b.base + 8}`);
  for (const f of [0.33, 0.66]) grid.push(`M${b.x0} ${f2(b.top + (b.base + 8 - b.top) * f)}H${b.x1}`);
  const ticksA = [];
  const labels = [];
  for (let t = 0; t <= SCOPE.a.t1 + 1e-9; t += 0.25) {
    const major = Math.abs(t - Math.round(t)) < 1e-6;
    ticksA.push(`M${f2(xa(t))} ${a.base + 8}v${major ? 6 : 3}`);
    if (major) labels.push(`<text class="ln-big-axis" x="${f2(xa(t))}" y="${a.base + 26}" text-anchor="middle">${t} µs</text>`);
  }
  const ticksB = [];
  for (let r = r0; r <= r1; r++) {
    const major = r % 5 === 0;
    ticksB.push(`M${f2(xb(r / M_PER_US))} ${b.base + 8}v${major ? 6 : 3}`);
    if (major) labels.push(`<text class="ln-big-axis" x="${f2(xb(r / M_PER_US))}" y="${b.base + 26}" text-anchor="middle">${r} m</text>`);
  }
  const gx0 = xa(SCOPE.b.t0);
  const gx1 = xa(SCOPE.b.t1);
  const bracketY = a.top - 18;
  const t0Mark = (t, label) =>
    `<text class="ln-big-note" x="${f2(xa(t))}" y="${a.base - a.k * SCOPE.a.spike - 8}" text-anchor="middle">${label}</text>`;
  const echoMark = (i) =>
    `<g data-part="big-echo${i}" opacity="0"><path class="ln-big-mark" d="M0 ${b.base}V${b.top + 16}"/><circle class="ln-big-dot" cx="0" cy="${b.top + 16}" r="2"/><text class="ln-big-note" x="0" y="${b.top + 10}" text-anchor="middle"></text></g>`;
  return [
    `<div class="ln-big"><svg class="ln-big-svg" viewBox="0 0 ${BIG.w} ${BIG.h}" role="img" aria-label="The scope, enlarged. Top: one pulse period, the outgoing pulse at T0, its echo a fraction of a microsecond later, and the next pulse at ${PER.toFixed(0)} µs. Bottom: the echo gate, with time converted to range.">`,
    `<defs><clipPath id="ln-big-clip"><rect x="0" y="0" width="${BIG.w}" height="${BIG.h}" rx="8"/></clipPath></defs>`,
    `<rect class="ln-screen" x="0" y="0" width="${BIG.w}" height="${BIG.h}" rx="8"/>`,
    `<g clip-path="url(#ln-big-clip)">`,
    `<rect class="ln-big-gate" x="${f2(gx0)}" y="${a.top}" width="${f2(gx1 - gx0)}" height="${a.base + 8 - a.top}"/>`,
    `<path class="ln-big-grid" d="${grid.join("")}"/>`,
    `<rect class="ln-big-frame" x="${a.x0}" y="${a.top}" width="${a.x1 - a.x0}" height="${a.base + 8 - a.top}"/>`,
    `<rect class="ln-big-frame" x="${b.x0}" y="${b.top}" width="${b.x1 - b.x0}" height="${b.base + 8 - b.top}"/>`,
    `<path class="ln-big-zoom" d="M${f2(gx0)} ${a.base + 8}L${b.x0} ${b.top}M${f2(gx1)} ${a.base + 8}L${b.x1} ${b.top}"/>`,
    `<path class="ln-big-tick" d="${ticksA.join("")}${ticksB.join("")}"/>`,
    `<path class="ln-big-tick" d="M${f2(xa(0))} ${bracketY - 5}v10M${f2(xa(PER))} ${bracketY - 5}v10M${f2(xa(0))} ${bracketY}H${f2(xa(PER))}"/>`,
    `<text class="ln-big-note" x="${f2((xa(0) + xa(PER)) / 2)}" y="${bracketY - 6}" text-anchor="middle">1/PRF = ${PER.toFixed(0)} µs between pulses · ${LIDAR.prf / 1000} kHz · Rmax = c/(2·PRF) = ${LIDAR.maxRange.toFixed(0)} m</text>`,
    t0Mark(0, "T0 · fire"),
    t0Mark(PER, "next T0"),
    `<text class="ln-big-title" x="${a.x0}" y="20">A · one pulse period</text>`,
    `<text class="ln-big-title" x="${b.x0}" y="${b.top - 8}">B · echo gate, ${((SCOPE.a.t1 - SCOPE.a.t0) / (SCOPE.b.t1 - SCOPE.b.t0)).toFixed(0)}× zoom · R = c·Δt/2</text>`,
    `<text class="ln-big-live" data-part="big-read" x="${a.x1}" y="20" text-anchor="end">—</text>`,
    `<text class="ln-big-note" data-part="big-echoA" x="0" y="0" text-anchor="middle" opacity="0">echo</text>`,
    echoMark(0),
    echoMark(1),
    `<path class="ln-big-trace" data-part="big-trace" d=""/>`,
    `<circle class="ln-cursor" data-part="big-cursor" cx="${a.x0}" cy="${a.base}" r="3" opacity="0"/>`,
    labels.join(""),
    `<text class="ln-big-axis" x="${b.x1}" y="${BIG.h - 6}" text-anchor="end">height = echo intensity · 1 ns of flight = 15 cm of range</text>`,
    `</g><rect class="ln-big-rim" x="0.5" y="0.5" width="${BIG.w - 1}" height="${BIG.h - 1}" rx="8"/></svg></div>`,
  ].join("");
})();

// the far wall of the fuselage: skin from the top cut round to under the floor (the near side and top are cut away),
// stringers inside it, a riveted lap seam, a rivet row along the cut, and a cabin window in each bay. It sits behind
// the beam in the back layer and moves with the craft.
{
  const { ro: RO, skin: SKIN_T, top: D0, far: D1 } = HULL;
  const N = 60;
  const arc = (r, d0, d1) => Array.from({ length: N + 1 }, (_, i) => yzOf(r, d0 + ((d1 - d0) * i) / N));
  const out = [];
  out.push(S(prismPaths(XF, [...arc(RO + SKIN_T, D0, D1), ...arc(RO, D1, D0)], CRAFT.x0, CRAFT.x1), { tone: "lo", flat: true }));
  const along = (deg, r, step, from = CRAFT.x0 + 2.4) => Array.from({ length: Math.floor((CRAFT.x1 - from - 1) / step) + 1 }, (_, i) => at([from + i * step, ...yzOf(r, deg)]));
  out.push(Dots(along(D0 + 2.2, RO + SKIN_T, 6), { size: 0.35, tone: "lo" }));
  const LAP = 141;
  out.push(Ln(path3([[CRAFT.x0, ...yzOf(RO - 0.02, LAP)], [CRAFT.x1, ...yzOf(RO - 0.02, LAP)]]), { tone: "faint" }));
  out.push(Dots(along(LAP + 1.2, RO - 0.05, 6.2), { size: 0.3, tone: "lo" }));
  // windows: a rounded pane and its trim drawn on the inside of the skin, between the frames
  const WIN = { mid: 165, half: 6.6, wide: 5.4, round: 2.8, trim: 1.6 };
  const rounded = (cx, hw, hs, rr) => {
    const pts = [];
    const corner = (ux, us, from) => {
      for (let i = 0; i <= 6; i++) {
        const a = from + (i / 6) * (Math.PI / 2);
        pts.push([ux + rr * Math.cos(a), us + rr * Math.sin(a)]);
      }
    };
    corner(cx + hw - rr, hs - rr, 0);
    corner(cx - hw + rr, hs - rr, Math.PI / 2);
    corner(cx - hw + rr, -hs + rr, Math.PI);
    corner(cx + hw - rr, -hs + rr, (3 * Math.PI) / 2);
    return pts.map(([x, s]) => [x, ...yzOf(RO - 0.04, WIN.mid + (s / RO) * (180 / Math.PI))]);
  };
  for (const cx of [-76, -38, 0, 38]) {
    const trim = path3(rounded(cx, WIN.wide + WIN.trim, WIN.half + WIN.trim, WIN.round + WIN.trim), true);
    const pane = path3(rounded(cx, WIN.wide, WIN.half, WIN.round), true);
    out.push(`<path class="iso-fill ln-trim" d="${trim}"/>` + Ln(trim, { tone: "lo" }));
    out.push(`<path class="ln-glass" d="${pane}"/>` + Ln(pane, { tone: "lo" }));
  }
  const stringers = [135, 150, 180, 195, 232, 256];
  for (const deg of byDepth(stringers, (deg) => [0, ...yzOf(RO, deg)])) {
    const d = (0.55 / RO) * (180 / Math.PI);
    const poly = [yzOf(RO, deg - d), yzOf(RO, deg + d), yzOf(RO - 1.3, deg + d), yzOf(RO - 1.3, deg - d)];
    out.push(S(prismPaths(XF, poly, CRAFT.x0, CRAFT.x1), { tone: "lo" }));
  }
  back.push(`<g data-part="craft-back">${out.join("")}</g>`);
}

const LABEL_TEXT =
  "A cutaway section of a survey aircraft's fuselage, its top and near side cut away to show frames, windows and the cabin floor. On the floor a lidar head sits in a housing, itself cut open, on a stabilised mount bolted to the seat tracks, with a GNSS antenna on the fuselage above and a GNSS/INS navigation computer on the floor carrying the operator's live display, flying over a small square of country with a road, a house, a shed and trees. A laser fires pulses that a galvanometer mirror swings from side to side; each echo's round-trip time gives a range, and the points build a cloud on the ground as the aircraft flies.";
const backSvg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, body: back, className: "ln-back" });
// loupe A: the ring that Fig 2 magnifies, drawn round the housing like a lens held over the drawing
const loupeA = (() => {
  const pts = [];
  for (const x of [X0, X1]) for (const y of [CASE.y, CASE.y + CASE.d]) for (const z of [CASE_Z, LID]) pts.push(at([x, y, z]));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = Math.max(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy))) + 6;
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * 2 * Math.PI;
    const r1 = r + (i % 6 ? 2.2 : 3.6);
    return `M${f2(cx + r * Math.cos(a))} ${f2(cy + r * Math.sin(a))}L${f2(cx + r1 * Math.cos(a))} ${f2(cy + r1 * Math.sin(a))}`;
  }).join("");
  const ta = (Math.PI * 3) / 4;
  return `<g class="ln-loupe" data-part="loupe-a"><circle class="ln-loupe-rim" cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}"/><path class="ln-loupe-knurl" d="${ticks}"/><circle class="ln-loupe-tab" cx="${f2(cx + (r + 7) * Math.cos(ta))}" cy="${f2(cy + (r + 7) * Math.sin(ta))}" r="6.2"/><text class="ln-loupe-mark" x="${f2(cx + (r + 7) * Math.cos(ta))}" y="${f2(cy + (r + 7) * Math.sin(ta) + 3.2)}" text-anchor="middle">A</text></g>`;
})();
const frontSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg ln-layer ln-front" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g data-part="craft">${frontBody}${loupeA}</g></svg>`;
const stage = `<div class="iso-stage ln-stage" tabindex="0" role="group" aria-label="Airborne lidar. Drag the aircraft along the road to fly it, and hover any part to read what it does; or use the left and right arrow keys, with Shift for bigger steps. Click, or press Space, to slow time a million-fold and watch single pulses."><span class="ln-said" aria-live="polite"></span><div class="ln-speed" aria-hidden="true"><span class="ln-speed-k">Time scale</span><b class="ln-speed-v">1×</b><span class="ln-speed-rule"><i style="left:0.000%"></i><i style="left:16.667%"></i><i style="left:33.333%"></i><i style="left:50.000%"></i><i style="left:66.667%"></i><i style="left:83.333%"></i><i style="left:100.000%"></i><em class="ln-speed-fill"></em><em class="ln-speed-mark"></em></span><span class="ln-speed-ends"><span>1×</span><span>1/10<sup>3</sup></span><span>1/10<sup>6</sup></span></span><span class="ln-speed-note">normal pace</span></div>${backSvg}<canvas class="ln-layer ln-gl" aria-hidden="true"></canvas>${frontSvg}</div>`;

const DATA = {
  W,
  H,
  P,
  V,
  camera: glCamera(P),
  screen: SCREEN,
  mirror: { from: MIRROR.from, to: MIRROR.to },
  beam: BEAM,
  scope: SCOPE,
  big: BIG,
  bullet: -70,
  start: 30,
};

const CSS = readFileSync(join(HERE, "lidar.css"), "utf8");
const latheSource = readFileSync(`${SKILL}/kit/lathe.mjs`, "utf8").replace(/^import .*$/m, "").replace(/^export /gm, "");
const latheScript = `const G = (() => {${latheSource}\nreturn { viewOf, scaleOf, frameOf, frameAlong, solidOf, disc, toneOf, dot3, add3, mul3, unit3 };})();\n`;
const modelScript = `const MODEL = (() => {${readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "")}\nreturn { LIDAR, SCENE, planesOf, inTile, cast, returnsOf, angleAt, timeAt, xAt, readoutOf, tri, SURFACE };})();\n`;
const partsScript = `const PARTS = (() => {${readFileSync(join(HERE, "parts.mjs"), "utf8").replace(/^export /gm, "")}\nreturn { prismPaths, mirrorPoly, MIRROR };})();\n`;
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
// Fig 2: the head through the loupe, its model and parts inlined as modules of their own
const HEAD = buildHead();
const moduleScript = (name, file, mod) => `const ${name} = (() => {${readFileSync(join(HERE, file), "utf8").replace(/^export /gm, "")}\nreturn { ${Object.keys(mod).join(", ")} };})();\n`;
const headScript = moduleScript("HM", "head-model.mjs", HMOD) + moduleScript("HPARTS", "head-parts.mjs", await import("./head-parts.mjs"));
// the guide's flat drawings, redrawn in the page by the same functions while they animate
const figSource = readFileSync(join(HERE, "guide-figs.mjs"), "utf8");
const guideScript = `const GFIG = (() => {${figSource.slice(0, figSource.indexOf("// ---------------------------------------------------------------- wavelength")).replace(/^import .*$/m, "").replace(/^export /gm, "")}\nreturn { FIGS, ANIMS, lidarWith };})();\n` + readFileSync(join(HERE, "guide-live.js"), "utf8");
const HEAD_LIVE = readFileSync(join(HERE, "head-live.js"), "utf8").replace("__HEAD__", JSON.stringify(HEAD.DATA));
const HF = HMOD.factsOf(HMOD.defaults);

const swathM = LIDAR.swath.toFixed(0);
const fig1 =
  k.plateHtml({
    fig: "Fig 1",
    title: "Airborne lidar, galvo scan",
    hint: "Drag to fly · hover a part · click to slow time",
    readout: readoutOf(DATA.start),
    keys: [
      { mark: "lit", label: "Scan mirror on the galvanometer shaft: the only part that moves inside the sensor head" },
      { mark: "raised", label: "Laser, receiver and timing board in a cut-open housing on a stabilised mount over the floor port" },
      { mark: "edge", label: "Points: each one is a pulse's echo, placed by its scan angle and range" },
    ],
    caption: `A survey aircraft flies over a small square of country with the top and near side of its fuselage cut away. The lidar sensor head sits in a cut-open housing on a stabilised mount, the GNSS antenna is on the crown, and the navigation computer on the floor draws the live waveform on its monitor, the scope below. The drawing shows one pulse in ${LIDAR.pulseDecimation.toFixed(0)} and flies ${LIDAR.slow.toFixed(0)}× slower than the real aircraft.`,
    body: stage + bigScope,
  });

const kHz = (v) => (v >= 1e6 ? `${v / 1e6} MHz` : `${v / 1e3} kHz`);
const SC = HMOD.SCANNERS;
const fig2 = k.plateHtml({
  fig: "Fig 2",
  title: "The sensor head, through loupe A",
  hint: "Hover a part · zoom ring or + − · drag to pan · time ring slows pulses · click to pause",
  readout: `${HF.swath.toFixed(0)} m swath · ${HF.density.toFixed(0)} pts/m² · ${HF.inAir} in air`,
  keys: [
    { mark: "lit", label: "The scanner: the one part that moves, and the one you can swap" },
    { mark: "raised", label: "Laser, beam expander, receiving telescope, detector and timing board on the optical bench" },
    { mark: "edge", label: "Top-down, the pattern the scanner lays on the ground; right, what the receiver hears from the last pulse" },
  ],
  caption: `The lidar sensor head from loupe A on its optical bench, beside the pattern it draws on a map at ${HMOD.FLIGHT.alt} m and the echoes its receiver hears. Hover any part for a card saying what it does; the controls below rebuild the head.`,
  body: `<div class="hd-layout">${HEAD.stage}${HEAD.side}</div>${HEAD.controls}`,
});

// Fig 3: the boresight bench, the strips it flies and the calibration that finds it
const CALF = calHtml();
const calScript = moduleScript("CALM", "cal-model.mjs", CALMOD) + moduleScript("CALP", "cal-parts.mjs", CALPARTS);
const CAL_LIVE = readFileSync(join(HERE, "cal-live.js"), "utf8").replace("__CAL__", JSON.stringify(CALF.DATA));
const fig3 = k.plateHtml({
  fig: "Fig 3",
  title: "Boresight, from strips to a point cloud",
  hint: "Hover a part · turn the screws · Solve",
  readout: "strips differ – cm · points off – cm",
  keys: [
    { mark: "lit", label: "The scanner's pointer: where it really looks. The reticle is where the IMU says it looks, and the small ring inside it where processing thinks the ball is" },
    { mark: "raised", label: "IMU, GNSS receiver and antenna, and the scanner on a tip-tilt plate over a heading turntable" },
    { mark: "edge", label: "Right, the processed strips: their height difference in plan, and the points through two roofs" },
  ],
  caption: `The screws under the scanner set its true boresight, the small angles between it and the IMU. Two or three strips are flown over three buildings with that mount and processed with the estimate in the table; Solve finds the estimate from the strips alone, by fitting planes to every roof and patch of ground they share. The mount is drawn turned ${CALMOD.CAL.EXAG}× as far as the screws set it, and the strips show one pulse in ${CALMOD.CAL.shown}.`,
  body: `<div class="hd-layout cb-layout">${CALF.stage}${CALF.side}</div>${CALF.controls}`,
});

const GUIDE_CSS = readFileSync(join(HERE, "guide.css"), "utf8");
const body = `<style>${CSS}${GUIDE_CSS}</style>` + guideHtml({ LIDAR, HM: HMOD, HF, CAL: CALMOD.CAL, fig1, fig2, fig3, scans: scannerThumbs() });
// the dark page follows ?theme=light|dark, then the reader's saved choice (the masthead switch), then the system theme;
// it runs before any figure script reads data-theme, and reloads on a system change while on Auto because the shaders
// and canvases pick their inks once at start
const AUTO_THEME = `<script>(()=>{const K="lidar-theme",q=new URLSearchParams(location.search).get("theme"),m=matchMedia("(prefers-color-scheme: light)"),pref=()=>{try{const s=localStorage.getItem(K);return s==="light"||s==="dark"?s:"auto"}catch{return"auto"}},p=pref(),b=document.body;b.dataset.themePref=p;b.dataset.theme=q==="light"||q==="dark"?q:p!=="auto"?p:m.matches?"light":"dark";if(!q)m.addEventListener("change",()=>{if(pref()==="auto")location.reload()})})()</script>`;
const page = k.pageHtml({ title: "How airborne lidar works: a field guide", theme: THEME, body: (THEME === "dark" ? AUTO_THEME : "") + body, script: kitScript() + glScript() + latheScript + modelScript + partsScript + LIVE + headScript + HEAD_LIVE + calScript + CAL_LIVE + guideScript, width: 1120 });
if (!page.includes(`data-theme="dark"><main class="iso-page">${AUTO_THEME}`) && THEME === "dark") throw new Error("theme script must open <main>");
const name = THEME === "light" ? "lidar-light.html" : "lidar.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${R.items.length} items`, `${R.solids.length} solids`, `scale ${KS.toFixed(3)}`, `${CABLES.length} cables`, `fallback ${FALLBACK.length} dots`);

A.auditOrExit(R, P, {});
if (process.argv.includes("--audit")) console.log(`fig 3 bench: ${CALF.items} items, ${CALF.solids} solids`);
A.auditOrExit(CALF.R, CP, {});
