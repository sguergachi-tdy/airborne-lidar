// Fig 2: the lidar head through the loupe. One clock drives the scanner on the bench, the pulses below the window,
// the pattern on the ground and the receiver trace; all of them come from HM (head-model.mjs).
(() => {
  const D = __HEAD__;
  const P = D.P;
  const at = (p) => iso(p, P);
  const stage = document.querySelector(".hd-stage");
  if (!stage) return;
  const fig = stage.closest(".iso-figure");
  const readout = fig.querySelector("[data-readout]");
  const said = stage.querySelector(".hd-said");
  const items = [...stage.querySelectorAll(".hd-front .it[data-when]")];
  const rows = [...fig.querySelectorAll(".hd-row[data-only]")];
  const segs = [...fig.querySelectorAll(".hd-seg")];
  const slides = [...fig.querySelectorAll("input[data-slide]")];
  const sub = fig.querySelector(".hd-sub");
  const subTitle = fig.querySelector('[data-part="sub-title"]');
  const scanSeg = fig.querySelector('.hd-seg[data-key="scanner"]');
  const mapCanvas = fig.querySelector(".hd-map");
  const scopeCanvas = fig.querySelector(".hd-scope");
  const mapNote = fig.querySelector('[data-part="map-note"]');
  mapCanvas.insertAdjacentHTML(
    "afterend",
    `<div class="hd-key"><span><i class="k-tree"></i>Trees</span><span><i class="k-water"></i>Water</span><span><i class="k-house"></i>Buildings</span><span><i class="k-road"></i>Road</span><span class="k-ramp">Returns<i class="k-r1"></i>1<i class="k-r2"></i>2<i class="k-r3"></i>3<i class="k-r4"></i>4+</span></div>`
  );
  const scopeNote = fig.querySelector('[data-part="scope-note"]');
  const pale = document.body.dataset.theme === "light";
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const { SCANNERS, LASERS, DETECTORS, FLIGHT, FLASH_RATE } = HM;
  const C = HM.physics.C;
  const DEG = HM.physics.DEG;
  const HX = HPARTS.HEADX;
  const cfg = { ...HM.defaults, rate1: SCANNERS.risley.rate, rate2: -SCANNERS.risley.rate };
  const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");
  const slideText = (key) => (key === "rate2" ? sgn(cfg.rate2) : `${cfg[key]}`);

  // one clock: tr is the head's own time, which runs `slow` times slower than the page (×100 by default, down to
  // ×10 million on the time slider, where single pulses can be followed to the ground and back)
  const SLOW = 100;
  let ls = 2;
  let lsT = 2;
  let slow = SLOW;
  let tr = 0.35 / SLOW;
  // the map's points age at the default pace, so the pattern holds still while time is slowed
  const MAPK = SLOW;
  // the map stretches the distance flown so successive scan lines separate
  const STRETCH = 12;
  // the map draws one pulse in DEC; the fan below the window far fewer
  const DEC = 20;
  const LIFE = 14;

  const matches = (tag) =>
    !tag ||
    tag.split(" ").every((term) => {
      const [key, vals] = term.split(":");
      return vals.split("|").includes(String(cfg[key]));
    });
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const fmt = (v, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "—");
  const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

  // ---------------------------------------------------------------- live parts, rebuilt from the same geometry the build drew
  const ctx = { at, pathOf, toneOf: G.toneOf, V: D.V, P };
  const XF = G.frameOf([0, 0, D.zb], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const PF = G.frameOf(HX.polygon.axis, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const live = (name) => [...stage.querySelectorAll(`[data-live="${name}"]`)];
  const visibleOf = (hosts) => hosts.find((host) => host.closest(".it").style.display !== "none");
  const galvoHost = live("galvo")[0];
  const polyHosts = live("poly");
  const palmerHost = live("palmer")[0];
  const mark1 = live("mark1")[0];
  const mark2 = live("mark2")[0];
  const outs = live("out");
  let lastKey = "";

  // where the outgoing beam leaves the scan element, and its direction
  function beamOf(pose) {
    const d = pose.d;
    let o = [0, 0, D.zb];
    if (cfg.scanner === "polygon") {
      const { rin } = HX.polygon;
      const [, ay, az] = HX.polygon.axis;
      const N = cfg.facets;
      const facet = (2 * Math.PI) / N;
      const local = ((((pose.turn + facet / 2) % facet) + facet) % facet) - facet / 2;
      const a = (225 * DEG) + local;
      const ny = Math.cos(a);
      const nz = Math.sin(a);
      o = [0, ay + (rin - nz * (D.zb - az)) / ny, D.zb];
    } else if (cfg.scanner === "risley") o = [0, 0, 2];
    else if (cfg.scanner === "flash") o = [0, 0, 2];
    // the beam leaves through the top of the window glass
    const t = (o[2] + 4) / -d[2];
    return { o, d, exit: add(o, mul(d, t)) };
  }

  function paintParts(pose) {
    const key = `${cfg.scanner}:${cfg.facets}:${(pose.theta ?? 0).toFixed(4)}:${(pose.turn ?? 0).toFixed(4)}:${(pose.turn2 ?? 0).toFixed(4)}`;
    if (key === lastKey) return;
    lastKey = key;
    if (cfg.scanner === "galvo") {
      const { from, to } = HX.galvo;
      galvoHost.innerHTML = solidSvg(PARTS.prismPaths(XF, HPARTS.galvoPoly(pose.theta), from, to, ctx), { tone: "hi", lit: true });
    } else if (cfg.scanner === "polygon") {
      const host = visibleOf(polyHosts);
      const { from, to } = HX.polygon;
      if (host) host.innerHTML = solidSvg(PARTS.prismPaths(PF, HPARTS.polygonPoly(cfg.facets, pose.turn), from, to, ctx), { tone: "hi", lit: true });
    } else if (cfg.scanner === "palmer") {
      const F = G.frameAlong([0, 0, D.zb], mul(pose.n, -1));
      const { r, thick } = HX.palmer;
      palmerHost.innerHTML = solidSvg(G.solidOf([[0, r], [thick, r]], F, P), { tone: "hi", lit: true });
    } else if (cfg.scanner === "risley") {
      const r1 = D.risley.r1;
      const c1 = [r1 * Math.cos(pose.turn), r1 * Math.sin(pose.turn), D.risley.z1];
      const p1 = at(c1);
      const dot = mark1.querySelector("circle");
      dot.setAttribute("cx", p1[0].toFixed(2));
      dot.setAttribute("cy", p1[1].toFixed(2));
      // the mark is on the ring's side: seen only while that side faces the viewer
      const facing = Math.cos(pose.turn) * D.V[0] + Math.sin(pose.turn) * D.V[1];
      mark1.style.opacity = clamp((facing - 0.05) / 0.3, 0, 1).toFixed(3);
      const u = [Math.cos(pose.turn2), Math.sin(pose.turn2)];
      const z = D.risley.z2;
      const thick = at([9 * u[0], 9 * u[1], z]);
      mark2.querySelector("path").setAttribute("d", pathOf([at([-9 * u[0], -9 * u[1], z]), thick]));
      const dot2 = mark2.querySelector("circle");
      dot2.setAttribute("cx", thick[0].toFixed(2));
      dot2.setAttribute("cy", thick[1].toFixed(2));
    }
    const out = visibleOf(outs);
    if (out && ["galvo", "polygon", "palmer"].includes(cfg.scanner)) {
      const b = beamOf(pose);
      // on a polygon the facet meets the beam beyond the rest point, so the incoming beam runs on to it
      const pts = b.o[1] > 0.05 ? [[0, 0, D.zb], b.o, b.exit] : [b.o, b.exit];
      out.querySelector("path").setAttribute("d", pathOf(pts.map(at)));
      out.style.opacity = pose.on ? "1" : "0";
    }
  }

  // ---------------------------------------------------------------- pulses below the window: a WebGL fan of the last few shots
  const canvas = stage.querySelector(".hd-gl");
  // the kit's WebGL layer reads its canvas box on every draw, which forces a layout after the frame's DOM writes: serve
  // it the size last measured, measured again only after a resize
  const cacheBox = (el) => {
    let box = null;
    new ResizeObserver(() => (box = null)).observe(el);
    el.getBoundingClientRect = () => box || (box = Element.prototype.getBoundingClientRect.call(el));
  };
  cacheBox(canvas);
  const K = 48;
  // uA: a shot's segment, window to fan end (drawing units). uB: streak level, then one pulse in flight on it:
  // position along the segment, level, and half-length (negative when it travels back up as an echo)
  const FRAG = `
uniform vec4 uA[${K}];uniform vec4 uB[${K}];uniform float uN;uniform float uLight;uniform vec3 uInk;uniform vec3 uLoupe;uniform vec3 uZoom;
void main(){
  vec2 sv=viewOf(gl_FragCoord.xy);
  // nothing shows past the loupe's rim, and a shot further than 14 px adds under 1e-5: skip both
  if(length(sv-uLoupe.xy)>uLoupe.z-14.){gl_FragColor=vec4(0.);return;}
  vec2 vb=uZoom.xy+(sv-uLoupe.xy)/uZoom.z;
  float glow=0.;float core=0.;
  for(int i=0;i<${K};i++){
    if(float(i)>=uN)break;
    vec4 s=uA[i];vec4 q=uB[i];
    vec2 ab=s.zw-s.xy;
    float L2=max(dot(ab,ab),1e-4);
    float t=dot(vb-s.xy,ab)/L2;
    float h=clamp(t,0.,1.);
    float d=length(vb-s.xy-ab*h)*uZoom.z;
    if(d>14.)continue;
    // each shot starts at the window and thins out along its way down
    float g=q.x*smoothstep(0.,.05,h)*(1.-smoothstep(.45,1.,h));
    core+=g*exp(-d*d/.36);
    glow+=g*.3*exp(-d*d/9.);
    if(q.z>0.){
      // a pulse in flight: a short bright packet with a faint wake behind it
      float w=max(2.,abs(q.w)*uZoom.z);
      float a=(t-q.y)*sqrt(L2)*uZoom.z*sign(q.w);
      float sg=a<0.?w*4.:w;
      float b=q.z*exp(-a*a/(2.*sg*sg))*(1.-smoothstep(-.02,0.,-t));
      core+=b*1.5*exp(-d*d/.5);
      glow+=b*.55*exp(-d*d/14.);
    }
  }
  float rim=1.-smoothstep(uLoupe.z-46.,uLoupe.z-14.,length(sv-uLoupe.xy));
  core*=rim;glow*=rim;
  float dither=(hash12(gl_FragCoord.xy)-.5)/255.;
  if(uLight>.5){
    float al=clamp(glow*.9+core*.85,0.,.92);
    gl_FragColor=vec4(uInk*al+dither*al,al);
  }else{
    vec3 e=uInk*glow*1.3+mix(uInk,vec3(1.),.55)*core*1.2;
    e=tonemap(e,1.4)+dither;
    gl_FragColor=vec4(e,max(e.r,max(e.g,e.b)));
  }
}`;
  const layer = typeof glLayer === "function" ? glLayer({ canvas, fragment: FRAG, view: [D.W, D.H], camera: D.camera, uniforms: ["uA", "uB", "uN", "uLight", "uInk", "uLoupe", "uZoom"] }) : null;
  const flat = layer ? null : canvas.getContext("2d");
  if (layer) stage.setAttribute("data-gl", "");
  const INK = {
    ir: pale ? [0.8, 0.12, 0.15] : [1, 0.3, 0.24],
    green: pale ? [0.05, 0.5, 0.22] : [0.3, 1, 0.45],
  };
  // number of returns per pulse on the map: 1, 2, 3, 4+, in the laser's own hue: red to yellow for the infrared lasers
  // (drawn red), deep to light green for the green laser
  const RAMPS = {
    ir: pale ? ["178,24,28", "212,72,18", "222,124,0", "196,158,0"] : ["226,52,44", "244,108,42", "250,164,48", "255,226,84"],
    green: pale ? ["10,86,38", "26,124,50", "64,160,62", "118,188,72"] : ["28,132,58", "46,178,78", "104,218,110", "186,246,160"],
  };
  let RAMP = RAMPS.ir;
  const uA = new Float32Array(K * 4);
  const uB = new Float32Array(K * 4);
  let shots = [];
  const pulseEls = stage.querySelectorAll(".hd-beam");
  const echoEls = stage.querySelectorAll(".hd-rxlight, .hd-cone, .hd-die");
  let pulseKey = "";
  const envelope = (age) => (age < 0 ? 0 : (1 - Math.exp(-age / 0.012)) * Math.exp(-age / 0.32));
  const smooth = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // streaks give way to single pulses in flight as time is slowed past ×50k (a round trip then lasts 40 ms or more)
  const bulletMix = () => smooth(4.7, 5.7, ls);
  // the fan is far shorter than the 150 m to the ground: ranges are drawn compressed, the ground at GROUND of the way down
  const GROUND = 0.85;
  const hOf = (range) => (GROUND * range) / FLIGHT.alt;
  function shoot(tf, pose) {
    const b = beamOf(pose);
    const dirs = cfg.scanner === "flash" ? flashCone() : [b.d];
    const tvf = tv - (tr - tf) * slow;
    // what this pulse lands on (a flash pulse: the ground under the middle of its array) and what it sends back; the
    // aircraft's true position and attitude decide where the beam really goes
    const geo = HM.georef(cfg.scanner === "flash" ? [0, 0, -1] : pose.d, tf, cfg.nav);
    const hit = geo ? surfaceAt(alongAt(tf) + geo.truth[0], geo.truth[1], geo.w) : null;
    const ex = hit ? HM.echoesFor(cfg, hit) : [];
    const back = (2 * Math.max(FLIGHT.alt, ...ex.map((e) => e.r))) / C;
    for (const d of dirs) {
      const t = (b.exit[2] - D.fan) / -d[2];
      shots.push({ tf, tvf, a: at(b.exit), b: at(add(b.exit, mul(d, t))), hit, echoes: ex, back });
    }
    if (shots.length > K) shots = shots.slice(shots.length - K);
  }
  // a flash pulse is spread by the diffuser over the whole field at once
  function flashCone() {
    const h = Math.tan(SCANNERS.flash.half * DEG);
    const out = [];
    for (const [x, y] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) {
      const v = [x * h, y * h, -1];
      const l = Math.hypot(...v);
      out.push(mul(v, 1 / l));
    }
    return out;
  }
  function paintFan() {
    const m = bulletMix();
    shots = shots.filter((s) => tv - s.tvf < 2 || (m > 0 && C * (tr - s.tf) < C * s.back + 4));
    const list = [];
    let latest = 0;
    for (const s of shots) {
      const echoes = s.echoes;
      const rMax = (C * s.back) / 2;
      const e = envelope(tv - s.tvf);
      latest = Math.max(latest, e * (1 - m));
      const ct = C * (tr - s.tf);
      // a faint trace of the path while one of its pulses is still in the air
      const trace = m * 0.07 * smooth(0, 3, ct) * (1 - smooth(2 * rMax - 6, 2 * rMax, ct));
      const streak = e * (1 - m) + trace;
      if (streak > 0.002) list.push([s, streak, 0, 0, 1]);
      if (m < 0.01 || ct < 0) continue;
      // the outgoing pulse loses what each surface sends back and is gone below the last one
      const spent = echoes.reduce((sum, x) => sum + (ct > x.r ? x.a : 0), 0);
      const out = Math.max(0.3, 1 - spent) * (1 - smooth(rMax, rMax + 5, ct)) * smooth(0, 1.5, ct);
      if (out > 0.01) list.push([s, 0, hOf(ct), m * out, 0.9]);
      for (const x of echoes) {
        if (x.what === "water column" || ct < x.r || ct > 2 * x.r) continue;
        const back = 2 * x.r - ct;
        const level = (0.35 + 0.65 * Math.min(1, x.a / 0.45)) * smooth(0, 1.5, ct - x.r) * smooth(0, 5, back);
        list.push([s, 0, hOf(back), m * level, -0.9]);
      }
    }
    const n = Math.min(K, list.length);
    list.slice(list.length - n).forEach(([s, streak, pos, level, w], i) => {
      uA.set([s.a[0], s.a[1], s.b[0], s.b[1]], i * 4);
      uB.set([streak, pos, level, w], i * 4);
    });
    // set on the few parts that read it, not the stage: a property on the stage restyles every part under it each frame
    const pulse = latest.toFixed(3);
    if (pulse !== pulseKey) for (const el of pulseEls) el.style.setProperty("--hd-pulse", (pulseKey = pulse));
    const ink = INK[LASERS[cfg.laser].ink];
    if (layer) {
      if (!n) return layer.clear();
      layer.draw({ uA, uB, uN: n, uLight: pale ? 1 : 0, uInk: ink, uLoupe: [D.loupe.cx, D.loupe.cy, D.loupe.r], uZoom: [Fc[0], Fc[1], zoom] }, tv);
      return;
    }
    if (!flat) return;
    const box = canvas.getBoundingClientRect();
    const ratio = Math.min(1.5, devicePixelRatio || 1);
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    flat.setTransform(canvas.width / D.W, 0, 0, canvas.height / D.H, 0, 0);
    flat.clearRect(0, 0, D.W, D.H);
    flat.save();
    flat.beginPath();
    flat.arc(D.loupe.cx, D.loupe.cy, D.loupe.r - 24, 0, 2 * Math.PI);
    flat.clip();
    flat.transform(zoom, 0, 0, zoom, D.loupe.cx - Fc[0] * zoom, D.loupe.cy - Fc[1] * zoom);
    flat.lineWidth = 1 / zoom;
    const c = ink.map((v) => Math.round(v * 255)).join(",");
    for (let i = 0; i < n; i++) {
      const [ax, ay, bx, by] = uA.subarray(i * 4, i * 4 + 4);
      const [e, pos, level] = uB.subarray(i * 4, i * 4 + 4);
      if (e > 0.002) {
        const g = flat.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, `rgba(${c},${e})`);
        g.addColorStop(0.6, `rgba(${c},${e * 0.6})`);
        g.addColorStop(1, `rgba(${c},0)`);
        flat.strokeStyle = g;
        flat.beginPath();
        flat.moveTo(ax, ay);
        flat.lineTo(bx, by);
        flat.stroke();
      }
      if (level > 0.01) {
        flat.fillStyle = `rgba(${c},${Math.min(1, level)})`;
        flat.beginPath();
        flat.arc(ax + (bx - ax) * pos, ay + (by - ay) * pos, 2.2 / zoom, 0, 2 * Math.PI);
        flat.fill();
      }
    }
    flat.restore();
  }

  // ---------------------------------------------------------------- the map: top-down, aircraft flying up the page
  const MW = 400;
  const MH = 448;
  const PX = 2;
  const PLANE = { x: MW / 2, y: 112 };
  const CAP = 24000;
  // each point: where the processing puts it (along, cross), when, whether it came off something tall, and where the
  // beam really landed (along, cross)
  const pts = new Float32Array(CAP * 6);
  let head = 0;
  let count = 0;
  const FDEC = 10;
  const FCAP = 400;
  const frames = new Float32Array(FCAP * 3);
  let fHead = 0;
  let fCount = 0;
  let genTo = 0;
  const mctx = mapCanvas.getContext("2d");
  const alongAt = (tr) => FLIGHT.speed * STRETCH * tr;

  // the basemap: a simplified topographic sheet in map metres (cross, along), cut into tiles along the track and
  // seeded by tile index, so the same ground comes back whenever a tile is rebuilt
  const TILE = 40;
  const ROAD = { x: -46, half: 3 };
  const RIVER = 5;
  const KINDS = ["woods", "village", "pond", "river", "field", "village", "woods", "pond"];
  const tiles = new Map();
  const rand = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const riverAt = (t, x) => t.river.a + 5 * Math.sin(x / 17 + t.river.p);
  function tileOf(k) {
    let t = tiles.get(k);
    if (t) return t;
    if (tiles.size > 48) tiles.clear();
    const r = rand(k * 7919 + 13);
    const a0 = k * TILE;
    const kind = KINDS[((k % 8) + 8) % 8];
    t = { trees: [], houses: [], ponds: [], river: null };
    const taken = [];
    const free = (a, x, rad) =>
      a - rad > a0 + 1 &&
      a + rad < a0 + TILE - 1 &&
      Math.abs(x) < 82 &&
      Math.abs(x - ROAD.x) > ROAD.half + rad + 1 &&
      taken.every((o) => Math.hypot(a - o.a, x - o.x) > rad + o.r + 0.6) &&
      !(t.river && Math.abs(a - riverAt(t, x)) < RIVER + rad + 1.5);
    const tree = (a, x, rad) => free(a, x, rad) && (t.trees.push({ a, x, r: rad }), taken.push({ a, x, r: rad }));
    if (kind === "river") {
      t.river = { a: a0 + TILE / 2, p: r() * 6 };
      for (let i = 0; i < 26; i++) {
        const x = (r() - 0.5) * 164;
        tree(riverAt(t, x) + (r() < 0.5 ? -1 : 1) * (RIVER + 3.5 + r() * 5), x, 1.8 + r() * 1.4);
      }
    } else if (kind === "pond") {
      const R = 9 + r() * 4;
      const p = { a: a0 + TILE / 2 + (r() - 0.5) * 4, x: -6 + r() * 34, pts: [], R };
      const f1 = r() * 6;
      const f2 = r() * 6;
      for (let i = 0; i < 28; i++) {
        const th = (i / 28) * 2 * Math.PI;
        const rho = R * (1 + 0.16 * Math.sin(2 * th + f1) + 0.08 * Math.sin(3 * th + f2));
        p.pts.push([p.a + rho * Math.sin(th), p.x + rho * Math.cos(th)]);
      }
      t.ponds.push(p);
      taken.push({ a: p.a, x: p.x, r: R * 1.24 });
      for (let i = 0; i < 40; i++) {
        const th = r() * 2 * Math.PI;
        const d = R * 1.3 + 2 + r() * 9;
        tree(p.a + d * Math.sin(th), p.x + d * Math.cos(th), 1.8 + r() * 1.6);
      }
    } else if (kind === "village") {
      for (const side of [-1, 1]) {
        for (let a = a0 + 2 + r() * 3; ; ) {
          const d = 8 + r() * 6;
          const w = 7 + r() * 5;
          if (a + d > a0 + TILE - 2) break;
          const x = ROAD.x + side * (ROAD.half + 3 + w / 2 + r() * 3);
          t.houses.push({ a: a + d / 2, x, w, d });
          taken.push({ a: a + d / 2, x, r: Math.hypot(w, d) / 2 });
          if (side > 0 && r() < 0.5) {
            const w2 = 8 + r() * 6;
            const x2 = x + w / 2 + 6 + w2 / 2;
            t.houses.push({ a: a + d / 2, x: x2, w: w2, d: d * 0.8 });
            taken.push({ a: a + d / 2, x: x2, r: Math.hypot(w2, d * 0.8) / 2 });
          }
          a += d + 3 + r() * 6;
        }
      }
      for (let i = 0; i < 30; i++) tree(a0 + r() * TILE, ROAD.x + (r() - 0.3) * 70, 1.6 + r() * 1.4);
    } else if (kind === "woods") {
      const x0 = -10 + r() * 60;
      for (let i = 0; i < 120; i++) tree(a0 + r() * TILE, x0 + (r() - 0.5) * 80, 2 + r() * 1.8);
    } else {
      const a = a0 + 8 + r() * 24;
      for (let x = -36; x < 82; x += 4 + r() * 3) tree(a + (r() - 0.5) * 1.5, x, 1.6 + r() * 1.1);
      for (let i = 0; i < 5; i++) tree(a0 + r() * TILE, (r() - 0.5) * 150, 2.4 + r() * 1.4);
    }
    tiles.set(k, t);
    return t;
  }
  const inside = (pts, a, x) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ai, xi] = pts[i];
      const [aj, xj] = pts[j];
      if (xi > x !== xj > x && a < ((aj - ai) * (x - xi)) / (xj - xi) + ai) hit = !hit;
    }
    return hit;
  };
  // near-infrared light is absorbed by water and only a near-vertical, mirror-like glint comes back; green goes through
  const GLINT = { surface: 4, absorbed: 1.5, bottom: 90 };
  // what lies under the spot, read off the same basemap the map draws; heights are fixed per tree and per house
  function surfaceAt(a, x, d) {
    const hit = { a, x };
    const t = tileOf(Math.floor(a / TILE));
    for (const h of t.houses) {
      const ea = h.d / 2 - Math.abs(a - h.a);
      const ex = h.w / 2 - Math.abs(x - h.x);
      if (ea > 0 && ex > 0) return { ...hit, kind: "roof", height: 5 + 5 * HM.hash(h.a * 1.37 + h.x * 0.71), edge: Math.min(ea, ex) < 0.7 };
    }
    for (const o of t.trees) {
      const q = Math.hypot(a - o.a, x - o.x) / o.r;
      if (q < 1) return { ...hit, kind: "tree", height: 9 + 12 * HM.hash(o.a * 0.53 + o.x * 1.91), q };
    }
    const glint = Math.acos(clamp(-d[2] / Math.hypot(d[0], d[1], d[2]), -1, 1)) / DEG < GLINT[LASERS[cfg.laser].water];
    if (t.river && Math.abs(a - riverAt(t, x)) < RIVER) return { ...hit, kind: "water", glint, depth: 0.6 + 2.4 * (1 - ((a - riverAt(t, x)) / RIVER) ** 2), bed: "river bed", name: "river" };
    for (const p of t.ponds) {
      if (inside(p.pts, a, x)) return { ...hit, kind: "water", glint, depth: 0.5 + 3.5 * clamp(1 - (Math.hypot(a - p.a, x - p.x) / p.R) ** 2, 0, 1), bed: "pond bottom", name: "pond" };
    }
    if (Math.abs(x - ROAD.x) < ROAD.half) return { ...hit, kind: "road" };
    return { ...hit, kind: "grass" };
  }
  const BASE = pale
    ? { water: "rgba(110,165,215,.30)", shore: "rgba(50,105,160,.7)", tree: "rgba(100,150,90,.22)", crown: "rgba(55,105,55,.62)", house: "rgba(90,85,80,.16)", wall: "rgba(70,65,60,.72)", road: "rgba(0,0,0,.035)" }
    : { water: "rgba(64,118,170,.28)", shore: "rgba(120,170,220,.62)", tree: "rgba(96,140,90,.2)", crown: "rgba(140,185,125,.55)", house: "rgba(210,205,195,.14)", wall: "rgba(225,220,210,.62)", road: "rgba(255,255,255,.05)" };
  function paintBase(c, X, Y, lo, hi) {
    const ts = [];
    for (let k = Math.floor(lo / TILE); k <= Math.floor(hi / TILE); k++) ts.push(tileOf(k));
    // water first: river bands and ponds, filled with a shoreline
    c.beginPath();
    for (const t of ts) {
      if (t.river) {
        for (let x = -84; x <= 84; x += 3) (x === -84 ? c.moveTo : c.lineTo).call(c, X(x), Y(riverAt(t, x) + RIVER));
        for (let x = 84; x >= -84; x -= 3) c.lineTo(X(x), Y(riverAt(t, x) - RIVER));
        c.closePath();
      }
      for (const p of t.ponds) {
        p.pts.forEach(([a, x], i) => (i ? c.lineTo(X(x), Y(a)) : c.moveTo(X(x), Y(a))));
        c.closePath();
      }
    }
    c.fillStyle = BASE.water;
    c.fill();
    c.beginPath();
    for (const t of ts) {
      if (t.river)
        for (const s of [1, -1]) {
          for (let x = -84; x <= 84; x += 3) (x === -84 ? c.moveTo : c.lineTo).call(c, X(x), Y(riverAt(t, x) + s * RIVER));
        }
      for (const p of t.ponds) {
        p.pts.forEach(([a, x], i) => (i ? c.lineTo(X(x), Y(a)) : c.moveTo(X(x), Y(a))));
        c.closePath();
      }
    }
    c.strokeStyle = BASE.shore;
    c.lineWidth = 1;
    c.stroke();
    // the road, solid over the river where it bridges it, with a dashed centre line and parapets
    const r0 = X(ROAD.x + ROAD.half);
    const r1 = X(ROAD.x - ROAD.half);
    c.fillStyle = css("--anatomy-paper") || (pale ? "#fff" : "#131313");
    c.fillRect(r0, 0, r1 - r0, MH);
    c.fillStyle = BASE.road;
    c.fillRect(r0, 0, r1 - r0, MH);
    c.strokeStyle = css("--anatomy-lo");
    c.beginPath();
    c.moveTo(r0, 0), c.lineTo(r0, MH), c.moveTo(r1, 0), c.lineTo(r1, MH);
    for (const t of ts) {
      if (!t.river) continue;
      const ab = riverAt(t, ROAD.x);
      for (const s of [1, -1]) {
        const y = Y(ab + s * (RIVER + 1.5));
        c.moveTo(r0 - 4, y), c.lineTo(r1 + 4, y);
      }
    }
    c.stroke();
    c.setLineDash([5, 6]);
    c.beginPath();
    c.moveTo(X(ROAD.x), 0), c.lineTo(X(ROAD.x), MH);
    c.strokeStyle = css("--anatomy-faint");
    c.stroke();
    c.setLineDash([]);
    // buildings: footprints with the roof ridge along the long side
    c.beginPath();
    const ridges = [];
    for (const t of ts)
      for (const h of t.houses) {
        const x0 = X(h.x + h.w / 2);
        const y0 = Y(h.a + h.d / 2);
        const w = h.w * PX;
        const d = h.d * PX;
        c.rect(x0, y0, w, d);
        ridges.push(h.d >= h.w ? [x0 + w / 2, y0, x0 + w / 2, y0 + d] : [x0, y0 + d / 2, x0 + w, y0 + d / 2]);
      }
    c.fillStyle = BASE.house;
    c.fill();
    c.strokeStyle = BASE.wall;
    c.stroke();
    c.beginPath();
    for (const [x0, y0, x1, y1] of ridges) c.moveTo(x0, y0), c.lineTo(x1, y1);
    c.stroke();
    // trees: a crown with its trunk dot, the map symbol for deciduous woodland
    c.beginPath();
    for (const t of ts)
      for (const tr of t.trees) {
        c.moveTo(X(tr.x) + tr.r * PX, Y(tr.a));
        c.arc(X(tr.x), Y(tr.a), tr.r * PX, 0, 2 * Math.PI);
      }
    c.fillStyle = BASE.tree;
    c.fill();
    c.strokeStyle = BASE.crown;
    c.stroke();
    c.beginPath();
    for (const t of ts) for (const tr of t.trees) c.rect(X(tr.x) - 0.7, Y(tr.a) - 0.7, 1.4, 1.4);
    c.fillStyle = BASE.crown;
    c.fill();
  }

  function gen(tr0, tr1) {
    if (cfg.scanner === "flash") {
      const step = FDEC / Math.min(cfg.prf, FLASH_RATE);
      for (let i = Math.ceil(tr0 / step); i * step < tr1; i++) {
        const geo = HM.georef([0, 0, -1], i * step, cfg.nav);
        frames[fHead * 3] = alongAt(i * step) + geo.seen[0];
        frames[fHead * 3 + 1] = geo.seen[1];
        frames[fHead * 3 + 2] = i * step;
        fHead = (fHead + 1) % FCAP;
        fCount = Math.min(FCAP, fCount + 1);
      }
      return;
    }
    const step = DEC / cfg.prf;
    for (let i = Math.ceil(tr0 / step); i * step < tr1; i++) {
      const tr = i * step;
      const pose = HM.poseOf(cfg, tr);
      if (!pose.on) continue;
      const geo = HM.georef(pose.d, tr, cfg.nav);
      if (!geo) continue;
      const a0 = alongAt(tr);
      const hit = surfaceAt(a0 + geo.truth[0], geo.truth[1], geo.w);
      if (hit.kind === "water" && !hit.glint) continue;
      // a pulse with no echo above the receiver's threshold makes no point
      const n = HM.returnsOf(cfg, HM.echoesFor(cfg, hit));
      if (!n) continue;
      const o = head * 6;
      pts[o] = a0 + geo.seen[0];
      pts[o + 1] = geo.seen[1];
      pts[o + 2] = tr;
      pts[o + 3] = n;
      pts[o + 4] = a0 + geo.truth[0];
      pts[o + 5] = geo.truth[1];
      head = (head + 1) % CAP;
      count = Math.min(CAP, count + 1);
    }
  }
  function resetMap(tr) {
    head = count = fHead = fCount = 0;
    gen(tr - LIFE / MAPK, tr);
    genTo = tr;
  }
  // one flash frame: the detector's grid of pixels, each a point on the ground
  let stamp = null;
  let stampInk = "";
  function stampOf(rgb) {
    if (stamp && stampInk === rgb) return stamp;
    const S = SCANNERS.flash;
    const e = FLIGHT.alt * Math.tan(S.half * DEG);
    const side = Math.ceil(2 * e * PX * 2);
    stamp = document.createElement("canvas");
    stamp.width = stamp.height = side;
    const c = stamp.getContext("2d");
    c.fillStyle = `rgb(${rgb})`;
    for (let i = 0; i < S.grid; i++) for (let j = 0; j < S.grid; j++) c.fillRect(((i + 0.5) / S.grid) * side - 1, ((j + 0.5) / S.grid) * side - 1, 2, 2);
    stampInk = rgb;
    return stamp;
  }
  const fit = (cv, w, h) => {
    const ratio = Math.min(2, devicePixelRatio || 1);
    const box = cv.getBoundingClientRect();
    const k = box.width ? (box.width / w) * ratio : ratio;
    const W = Math.round(w * k);
    const H = Math.round(h * k);
    if (cv.width !== W || cv.height !== H) (cv.width = W), (cv.height = H);
    const c = cv.getContext("2d");
    c.setTransform(k, 0, 0, k, 0, 0);
    return c;
  };
  function planePath(c, s, cx = PLANE.x, cy = PLANE.y, yaw = 0) {
    // a high-wing survey single, metres: 12.7 m long, 15.9 m span, nose up; yaw turns the nose left (counter-clockwise)
    const [cs, sn] = [Math.cos(yaw), Math.sin(yaw)];
    const q = (x, y) => [cx + (x * cs - y * sn) * s, cy - (x * sn + y * cs) * s];
    const shape = [
      [0, 6.6], [0.45, 6.3], [0.8, 5.4], [0.8, 2.6], [7.95, 2.3], [7.95, 0.6], [0.8, 0.5], [0.6, -4.4], [3.1, -4.9], [3.1, -6], [0.3, -6], [0, -6.1],
    ];
    const pts2 = [...shape, ...shape.slice().reverse().map(([x, y]) => [-x, y])];
    c.beginPath();
    pts2.forEach(([x, y], i) => (i ? c.lineTo(...q(x, y)) : c.moveTo(...q(x, y))));
    c.closePath();
  }
  function paintMap(tr, pose) {
    const c = fit(mapCanvas, MW, MH);
    const now = alongAt(tr);
    const X = (cross) => PLANE.x - cross * PX;
    const Y = (along) => PLANE.y - (along - now) * PX;
    c.clearRect(0, 0, MW, MH);
    // a 10 m ground grid that scrolls with the ground
    c.strokeStyle = css("--anatomy-faint");
    c.lineWidth = 1;
    c.beginPath();
    for (let x = -80; x <= 80; x += 10) c.moveTo(Math.round(X(x)) + 0.5, 0), c.lineTo(Math.round(X(x)) + 0.5, MH);
    const first = Math.ceil((now - (MH - PLANE.y) / PX) / 10) * 10;
    for (let a = first; Y(a) > 0; a += 10) c.moveTo(0, Math.round(Y(a)) + 0.5), c.lineTo(MW, Math.round(Y(a)) + 0.5);
    c.stroke();
    paintBase(c, X, Y, now - (MH - PLANE.y) / PX, now + PLANE.y / PX);
    const rgb = INK[LASERS[cfg.laser].ink].map((v) => Math.round(v * 255)).join(",");
    if (cfg.scanner === "flash") {
      // a flash pixel times one echo, so every point is a single return
      const img = stampOf(RAMP[0]);
      const half = img.width / 4;
      for (let n = 0; n < fCount; n++) {
        const i = (fHead - 1 - n + FCAP) % FCAP;
        const age = (tr - frames[i * 3 + 2]) * MAPK;
        if (age > LIFE || age < 0) continue;
        c.globalAlpha = 0.5 * (1 - age / LIFE) ** 1.5;
        c.drawImage(img, X(frames[i * 3 + 1]) - half, Y(frames[i * 3]) - half, half * 2, half * 2);
      }
      c.globalAlpha = 1;
    } else {
      // points in eight age buckets, newest brightest, coloured and sized by how many returns their pulse gave: one
      // off road, grass and roofs, two at an eave or over water in green, up to four through a tree crown
      const paths = Array.from({ length: 32 }, () => new Path2D());
      for (let n = 0; n < count; n++) {
        const i = (head - 1 - n + CAP) % CAP;
        const age = (tr - pts[i * 6 + 2]) * MAPK;
        if (age < 0 || age > LIFE) continue;
        const k = pts[i * 6 + 3] - 1;
        const r = 0.8 + 0.22 * k;
        paths[Math.min(7, Math.floor((age / LIFE) * 8)) * 4 + k].rect(X(pts[i * 6 + 1]) - r, Y(pts[i * 6]) - r, 2 * r, 2 * r);
      }
      for (let b = 7; b >= 0; b--)
        for (let k = 0; k < 4; k++) {
          c.fillStyle = `rgba(${RAMP[k]},${(pale ? 0.9 : 0.95) * (1 - b / 8) ** 1.4})`;
          c.fill(paths[b * 4 + k]);
        }
      // without full navigation, a sample of the newest points is tied by a thread to a ring where its pulse really
      // landed: the placed point sits on the clean pattern the processing assumes, the ring on the true, wobbling one
      if (cfg.nav !== "ins") {
        const RECENT = 3;
        let inWin = 0;
        for (let n = 0; n < count; n++) {
          const age = (tr - pts[((head - 1 - n + CAP) % CAP) * 6 + 2]) * MAPK;
          if (age < 0) continue;
          if (age > RECENT) break;
          inWin++;
        }
        const stride = Math.max(1, Math.ceil(inWin / 48));
        const threads = [new Path2D(), new Path2D(), new Path2D()];
        const rings = [new Path2D(), new Path2D(), new Path2D()];
        let k = 0;
        for (let n = 0; n < count; n++) {
          const i = (head - 1 - n + CAP) % CAP;
          const age = (tr - pts[i * 6 + 2]) * MAPK;
          if (age < 0) continue;
          if (age > RECENT) break;
          if (k++ % stride) continue;
          const b = Math.min(2, Math.floor((age / RECENT) * 3));
          const tx = X(pts[i * 6 + 5]);
          const ty = Y(pts[i * 6 + 4]);
          const sx = X(pts[i * 6 + 1]);
          const sy = Y(pts[i * 6]);
          const L = Math.hypot(sx - tx, sy - ty);
          if (L > 2.4) {
            threads[b].moveTo(tx + ((sx - tx) * 2.2) / L, ty + ((sy - ty) * 2.2) / L);
            threads[b].lineTo(sx, sy);
          }
          rings[b].moveTo(tx + 2.2, ty);
          rings[b].arc(tx, ty, 2.2, 0, 2 * Math.PI);
        }
        const lit = css("--anatomy-lit") || (pale ? "#000" : "#fff");
        const paperInk = css("--anatomy-paper") || (pale ? "#fff" : "#131313");
        c.lineWidth = 1;
        for (let b = 2; b >= 0; b--) {
          c.globalAlpha = [0.95, 0.6, 0.3][b];
          c.strokeStyle = lit;
          c.stroke(threads[b]);
          c.fillStyle = paperInk;
          c.fill(rings[b]);
          c.stroke(rings[b]);
        }
        c.globalAlpha = 1;
      }
    }
    // the aircraft's true track over the last stretch, then the aircraft itself, yawed, with ring A where the head sits
    const att = HM.attitudeOf(tr);
    const span = (MH - PLANE.y) / PX / alongAt(1);
    c.beginPath();
    for (let j = 0; j <= 48; j++) {
      const t = tr - (span * j) / 48;
      const w = HM.attitudeOf(t);
      (j ? c.lineTo : c.moveTo).call(c, X(w.dx), Y(alongAt(t) + w.da));
    }
    c.strokeStyle = css("--anatomy-mid");
    c.globalAlpha = 0.6;
    c.stroke();
    c.globalAlpha = 1;
    // with no GNSS the processing can only assume the aircraft flew its plan: a ghost where it is believed to be
    if (cfg.nav === "none") {
      planePath(c, PX);
      c.setLineDash([2, 2]);
      c.strokeStyle = css("--anatomy-mid");
      c.stroke();
      c.setLineDash([]);
      c.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      c.fillStyle = css("--anatomy-muted");
      c.textAlign = "right";
      c.fillText("assumed", PLANE.x - 14, PLANE.y - 12);
      c.textAlign = "left";
    }
    const ax = X(att.dx);
    const ay = Y(now + att.da);
    planePath(c, PX, ax, ay, att.yaw);
    c.fillStyle = pale ? "rgba(255,255,255,.55)" : "rgba(19,19,19,.6)";
    c.fill();
    c.strokeStyle = css("--anatomy-hi");
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.arc(ax, ay, 4, 0, 2 * Math.PI);
    c.strokeStyle = css("--anatomy-lit");
    c.stroke();
    c.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    // where the beam is now: where it really lands
    const geo = pose.on && cfg.scanner !== "flash" ? HM.georef(pose.d, tr, cfg.nav) : null;
    if (geo) {
      c.beginPath();
      c.arc(X(geo.truth[1]), Y(now + geo.truth[0]), 3.2, 0, 2 * Math.PI);
      c.strokeStyle = `rgb(${rgb})`;
      c.stroke();
    }
    // the spot the scope is showing: the last pulse whose echoes are all home
    if (hitNow && hitNow.kind !== "none" && cfg.scanner !== "flash") {
      const hx = Math.round(X(hitNow.x)) + 0.5;
      const hy = Math.round(Y(hitNow.a)) + 0.5;
      c.strokeStyle = css("--anatomy-lit") || (pale ? "#000" : "#fff");
      c.beginPath();
      c.moveTo(hx - 6, hy), c.lineTo(hx - 2.5, hy), c.moveTo(hx + 2.5, hy), c.lineTo(hx + 6, hy);
      c.moveTo(hx, hy - 6), c.lineTo(hx, hy - 2.5), c.moveTo(hx, hy + 2.5), c.lineTo(hx, hy + 6);
      c.stroke();
    }
    // the swath, measured across the track, and a 20 m scale bar, each on a paper chip so the basemap stays behind them
    const F = facts;
    const half = F.swath / 2;
    const paper = css("--anatomy-paper") || (pale ? "#fff" : "#131313");
    const chip = (x0, y0, x1, y1) => {
      c.globalAlpha = 0.86;
      c.fillStyle = paper;
      c.beginPath();
      c.roundRect(x0, y0, x1 - x0, y1 - y0, 3);
      c.fill();
      c.globalAlpha = 1;
    };
    const yS = MH - 22;
    const label = `swath ${fmt(F.swath)} m`;
    const lw = c.measureText(label).width;
    chip(PLANE.x - lw / 2 - 5, yS + 5, PLANE.x + lw / 2 + 5, yS + 19);
    chip(6, 10, 12 + 20 * PX + 36, 30);
    c.strokeStyle = css("--anatomy-mid");
    c.fillStyle = css("--anatomy-muted");
    c.beginPath();
    c.moveTo(X(half), yS - 4), c.lineTo(X(half), yS + 4), c.moveTo(X(half), yS), c.lineTo(X(-half), yS), c.moveTo(X(-half), yS - 4), c.lineTo(X(-half), yS + 4);
    c.stroke();
    c.textAlign = "center";
    c.fillText(label, PLANE.x, yS + 15);
    c.textAlign = "left";
    c.beginPath();
    c.moveTo(12, 20), c.lineTo(12 + 20 * PX, 20), c.moveTo(12, 16), c.lineTo(12, 24), c.moveTo(12 + 20 * PX, 16), c.lineTo(12 + 20 * PX, 24);
    c.stroke();
    c.fillText("20 m", 12 + 20 * PX + 6, 24);
    // what the IMU reads, and how far the newest points sit from where their pulses landed
    const sg = (v, d = 1) => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(d).padStart(d + 3, "\u2007")}`;
    const nav = cfg.nav === "ins" ? `roll ${sg(att.roll / DEG)}°  pitch ${sg(att.pitch / DEG)}°  yaw ${sg(att.yaw / DEG)}°` : "no IMU: roll, pitch and yaw unknown";
    let off = 0;
    let m = 0;
    if (cfg.scanner !== "flash")
      for (let n = 0; n < count && m < 400; n++) {
        const i = (head - 1 - n + CAP) % CAP;
        const age = (tr - pts[i * 6 + 2]) * MAPK;
        if (age < 0) continue;
        if (age > 1.5) break;
        off += (pts[i * 6] - pts[i * 6 + 4]) ** 2 + (pts[i * 6 + 1] - pts[i * 6 + 5]) ** 2;
        m++;
      }
    else {
      const g = HM.georef([0, 0, -1], tr, cfg.nav);
      off = (g.seen[0] - g.truth[0]) ** 2 + (g.seen[1] - g.truth[1]) ** 2;
      m = 1;
    }
    const err = m ? Math.sqrt(off / m) : 0;
    const verdict = cfg.nav === "ins" ? "" : `${cfg.nav === "gnss" ? "no attitude: placed as if level" : "no position or attitude: placed on the plan, level"} · off ${fmt(err, 1)} m`;
    const key = cfg.nav === "ins" ? "" : "placed     where it really landed";
    const nw = Math.max(c.measureText(nav).width, c.measureText(verdict).width, 14 + c.measureText(key).width);
    chip(6, 34, 18 + nw, verdict ? 80 : 52);
    c.fillStyle = css("--anatomy-muted");
    c.fillText(nav, 12, 46);
    c.fillStyle = css("--anatomy-lit");
    if (verdict) {
      c.fillText(verdict, 12, 60);
      // the key: a placed point, and the ring its thread runs to
      c.fillStyle = `rgb(${RAMP[0]})`;
      c.fillRect(13, 69.2, 3.6, 3.6);
      c.fillStyle = css("--anatomy-muted");
      c.fillText("placed", 21, 74);
      const rx = 21 + c.measureText("placed   ").width + 3;
      c.beginPath();
      c.arc(rx, 71, 2.2, 0, 2 * Math.PI);
      c.strokeStyle = css("--anatomy-lit") || (pale ? "#000" : "#fff");
      c.stroke();
      c.fillText("where it really landed", rx + 6, 74);
    }
    stage.dataset.navErr = err.toFixed(2);
  }

  // ---------------------------------------------------------------- the scope: the pulse train above, one pulse's echo below
  const SW = 400;
  const SH = 182;
  const L0 = 44;
  const L1 = 388;
  let echoes = [];
  let curve = [];
  let peaks = [];
  let histo = null;
  const RFROM = FLIGHT.alt - 22;
  const RTO = FLIGHT.alt + 7;
  const xR = (r) => L0 + ((r - RFROM) / (RTO - RFROM)) * (L1 - L0);
  // the scope shows the last pulse whose echoes are all home; until the first one is, the ground under the aircraft
  let scoped = null;
  let hitNow = null;
  let noisy = () => 0;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  function prepareScope(src) {
    hitNow = src.hit;
    echoes = src.echoes;
    stage.dataset.hit = src.hit ? src.hit.kind : "none";
    // receiver noise, band-limited to about one sample a nanosecond: a floor from the amplifier and shot noise that
    // grows with the signal
    const N = Math.ceil((RTO - RFROM) / 0.15) + 2;
    const floorN = Float32Array.from({ length: N }, gauss);
    const shotN = Float32Array.from({ length: N }, gauss);
    noisy = (r) => {
      const u = clamp((r - RFROM) / 0.15, 0, N - 1.001);
      const i = Math.floor(u);
      const f = u - i;
      const y = HM.signalAt(cfg, echoes, r);
      return y + 0.005 * (floorN[i] * (1 - f) + floorN[i + 1] * f) + 0.04 * Math.sqrt(Math.max(0, y)) * (shotN[i] * (1 - f) + shotN[i + 1] * f);
    };
    curve = [];
    for (let r = RFROM; r <= RTO; r += 0.05) curve.push([r, noisy(r)]);
    peaks = HM.discreteOf(cfg, echoes, { from: RFROM, to: RTO, signal: noisy });
    // single photons pile up over many shots, so the histogram keeps a fading memory of the ground just flown over
    const fresh = HM.photonsOf(cfg, echoes, { from: RFROM, to: RTO, shots: 70, seed: 1 + Math.floor(Math.random() * 9000) });
    histo = histo ? { width: fresh.width, counts: histo.counts.map((n, i) => n * 0.72 + fresh.counts[i]) } : fresh;
  }
  function follow() {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (tr - s.tf < s.back) continue;
      if (scoped !== s.echoes) (scoped = s.echoes), prepareScope(s);
      return;
    }
    if (!hitNow) {
      const hit = surfaceAt(alongAt(tr), 0, [0, 0, -1]);
      prepareScope({ hit, echoes: HM.echoesFor(cfg, hit) });
    }
  }
  function paintScope(tv) {
    const c = fit(scopeCanvas, SW, SH);
    c.clearRect(0, 0, SW, SH);
    const rgb = INK[LASERS[cfg.laser].ink].map((v) => Math.round(v * 255)).join(",");
    const ink = `rgb(${rgb})`;
    const mid = css("--anatomy-mid");
    const lo = css("--anatomy-lo");
    const muted = css("--anatomy-muted");
    const hi = css("--anatomy-hi");
    c.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    c.lineWidth = 1;
    // pulse train, 0 to 3 µs: every T0 and the echo that belongs to it
    const rate = cfg.scanner === "flash" ? facts.frames : cfg.prf;
    const period = 1e6 / rate;
    const tof = ((2 * FLIGHT.alt) / C) * 1e6;
    const T1 = 3;
    const xT = (t) => L0 + (t / T1) * (L1 - L0);
    const base = 66;
    c.strokeStyle = lo;
    c.beginPath();
    c.moveTo(L0, base + 0.5), c.lineTo(L1, base + 0.5);
    for (let t = 0; t <= T1 + 1e-9; t += 0.5) c.moveTo(Math.round(xT(t)) + 0.5, base), c.lineTo(Math.round(xT(t)) + 0.5, base + 4);
    c.stroke();
    c.fillStyle = muted;
    c.textAlign = "center";
    for (let t = 0; t <= T1 + 1e-9; t += 1) c.fillText(`${t} µs`, xT(t), base + 15);
    c.textAlign = "left";
    c.fillText("pulses", 4, base - 2);
    const firstEcho = echoes[0] ? echoes[0].a : 0;
    let k0 = -Math.ceil(tof / period);
    let level = 0;
    for (let k = k0; k * period <= T1; k++) {
      const t0 = k * period;
      const te = t0 + tof;
      const lane = 22 + (((k % 3) + 3) % 3) * 7;
      if (te >= 0 && t0 <= T1) {
        c.strokeStyle = muted;
        c.beginPath();
        const a = Math.max(L0, xT(t0));
        const b = Math.min(L1, xT(te));
        if (b > a) {
          c.moveTo(a, lane + 0.5), c.lineTo(b, lane + 0.5);
          if (t0 >= 0) c.moveTo(Math.round(a) + 0.5, lane), c.lineTo(Math.round(a) + 0.5, lane + 4);
          if (te <= T1) c.moveTo(Math.round(b) + 0.5, lane), c.lineTo(Math.round(b) + 0.5, lane + 4);
          c.stroke();
        }
      }
      if (t0 >= 0 && t0 <= T1) {
        c.fillStyle = ink;
        c.fillRect(xT(t0) - 1, base - 26, 2, 26);
        level++;
      }
      if (te >= 0 && te <= T1) {
        c.fillStyle = hi;
        c.fillRect(xT(te) - 1, base - 6 - 18 * Math.min(1, firstEcho / 0.45), 2, 6 + 18 * Math.min(1, firstEcho / 0.45));
      }
    }
    c.fillStyle = muted;
    c.textAlign = "right";
    c.fillText(`${facts.inAir} in the air · echo ${tof.toFixed(2)} µs`, L1, 12);
    c.textAlign = "left";
    // one pulse's echo, in range
    const top = 116;
    const floor = 162;
    // one fixed gain per laser, so a bright roof stands taller than the road beside it
    const most = { yag: 0.55, fibre: 0.45, green: 0.2 }[cfg.laser] ?? 0.45;
    const yS = (v) => floor - clamp(v / most, -0.06, 1) * (floor - top);
    c.strokeStyle = lo;
    c.beginPath();
    c.moveTo(L0, floor + 0.5), c.lineTo(L1, floor + 0.5);
    for (let r = Math.ceil(RFROM / 5) * 5; r <= RTO; r += 5) c.moveTo(Math.round(xR(r)) + 0.5, floor), c.lineTo(Math.round(xR(r)) + 0.5, floor + 4);
    c.stroke();
    c.fillStyle = muted;
    c.textAlign = "center";
    for (let r = Math.ceil(RFROM / 10) * 10; r <= RTO; r += 10) c.fillText(`${r} m`, xR(r), floor + 15);
    c.textAlign = "left";
    c.fillText("echo", 4, floor - 2);
    const det = cfg.detector;
    if (det === "photon") {
      const peak = Math.max(8, ...histo.counts);
      c.fillStyle = `rgba(${rgb},${pale ? 0.8 : 0.85})`;
      histo.counts.forEach((n, i) => {
        if (!n) return;
        const x0 = xR(RFROM + i * histo.width);
        const h = (n / peak) * (floor - top);
        c.fillRect(x0, floor - h, Math.max(1, xR(RFROM + (i + 1) * histo.width) - x0 - 0.5), h);
      });
    }
    c.strokeStyle = det === "photon" ? lo : mid;
    c.beginPath();
    curve.forEach(([r, y], i) => (i ? c.lineTo(xR(r), yS(y)) : c.moveTo(xR(r), yS(y))));
    c.stroke();
    if (det === "waveform") {
      // the digitiser samples once a nanosecond: 15 cm of range per sample
      c.fillStyle = ink;
      for (let r = RFROM; r <= RTO; r += 0.15) c.fillRect(xR(r) - 1, yS(noisy(r)) - 1, 2, 2);
    } else if (det === "discrete") {
      c.strokeStyle = ink;
      c.fillStyle = ink;
      peaks.forEach((p, i) => {
        const x = Math.round(xR(p.r)) + 0.5;
        c.beginPath();
        c.moveTo(x, floor), c.lineTo(x, yS(p.a));
        c.stroke();
        c.beginPath();
        c.arc(x, yS(p.a), 2.4, 0, 2 * Math.PI);
        c.fill();
        c.fillText(String(i + 1), x + 4, yS(p.a) - 3);
      });
      const thr = yS(0.04);
      c.strokeStyle = lo;
      c.beginPath();
      c.moveTo(L0, Math.round(thr) + 0.5), c.lineTo(L1, Math.round(thr) + 0.5);
      c.stroke();
      c.fillStyle = muted;
      c.textAlign = "right";
      c.fillText("threshold", L1, thr - 3);
      c.textAlign = "left";
    }
    // name each surface over its echo
    c.fillStyle = muted;
    c.textAlign = "center";
    const named = [];
    for (const e of echoes) {
      if (e.what === "water column") continue;
      const w = c.measureText(e.what).width / 2 + 6;
      const x = clamp(xR(e.r), L0 + w, L1 - w);
      const row = [0, 1].find((k) => !named.some(([a, b, n]) => n === k && x + w > a && x - w < b));
      if (row === undefined) continue;
      named.push([x - w, x + w, row]);
      c.fillText(e.what, x, top - 14 - row * 12);
    }
    if (!echoes.length && hitNow) {
      c.fillStyle = muted;
      const why = hitNow.kind === "none" ? "beam above the horizon" : LASERS[cfg.laser].water === "absorbed" ? "water absorbs 1550 nm" : "calm water mirrors the beam away";
      c.fillText(`no return · ${why}`, (L0 + L1) / 2, (top + floor) / 2);
    }
    c.textAlign = "left";
    c.fillStyle = muted;
    if (hitNow) {
      // the hit and its returns share the top line with the pulse note, left of it, with the swatch its point wears
      const m = Math.min(4, peaks.length);
      const label = `${hitLabel(hitNow, echoes)}${hitNow.kind === "none" ? "" : ` · ${m} return${m === 1 ? "" : "s"}`}`;
      const x = m ? 14 : 4;
      c.fillText(label, x, 12);
      if (m) {
        c.fillStyle = `rgb(${RAMP[m - 1]})`;
        c.fillRect(4, 6, 6, 6);
      }
    }
  }
  function hitLabel(h, ex) {
    if (h.kind === "tree") return `tree ${fmt(h.height)} m`;
    if (h.kind === "roof") return `${h.edge ? "roof edge" : "roof"} ${fmt(h.height)} m`;
    if (h.kind === "water") return `${h.name || "water"} ${h.depth.toFixed(1)} m deep`;
    if (h.kind === "none") return "no ground";
    return h.kind;
  }

  // ---------------------------------------------------------------- configuration, readout and the clock
  let facts = HM.factsOf(cfg);
  let nextShot = tr;
  let tv = 0.35;
  let prev = null;
  let raf = 0;
  let paused = false;
  let onscreen = true;
  // the loupe zooms like a camera lens: lz is log2 of the magnification, eased toward the ring's setting, about a focus
  // point F in drawing units (by default the optics between the injection mirror and the scanner)
  const ZMAX = 6;
  const LZMAX = Math.log2(ZMAX);
  const CEN = [D.loupe.cx, D.loupe.cy];
  let lz = 0;
  let lzT = 0;
  let zoom = 1;
  let FT = [...D.focus[cfg.rx]];
  let Fc = [...CEN];
  let anchor = null;
  const clampF = (f, z) => {
    const lim = D.loupe.r * (1 - 1 / z);
    const dx = f[0] - CEN[0];
    const dy = f[1] - CEN[1];
    const l = Math.hypot(dx, dy);
    return l <= lim ? [f[0], f[1]] : [CEN[0] + (dx * lim) / l, CEN[1] + (dy * lim) / l];
  };
  const LSMIN = 2;
  const LSMAX = 7;
  const slowLabel = (s) => {
    const e = 10 ** Math.max(0, Math.floor(Math.log10(s)) - 1);
    const v = Math.round(s / e) * e;
    return v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : `${v}`;
  };
  const fanRate = () => (cfg.scanner === "flash" ? 2.5 : 4 * Math.sqrt(cfg.prf / 1e5));
  const kHz = (v) => (v >= 1e6 ? `${v / 1e6} MHz` : `${v / 1e3} kHz`);
  const dens = (v) => (v < 10 ? fmt(v, 1) : fmt(v));
  function readoutText() {
    return `${fmt(facts.swath)} m swath · ${dens(facts.density)} pts/m² · ${facts.inAir} in air`;
  }
  function sentence() {
    const S = SCANNERS[cfg.scanner];
    const name = cfg.scanner === "polygon" ? `${cfg.facets}-facet polygon` : cfg.scanner === "risley" ? `Risley prisms turning ${cfg.rate1} and ${sgn(cfg.rate2)} times a second, phase ${cfg.phase}°` : S.name;
    const lines = facts.lines && cfg.scanner !== "risley" ? ` at ${facts.scanRate} ${S.unit === "Hz" ? "Hz" : "turns a second"}, ${fmt(facts.lines)} scan lines a second ${fmt(facts.lineSpacing, 2)} m apart, ${fmt(facts.perLine)} shots a line` : "";
    return `${name}${lines}, ${LASERS[cfg.laser].name} at ${kHz(cfg.prf)}, ${DETECTORS[cfg.detector].name.toLowerCase()}, navigation ${HM.NAVS[cfg.nav].name}: ${fmt(facts.swath)} m swath, ${dens(facts.density)} points per square metre, ${facts.inAir} pulse${facts.inAir > 1 ? "s" : ""} in the air, unambiguous to ${fmt(facts.unambiguous)} m.`;
  }
  function apply(announce) {
    for (const el of items) el.style.display = matches(el.dataset.when) ? "" : "none";
    for (const row of rows) row.hidden = !matches(row.dataset.only);
    for (const seg of segs) for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.value) === String(cfg[seg.dataset.key]) ? "true" : "false");
    placeNotch();
    for (const el of slides) {
      el.value = cfg[el.dataset.slide];
      fig.querySelector(`output[data-out="${el.dataset.slide}"]`).textContent = slideText(el.dataset.slide);
    }
    stage.dataset.ink = LASERS[cfg.laser].ink;
    RAMP = RAMPS[LASERS[cfg.laser].ink];
    for (const el of [stage, ...document.querySelectorAll(".hd-key")]) RAMP.forEach((v, i) => el.style.setProperty(`--hd-r${i + 1}`, `rgb(${v})`));
    stage.dataset.scanner = cfg.scanner;
    facts = HM.factsOf(cfg);
    histo = null;
    if (hitNow) prepareScope({ hit: hitNow, echoes: HM.echoesFor(cfg, hitNow) });
    scoped = null;
    shots = [];
    lastKey = "";
    nextShot = tr;
    resetMap(tr);
    readout.textContent = readoutText();
    notes();
    scopeNote.textContent = DETECTORS[cfg.detector].note;
    // a new coaxial design moves the zoom to its own receive path
    if (stage.dataset.rx && stage.dataset.rx !== cfg.rx) {
      FT = [...D.focus[cfg.rx]];
      anchor = null;
    }
    stage.dataset.rx = cfg.rx;
    if (announce) said.textContent = sentence();
    kick();
  }
  function placeNotch() {
    const b = scanSeg.querySelector('button[aria-checked="true"]');
    if (!b) return;
    subTitle.textContent = `${b.textContent} settings`;
    const x = b.getBoundingClientRect();
    const y = sub.getBoundingClientRect();
    if (x.width) sub.style.setProperty("--notch", `${(x.left + x.width / 2 - y.left).toFixed(1)}px`);
  }
  addEventListener("resize", placeNotch);
  document.fonts?.ready.then(placeNotch);
  function notes() {
    mapNote.textContent = `track stretched ×${STRETCH} · ${cfg.scanner === "flash" ? `1 frame in ${FDEC}` : `1 pulse in ${DEC}`} shown`;
  }
  for (const seg of segs) {
    seg.addEventListener("click", (event) => {
      const b = event.target.closest("button");
      if (!b) return;
      const key = seg.dataset.key;
      cfg[key] = ["facets", "prf", "rate"].includes(key) ? Number(b.dataset.value) : b.dataset.value;
      // each scanner starts at its own usual frequency
      if (key === "scanner") cfg.rate = SCANNERS[cfg.scanner].rate;
      apply(true);
    });
    // arrow keys move along a radio group
    seg.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const list = [...seg.querySelectorAll("button")];
      const i = list.findIndex((b) => b.getAttribute("aria-checked") === "true");
      const next = list[(i + (event.key === "ArrowRight" ? 1 : list.length - 1)) % list.length];
      next.focus();
      next.click();
      event.preventDefault();
    });
  }
  function setPaused(v) {
    paused = v;
    stage.classList.toggle("is-paused", paused);
    fig.classList.toggle("hd-is-paused", paused);
    said.textContent = paused ? "Simulation paused." : "Running.";
    kick();
  }
  for (const el of slides) {
    el.addEventListener("input", () => {
      cfg[el.dataset.slide] = Number(el.value);
      apply(false);
    });
    el.addEventListener("change", () => (said.textContent = sentence()));
  }
  const zoomTo = (v) => {
    lzT = clamp(v, 0, LZMAX);
    said.textContent = `Zoom ${fmt(2 ** lzT, 1)}×`;
    kick();
  };
  const slowTo = (v) => {
    lsT = clamp(v, LSMIN, LSMAX);
    notes();
    said.textContent = `Time slowed ${slowLabel(10 ** lsT)} times${lsT > 4.9 ? ": single pulses in flight" : ""}`;
    kick();
  };
  stage.addEventListener("keydown", (event) => {
    const key = event.key;
    if (key === " ") {
      setPaused(!paused);
    } else if (key === "+" || key === "=") zoomTo(lzT + 0.5);
    else if (key === "-" || key === "_") zoomTo(lzT - 0.5);
    else if (key === "0") zoomTo(0);
    else if (key === ",") slowTo(lsT + 0.5);
    else if (key === ".") slowTo(lsT - 0.5);
    else return;
    event.preventDefault();
  });
  // drag inside the lens to look around when zoomed; a drag is not a click
  let press = null;
  let dragged = false;
  const toView = (event) => {
    const box = stage.getBoundingClientRect();
    return [((event.clientX - box.left) / box.width) * D.W, ((event.clientY - box.top) / box.height) * D.H];
  };
  stage.addEventListener("pointerdown", (event) => {
    dragged = false;
    if (zoom < 1.02 || event.button) return;
    press = { s: toView(event), f: [...Fc], id: event.pointerId };
  });
  stage.addEventListener("pointermove", (event) => {
    if (!press || event.pointerId !== press.id) return;
    const s = toView(event);
    if (!dragged && Math.hypot(s[0] - press.s[0], s[1] - press.s[1]) < 4) return;
    if (!dragged) stage.setPointerCapture(event.pointerId), stage.classList.add("hd-panning");
    dragged = true;
    anchor = null;
    FT = clampF([press.f[0] - (s[0] - press.s[0]) / zoom, press.f[1] - (s[1] - press.s[1]) / zoom], zoom);
    kick();
  });
  const release = () => {
    press = null;
    stage.classList.remove("hd-panning");
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);
  stage.addEventListener("click", () => {
    if (dragged) return void (dragged = false);
    setPaused(!paused);
  });
  // pinch or Ctrl+wheel zooms about the pointer
  stage.addEventListener(
    "wheel",
    (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const s = toView(event);
      anchor = { s, p: [Fc[0] + (s[0] - CEN[0]) / zoom, Fc[1] + (s[1] - CEN[1]) / zoom] };
      lzT = clamp(lzT - event.deltaY * 0.004, 0, LZMAX);
      kick();
    },
    { passive: false }
  );

  // ---------------------------------------------------------------- the bezel: a zoom ring at upper right, a time slider at lower left
  const R0 = D.loupe.r;
  const rad = (deg) => (deg * Math.PI) / 180;
  const pol = (r, deg) => [CEN[0] + r * Math.cos(rad(deg)), CEN[1] + r * Math.sin(rad(deg))];
  const P2 = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const band = (r0, r1, a0, a1) => `M${P2(pol(r1, a0))}A${r1} ${r1} 0 0 1 ${P2(pol(r1, a1))}L${P2(pol(r0, a1))}A${r0} ${r0} 0 0 0 ${P2(pol(r0, a0))}Z`;
  const Z0 = -70;
  const Z1 = -20;
  const zAng = (l) => Z0 + (l / LZMAX) * (Z1 - Z0);
  const T0 = 158;
  const T1 = 112;
  const tAng = (l) => T0 + ((l - LSMIN) / (LSMAX - LSMIN)) * (T1 - T0);
  const label = (r, deg, text, turn, cls = "") => {
    const [x, y] = pol(r, deg);
    return `<text class="hd-num${cls}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(deg + turn).toFixed(1)})" dy="0.35em" text-anchor="middle">${text}</text>`;
  };
  const tick = (r0, r1, deg) => `M${P2(pol(r0, deg))}L${P2(pol(r1, deg))}`;
  const zMarks = [1, 1.5, 2, 3, 4, 6];
  const zMinor = [];
  for (let l = 0; l <= LZMAX + 1e-6; l += LZMAX / 20) zMinor.push(tick(R0 + 13, R0 + 15, zAng(l)));
  const tMinor = [];
  for (let l = LSMIN; l <= LSMAX + 1e-6; l += 0.25) tMinor.push(tick(R0 + 13, Number.isInteger(l) ? R0 + 15.4 : R0 + 14.4, tAng(l)));
  const dials = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg hd-layer hd-dials" viewBox="0 0 ${D.W} ${D.H}">
<g class="hd-dial hd-zoom" role="slider" tabindex="0" aria-label="Zoom" aria-valuemin="1" aria-valuemax="${ZMAX}" aria-valuenow="1" aria-valuetext="1×">
<path class="hd-plate" d="${band(R0 + 13, R0 + 29, Z0 - 6, Z1 + 20)}"/>
<path class="hd-tick" d="${zMinor.join("")}${zMarks.map((z) => tick(R0 + 13, R0 + 16.5, zAng(Math.log2(z)))).join("")}"/>
<path class="hd-rule" d="${tick(R0 + 13, R0 + 29, Z1 + 7)}"/>
${zMarks.map((z) => label(R0 + 22.5, zAng(Math.log2(z)), `${z}×`, 90)).join("")}
${label(R0 + 21, Z1 + 13.5, "ZOOM", 90, " hd-name")}
<path class="hd-index" d=""/></g>
<g class="hd-dial hd-time" role="slider" tabindex="0" aria-label="Time, slowed down" aria-valuemin="100" aria-valuemax="10000000" aria-valuenow="100" aria-valuetext="÷100">
<path class="hd-plate" d="${band(R0 + 13, R0 + 29, T1 - 18, T0 + 6)}"/>
<path class="hd-tick" d="${tMinor.join("")}"/>
<path class="hd-rule" d="${tick(R0 + 13, R0 + 29, T1 - 6)}"/>
<path class="hd-slot" d="M${P2(pol(R0 + 17.6, T1))}A${R0 + 17.6} ${R0 + 17.6} 0 0 1 ${P2(pol(R0 + 17.6, T0))}"/>
${[2, 3, 4, 5, 6, 7].map((l) => label(R0 + 25, tAng(l), `÷${slowLabel(10 ** l)}`, -90, " hd-num-t")).join("")}
${label(R0 + 21, T1 - 12, "TIME", -90, " hd-name")}
<rect class="hd-thumb" x="-6" y="-3" width="12" height="6" rx="3"/></g></svg>`;
  stage.querySelector(".hd-bezel").insertAdjacentHTML("afterend", dials);
  const zoomDial = stage.querySelector(".hd-zoom");
  const timeDial = stage.querySelector(".hd-time");
  const indexEl = zoomDial.querySelector(".hd-index");
  const thumb = timeDial.querySelector(".hd-thumb");
  const knurl = stage.querySelector(".hd-knurl");
  const frontSvg = stage.querySelector(".hd-front");
  const clipDisc = frontSvg.querySelector("clipPath circle");
  const angleOf = (event) => {
    const s = toView(event);
    return (Math.atan2(s[1] - CEN[1], s[0] - CEN[0]) * 180) / Math.PI;
  };
  // a dial keeps turning while held, wherever the pointer goes, and its release never reaches the stage as a click
  const eatClick = (event) => (event.stopPropagation(), event.preventDefault());
  function dial(el, onAngle, onStep) {
    let held = null;
    const move = (event) => {
      if (held === event.pointerId) event.stopPropagation(), onAngle(angleOf(event));
    };
    const up = (event) => {
      if (held !== event.pointerId) return;
      event.stopPropagation();
      held = null;
      el.classList.remove("held");
      removeEventListener("pointermove", move, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", up, true);
      addEventListener("click", eatClick, true);
      setTimeout(() => removeEventListener("click", eatClick, true));
    };
    el.addEventListener("pointerdown", (event) => {
      if (event.button) return;
      event.stopPropagation();
      event.preventDefault();
      held = event.pointerId;
      el.classList.add("held");
      addEventListener("pointermove", move, true);
      addEventListener("pointerup", up, true);
      addEventListener("pointercancel", up, true);
      onAngle(angleOf(event));
    });
    el.addEventListener("click", (event) => event.stopPropagation());
    el.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        onStep(event.deltaY < 0 ? 1 : -1);
      },
      { passive: false }
    );
    el.addEventListener("keydown", (event) => {
      const up = ["ArrowRight", "ArrowUp", "+", "="].includes(event.key);
      const down = ["ArrowLeft", "ArrowDown", "-"].includes(event.key);
      if (!up && !down) return;
      event.preventDefault();
      event.stopPropagation();
      onStep(up ? 1 : -1);
    });
  }
  dial(
    zoomDial,
    (deg) => {
      anchor = null;
      const v = clamp((deg - Z0) / (Z1 - Z0), 0, 1) * LZMAX;
      const near = zMarks.map((z) => Math.log2(z)).find((l) => Math.abs(zAng(l) - deg) < 1.2);
      zoomTo(near ?? v);
    },
    (dir) => ((anchor = null), zoomTo(lzT + dir * 0.25))
  );
  dial(
    timeDial,
    (deg) => {
      const v = LSMIN + clamp((deg - T0) / (T1 - T0), 0, 1) * (LSMAX - LSMIN);
      slowTo(Math.abs(v - Math.round(v)) * Math.abs((T1 - T0) / (LSMAX - LSMIN)) < 1.2 ? Math.round(v) : v);
    },
    (dir) => slowTo(lsT + dir * 0.25)
  );
  // the view follows the eased ring: the front SVG's viewBox and clip, the fan's uniform, the ring's index and knurl
  let viewKey = "";
  function view() {
    const key = `${Fc[0].toFixed(2)},${Fc[1].toFixed(2)},${zoom.toFixed(4)},${ls.toFixed(3)}`;
    if (key === viewKey) return;
    viewKey = key;
    const w = D.W / zoom;
    frontSvg.setAttribute("viewBox", `${(Fc[0] - w / 2).toFixed(2)} ${(Fc[1] - w / 2).toFixed(2)} ${w.toFixed(2)} ${w.toFixed(2)}`);
    clipDisc.setAttribute("cx", Fc[0].toFixed(2));
    clipDisc.setAttribute("cy", Fc[1].toFixed(2));
    clipDisc.setAttribute("r", (D.loupe.r / zoom).toFixed(2));
    const lod = smooth(1.7, 2.6, zoom);
    stage.classList.toggle("hd-lod-on", lod > 0.002);
    stage.style.setProperty("--hd-lod", lod.toFixed(3));
    stage.style.setProperty("--hd-zoom", zoom.toFixed(3));
    const a = zAng(lz);
    const tip = pol(R0 + 12.6, a);
    const l = pol(R0 + 8.6, a - 1.1);
    const r = pol(R0 + 8.6, a + 1.1);
    indexEl.setAttribute("d", `M${P2(tip)}L${P2(l)}L${P2(r)}Z`);
    knurl.setAttribute("transform", `rotate(${((lz / LZMAX) * 50).toFixed(2)} ${CEN[0]} ${CEN[1]})`);
    zoomDial.setAttribute("aria-valuenow", zoom.toFixed(2));
    zoomDial.setAttribute("aria-valuetext", `${fmt(zoom, 1)}×`);
    const [tx, ty] = pol(R0 + 17.6, tAng(ls));
    thumb.setAttribute("transform", `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${(tAng(ls) + 90).toFixed(2)})`);
    timeDial.setAttribute("aria-valuenow", String(Math.round(slow)));
    timeDial.setAttribute("aria-valuetext", `÷${slowLabel(slow)}`);
  }
  // eases zoom and time toward their settings; true while either is still moving
  function ease(dt) {
    const kz = still.matches ? 1 : 1 - Math.exp(-dt / 0.16);
    const kt = still.matches ? 1 : 1 - Math.exp(-dt / 0.22);
    lz += (lzT - lz) * kz;
    if (Math.abs(lzT - lz) < 2e-3) lz = lzT;
    ls += (lsT - ls) * kt;
    if (Math.abs(lsT - ls) < 2e-3) ls = lsT;
    zoom = 2 ** lz;
    slow = 10 ** ls;
    if (anchor) FT = [anchor.p[0] - (anchor.s[0] - CEN[0]) / zoom, anchor.p[1] - (anchor.s[1] - CEN[1]) / zoom];
    if (lz === lzT) anchor = null;
    Fc = clampF(FT, zoom);
    view();
    return lz !== lzT || ls !== lsT;
  }

  // ---------------------------------------------------------------- hover cards: what each part does and why the lidar needs it
  const us = (s) => `${fmt(s * 1e6, 2)} µs`;
  const laserCard = () => {
    const L = LASERS[cfg.laser];
    const text = {
      yag: ["A diode-pumped Nd:YAG crystal, Q-switched into nanosecond pulses at 1064 nm. The fins carry away its heat.", "Near-infrared is bright off leaves and soil, so it is the workhorse for terrain and forestry; it stops at a water surface."],
      fibre: ["The pump and seed for an erbium fibre laser at 1550 nm; the fins carry away its heat.", "Fibre lasers fire at MHz rates efficiently. Water absorbs 1550 nm, including the water in the front of the eye, so it is eye-safe at higher power."],
      green: ["An Nd:YAG at 1064 nm whose output is frequency-doubled to 532 nm further down the bench.", "Green light passes through clear water, so the lidar can map the bottom as well as the surface."],
    }[cfg.laser];
    return { sys: "Transmitter", title: L.name, does: text[0], why: text[1], spec: `${kHz(cfg.prf)} · ${fmt(L.width * 1e9, 1)} ns pulse · ${L.eyeSafe ? "eye-safe" : "not eye-safe"}` };
  };
  const scanSpec = () => `${fmt(facts.swath)} m swath${facts.lines ? ` · ${facts.scanRate} ${SCANNERS[cfg.scanner].unit} · ${fmt(facts.lines)} lines/s · ${fmt(facts.lineSpacing, 2)} m apart` : ""}`;
  const CARDS = [
    [/^yag\.qswitch/, () => ({ sys: "Transmitter", title: "Q-switch", does: "An electro-optic shutter that keeps the laser cavity closed while the crystal stores energy, then opens it in a few nanoseconds.", why: "It turns stored energy into one short, bright pulse per trigger; the pulse width sets how finely range can be resolved.", spec: `${fmt(LASERS[cfg.laser].width * 1e9, 1)} ns → ${fmt(facts.rangeRes * 100)} cm range resolution` })],
    [/^yag\.nozzle/, () => ({ sys: "Transmitter", title: "Output coupler", does: "The partly reflecting mirror at the end of the cavity that lets each pulse out along the bench.", why: "It sets where the beam starts and how wide it is before the expander.", spec: LASERS[cfg.laser].name })],
    [/^laser\.(driver|cable)/, () => ({ sys: "Transmitter", title: "Laser driver", does: "Feeds the pump diodes and fires the Q-switch on every tick of the timing board.", why: "Its trigger is T0, the instant every range is timed from.", spec: `T0 every ${us(facts.period)} · ${kHz(cfg.prf)}` })],
    [/^laser\./, laserCard],
    [/^green\.oven/, () => ({ sys: "Transmitter", title: "Doubling crystal oven", does: "Holds a nonlinear crystal at a fixed temperature so it converts 1064 nm light into 532 nm.", why: "Green is the colour that travels through water: this is what makes a bathymetric lidar.", spec: "1064 nm in → 532 nm out" })],
    [/^green\.d(ichroic|post|foot)/, () => ({ sys: "Transmitter", title: "Dichroic separator", does: "A coated mirror that passes 532 nm and turns the leftover 1064 nm aside.", why: "Only green leaves the head; the leftover infrared goes into the beam dump.", spec: "passes 532 · reflects 1064" })],
    [/^(green\.dump|beam\.dump)/, () => ({ sys: "Transmitter", title: "Beam dump", does: "A blackened, finned cone that soaks up unwanted light and turns it into heat.", why: "Stray light inside the housing would blind the detector and is an eye hazard.", spec: "absorbs the residual 1064 nm" })],
    [/^green\.ap/, () => ({ sys: "Transmitter", title: "Aperture", does: "A hard stop that trims the ragged edge of the beam.", why: "A clean, round beam gives a round footprint and less stray light.", spec: `footprint ø ${fmt(facts.footprint * 100)} cm on the ground` })],
    [/^fibre\.amp/, () => ({ sys: "Transmitter", title: "Erbium fibre amplifier", does: "Pump diodes drive a length of erbium-doped fibre that amplifies weak seed pulses to full power.", why: "Fibre amplifiers reach MHz pulse rates with good efficiency and little alignment to drift.", spec: `${kHz(cfg.prf)} · 1550 nm` })],
    [/^fibre\.(hub|flange)/, () => ({ sys: "Transmitter", title: "Gain fibre spool", does: "Metres of active fibre wound on a drum so the amplifier stays compact.", why: "A long gain path builds power without a large crystal or water cooling.", spec: "erbium-doped fibre" })],
    [/^fibre\.(collimator|vblock)/, () => ({ sys: "Transmitter", title: "Fibre collimator", does: "A lens that turns the light diverging from the fibre tip into a parallel beam; the V-block holds it on axis.", why: "Free-space optics downstream need a straight, parallel beam.", spec: "fibre → free space" })],
    [/^fibre\./, () => ({ sys: "Transmitter", title: "Delivery fibre", does: "Armoured fibre that carries the amplified light from the spool to the collimator.", why: "It lets the laser sit anywhere on the bench without mirrors to align.", spec: "1550 nm" })],
    [/^expander/, () => ({ sys: "Transmitter", title: "Beam expander", does: "A Galilean telescope: a small negative lens spreads the laser's beam and a larger positive lens collimates it again, several times wider and parallel.", why: "A wider, collimated beam diverges less: divergence sets the footprint each pulse lights on the ground.", spec: `footprint ø ${fmt(facts.footprint * 100)} cm at ${FLIGHT.alt} m` })],
    [/^holed\.(mirror|cell|post|foot)/, () => ({ sys: "Optical path", title: "Holed (scraper) mirror", does: "A 45° mirror with a small hole on the axis: the pulse leaves through the hole, and the wide echo coming back reflects off the annulus into the telescope.", why: "Transmit and receive share one axis with no beam splitter; only the centre of the echo is lost back through the hole.", spec: `ø ${D.holed.hole * 2} hole · ${fmt(100 - 100 * (D.holed.hole / 9) ** 2)}% of the echo kept` })],
    [/^inject/, () => (cfg.rx === "holed"
      ? { sys: "Optical path", title: "Turning mirror", does: "Turns the expanded beam from the laser onto the scanner's axis, aimed through the hole in the scraper mirror.", why: "Every optic downstream shares this one axis, so the telescope looks where the laser points.", spec: "fixed, 45°" }
      : { sys: "Optical path", title: "Injection mirror", does: "A small mirror in the middle of the receive path that puts the outgoing pulse onto the scanner's axis.", why: "Transmit and receive share one axis, so the telescope always looks where the laser points; the mirror shades only the centre of the echo.", spec: `coaxial · ${fmt(100 - 100 * (3.5 / 9) ** 2)}% of the echo kept` })],
    [/^fold/, () => ({ sys: "Optical path", title: "Fold mirror", does: "A fixed mirror that turns the beam down through the window.", why: "With prisms or a diffuser there is no scanning mirror, so this one does the turning.", spec: "fixed, 45°" })],
    [/^galvo\.encoder/, () => ({ sys: "Scanner", title: "Angle encoder", does: "Reads the mirror's angle at the moment of every shot.", why: "Each point needs its beam direction; combined with the POS trajectory it puts the point on the map.", spec: `±${SCANNERS.galvo.half}° · ${facts.scanRate} Hz` })],
    [/^(galvo|poly|palmer|risley)[.\d]*.*cable|^cable\.drive/, () => ({ sys: "Scanner", title: "Scanner drive cable", does: "Carries motor current one way and the encoder signal back.", why: "The angle must reach the timing board in step with every shot.", spec: "drive + encoder" })],
    [/^galvo\./, () => ({ sys: "Scanner", title: "Galvanometer scanner", does: "A moving-magnet motor swings a light mirror back and forth.", why: "It sweeps the beam across track while the aircraft's motion supplies the along-track step; points bunch at the edges where it turns.", spec: scanSpec() })],
    [/^poly/, () => ({ sys: "Scanner", title: `${cfg.facets}-facet polygon`, does: "A mirrored prism spinning at constant speed; each facet sweeps one line, all in the same direction.", why: "Evenly spaced points with no turnaround; fewer facets give longer lines, more facets give more lines a second.", spec: `${scanSpec()} · ${fmt(facts.duty * 100)}% duty` })],
    [/^palmer/, () => ({ sys: "Scanner", title: "Palmer scanner", does: `A mirror tilted ${SCANNERS.palmer.tilt}° on a spinning shaft, so the beam traces a cone.`, why: "Its ellipses look forward and back, so every spot is seen twice, from two angles.", spec: scanSpec() })],
    [/^risley/, () => ({ sys: "Scanner", title: "Risley prism pair", does: `Two ${SCANNERS.risley.wedge}° glass wedges turning on the beam; their deflections add.`, why: "The two prisms' speeds, directions and phase choose the pattern: equal and opposite give a line, equal and together a circle, nearly equal a spiral, and others a rosette, with no part that swings back and forth.", spec: `${cfg.rate1} and ${sgn(cfg.rate2)} rev/s · phase ${cfg.phase}° · ${fmt(facts.swath)} m` })],
    [/^flash/, () => ({ sys: "Scanner", title: "Flash diffuser", does: "Spreads each pulse over the whole field of view.", why: "Every pixel of the detector array times its own echo: a full 3D frame per pulse, no moving parts.", spec: `${SCANNERS.flash.grid}×${SCANNERS.flash.grid} px · ${fmt(facts.frames)} frames/s` })],
    [/^drive/, () => ({ sys: "Scanner", title: "Scanner drive", does: "Servo electronics that power the scanner and hold its motion to the commanded profile.", why: "A steady angle profile keeps point spacing predictable.", spec: scanSpec() })],
    [/^scope/, () => ({ sys: "Receiver", title: "Receiving telescope", does: "A cemented objective focuses the echo through a pinhole field stop; a relay lens re-collimates it through a narrowband filter, and a last lens focuses it onto the detector. Zoom in to see the section.", why: `An echo from ${FLIGHT.alt} m is many orders of magnitude weaker than the pulse, so collecting area counts; the pinhole and filter shut out sunlight from everywhere but the lit spot and the laser's line.`, spec: `round trip ${us((2 * FLIGHT.alt) / C)} · filter at ${LASERS[cfg.laser].name}` })],
    [/^det\.(spad|tec)/, () => ({ sys: "Receiver", title: "SPAD array", does: "A microlens row over an array of single-photon avalanche diodes, on a ceramic carrier and a two-stage Peltier cooler; each cell fires on a single photon.", why: "Photon counting needs far less laser energy per point; a surface shows where detections from many shots pile up above the sunlight background, and cooling keeps dark counts down.", spec: DETECTORS.photon.note })],
    [/^det\.(body|can|flange)/, () => ({ sys: "Receiver", title: "Avalanche photodiode", does: cfg.detector === "waveform" ? "A small APD die behind a window, wired straight to a transimpedance amplifier that turns its current into a voltage to be digitised." : "A sub-millimetre APD die on a ceramic submount inside a sealed TO can, behind a glass window; a gold bond wire carries its current to a pin.", why: "Gain inside the diode lifts a few hundred photons above the amplifier's noise; its speed and noise set how precisely an echo can be timed.", spec: DETECTORS[cfg.detector].note })],
    [/^det\.cfd/, () => ({ sys: "Receiver", title: "Constant-fraction discriminator", does: "Fires a stop pulse when an echo crosses a fixed fraction of its own peak.", why: "Strong and weak echoes are timed at the same point on their shape, so bright targets don't range short.", spec: "typically 4 to 8 returns per pulse" })],
    [/^det\.tdc/, () => ({ sys: "Receiver", title: "Time-to-digital converter", does: "Counts the time from T0 to each stop, to tens of picoseconds.", why: "Range is c·t/2: every nanosecond is 15 cm.", spec: `ground at ${us((2 * FLIGHT.alt) / C)} → ${FLIGHT.alt} m` })],
    [/^det\.adc/, () => ({ sys: "Receiver", title: "Waveform digitiser", does: "Samples the detector's whole output once a nanosecond.", why: "Full waveform keeps every return, including weak ones a trigger would miss, for later analysis.", spec: "1 GS/s · 15 cm per sample" })],
    [/^det\.(fpga|ddr)/, () => ({ sys: "Receiver", title: "FPGA and memory", does: "Finds the peaks, tags each shot with its time and scan angle, and buffers the stream.", why: `It must keep up with ${kHz(cfg.prf)} of shots and match each echo to its pulse when ${facts.inAir} are in the air.`, spec: `${facts.inAir} in air · unambiguous to ${fmt(facts.unambiguous)} m` })],
    [/^det\.coax/, () => ({ sys: "Receiver", title: "Signal coax", does: "Shielded cable from the detector to the timing board.", why: "Nanosecond edges need a shielded, matched line to arrive clean.", spec: "50 Ω, SMA" })],
    [/^imu\.|^bulkimu|^cable\.imu/, () => {
      const a = HM.attitudeOf(tr);
      const sg = (v) => `${v < 0 ? "−" : "+"}${Math.abs(v / DEG).toFixed(1).padStart(4, "\u2007")}°`;
      return { sys: "Navigation", title: "Inertial measurement unit", does: "Three fibre-optic gyros and three accelerometers on one block, read 200 times a second; the cable takes them to the POS computer, which blends them with GNSS in a Kalman filter.", why: `The aircraft rolls, pitches and yaws in every gust, and 1° of roll moves a point ${fmt(FLIGHT.alt * Math.tan(DEG), 1)} m at ${FLIGHT.alt} m. It is bolted to the same bench as the scanner: the lever arm and boresight to it are measured once and never change.`, spec: `roll ${sg(a.roll)} · pitch ${sg(a.pitch)} · yaw ${sg(a.yaw)}` };
    }],
    [/^rx\.pps|^bulkpps|^cable\.pps/, () => ({ sys: "Navigation", title: "PPS time input", does: "A pulse once a second from the GNSS receiver, on the edge of each GPS second, plus the time message that names it.", why: "The sensor logs every shot on its own clock and records when each pulse arrived; after the flight the shot times are converted to GPS time, so each range and scan angle is matched to the trajectory at that instant.", spec: `1 pulse/s · shots ${us(facts.period)} apart` })],
    [/^rx\./, () => ({ sys: "Receiver", title: "Timing board", does: "Holds the receiver electronics and takes T0 from the laser.", why: "Every range is a time measured on this board.", spec: `T0 every ${us(facts.period)}` })],
    [/^psu/, () => ({ sys: "Power", title: "Power supply", does: "Turns the aircraft's 28 V bus into clean rails for the laser, scanner and receiver; the LED shows it is on.", why: "Noise on the rails shows up as timing jitter and range noise.", spec: "28 V DC in" })],
    [/^dry/, () => ({ sys: "Housing", title: "Desiccant cartridge", does: "Silica gel behind a small window; it changes colour when it is spent.", why: "Keeps the sealed housing dry so the optics don't fog as the aircraft climbs into cold air.", spec: "check before flight" })],
    [/^relief/, () => ({ sys: "Housing", title: "Pressure relief valve", does: "Lets the sealed housing breathe as outside pressure changes with altitude.", why: "Spares the window and seals from stress in climbs and descents.", spec: "venting valve" })],
    [/^bulk/, () => ({ sys: "Housing", title: "Bulkhead connector", does: "Carries power and data through the sealed wall.", why: "Cables pass in without breaking the seal.", spec: "sealed, panel-mounted" })],
    [/^cable\.data/, () => ({ sys: "Data", title: "Data harness", does: "Takes ranges, angles and timestamps to the sensor computer.", why: "After the flight they are merged with the POS trajectory to become map points.", spec: `${kHz(cfg.prf)} shot stream` })],
    [/^cable\.power/, () => ({ sys: "Power", title: "Power harness", does: "Brings aircraft power in to the supply.", why: "The laser and scanner draw the most current.", spec: "28 V DC" })],
    [/^window/, () => ({ sys: "Housing", title: "Optical window", does: "A flat coated glass port in the floor, held to a seal by clamp strips.", why: "Seals the head against dust and moisture while passing both the pulse and its echo.", spec: `${LASERS[cfg.laser].nm} nm coating` })],
    [/^(wall|lip)/, () => ({ sys: "Housing", title: "Sealed housing (cut away)", does: "A ribbed box around the bench; two walls are cut away here.", why: "It keeps light, dust and moisture out and the optics in alignment.", spec: "drawn far larger than real" })],
    [/^plate/, () => ({ sys: "Housing", title: "Optical breadboard", does: "A stiff plate with a grid of tapped holes that every optic bolts to.", why: "Holds the alignment between laser, scanner and telescope in flight.", spec: "tapped grid" })],
    [/^iso\./, () => ({ sys: "Housing", title: "Vibration isolator", does: "Rubber mounts between the housing and the aircraft.", why: "They keep engine and airframe vibration off the optics; the IMU records the attitude that remains.", spec: "one per corner" })],
    [/^label/, () => ({ sys: "Housing", title: "Nameplate", does: "Model, serial number and laser class.", why: "Laser class says how the beam must be handled on the ground.", spec: LASERS[cfg.laser].eyeSafe ? "eye-safe wavelength" : "laser hazard: not eye-safe" })],
    [/^beam/, () => ({ sys: "Optical path", title: "Outgoing beam", does: "The pulse travelling along the bench, through the expander and onto the scanner.", why: "Each pulse becomes one point, or several when it hits layers.", spec: `${LASERS[cfg.laser].nm} nm · ${kHz(cfg.prf)}` })],
  ];
  const cardOf = (name) => CARDS.findIndex(([re]) => re.test(name));
  const parts = [...stage.querySelectorAll(".hd-front .it[data-name]")].map((el) => [el, cardOf(el.dataset.name)]);
  const layout = stage.closest(".hd-layout");
  const card = document.createElement("div");
  card.className = "hd-card";
  card.setAttribute("aria-hidden", "true");
  layout.appendChild(card);
  let hot = -1;
  function hover(event) {
    const el = event.target.closest && event.target.closest(".hd-front .it[data-name]");
    const i = el ? cardOf(el.dataset.name) : -1;
    if (i !== hot) {
      hot = i;
      for (const [p, j] of parts) p.classList.toggle("hd-hot", j === i && i >= 0);
      if (i < 0) return card.classList.remove("on");
      const c = CARDS[i][1]();
      card.innerHTML = `<div class="hd-card-sys">${c.sys}</div><div class="hd-card-title">${c.title}</div><p>${c.does}</p><p class="hd-card-why">${c.why}</p><div class="hd-card-spec">${c.spec}</div>`;
      card.classList.add("on");
    }
    const box = layout.getBoundingClientRect();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let x = event.clientX - box.left + 16;
    let y = event.clientY - box.top + 16;
    if (x + w > box.width) x = event.clientX - box.left - w - 16;
    if (y + h > box.height) y = event.clientY - box.top - h - 16;
    card.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px)`;
  }
  stage.addEventListener("pointermove", hover);
  stage.addEventListener("pointerdown", hover);
  stage.addEventListener("pointerleave", () => hover({ target: stage, clientX: 0, clientY: 0 }));

  // how strongly the telescope is being lit by returns right now: each shot's echoes arrive 2r/c after it fired
  function echoLevel() {
    let e = 0;
    for (const s of shots) {
      for (const x of s.echoes) {
        if (x.what === "water column") continue;
        e += envelope((tr - s.tf - (2 * x.r) / C) * slow) * Math.min(1, x.a / 0.45);
      }
    }
    return Math.min(1, e);
  }
  let echoKey = "";
  function step() {
    const pose = HM.poseOf(cfg, tr);
    // fire at the true PRF once time is slow enough to see single pulses; until then, a readable few per second
    const phys = cfg.scanner === "flash" ? facts.frames : cfg.prf;
    const per = 1 / phys;
    const iv = Math.max(per, 1 / (fanRate() * slow));
    nextShot = Math.max(Math.min(nextShot, tr + iv), tr - 0.6 / slow);
    if (iv === per) nextShot = Math.ceil(nextShot * phys - 1e-6) / phys;
    while (nextShot <= tr) {
      const p = HM.poseOf(cfg, nextShot);
      if (p.on) shoot(nextShot, p);
      // the few pulses shown at full speed are picked at random, so they don't strobe with the scan and land on one spot
      nextShot += iv === per ? iv : iv * (0.55 + 0.9 * Math.random());
    }
    if (genTo < tr) gen(genTo, tr), (genTo = tr);
    paintParts(pose);
    paintFan();
    paintMap(tr, pose);
    follow();
    paintScope(tv);
    const echo = echoLevel().toFixed(3);
    if (echo !== echoKey) for (const el of echoEls) el.style.setProperty("--hd-echo", (echoKey = echo));
  }
  function frame(now) {
    raf = 0;
    const dt = prev === null ? 0 : Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const moving = ease(dt);
    if (!paused) (tv += dt), (tr += dt / slow);
    step();
    if (onscreen && !still.matches && (!paused || moving)) raf = requestAnimationFrame(frame);
    else prev = null;
  }
  function kick() {
    if (still.matches) {
      // one still frame: a full pattern on the ground and the last shot just fired
      ease(0);
      shots = [];
      const tf = tr - 0.03 / slow;
      shoot(tf, HM.poseOf(cfg, tf));
      step();
      return;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver((entries) => {
    onscreen = entries.some((e) => e.isIntersecting);
    if (onscreen) kick();
  }).observe(fig);
  still.addEventListener("change", kick);
  addEventListener("resize", () => (paused || still.matches || !onscreen) && step());
  apply(false);
})();
