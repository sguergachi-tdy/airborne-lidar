// Flat 2D geometry drawings that sit above the guide's equations. Every length and angle is computed from the model; where
// a drawing has to exaggerate (spacing, roll, boresight) it says so.
import { SCANNERS, poseOf, groundOf, FLIGHT, signalAt, discreteOf, photonsOf } from "./head-model.mjs";

const C = 299792458;
const n = (v) => Math.round(v * 100) / 100;
const dOf = (pts, close = false) => pts.map(([x, y], i) => `${i ? "L" : "M"}${n(x)} ${n(y)}`).join("") + (close ? "Z" : "");
const rad = (a) => (a * Math.PI) / 180;
const polar = ([cx, cy], r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const rot = ([x, y], a) => [x * Math.cos(rad(a)) - y * Math.sin(rad(a)), x * Math.sin(rad(a)) + y * Math.cos(rad(a))];

// tones: s soft, h head, a accent, f faint
const line = (pts, tone = "s", extra = "") => `<path class="ln t-${tone}${extra}" d="${dOf(pts)}"/>`;
const dash = (pts, tone = "s") => line(pts, tone, " dash");
const shape = (pts, cls) => `<path class="${cls}" d="${dOf(pts, true)}"/>`;
const dot = ([x, y], r, tone = "a") => `<circle class="fl t-${tone}" cx="${n(x)}" cy="${n(y)}" r="${r}"/>`;
const ring = ([x, y], r, tone = "a") => `<circle class="ln t-${tone} paper" cx="${n(x)}" cy="${n(y)}" r="${r}"/>`;
const text = ([x, y], s, cls = "lb", anchor = "middle") => `<text class="${cls}" x="${n(x)}" y="${n(y)}" text-anchor="${anchor}">${s}</text>`;
const v = (s) => `<tspan class="vi">${s}</tspan>`;
// a changing number padded to a fixed width with figure spaces (as wide as a digit), so its label never shifts
const pad = (s, w) => String(s).padStart(w, "\u2007");
const vb = (s) => `<tspan class="vb">${s}</tspan>`;
const sub = (s) => `<tspan class="sb" dy="4">${s}</tspan><tspan dy="-4"> </tspan>`;

function arrow(a, b, tone = "a", size = 7) {
  const u = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const back = (da) => [b[0] - size * Math.cos(u + da), b[1] - size * Math.sin(u + da)];
  const stem = [b[0] - size * 0.7 * Math.cos(u), b[1] - size * 0.7 * Math.sin(u)];
  return line([a, stem], tone) + shape([b, back(0.38), back(-0.38)], `fl t-${tone}`);
}
function arc(c, r, a0, a1, tone = "s") {
  const p0 = polar(c, r, a0);
  const p1 = polar(c, r, a1);
  return `<path class="ln t-${tone}" d="M${n(p0[0])} ${n(p0[1])}A${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${n(p1[0])} ${n(p1[1])}"/>`;
}
// a dimension: the measured line with a short bar square to it at each end
function dim(a, b, tone = "h", bar = 5) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const p = [(-(b[1] - a[1]) / L) * bar, ((b[0] - a[0]) / L) * bar];
  return line([a, b], tone) + line([add(a, p), add(a, p, -1)], tone) + line([add(b, p), add(b, p, -1)], tone);
}
function ground(x0, x1, y) {
  const hatch = [];
  for (let x = x0 + 8; x <= x1; x += 8) hatch.push(`M${n(x)} ${n(y)}L${n(x - 6)} ${n(y + 7)}`);
  return `<path class="ln t-f" d="${hatch.join("")}"/>` + line([[x0, y], [x1, y]], "s");
}
// the survey aircraft seen from behind: fuselage, low wing with a little dihedral, engines, fin and the sensor port
function craftFront([cx, cy], r, roll = 0, { fin = true, port = true } = {}) {
  const span = r * 5.6;
  const wy = r * 0.4;
  const wing = (s) => shape([[s * r * 0.75, wy - 2], [s * span, wy - 6], [s * span, wy - 4.2], [s * r * 0.75, wy + 2]], "fl-paper ln t-h");
  const out = [];
  if (fin) out.push(shape([[-1.8, -r + 1], [-0.9, -r - 13], [0.9, -r - 13], [1.8, -r + 1]], "fl-paper ln t-s"));
  out.push(wing(-1), wing(1));
  for (const s of [-1, 1]) out.push(`<circle class="fl-paper ln t-h" cx="${n(s * r * 2.7)}" cy="${n(wy + r * 0.5)}" r="${n(r * 0.36)}"/>`);
  out.push(`<circle class="fl-paper ln t-h" cx="0" cy="0" r="${r}"/>`);
  if (port) out.push(dot([0, r], 1.6, "a"));
  return `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${roll})">${out.join("")}</g>`;
}
// the aircraft from above, nose along +x
function craftPlan([cx, cy], s = 1) {
  const fus = "M30 0C26 -4 18 -4.6 10 -4.6L-22 -3.6L-30 -1.4L-30 1.4L-22 3.6L10 4.6C18 4.6 26 4 30 0Z";
  const wing = (k) => dOf([[8, k * 4.4], [-1, k * 34], [-8, k * 34], [-6, k * 4.4]], true);
  const tail = (k) => dOf([[-21, k * 3.4], [-26, k * 12], [-29.5, k * 12], [-28.5, k * 2.6]], true);
  const eng = (k) => `<rect class="fl-paper ln t-h" x="-5" y="${k > 0 ? 12 : -17}" width="13" height="5" rx="2"/>`;
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${s})"><path class="fl-paper ln t-h" d="${wing(-1)}${wing(1)}"/><path class="fl-paper ln t-h" d="${tail(-1)}${tail(1)}"/>${eng(-1)}${eng(1)}<path class="fl-paper ln t-h" d="${fus}"/></g>`;
}
const svg = (w, h, label, body) => `<svg class="gq" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${body.join("")}</svg>`;

// ---------------------------------------------------------------- 1 · R = c·Δt/2
// animated, a.p is the time since the pulse left, in µs; without it the round trip is complete
export function rangingFig(L, a = {}) {
  const out = [];
  const R = L.metres;
  const tof = ((2 * R) / C) * 1e6;
  const p = a.p ?? Infinity;
  // left: the aircraft, the pulse down and its echo up, R between them
  // the ground shares the scope's baseline; 150 m reaches the same height as before
  const gy = 168;
  const S = [104, gy - R * (128 / 150)];
  out.push(ground(24, 184, gy));
  const top = S[1] + 13;
  const bot = gy - 2;
  const leg = (x, from, to) => (Math.abs(to - from) > 9 ? arrow([x, from], [x, to], "a") : dot([x, to], 1.8, "a"));
  if (p >= tof / 2) out.push(arrow([S[0] - 5, top], [S[0] - 5, bot], "a"));
  else out.push(leg(S[0] - 5, top, top + (bot - top) * (p / (tof / 2))));
  if (p >= tof) out.push(`<g class="echo">${arrow([S[0] + 5, bot], [S[0] + 5, top], "a")}</g>`);
  else if (p > tof / 2) out.push(`<g class="echo">${leg(S[0] + 5, bot, bot - (bot - top) * ((p - tof / 2) / (tof / 2)))}</g>`);
  out.push(craftFront(S, 10));
  if (p >= tof / 2) out.push(dot([S[0], gy], 2.2, "a"));
  out.push(dash([[S[0] - 64, S[1] + 10], [34, S[1] + 10]], "f"));
  out.push(dim([28, S[1] + 10], [28, gy]));
  const mid = (S[1] + 10 + gy) / 2;
  out.push(text([38, mid - 9], `${v("R")}`, "vi", "start"), text([38, mid + 9], `${pad(Math.round(R), 3)} m`, "lb num", "start"));
  // right: the scope, T0 and the echo Δt later, read on two scales
  const x0 = 262;
  const k = 262;
  const X = (t) => x0 + t * k;
  const base = 168;
  const g = (t, c, h, s) => h * Math.exp(-(((t - c) * k) ** 2) / (2 * s * s));
  const pts = [];
  const end = Math.min(1.02, p);
  for (let t = -0.08; t <= end; t += 0.002) pts.push([X(t), base - g(t, 0, 92, 3.2) - g(t, tof, 50, 5.5)]);
  out.push(line([[X(-0.08), base], [X(1.02), base]], "s"));
  for (let i = 0; i <= 5; i++) {
    const t = i * 0.2;
    out.push(line([[X(t), base], [X(t), base + (i % 5 ? 4 : 7)]], "s"));
    out.push(text([X(t), base + 20], i ? `${n(t)}` : "0", "lb"), text([X(t), base + 38], `${Math.round((C * t * 1e-6) / 2)}`, "lb num"));
  }
  out.push(text([X(-0.08) - 6, base + 20], "µs", "lb", "end"), text([X(-0.08) - 6, base + 38], "m", "lb num", "end"));
  out.push(`<path class="ln t-a trace" d="${dOf(pts)}"/>`);
  if (p < 1.02) out.push(dot(pts[pts.length - 1], 2.2, "a"));
  out.push(text([X(0), base - 100], `T${sub("0")}`, "lb", "middle"));
  out.push(dash([[X(0), base - 108], [X(0), 44]], "f"));
  if (p >= tof) {
    out.push(text([X(tof), base - 58], "echo", "lb", "middle"));
    out.push(dash([[X(tof), base - 66], [X(tof), 44]], "f"));
    out.push(dim([X(0), 40], [X(tof), 40]));
    out.push(text([(X(0) + X(tof)) / 2, 30], `${v("Δt")} = ${tof.toFixed(3)} µs`, "lb hd"));
  }
  return svg(560, 216, `Left, a pulse leaves the aircraft, reaches the ground ${Math.round(R)} m below and its echo returns. Right, the scope: the outgoing pulse at T0 and its echo ${tof.toFixed(3)} microseconds later, on a time scale and a range scale where 0.2 µs is 30 m.`, out);
}

// ---------------------------------------------------------------- 2 · Rmax = c / (2·PRF): range against time, three pulse periods
export function maxRangeFig(L) {
  const out = [];
  const per = L.period * 1e6;
  const rmax = Math.round(L.maxRange);
  const x0 = 78;
  const X = (t) => x0 + t * 46;
  const Y = (r) => 46 + r * 0.205;
  const far = Math.round((rmax * 1.3) / 10) * 10;
  const read = far - rmax;
  const tEnd = 10.2;
  // at a high PRF Rmax comes up toward the ground: its labels slide below its line, clear of the crowded pulses
  const k = ease((450 - rmax) / 150);
  const halo = k > 0 ? " halo" : "";
  // the ground and the unambiguous range; the ground label takes a halo wherever a pulse crosses it
  const tg = (L.metres / C) * 1e6;
  const gx = [X(7.8) - 116, X(7.8) + 2];
  let crossed = false;
  for (let i = 0; i * per <= tEnd; i++) if (X(i * per) < gx[1] && X(i * per + 2 * tg) > gx[0]) crossed = true;
  out.push(line([[x0, Y(0)], [X(tEnd), Y(0)]], "h"));
  out.push(line([[x0, Y(0)], [x0, Y(840)]], "s"));
  for (let r = 0; r <= 800; r += 200) out.push(line([[x0 - 5, Y(r)], [x0, Y(r)]], "s"), text([x0 - 9, Y(r) + 5], `${r}${r === 800 ? " m" : ""}`, "lb", "end"));
    for (let t = 0; t <= 10; t += 1) out.push(line([[X(t), Y(840)], [X(t), Y(840) + (t % 2 ? 4 : 7)]], "s"), t % 2 ? "" : text([X(t), Y(840) + 22], `${t}${t === 10 ? " µs" : ""}`, "lb"));
  out.push(line([[x0, Y(840)], [X(tEnd), Y(840)]], "s"));
  // the ground and the unambiguous range
  out.push(line([[x0, Y(L.metres)], [X(tEnd), Y(L.metres)]], "f"), text([X(7.8), Y(L.metres) - 6], `ground · ${L.metres} m`, "lb" + (crossed ? " halo" : ""), "end"));
  out.push(dash([[x0, Y(rmax)], [X(tEnd), Y(rmax)]], "h"), text([X(tEnd), Y(rmax) - 7 + 25 * k], `${v("R")}${sub("max")} = ${rmax} m`, "lb hd" + halo, "end"));
  // each pulse: fired at the top, down to the ground and back
  for (let i = 0; i * per <= 10; i++) {
    const t = i * per;
    const pts = [[t, 0], [t + tg, L.metres], [t + 2 * tg, 0]];
    if (pts[2][0] > tEnd) {
      // the last pulse runs off the end of the time axis
      const u = (tEnd - t) / tg;
      pts.splice(u <= 1 ? 1 : 2, 3, [tEnd, L.metres * (u <= 1 ? u : 2 - u)]);
    }
    out.push(line(pts.map(([pt, r]) => [X(pt), Y(r)]), "a"));
    out.push(shape([[X(t) - 3.2, Y(0)], [X(t), Y(0) - 13], [X(t) + 3.2, Y(0)]], "fl t-a"));
    out.push(text([X(t) + 7, Y(0) - 5], `T${sub(String(i))}`, "lb", "start"));
  }
  // the pulse that could reach Rmax comes back exactly as the next one fires; one from farther comes back after it
  const tm = (rmax / C) * 1e6;
  out.push(line([[X(0), Y(0)], [X(tm), Y(rmax)], [X(2 * tm), Y(0)]], "a", " dash"));
  const tf = (far / C) * 1e6;
  out.push(line([[X(0), Y(0)], [X(tf), Y(far)], [X(2 * tf), Y(0)]], "s", " dash"));
  out.push(dot([X(tf), Y(far)], 2.4, "s"), text([X(tf) + 8, Y(far) + 5], `echo from ${far} m`, "lb", "start"));
  out.push(ring([X(2 * tf), Y(0)], 3.4, "h"));
  out.push(dash([[X(2 * tf), Y(0)], [X(2 * tf), Y(read)]], "f"), dot([X(2 * tf), Y(read)], 2.2, "h"));
  const readText = (y) => text([X(tEnd), y], `timed from T${sub("1")}: read as ${pad(read, 3)} m`, "lb hd" + halo, "end");
  if (k === 0) out.push(readText(Y(read) + 20));
  else for (const [y, o] of [[Y(read) + 20, 1 - ease(k * 2)], [Y(rmax) + 40, ease(k * 2 - 1)]]) if (o > 0) out.push(`<g opacity="${n(o, 2)}">${readText(y)}</g>`);
  // the period label sits over its bracket while it fits; at a high PRF the bracket is short and it moves beside it
  const lab = `1/PRF = ${per.toFixed(2)} µs · ${pad(Math.round(L.prf / 1000), 3)} kHz`;
  const fits = ease((X(per) - X(0) - lab.length * 7 - 8) / 16);
  out.push(dim([X(0), 14], [X(per), 14]));
  for (const [o, t] of [[fits, text([X(per / 2), 8], lab, "lb hd")], [1 - fits, text([X(per) + 10, 18.5], lab, "lb hd", "start")]]) if (o > 0) out.push(o >= 1 ? t : `<g opacity="${n(o, 2)}">${t}</g>`);
  return svg(560, 238, `Range against time over three pulse periods of ${n(per)} microseconds. Each pulse goes down to the ground and back long before the next fires. A pulse reaching ${n(rmax)} m would return just as the next fires; an echo from ${far} m returns after it and is read as ${read} m.`, out);
}

// ---------------------------------------------------------------- 3 · swath = 2·h·tan θhalf, and the mirror that doubles its angle
// animated, a.beam is where the galvo points the beam now, in degrees; without it the mirror rests at the edge of the swath
export function swathFig(L, a = {}) {
  const out = [];
  const half = L.half;
  const beam = a.beam ?? half;
  const phi = beam / 2;
  const deg = (x, step = 1) => Math.round(Math.abs(x) / step) * step;
  // left: a mirror turned by φ turns the reflected beam by 2φ
  const M = [112, 78];
  out.push(arrow([16, M[1]], [M[0] - 3, M[1]], "a"), text([18, M[1] + 20], "laser", "lb", "start"));
  out.push(dash([M, polar(M, 128, 90)], "s"));
  out.push(arrow(M, polar(M, 128, 90 + beam), "a"));
  out.push(arc(M, 92, 90, 90 + beam, "h"));
  out.push(text(polar(M, 100, beam >= 0 ? 84 : 96), `2${v("φ")} = ${pad(deg(beam), 2)}°`, "lb hd", beam >= 0 ? "start" : "end"));
  out.push(dash([polar(M, 34, 45), polar(M, 34, 225)], "s"));
  out.push(`<path class="ln t-h mirror" d="${dOf([polar(M, 34, 45 + phi), polar(M, 34, 225 + phi)])}"/>`);
  out.push(arc(M, 28, 225, 225 + phi, "h"), text(polar(M, 40, 222), `${v("φ")} = ${pad(deg(phi, 0.5).toFixed(1), 4)}°`, "lb hd", "end"));
  out.push(ring(M, 2.6, "h"));
  out.push(text([112, 230], "galvo mirror", "lb"));
  // right: the swath under the aircraft
  const gy = 204;
  const S = [392, gy - 12 - L.metres];
  const h = gy - S[1] - 12;
  const w = h * Math.tan(rad(half));
  const o = [S[0], S[1] + 12];
  out.push(shape([o, [o[0] - w, gy], [o[0] + w, gy]], "wash"));
  out.push(ground(256, 548, gy));
  out.push(line([o, [o[0] - w, gy]], "a"), line([o, [o[0] + w, gy]], "a"), dash([o, [o[0], gy]], "s"));
  for (let i = -4; i <= 4; i++) out.push(dot([o[0] + (i / 4) * w, gy], 1.7, "a"));
  if (a.beam !== undefined) {
    const hit = [o[0] - h * Math.tan(rad(beam)), gy];
    out.push(line([o, hit], "a"), dot(hit, 3, "a"));
  }
  out.push(craftFront(S, 10));
  out.push(arc(o, 64, 90, 90 + half, "h"), text(polar(o, 72, 90 + half + 4), `${v("θ")}${sub("half")}= ${Math.round(half)}°`, "lb hd", "end"));
  const mid = (o[1] + gy) / 2;
  out.push(dash([[o[0] + 66, o[1]], [o[0] + 104, o[1]]], "f"), dim([o[0] + 98, o[1]], [o[0] + 98, gy]));
  out.push(text([o[0] + 108, mid - 11], v("h"), "vi", "start"),   text([o[0] + 108, mid + 7], `${pad(Math.round(L.metres), 3)} m`, "lb num", "start"));
    out.push(dim([o[0] - w, gy + 16], [o[0] + w, gy + 16]), text([o[0], gy + 34], `swath = ${pad(Math.round(L.swath), 3)} m`, "lb hd"));
  return svg(560, 244, `Left, a galvo mirror turned by ${n(phi)} degrees turns the reflected beam by ${n(beam)}. Right, the beam swinging ±${n(half)} degrees from ${Math.round(L.metres)} m lights a swath ${n(L.swath)} m wide.`, out);
}

// ---------------------------------------------------------------- 4 · along-track spacing, from above
// animated, a.x is where the aircraft's nose is now; without it the flight is over. Drawn spacing scales with the true one.
export function spacingFig(L, a = {}) {
  const out = [];
  const y0 = 54;
  const y1 = 176;
  const yc = (y0 + y1) / 2;
  const x0 = 46;
  const dx = 40 * (L.lineSpacing / 0.55);
  const lines = Math.floor(400 / dx + 1e-9);
  const px = a.x ?? x0 + lines * dx + 10;
  const u = Math.max(0, (px - 10 - x0) / dx);
  const yAt = (i, f) => (i % 2 ? y1 + (y0 - y1) * f : y0 + (y1 - y0) * f);
  out.push(line([[x0 - 6, y0], [530, y0]], "f"), line([[x0 - 6, y1], [530, y1]], "f"), dash([[x0 - 6, yc], [530, yc]], "f"));
  const zig = [];
  for (let i = 0; i <= Math.floor(u); i++) zig.push([x0 + i * dx, i % 2 ? y1 : y0]);
  if (u > Math.floor(u)) zig.push([x0 + u * dx, yAt(Math.floor(u), u - Math.floor(u))]);
  if (zig.length > 1) out.push(line(zig, "a"));
  for (let i = 0; i < Math.ceil(u); i++) {
    for (let j = 0; j <= 8 && i + j / 8 <= u + 1e-9; j++) {
      const f = j / 8;
      out.push(dot([x0 + (i + f) * dx, yAt(i, f)], 1.5, "a"));
    }
  }
  // flying in, the aircraft fades up as it clears the swath bracket
  const fade = a.x === undefined ? 1 : Math.min(1, Math.max(0, (px - 58) / 40));
  const craft = craftPlan([px, yc], 1.15) + arrow([px + 38, yc], [px + 96, yc], "h", 6) + text([px + 80, yc - 10], v("v"), "vi");
  if (fade > 0) out.push(fade < 1 ? `<g opacity="${n(fade)}">${craft}</g>` : craft);
  // successive lines cross the flight line Δx apart
  const ka = x0 + (Math.floor(lines / 2) - 0.5) * dx;
  const kb = ka + dx;
  if (px - 10 >= kb) {
    out.push(ring([ka, yc], 3.2, "h"), ring([kb, yc], 3.2, "h"));
    out.push(dash([[ka, yc + 4], [ka, y1 + 24]], "f"), dash([[kb, yc + 4], [kb, y1 + 24]], "f"), dim([ka, y1 + 20], [kb, y1 + 20]));
  }
  out.push(text([(ka + kb) / 2, y1 + 40], `${v("Δx")} = ${pad(L.speed, 3)} m/s ÷ ${pad(2 * L.scanHz, 3)} lines/s = ${pad(n(L.lineSpacing * 100), 4)} cm`, "lb hd"));
  out.push(dim([x0 - 22, y0], [x0 - 22, y1]), text([x0 - 30, yc], "swath", "lb rot", "middle"));
  out.push(text([530, 40], "spacing exaggerated", "lb", "end"));
  return svg(560, 226, `Seen from above, the galvo draws a zigzag across the swath as the aircraft flies on. Successive lines cross the flight line ${n(L.lineSpacing * 100)} cm apart.`, out);
}

// ---------------------------------------------------------------- 5 · density: one second of flight, and one square metre of it
// animated, a.fill is how much of the second has been flown and a.plane the aircraft's opacity
export function densityFig(L, a = {}) {
  const out = [];
  const fill = a.fill ?? 1;
  const along = L.speed;
  const across = L.swath;
  const k = Math.min(2.1, 170 / across);
  const r0 = [80, 30];
  const rw = along * k;
  const rh = across * k;
  const fw = rw * fill;
  out.push(shape([r0, [r0[0] + fw, r0[1]], [r0[0] + fw, r0[1] + rh], [r0[0], r0[1] + rh]], "wash ln t-a"));
  out.push(dim([r0[0], r0[1] + rh + 14], [r0[0] + rw, r0[1] + rh + 14]), text([r0[0] + rw / 2, r0[1] + rh + 32], `${v("v")} · 1 s = ${Math.round(along)} m`, "lb hd"));
  out.push(dim([r0[0] - 14, r0[1]], [r0[0] - 14, r0[1] + rh]), text([r0[0] - 24, r0[1] + rh / 2], `swath ${Math.round(across)} m`, "lb hd rot"));
  const pulses = Math.round((L.prf * fill) / 1000) * 1000;
  out.push(text([r0[0] + rw + 12, r0[1] + 12], `PRF · 1 s`, "lb", "start"), text([r0[0] + rw + 12, r0[1] + 30], `= ${pad(pulses.toLocaleString("en-US").replace(/,/g, "\u2007"), 7)}`, "lb hd", "start"), text([r0[0] + rw + 12, r0[1] + 48], `pulses`, "lb hd", "start"));
  // one square metre, true size in the strip, then enlarged
  const m = [r0[0] + rw * 0.55, r0[1] + rh * 0.52];
  const B = [296, 34];
  const s = 150;
  out.push(line([m, B], "f"), line([[m[0], m[1] + k], [B[0], B[1] + s]], "f"));
  out.push(shape([m, [m[0] + k, m[1]], [m[0] + k, m[1] + k], [m[0], m[1] + k]], "fl t-h"));
  out.push(shape([B, [B[0] + s, B[1]], [B[0] + s, B[1] + s], [B[0], B[1] + s]], "fl-paper ln t-h"));
  const sx = L.lineSpacing;
  const sy = L.swath / L.pulsesPerSweep;
  const r = Math.min(1.9, 0.33 * sy * s);
  if (fw >= m[0] + k - r0[0]) {
    const lx = [];
    for (let i = 0; (i + 0.4) * sx < 1; i++) {
      const x = (i + 0.4) * sx;
      lx.push(B[0] + x * s);
      out.push(line([[B[0] + x * s, B[1]], [B[0] + x * s, B[1] + s]], "f"));
      for (let j = 0; (j + (i % 2 ? 0.25 : 0.75)) * sy < 1; j++) {
        out.push(dot([B[0] + x * s, B[1] + (j + (i % 2 ? 0.25 : 0.75)) * sy * s], r, "a"));
      }
    }
    const i0 = lx.length >= 4 ? 2 : 0;
    if (lx.length > 1) out.push(dim([lx[i0], B[1] - 10], [lx[i0 + 1], B[1] - 10]), text([(lx[i0] + lx[i0 + 1]) / 2, B[1] - 18],     `${v("Δx")} ${pad(n(sx * 100), 2)} cm`, "lb hd"));
    const ya = B[1] + 0.75 * sy * s;
        out.push(dim([B[0] + s + 10, ya], [B[0] + s + 10, ya + sy * s]), text([B[0] + s + 18, ya + 10], `${v("Δy")} ${pad((sy * 100).toFixed(1), 4)} cm`, "lb hd", "start"));
  }
  out.push(text([B[0] + s / 2, B[1] + s + 24], `1 m² · ≈ ${pad(Math.round(L.density), 3)} points`, "lb hd"));
  if (a.plane > 0) out.push(`<g opacity="${n(a.plane)}">${craftPlan([r0[0] + fw, r0[1] + rh / 2], 0.7)}</g>`);
  return svg(560, 250, `The strip flown in one second, ${Math.round(along)} by ${n(across)} metres, holds ${L.prf} pulses. Enlarged, one square metre of it: scan lines ${n(sx * 100)} cm apart with pulses every ${(sy * 100).toFixed(1)} cm along each, about ${Math.round(L.density)} points.`, out);
}

// ---------------------------------------------------------------- 6 · p = g + Rnav (l + Rbore ρ u(θ))
// animated, a.roll and a.theta move the aircraft and the beam, and a.trail lists the last few [roll, theta]
export function georefFig(L, a = {}) {
  const out = [];
  const roll = a.roll ?? 8;
  const bore = 4;
  const theta = a.theta ?? 30;
  const r = 14;
  const Cc = [300, 70];
  const gy = 236;
  const O = [44, gy];
  const G = add(Cc, rot([0, -r - 5], roll));
  const S = add(Cc, rot([0, r + 3], roll));
  const down = (d) => [-Math.sin(rad(d)), Math.cos(rad(d))];
  const tip = (ro, th) => {
    const s = add(Cc, rot([0, r + 3], ro));
    const b = down(ro + bore - th);
    return add(s, b, (gy - s[1]) / b[1]);
  };
  const beam = down(roll + bore - theta);
  const t = (gy - S[1]) / beam[1];
  const p = add(S, beam, t);
  out.push(ground(20, 540, gy));
  for (const [ro, th] of a.trail ?? []) out.push(dot(tip(ro, th), 1.5, "s"));
  // the map frame
  out.push(arrow(O, [O[0] + 30, O[1]], "s", 5), arrow(O, [O[0], O[1] - 30], "s", 5), dot(O, 2.4, "h"));
  out.push(text([O[0] + 36, O[1] - 4], "E", "lb", "start"), text([O[0], O[1] - 38], "U", "lb"));
  // attitude: the wing against the level
  out.push(dash([[Cc[0] - 110, Cc[1]], [Cc[0] + 118, Cc[1]]], "f"));
  out.push(craftFront(Cc, r, roll, { fin: false, port: false }));
  out.push(arc(Cc, 104, 0, roll, "h"), text(polar(Cc, 112, roll / 2 + 1), `${v("R")}${sub("nav")}`, "lb hd", "start"));
  // the antenna on the crown, the IMU at the belly
  out.push(`<g transform="translate(${n(G[0])} ${n(G[1])}) rotate(${n(roll)})"><path class="fl-paper ln t-h" d="M-4 1.5Q-4 -4 0 -4.5Q4 -4 4 1.5Z"/></g>`);
  out.push(`<g transform="translate(${n(S[0])} ${n(S[1])}) rotate(${n(roll)})"><rect class="fl-paper ln t-h" x="-4" y="-4" width="8" height="8" rx="1"/></g>`);
  // boresight: the IMU's down axis and the scanner's, a few degrees apart
  out.push(dash([S, add(S, down(roll), 130)], "f"), dash([S, add(S, down(roll + bore), 130)], "s"));
  out.push(arc(S, 122, 90 + roll, 90 + roll + bore, "h"));
  const boreAt = (side) => (side > 0 ? text(polar(S, 126, 90 + roll + bore + 4), `${v("R")}${sub("bore")}`, "lb hd", "end") : text(polar(S, 126, 90 + roll - 4), `${v("R")}${sub("bore")}`, "lb hd", "start"));
  // the labels on the beam sit on its outer side, crossing over as it passes the boresight; θ fades when too small to label
  const faded = (o, s) => (o >= 1 ? s : o <= 0 ? "" : `<g opacity="${n(o)}">${s}</g>`);
  const right = Math.min(1, Math.max(0, theta / 6 + 0.5));
  out.push(faded(right, boreAt(1)), faded(1 - right, boreAt(-1)));
  out.push(faded(Math.min(1, Math.max(0, (Math.abs(theta) - 5) / 6)), arc(S, 58, 90 + roll + bore - theta, 90 + roll + bore, "h") + text(polar(S, 72, 90 + roll + bore - theta / 2), v("θ"), "vi")));
  // the vector chain: g to the antenna, l to the IMU, ρ·u(θ) out to the point
  out.push(arrow(O, add(G, [-3, 1]), "h", 8));
  out.push(text(add([(O[0] + G[0]) / 2, (O[1] + G[1]) / 2], [-14, -6]), vb("g"), "vb", "end"));
  out.push(arrow(G, add(S, rot([0, -4.5], roll)), "h", 6));
  out.push(text(add(Cc, [r + 7, -9]), vb("l"), "vb", "start"));
  out.push(arrow(add(S, beam, 5), p, "a", 8));
  const rho = `${v("ρ")} · ${vb("u")}(${v("θ")})`;
  out.push(faded(right, text(add(add(S, beam, t * 0.58), [12, 0]), rho, "vi", "start")), faded(1 - right, text(add(add(S, beam, t * 0.58), [-12, 0]), rho, "vi", "end")));
  out.push(dot(p, 3, "a"), faded(right, text([p[0] + 10, gy - 8], vb("p"), "vb", "start")), faded(1 - right, text([p[0] - 10, gy - 8], vb("p"), "vb", "end")));
  out.push(text([540, 30], "roll and boresight exaggerated", "lb", "end"));
  return svg(560, 252, "The georeferencing chain, seen from behind the aircraft: vector g from the map origin to the GNSS antenna, the attitude R nav tilting the aircraft, the lever arm l down to the IMU, the boresight R bore between the IMU's axis and the scanner's, and the pulse rho times u of theta out to the point p on the ground.", out);
}

// ---------------------------------------------------------------- 7 · walk-off, δ = ω·2R/c
// animated, a.u is the galvo's phase in cycles and a.R the range; without them the mirror is mid-sweep at 1000 m.
// The galvo follows the head model's rounded triangle; the receiver's field of view is taken as 1 mrad.
const FOV = 1e-3;
function galvoAt(L, u) {
  const x = 2 * Math.PI * u;
  const A = Math.asin(0.985);
  const s = 0.985 * Math.sin(x);
  return { theta: (L.half * Math.asin(s)) / A, rate: (rad(L.half) * 0.985 * Math.cos(x) * 2 * Math.PI * L.scanHz) / (A * Math.sqrt(1 - s * s)) };
}
// the share of a disc of radius b, d from the centre of a disc of radius a, that lies inside it
function inside(a, b, d) {
  if (d >= a + b) return 0;
  if (d <= a - b) return 1;
  const p = b * b * Math.acos((d * d + b * b - a * a) / (2 * d * b)) + a * a * Math.acos((d * d + a * a - b * b) / (2 * d * a));
  return (p - 0.5 * Math.sqrt((-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b))) / (Math.PI * b * b);
}
export function walkoffFig(L, a = {}) {
  const out = [];
  const R = a.R ?? 1000;
  const { theta, rate } = galvoAt(L, a.u ?? 0);
  const delta = rate * ((2 * R) / C);
  const mr = delta * 1e3;
  // left: the beam when the pulse left, and where the receiver looks when its echo comes back; angles drawn 12°/mrad
  const K = 12;
  const M = [160, 50];
  const gy = 196;
  const h = gy - M[1];
  const gx = (deg) => [M[0] - h * Math.tan(rad(deg)), gy];
  const now = theta + K * mr;
  const half = (K * FOV * 1e3) / 2;
  const spot = (K * L.divergence * 1e3) / 2;
  out.push(shape([M, gx(now - half), gx(now + half)], "wash"));
  out.push(ground(16, 330, gy));
  out.push(line([M, gx(now - half)], "f"), line([M, gx(now + half)], "f"), dash([M, gx(now)], "h"));
  // the receiver shares the scanner: the echo bundle comes back off the galvo, past the small injection mirror that
  // put the pulse in, and the objective focuses it on the field stop, off the pinhole by the walk-off (12 px per mrad)
  const pass = inside((FOV / 2) * 1e3, (L.divergence / 2) * 1e3, Math.abs(mr));
  const at = (dy) => [M[0] + dy / Math.tan(rad(45 + now / 2)), M[1] + dy];
  const J = [114, M[1]];
  const lens = 84;
  const w = 11;
  const F = [54, M[1] + Math.max(-18, Math.min(18, mr * 12))];
  const relay = 36;
  const r = (w * (F[0] - relay)) / (lens - F[0]);
  out.push(shape([[lens, M[1] - w], at(-w), at(w), [lens, M[1] + w]], "wash"));
  out.push(line([[lens, M[1] - w], at(-w)], "s"), line([[lens, M[1] + w], at(w)], "s"));
  out.push(line([J, [M[0] - 3, M[1]]], "a"), arrow([J[0], 6], [J[0], M[1] - 3], "a"), text([J[0] + 7, 16], "laser", "lb", "start"));
  out.push(`<path class="ln t-h mirror" d="${dOf([[J[0] - 5, M[1] - 5], [J[0] + 5, M[1] + 5]])}"/>`);
  out.push(line([[lens, M[1] - w], F], "s"), line([[lens, M[1] + w], F], "s"));
  const lensAt = (x, hh) => `<path class="fl-paper ln t-h" d="M${x} ${M[1] - hh}Q${x + hh / 2} ${M[1]} ${x} ${M[1] + hh}Q${x - hh / 2} ${M[1]} ${x} ${M[1] - hh}Z"/>`;
  out.push(`<g opacity="${n(pass)}">${line([F, [relay, M[1] - r]], "s")}${line([F, [relay, M[1] + r]], "s")}${line([[relay, M[1] - r], [14, M[1] - r]], "s")}${line([[relay, M[1] + r], [14, M[1] + r]], "s")}</g>`);
  out.push(lensAt(lens, 15), lensAt(relay, 10));
  out.push(`<rect class="fl-paper ln t-s" x="22" y="${M[1] - 10}" width="3" height="20"/>`);
  out.push(line([[F[0], M[1] - 22], [F[0], M[1] - 6]], "h", " trace"), line([[F[0], M[1] + 6], [F[0], M[1] + 22]], "h", " trace"));
  out.push(`<rect class="fl-paper ln t-h" x="6" y="${M[1] - 9}" width="8" height="18" rx="1.5"/>`, dot(F, 1.6, "a"));
  out.push(text([48, M[1] + 40], "receiver", "lb"));
  out.push(line([M, gx(theta)], "a"), line([gx(theta - spot), gx(theta + spot)], "a", " trace"), dot(gx(theta), 2.4, "a"));
  out.push(`<path class="ln t-f mirror" d="${dOf([polar(M, 30, 45 + theta / 2), polar(M, 30, 225 + theta / 2)])}"/>`);
  out.push(`<path class="ln t-h mirror" d="${dOf([polar(M, 30, 45 + now / 2), polar(M, 30, 225 + now / 2)])}"/>`);
  out.push(ring(M, 2.6, "h"));
  if (Math.abs(now - theta) > 0.6) out.push(arc(M, 104, 90 + Math.min(theta, now), 90 + Math.max(theta, now), "h"));
  out.push(text(polar(M, 116, 90 + Math.max(theta, now) + 3), v("δ"), "vi", "end"));
  const [x0, x1] = [gx(theta)[0], gx(now)[0]];
  out.push(dim([x0, gy + 16], [x1, gy + 16]), text([(x0 + x1) / 2, gy + 36], `${v("δ")}·${v("R")} = ${pad(Math.round(Math.abs(delta) * R * 100), 3)} cm`, "lb hd"));
  out.push(dim([306, M[1]], [306, gy]), text([300, (M[1] + gy) / 2 + 5], `${v("R")} = ${pad(Math.round(R), 4)} m`, "lb num", "end"));
  out.push(text([330, 22], "angles exaggerated", "lb", "end"));
  // right: the field stop seen from the detector, and the echo's image on it, offset by the walk-off
  const Q = [460, 106];
  const px = 60;
  const rs = (FOV / 2) * 1e3 * px;
  const rb = (L.divergence / 2) * 1e3 * px;
  const c = [Q[0] + mr * px, Q[1]];
  out.push(text([Q[0], 28], `field stop · ${FOV * 1e3} mrad`, "lb"));
  const speed = Math.min(1, Math.abs(rate) / 40);
  if (speed > 0.02) {
    const s = Math.sign(rate);
    out.push(`<g opacity="${n(speed)}">${arrow([Q[0] + 22 * s, 52], [Q[0] - 22 * s, 52], "h", 6)}</g>`);
  }
  out.push(ring(Q, rs, "h"), line([[Q[0] - rs - 14, Q[1]], [Q[0] - rs, Q[1]]], "f"), line([[Q[0] + rs, Q[1]], [Q[0] + rs + 14, Q[1]]], "f"));
  out.push(`<clipPath id="gd-wo-stop"><circle cx="${Q[0]}" cy="${Q[1]}" r="${rs}"/></clipPath>`);
  out.push(`<circle class="fl t-a" opacity="0.3" cx="${n(c[0])}" cy="${n(c[1])}" r="${rb}"/>`, `<g clip-path="url(#gd-wo-stop)"><circle class="fl t-a" cx="${n(c[0])}" cy="${n(c[1])}" r="${rb}"/></g>`);
  out.push(text([Q[0], 166], `${v("δ")} = ${pad(Math.abs(mr).toFixed(2), 4)} mrad`, "lb hd"));
  out.push(text([Q[0], 186], `${pad(Math.round(inside(rs, rb, Math.abs(mr) * px) * 100), 3)} % of the echo passes`, "lb"));
  return svg(560, 240, `Left, a small injection mirror puts the laser pulse onto a galvo mirror, which sends it ${Math.round(R)} m down; by the time its echo returns the mirror has turned on, so the receiver's field of view, which looks out through the same mirror, has moved ${n(mr)} milliradians past the lit spot, and the receiving telescope focuses the echo beside its pinhole. Right, the echo's image on a 1 mrad field stop, offset by that walk-off.`, out);
}

// ---------------------------------------------------------------- 8 · time sync: a shot's sensor time to GPS time to the trajectory
// animated, a.s is the shot's GPS time in seconds after T1; without it the shot sits 0.382 364 s after the PPS. The time
// axis is true: 305 px a second, so the IMU's 200 samples a second sit 1.5 px apart and the shots are a continuous band.
// The sensor clock is offset from GPS time by an arbitrary 0.83 s and runs 37 ppm fast, a typical crystal.
const T1 = 345601;
const MARKS = [4183.830412, 4184.830449];
const syncRoll = (t) => 2.2 * Math.sin((2 * Math.PI * t) / 2.7 + 0.9) + 1.1 * Math.sin((2 * Math.PI * t) / 0.9 + 2.1) + 0.4 * Math.sin((2 * Math.PI * t) / 0.37 + 0.4);
// Animated, a.z zooms the whole chart in about the shot: 0 is the 1.48 s overview, 1 is 12 ms (the IMU's samples, 5 ms
// apart, and the straight trajectory between them) and 2 is 25 µs (single shots at the PRF). The roll scale zooms with it.
const SYNC_W = [1.48, 0.012, 25e-6];
const SYNC_STEPS = [1e-6, 5e-6, 1e-5, 5e-5, 1e-4, 5e-4, 1e-3, 5e-3, 0.01, 0.05, 0.1, 0.5, 1];
export function syncFig(L, a = {}) {
  const out = [];
  const s = a.s ?? 0.382364;
  const z = Math.max(0, Math.min(2, a.z ?? 0));
  const X0 = 96;
  const X1 = X0 + SYNC_W[0] * 305;
  const lw = SYNC_W.map(Math.log);
  const W = Math.exp(z <= 1 ? lw[0] + (lw[1] - lw[0]) * z : lw[1] + (lw[2] - lw[1]) * (z - 1));
  const f0 = (s + 0.18) / SYNC_W[0];
  const t0 = s - (f0 + (0.5 - f0) * Math.min(1, z)) * W;
  const t1 = t0 + W;
  const k = (X1 - X0) / W;
  const X = (t) => X0 + (t - t0) * k;
  const inX = (x, m = 0) => x >= X0 + m && x <= X1 - m;
  const per = MARKS[1] - MARKS[0];
  const sensor = (t) => MARKS[0] + t * per;
  const op = (o, body) => (o <= 0 ? "" : o >= 1 ? body : `<g opacity="${n(o, 2)}">${body}</g>`);
  // a lane's label, and the accent that flashes over it when the zoom has come down to show that lane
  const label = (y, s, f = 0) => text([8, y], s, "lb", "start") + op(f, text([8, y], s, "lb num", "start"));
  const ms = (v) => String(Math.round((v - Math.floor(v)) * 1e3) % 1000).padStart(3, "0");
  const us = (v) => String(Math.round((v - Math.floor(v)) * 1e6) % 1e6).padStart(6, "0").replace(/^(\d{3})/, "$1 ");
  const secs = (v) => String(Math.round(v)).replace(/^(\d+)(\d{3})$/, "$1 $2");
  // a ruler that re-ticks itself as it zooms: each level of ticks fades in as it spreads, and is labelled once it has room
  const ruler = (y, v0, v1, xOf, name) => {
    const pxPer = (xOf(v1) - xOf(v0)) / (v1 - v0);
    out.push(line([[X0, y], [X1, y]], "s"));
    SYNC_STEPS.forEach((st, i) => {
      const sp = st * pxPer;
      if (sp < 16) return;
      const up = SYNC_STEPS[i + 1];
      const h = 4 + 3 * ease((sp - 155) / 25);
      const d = [];
      const labs = [];
      for (let j = Math.ceil(v0 / st - 1e-9); j <= Math.floor(v1 / st + 1e-9); j++) {
        const v = j * st;
        if (up && Math.abs(v / up - Math.round(v / up)) < 1e-6) continue;
        const x = xOf(v);
        d.push(`M${n(x)} ${y}L${n(x)} ${n(y + h)}`);
        if (sp > 155 && inX(x, 30)) labs.push(text([x, y + 21], st >= 1 ? `${name(v)} s` : st >= 1e-3 ? `${ms(v)} ms` : `${us(v)} µs`, "lb halo"));
      }
      out.push(op(ease((sp - 16) / 14), `<path class="ln t-s" d="${d.join("")}"/>`), op(ease((sp - 155) / 25), labs.join("")));
    });
  };
  // the trajectory: roll, blended from the IMU and GNSS below it, a straight line between the IMU's samples
  const lin = (t) => {
    const i = Math.floor(t * 200);
    return syncRoll(i / 200) + (syncRoll((i + 1) / 200) - syncRoll(i / 200)) * (t * 200 - i);
  };
  const roll = lin(s);
  const kr = 7 * (240 / 7) ** Math.min(1, z);
  const Yr = (r) => 58 - 7 * roll - (r - roll) * kr;
  const ks = [];
  for (let i = Math.floor(t0 * 200) + 1; i / 200 < t1; i++) ks.push(i);
  const curve = [[X0, Yr(lin(t0))], ...ks.map((i) => [X(i / 200), Yr(syncRoll(i / 200))]), [X1, Yr(lin(t1))]];
  out.push(`<clipPath id="gd-sync-roll"><rect x="${X0}" y="10" width="${n(X1 - X0)}" height="82"/></clipPath>`);
  out.push(`<g clip-path="url(#gd-sync-roll)">${dash([[X0, Yr(0)], [X1, Yr(0)]], "f")}${line(curve, "h")}</g>`, label(62, "roll"));
  // the IMU, 200 samples a second; spread out, each sample shows where it sits on the trajectory
  const imu = ks.map((i) => `M${n(X(i / 200))} 100L${n(X(i / 200))} 95`);
  out.push(`<path class="ln t-f" d="${imu.join("")}"/>`, line([[X0, 100], [X1, 100]], "s"), label(104, "IMU", a.fi ?? 0));
  const ksp = k / 200;
  const i0 = Math.floor(s * 200);
  const pts = [];
  for (const i of ks) {
    const p = [X(i / 200), Yr(syncRoll(i / 200))];
    if (p[1] < 14 || p[1] > 88) continue;
    pts.push(dot([p[0], 100], 2, "s"), dash([[p[0], 95], [p[0], p[1] + 4]], "f"), i === i0 || i === i0 + 1 ? ring(p, 3.2, "h") : dot(p, 2.6, "h"));
  }
  const seg = line([[X(i0 / 200), Yr(syncRoll(i0 / 200))], [X((i0 + 1) / 200), Yr(syncRoll((i0 + 1) / 200))]], "a");
  out.push(op(ease((ksp - 12) / 30), `<g clip-path="url(#gd-sync-roll)">${seg}</g>${pts.join("")}`));
  // GNSS fixes 5 a second, on the GPS second
  out.push(line([[X0, 122], [X1, 122]], "s"), label(126, "GNSS"));
  for (let i = Math.ceil(t0 * 5); i <= t1 * 5; i++) if (inX(X(i / 5))) out.push(dot([X(i / 5), 122], 2.4, "h"));
  // GPS time, and the receiver's PPS: a pulse on the edge of every second, then a message naming it
  ruler(148, t0, t1, X, (v) => secs(T1 + v));
  out.push(label(152, "GPS time"));
  const py = 200;
  const pulse = [[X0, py]];
  const edges = [Math.ceil(t0), Math.ceil(t0) + 1].filter((t) => inX(X(t)) && X(t) + 3 <= X1);
  for (const t of edges) pulse.push([X(t), py], [X(t), py - 16], [X(t) + 3, py - 16], [X(t) + 3, py]);
  pulse.push([X1, py]);
  out.push(line(pulse, "h"), label(204, "PPS"));
  for (const t of edges) {
    const bx = X(t) + 12;
    if (bx + 74 <= X1) out.push(`<rect class="fl-paper ln t-s" x="${n(bx)}" y="${py - 18}" width="74" height="18" rx="2"/>`, text([bx + 37, py - 4.5], secs(T1 + t), "lb"));
  }
  // the shots: a continuous band until they spread apart, then one mark per pulse
  const sy = 250;
  const psp = k / L.prf;
  const solo = ease((psp - 3) / 9);
  out.push(op(1 - solo, `<rect class="wash" x="${X0}" y="${sy - 34}" width="${n(X1 - X0)}" height="10"/>`), label(225, "shots", a.fs ?? 0));
  if (solo > 0) {
    const hw = Math.min(3.2, psp * 0.3);
    const tri = [];
    for (let j = Math.ceil((t0 - s) * L.prf); j <= (t1 - s) * L.prf; j++) {
      const x = X(s + j / L.prf);
      if (j && inX(x, hw)) tri.push(shape([[x - hw, sy - 24], [x, sy - 36], [x + hw, sy - 24]], "fl t-s"));
    }
    out.push(op(solo, tri.join("")));
  }
  // the sensor clock, offset and running fast: it logs each PPS edge as a mark
  ruler(sy, sensor(t0), sensor(t1), (c) => X((c - MARKS[0]) / per), secs);
  out.push(label(254, "sensor"));
  for (const t of [0, 1]) if (inX(X(t))) out.push(dash([[X(t), py + 2], [X(t), sy - 2]], "s"), ring([X(t), sy], 3, "h"));
  // the shot: its sensor time between the two marks gives its GPS time, and that picks the trajectory
  const xs = X(s);
  const top = [xs, Yr(roll)];
  out.push(line([[xs, sy], top], "a"), line([[xs, sy - 36], [xs, sy - 22]], "a", " trace"));
  out.push(op(solo, shape([[xs - 3.2, sy - 24], [xs, sy - 36], [xs + 3.2, sy - 24]], "fl t-a")));
  out.push(dot([xs, sy], 2.4, "a"), dot([xs, 148], 2.4, "a"), dot(top, 3.2, "a"));
  // each reading sits on the chart beside its own point on the shot's line: right of it, crossfading to the left near
  // the right edge, so nothing jumps as the shot sweeps
  const c = sensor(s);
  const fmt = (x, d) => x.toFixed(d).replace(/^(\d+)(\d{3})\./, "$1 $2.").replace(/(\.\d{3})(\d+)/, "$1 $2");
  const side = ease((xs - 326) / 32);
  const read = (y, str, yl = y) => op(1 - side, text([xs + 8, y], str, "lb hd halo", "start")) + op(side, text([xs - 8, yl], str, "lb hd halo", "end"));
  // the roll reading rides just above the curve wherever the text spans it, so a steep stretch never runs through it
  const over = (xa, xb) => {
    let y = top[1];
    for (let x = Math.max(X0, xa); x <= Math.min(X1, xb); x += 2) y = Math.min(y, Yr(lin(t0 + (x - X0) / k)));
    return Math.max(22, y - 7);
  };
  out.push(read(over(xs, xs + 72), `${roll < 0 ? "−" : "+"}${Math.abs(roll).toFixed(3)}°`, over(xs - 72, xs)));
  out.push(read(142, `${v("t")}${sub("GPS")} = ${fmt(T1 + s, 6)} s`));
  out.push(read(sy - 6, `${v("c")} = ${fmt(c, 6)} s`));
  // the window's width, across the top
  const wide = W >= 1 ? `${W.toFixed(2)} s` : W >= 1e-3 ? `${(W * 1e3).toFixed(W >= 0.1 ? 0 : 1)} ms` : `${(W * 1e6).toFixed(W >= 1e-4 ? 0 : 1)} µs`;
  out.unshift('<g transform="translate(0 10)">');
  out.push("</g>", dim([X0, 18], [X1, 18], "s"), text([(X0 + X1) / 2, 11], wide, "lb hd"));
  return svg(560, 292, `A timing diagram on one true time axis, ${wide} wide. At the top, the aircraft's roll from the trajectory, blended from IMU samples 200 times a second and GNSS fixes 5 times a second. Below, GPS time and the receiver's PPS, a pulse on the edge of each second followed by a message naming it. At the bottom, the sensor clock, offset and running slightly fast, logs each PPS edge as a mark beside its stream of shots. One shot logged at ${fmt(c, 6)} s on the sensor clock falls ${n(s)} of the way between the marks, so its GPS time is ${fmt(T1 + s, 6)} s, where the trajectory, a straight line between the IMU samples on either side, has the aircraft rolled ${roll.toFixed(3)} degrees. The chart zooms in on the shot to 12 milliseconds, where the IMU samples 5 ms apart appear, and to 25 microseconds, where single shots ${n(1e6 / L.prf)} microseconds apart appear.`, out);
}

// ---------------------------------------------------------------- the drawings' animations
// Each one plays once when it scrolls into view: at(t) gives the parameters to change and the drawing's own state at
// time t (s), and every animation ends exactly on the drawing at rest, so the page reads the same when it stops.
export function lidarWith(L, o = {}) {
  const x = { ...L, ...o };
  x.swath = 2 * x.metres * Math.tan(rad(x.half));
  x.period = 1 / x.prf;
  x.maxRange = C / (2 * x.prf);
  x.lineSpacing = x.speed / (2 * x.scanHz);
  x.pulsesPerSweep = x.prf / (2 * x.scanHz);
  x.density = x.prf / (x.speed * x.swath);
  return x;
}
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    if (t <= t1) return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
}
const triWave = (u) => {
  const f = ((u % 2) + 2) % 2;
  return f < 1 ? -1 + 2 * f : 3 - 2 * f;
};
const flights = (() => {
  // the aircraft flies the strip three times: a faster scan, a faster aircraft, then the survey as flown
  const runs = [{ scanHz: 100, speed: 55 }, { scanHz: 50, speed: 110 }, { scanHz: 50, speed: 55 }];
  let t = 0.3;
  return runs.map((run) => {
    const dx = 40 * (run.speed / (2 * run.scanHz) / 0.55);
    const span = Math.floor(400 / dx + 1e-9) * dx;
    const fly = span / (130 * (run.speed / 55));
    const r = { ...run, t0: t, t1: t + fly, span };
    t += fly + 1.1;
    return r;
  });
})();
const georefAt = (t, dur) => [8 * Math.cos((2 * Math.PI * t) / 5), 30 * triWave((t - dur) / 1.1 + 1)];

export const ANIMS = {
  // the aircraft fires at 150 m, glides down to 95 m and 50 m and fires again, then climbs back: the echo comes sooner
  ranging: {
    dur: 10.8,
    at(t) {
      const R = kf(t, [[2.4, 150], [3.4, 95], [5.8, 95], [6.8, 50], [9.2, 50], [10.6, 150]]);
      const shot = [0, 3.4, 6.8].find((s) => t >= s && t < s + 2.4);
      return { L: { metres: R }, a: { p: shot === undefined ? undefined : (t - shot) * 0.5 } };
    },
  },
  // PRF climbs from 250 kHz to 900 kHz and back: the pulses crowd together and Rmax falls toward the ground
  maxRange: {
    dur: 9.4,
    at: (t) => ({ L: { prf: Math.round(kf(t, [[0.8, 250e3], [4.2, 900e3], [5.8, 900e3], [9.2, 250e3]]) / 1000) * 1000 } }),
  },
  // the galvo sweeps; the scan angle widens to ±30°, then the aircraft descends to 85 m
  swath: {
    dur: 11.25,
    at(t) {
      const half = kf(t, [[1.8, 18], [3.3, 30], [4.8, 30], [6.3, 18]]);
      const metres = kf(t, [[6.3, 150], [7.8, 85], [9.3, 85], [10.8, 150]]);
      return { L: { half, metres }, a: { beam: half * triWave((t - 11.25) / 0.75 + 1) } };
    },
  },
  spacing: {
    dur: flights[flights.length - 1].t1 + 0.6,
    at(t) {
      const run = [...flights].reverse().find((r) => t >= r.t0) ?? flights[0];
      const fly = Math.min(1, Math.max(0, (t - run.t0) / (run.t1 - run.t0)));
      return { L: { scanHz: run.scanHz, speed: run.speed }, a: { x: fly < 1 ? 56 + fly * run.span : undefined } };
    },
  },
  // one second is flown and counted, then PRF rises to 400 kHz and back, then the aircraft slows to 35 m/s and back
  density: {
    dur: 10.8,
    at: (t) => ({
      L: { prf: Math.round(kf(t, [[3, 250e3], [4.5, 400e3], [5.5, 400e3], [6.5, 250e3]]) / 1000) * 1000, speed: Math.round(kf(t, [[6.8, 55], [8.2, 35], [9.2, 35], [10.4, 55]])) },
      a: { fill: Math.min(1, t / 2.2), plane: 1 - ease((t - 2.2) / 0.5) },
    }),
  },
  // the aircraft rolls through ±8° while the galvo sweeps ±30°; the last points stay on the ground behind the beam
  georef: {
    dur: 9.9,
    at(t) {
      const [roll, theta] = georefAt(t, 9.9);
      const trail = [];
      for (let k = 1; k <= 16 && t - k * 0.05 >= 0; k++) trail.push(georefAt(t - k * 0.05, 9.9));
      return { a: { roll, theta, trail } };
    },
  },
  // the galvo sweeps, slowed to one cycle in 2.5 s, at 1000 m, out to 2000 m, in to 300 m and back: the lag swings
  // with the mirror's speed, vanishes at each turnaround and grows with range
  walkoff: {
    dur: 10,
    at: (t) => ({ a: { u: t / 2.5, R: Math.round(kf(t, [[1.2, 1000], [2.8, 2000], [4.4, 2000], [6.2, 300], [7.6, 300], [9.2, 1000]])) } }),
  },
  // the chart zooms in on the shot to 12 ms and 25 µs and back out, flashing the lane each zoom has come down to show
  // (the IMU's samples, then single shots); then the shot slides along the sensor clock to the next second, back past
  // the first and home, and GPS time and roll follow
  sync: {
    dur: 19.6,
    at: (t) => ({
      a: {
        z: kf(t, [[0.6, 0], [2.8, 1], [4.8, 1], [7, 2], [9, 2], [10.6, 0]]),
        fi: t > 2.6 && t < 4.4 ? Math.sin((Math.PI * 3 * (t - 2.6)) / 1.8) ** 2 : 0,
        fs: t > 6.8 && t < 8.6 ? Math.sin((Math.PI * 3 * (t - 6.8)) / 1.8) ** 2 : 0,
        s: kf(t, [[11, 0.382364], [13, 1.02], [13.8, 1.02], [16.2, -0.1], [17, -0.1], [19, 0.382364]]),
      },
    }),
  },
};
export const FIGS = { ranging: rangingFig, maxRange: maxRangeFig, swath: swathFig, spacing: spacingFig, density: densityFig, georef: georefFig, walkoff: walkoffFig, sync: syncFig };

// ---------------------------------------------------------------- wavelength: what each laser sees
// Typical reflectance of a green leaf, dry bare soil and fresh fine-grained snow (after the USGS and ASTER spectral
// libraries and Wiscombe & Warren 1980). Real surfaces vary by ±30 % or more; the shapes are what matter: leaves are dark
// in green and bright in the near infrared, snow is white until about 1.3 µm and nearly black at 1.5 µm.
const SPECTRA = {
  leaves: [[400, 0.04], [450, 0.05], [500, 0.07], [550, 0.12], [600, 0.08], [650, 0.05], [680, 0.04], [700, 0.1], [720, 0.28], [740, 0.44], [760, 0.5], [800, 0.52], [900, 0.53], [1000, 0.52], [1100, 0.49], [1150, 0.45], [1200, 0.43], [1250, 0.45], [1300, 0.44], [1350, 0.38], [1400, 0.24], [1450, 0.17], [1500, 0.23], [1550, 0.29], [1600, 0.32], [1650, 0.33], [1700, 0.31]],
  soil: [[400, 0.08], [500, 0.13], [600, 0.19], [700, 0.24], [800, 0.27], [900, 0.29], [1000, 0.31], [1100, 0.33], [1200, 0.35], [1300, 0.36], [1400, 0.34], [1450, 0.33], [1500, 0.36], [1600, 0.39], [1700, 0.4]],
  snow: [[400, 0.96], [500, 0.97], [600, 0.96], [700, 0.94], [800, 0.9], [900, 0.83], [950, 0.76], [1000, 0.68], [1030, 0.58], [1060, 0.62], [1100, 0.64], [1150, 0.58], [1200, 0.47], [1250, 0.4], [1300, 0.36], [1350, 0.25], [1400, 0.1], [1450, 0.04], [1500, 0.03], [1550, 0.05], [1600, 0.09], [1650, 0.13], [1700, 0.14]],
};
// Catmull-Rom through the table, so the drawn curve and the values read off it agree
function spectrumAt(table, nm) {
  let i = table.findIndex(([x], k) => k < table.length - 1 && nm <= table[k + 1][0]);
  if (i < 0) i = table.length - 2;
  const p = (k) => table[Math.max(0, Math.min(table.length - 1, k))];
  const [x1, y1] = p(i);
  const [x2, y2] = p(i + 1);
  const t = (nm - x1) / (x2 - x1);
  const m = (a, b) => (p(b)[1] - p(a)[1]) / (p(b)[0] - p(a)[0]) * (x2 - x1);
  const m1 = i > 0 ? m(i - 1, i + 1) : y2 - y1;
  const m2 = i + 2 < table.length ? m(i, i + 2) : y2 - y1;
  const h = [2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2];
  return Math.max(0.01, h[0] * y1 + h[1] * m1 + h[2] * y2 + h[3] * m2);
}
export function wavelengthFig(LASERS) {
  const out = [];
  // the 905 nm pulsed diode is not one of Figure 2's lasers, so it is only charted here
  const lasers = [LASERS.green, { nm: 905 }, LASERS.yag, LASERS.fibre];
  // the chart spans the table: green sits over the first column and fibre over the last; 905 and 1064 are too close, so the columns are spaced evenly
  const X = (nm) => 178 + ((nm - 532) / (1550 - 532)) * 323;
  const COL = [0, 1, 2, 3].map((i) => X(532) + (i * (X(1550) - X(532))) / 3);
  const x0 = X(400);
  const Y = (r) => 190 - r * 150;
  const pct = (r) => `${Math.round(r * 100)} %`;
  // spectrum: axes, the visible band, the three curves and where each laser cuts them
  out.push(`<defs><linearGradient id="gq-visible" x1="0" x2="1"><stop offset="0" stop-color="#7b3fe4"/><stop offset="0.17" stop-color="#3a62f0"/><stop offset="0.3" stop-color="#22b0d8"/><stop offset="0.43" stop-color="#3cb94a"/><stop offset="0.6" stop-color="#e8cf2a"/><stop offset="0.7" stop-color="#f08a24"/><stop offset="0.93" stop-color="#e03a2c"/><stop offset="1" stop-color="#e03a2c" stop-opacity="0"/></linearGradient></defs>`);
  out.push(text([x0 - 10, Y(1.04) - 8], "reflectance %", "lb", "end"));
  for (const r of [0, 0.5, 1]) out.push(line([[x0 - 5, Y(r)], [x0, Y(r)]], "s"), text([x0 - 10, Y(r) + 4], `${r * 100}`, "lb", "end"));
  out.push(line([[x0, Y(1)], [x0, Y(0)], [X(1700), Y(0)]], "s"));
  out.push(`<rect x="${n(X(400))}" y="${Y(0) + 5}" width="${n(X(720) - X(400))}" height="4" rx="2" fill="url(#gq-visible)" opacity="0.85"/>`);
  out.push(text([X(550), Y(0) + 24], "visible", "lb"), text([X(1250), Y(0) + 24], "infrared", "lb"));
  for (const L of lasers) out.push(dash([[X(L.nm), Y(1.04)], [X(L.nm), Y(0)]], "a"), text([X(L.nm), Y(1.04) - 8], L.nm === 1550 ? "1550 nm" : `${L.nm}`, "lb hd"));
  const curve = (key, tone, cls = "") => {
    const pts = [];
    for (let nm = 400; nm <= 1700; nm += 5) pts.push([X(nm), Y(spectrumAt(SPECTRA[key], nm))]);
    return line(pts, tone, cls);
  };
  out.push(curve("soil", "s"), curve("snow", "s", " dash"), curve("leaves", "h"));
  out.push(text([X(820), Y(0.9) - 10], "snow", "lb"), text([X(790), Y(0.53) - 10], "leaves", "lb hd"), text([X(1700), Y(0.4) - 9], "soil", "lb", "end"));
  for (const L of lasers) for (const key of Object.keys(SPECTRA)) out.push(dot([X(L.nm), Y(spectrumAt(SPECTRA[key], L.nm))], 2.4, "a"));
  // the table: what each laser gets back. Dot area follows the share of light returned
  const top = 244;
  ["green", "diode", "Nd:YAG", "Er fibre"].forEach((name, i) => out.push(text([COL[i], top], `${lasers[i].nm} nm`, "lb hd"), text([COL[i], top + 18], `(${name})`, "lb")));
  out.push(line([[0, top + 30], [X(1700), top + 30]], "f"));
  const at = (key) => lasers.map((L) => ({ r: spectrumAt(SPECTRA[key], L.nm) }));
  const rows = [
    ["Leaves", at("leaves")],
    ["Bare soil", at("soil")],
    ["Asphalt", [{ r: 0.06 }, { r: 0.09 }, { r: 0.1 }, { r: 0.12 }]],
    ["Snow and ice", at("snow")],
    ["Water surface", [{ r: 0.05, note: "weak" }, { r: 0.05, note: "near nadir" }, { r: 0.05, note: "near nadir" }, { note: "mostly gaps" }]],
    ["Bed under water", [{ r: 0.12, note: "15 m" }, { note: "10 cm" }, { note: "6 cm" }, { note: "0.6 mm" }]],
    ["Through cloud", [{ note: "blocked" }, { note: "blocked" }, { note: "blocked" }, { note: "blocked" }]],
  ];
  let y = top + 52;
  for (const [label, cells] of rows) {
    const noted = cells.some((c) => c.note);
    out.push(text([0, y + 4], label, "lb hd", "start"));
    cells.forEach((c, i) => {
      const x = COL[i];
      if (c.r == null) out.push(ring([x, y], 4, "s"));
      else out.push(dot([x, y], n(1.6 + 8 * Math.sqrt(c.r)), "a"));
      if (c.r != null && !c.note) out.push(text([x + 15, y + 4], pct(c.r), "lb", "start"));
      if (c.note) out.push(text([x, y + 22], c.note, "lb"));
    });
    y += noted ? 44 : 30;
  }
  out.push(line([[0, y - 12], [X(1700), y - 12]], "f"));
  return svg(560, y - 4, "Typical reflectance of leaves, bare soil and snow from 400 to 1700 nanometres, with the four lidar wavelengths marked, and below, what each wavelength gets back. Green, 532 nm: leaves 11 %, soil 15 %, snow 97 %, and it reaches the bed through clear water. Diode, 905 nm: leaves 53 %, soil 29 %, snow 82 %, water only near nadir. Nd:YAG, 1064 nm: leaves 50 %, soil 32 %, snow 62 %, water only near nadir. Er fibre, 1550 nm: leaves 29 %, soil 38 %, snow about 5 %, water mostly gaps. None of them see through cloud.", out);
}

// ---------------------------------------------------------------- each scanner's pattern on the ground, seen from above
// The beam's ground point is traced from the same model as Figure 2, at one scale across and along the track; only the
// aircraft's advance between scan lines is exaggerated (except the Risley rosette, drawn at true speed) so lines separate.
const PATTERNS = {
  galvo: { cfg: { scanner: "galvo" }, periods: 3 },
  polygon: { cfg: { scanner: "polygon", facets: 4 }, periods: 1.5 },
  palmer: { cfg: { scanner: "palmer" }, periods: 4.5 },
  risley: { cfg: { scanner: "risley", ratio: -1.5, phase: 0 }, seconds: 0.2, advance: 1 },
};
export function patternFig(id) {
  const W = 104;
  const H = 52;
  const top = 6;
  const out = [];
  const label = `${SCANNERS[id].name} pattern on the ground, seen from above, flying to the right`;
  if (id === "flash") {
    // a square footprint of 32 by 32 pixels per frame, stepped along the track frame by frame
    const S = SCANNERS.flash;
    const side = H;
    const step = 22;
    for (let k = 2; k >= 0; k--) {
      const x0 = W - side - k * step;
      out.push(`<rect class="fl-paper ln t-${k ? "f" : "s"}" x="${x0}" y="${top}" width="${side}" height="${side}"/>`);
    }
    const cells = [];
    const pitch = side / S.grid;
    for (let i = 0; i < S.grid; i++)
      for (let j = 0; j < S.grid; j++) cells.push(`M${n(W - side + (i + 0.5) * pitch)} ${n(top + (j + 0.5) * pitch)}h0`);
    out.push(`<path class="ln t-a gd-pat-px" d="${cells.join("")}"/>`);
  } else {
    const P = PATTERNS[id];
    const f = SCANNERS[id].rate;
    const T = P.seconds ?? P.periods / f;
    const steps = 1400;
    const runs = [[]];
    const raw = [];
    for (let i = 0; i <= steps; i++) {
      const t = (T * i) / steps;
      const p = poseOf({ ...P.cfg, rate: f }, t);
      const g = p.on && groundOf(p.d);
      raw.push(g ? [g[0], g[1], t] : null);
    }
    const ok = raw.filter(Boolean);
    const span = (k) => [Math.min(...ok.map((p) => p[k])), Math.max(...ok.map((p) => p[k]))];
    const [y0, y1] = span(1);
    const sc = H / (y1 - y0);
    const [g0, g1] = span(0);
    // the advance that fills the width, unless the pattern is drawn at true speed
    const k = P.advance ?? (W / sc - (g1 - g0)) / (FLIGHT.speed * T);
    const xs = ok.map((p) => p[0] + k * FLIGHT.speed * p[2]);
    const x0 = Math.min(...xs);
    const dx = (W - (Math.max(...xs) - x0) * sc) / 2;
    for (const p of raw) {
      if (!p) { if (runs.at(-1).length) runs.push([]); continue; }
      runs.at(-1).push([dx + (p[0] + k * FLIGHT.speed * p[2] - x0) * sc, top + (p[1] - y0) * sc]);
    }
    out.push(dash([[0, top], [W, top]], "f"), dash([[0, top + H], [W, top + H]], "f"));
    for (const r of runs) if (r.length > 1) out.push(line(r, "a", " gd-pat-ln"));
  }
  return `<svg class="gq gd-pat" viewBox="-2 0 ${W + 4} ${H + 2 * top}" role="img" aria-label="${label}">${out.join("")}</svg>`;
}

// One 1064 nm pulse through a 12 m tree, with values inside echoesFor's own ranges: canopy, branches, a shrub 0.8 m tall
// (inside the discrete board's 0.9 m dead time) and the ground.
const TREE_CFG = { laser: "yag" };
const TREE = [
  { r: FLIGHT.alt - 11.6, a: 0.44, s: 0.8, what: "canopy" },
  { r: FLIGHT.alt - 6.2, a: 0.18, s: 0.6, what: "branches" },
  { r: FLIGHT.alt - 0.8, a: 0.14, s: 0.3, what: "shrub" },
  { r: FLIGHT.alt, a: 0.15, s: 0.05, what: "ground" },
];
const ECHO_LABEL = {
  discrete: "Discrete returns from one pulse through a tree: three timed peaks, the shrub merged into the ground",
  waveform: "Full waveform from one pulse through a tree: the echo sampled every 15 cm, the shrub kept as a shoulder",
  photon: "Single-photon histogram from 400 shots through a tree: detections pile up at each surface over scattered sunlight",
};
export function echoFig(id) {
  const W = 200;
  const H = 54;
  const top = 4;
  const base = top + H;
  const from = FLIGHT.alt - 14;
  const to = FLIGHT.alt + 1.6;
  const step = 0.15;
  const x = (r) => ((r - from) / (to - from)) * W;
  const rs = Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);
  const sig = rs.map((r) => signalAt(TREE_CFG, TREE, r));
  const peak = Math.max(...sig);
  const y = (v, max = peak) => base - (v / max) * H;
  const out = [];
  const ticks = [];
  for (let r = Math.ceil(from); r <= to; r++) ticks.push(`M${n(x(r))} ${base}v${(r - FLIGHT.alt) % 5 ? 2 : 3.5}`);
  out.push(`<path class="ln t-f gd-echo-tk" d="${ticks.join("")}"/>`);
  const fine = Array.from({ length: 311 }, (_, i) => from + ((to - from) * i) / 310);
  out.push(line(fine.map((r) => [x(r), y(signalAt(TREE_CFG, TREE, r))]), "f"));
  if (id === "photon") {
    const { counts, width } = photonsOf(TREE_CFG, TREE, { from, to, bins: rs.length - 1, shots: 400 });
    const most = Math.max(...counts);
    const bars = counts.map((c, i) => (c ? `M${n(x(from + (i + 0.5) * width))} ${base}V${n(y(c, most))}` : "")).join("");
    out.push(`<path class="ln t-a gd-echo-bar" d="${bars}"/>`);
  } else if (id === "discrete") {
    const threshold = 0.04;
    out.push(dash([[0, y(threshold)], [W, y(threshold)]], "f"));
    for (const p of discreteOf(TREE_CFG, TREE, { from, to, threshold })) out.push(line([[x(p.r), base], [x(p.r), y(p.a)]], "a"), dot([x(p.r), y(p.a)], 1.7));
  } else {
    out.push(line(rs.map((r, i) => [x(r), y(sig[i])]), "a"), `<path class="ln t-a gd-echo-px" d="${rs.map((r, i) => `M${n(x(r))} ${n(y(sig[i]))}h0`).join("")}"/>`);
  }
  out.push(line([[0, base], [W, base]], "s"));
  return `<svg class="gq gd-echo" viewBox="-2 0 ${W + 4} ${base + 6}" role="img" aria-label="${ECHO_LABEL[id]}">${out.join("")}</svg>`;
}
