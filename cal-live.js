// Fig 3 runtime: the screws set the true boresight and turn the bench; the strips are flown with it and processed
// with the estimate; Solve fits the estimate from the strips alone. Model: CALM; moving parts: CALP.
(() => {
  const D = __CAL__;
  const stage = document.querySelector(".cb-stage");
  if (!stage) return;
  const fig = stage.closest(".iso-figure") ?? stage.parentElement;
  const { CAL } = CALM;
  const P = D.P;
  const at = (p) => iso(p, P);
  const ctx = {
    at,
    pathOf,
    V: D.V,
    prism: (F, poly, s0, s1) => PARTS.prismPaths(F, poly, s0, s1, { at, pathOf, toneOf: G.toneOf, V: D.V, P }),
    turned: (F, profile, opts) => G.solidOf(profile, F, P, opts),
    solid: solidSvg,
    line: lineSvg,
    dots: dotsSvg,
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KEYS = ["roll", "pitch", "heading"];
  const DEFAULT = { roll: 0.18, pitch: -0.27, heading: 0.62 };
  const ZERO = { roll: 0, pitch: 0, heading: 0 };

  const state = { truth: { ...DEFAULT }, est: { ...ZERO }, pattern: "pair", shown: { ...DEFAULT }, solving: false };
  const $ = (sel) => fig.querySelector(sel);
  const readout = $("[data-readout]");
  const said = stage.querySelector(".cb-said");

  // ------------------------------------------------------------ the bench
  const hosts = new Map([...stage.querySelectorAll("[data-move]")].map((el) => [el.dataset.move, el]));
  const slides = [...stage.querySelectorAll("[data-slide]")];
  let drawn = null;
  let measHook = () => {};
  function drawBench(bore) {
    const pose = CALP.poseOf(bore, D.E);
    for (const part of CALP.partsOf(pose)) {
      const host = hosts.get(part.name);
      if (host) host.innerHTML = CALP.drawPart(part, ctx);
    }
    const sp = CALP.spindleOf(pose);
    hosts.get("spindle").innerHTML = solidSvg(G.solidOf(sp.profile, sp.F, P, {}), { tone: "hi" });
    hosts.get("coil").innerHTML = CALP.coilSvg(CALP.coilOf(pose), ctx);
    hosts.get("thimble-ticks").innerHTML = CALP.thimbleTicks(pose.turns.heading, ctx);
    const t = `translate(${(D.slide[0] * pose.dx).toFixed(2)} ${(D.slide[1] * pose.dx).toFixed(2)})`;
    for (const el of slides) el.setAttribute("transform", t);
    drawn = { ...bore };
    measHook();
  }

  // where processing thinks the pointer's ball is: a ring round the estimated tip, in the reticle
  const estHost = stage.querySelector("[data-est]");
  const TIP = [CALP.BENCH.rod.to + CALP.BENCH.rod.ball, CALP.BENCH.axis.y, CALP.BENCH.axis.z];
  let estDrawn = "";
  function drawEst() {
    const key = KEYS.map((k0) => state.est[k0].toFixed(4)).join();
    if (!estHost || key === estDrawn) return;
    estDrawn = key;
    const { t } = CALP.poseOf(state.est, D.E);
    const c = t.p(TIP);
    const [u, v] = [t.d([0, 1, 0]), t.d([0, 0, 1])];
    const ring = (r) => pathOf(Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2;
      return at(c.map((x, j) => x + r * (Math.cos(a) * u[j] + Math.sin(a) * v[j])));
    }), true);
    measHook();
    estHost.innerHTML = `<path class="cb-est-ring" d="${ring(CALP.BENCH.rod.ball + 1.3)}"/>` + dotsSvg([at(c)], { size: 0.6, tone: "lit" });
  }

  // ------------------------------------------------------------ the model
  const shotCache = new Map();
  const shotsFor = (line) => {
    if (!shotCache.has(line.id)) shotCache.set(line.id, CALM.shotsOf(line, 1009 + line.id.charCodeAt(0) * 7919));
    return shotCache.get(line.id);
  };
  const linesOf = () => CAL.lines[state.pattern];
  let ms = [];
  let clouds = [];
  let measuredFor = null;
  function remeasure() {
    ms = linesOf().map((line) => CALM.measure(shotsFor(line), state.truth));
    measuredFor = JSON.stringify([state.pattern, state.truth]);
    clouds = [];
  }
  function reprocess() {
    clouds = ms.map((m, i) => CALM.georef(m, state.est, clouds[i]));
  }
  let stripCm = NaN;
  let absCm = NaN;
  function score({ strips = true } = {}) {
    if (strips) stripCm = CALM.stripRms(ms, state.est) * 100;
    absCm = CALM.absoluteRms(ms, clouds) * 100;
  }

  // ------------------------------------------------------------ colours
  const css = getComputedStyle(fig);
  const hex = (name, fallback) => {
    const v = (css.getPropertyValue(name) || fallback).trim();
    const m = v.match(/^#([0-9a-f]{6})$/i);
    return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128];
  };
  const C = {
    A: css.getPropertyValue("--cb-a").trim() || "#5aa0ff",
    B: css.getPropertyValue("--cb-b").trim() || "#ff6b5a",
    C: css.getPropertyValue("--cb-c").trim() || "#4fbf8a",
    ink: css.getPropertyValue("--cb-ink").trim() || "rgba(255,255,255,0.7)",
    faint: css.getPropertyValue("--cb-faint").trim() || "rgba(255,255,255,0.18)",
    neg: hex("--cb-neg", "#3d7bd9"),
    pos: hex("--cb-pos", "#d9553d"),
    zero: hex("--cb-zero", "#2a2a2a"),
  };

  function sharp(canvas) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = +canvas.getAttribute("width");
    const h = +canvas.getAttribute("height");
    if (!canvas.dataset.w) {
      canvas.dataset.w = w;
      canvas.dataset.h = h;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, w: +canvas.dataset.w, h: +canvas.dataset.h };
  }

  // ------------------------------------------------------------ plan: where the strips disagree in height
  const map = fig.querySelector(".cb-map");
  const W = CAL.win;
  const CELL = 1.5;
  const NX = Math.round((W.x1 - W.x0) / CELL);
  const NY = Math.round((W.y1 - W.y0) / CELL);
  const cells = document.createElement("canvas");
  cells.width = NX;
  cells.height = NY;
  const cellG = cells.getContext("2d");
  const img = cellG.createImageData(NX, NY);
  function drawMap() {
    const { g, w, h } = sharp(map);
    const pad = { l: 26, r: 26, t: 22, b: 30 };
    const s = Math.min((w - pad.l - pad.r) / (W.x1 - W.x0), (h - pad.t - pad.b) / (W.y1 - W.y0));
    const ox = pad.l + ((w - pad.l - pad.r) - s * (W.x1 - W.x0)) / 2;
    const oy = pad.t;
    const X = (x) => ox + (x - W.x0) * s;
    const Y = (y) => oy + (W.y1 - y) * s;
    g.clearRect(0, 0, w, h);
    // mean height of each strip in each cell
    const n = ms.length;
    const sum = new Float64Array(NX * NY * n);
    const cnt = new Uint16Array(NX * NY * n);
    clouds.forEach((xyz, s0) => {
      for (let i = 0; i < xyz.length; i += 3) {
        const cx = Math.floor((xyz[i] - W.x0) / CELL);
        const cy = Math.floor((W.y1 - xyz[i + 1]) / CELL);
        if (cx < 0 || cy < 0 || cx >= NX || cy >= NY) continue;
        const k = (cy * NX + cx) * n + s0;
        sum[k] += xyz[i + 2];
        cnt[k]++;
      }
    });
    for (let c = 0; c < NX * NY; c++) {
      const mean = (s0) => (cnt[c * n + s0] ? sum[c * n + s0] / cnt[c * n + s0] : NaN);
      const dz = n === 3 ? mean(2) - (mean(0) + mean(1)) / 2 : mean(0) - mean(1);
      const o = c * 4;
      if (!Number.isFinite(dz)) {
        img.data[o + 3] = 0;
        continue;
      }
      const t = Math.max(-1, Math.min(1, dz / 0.2));
      const to = t < 0 ? C.neg : C.pos;
      const f = Math.pow(Math.abs(t), 0.8);
      for (let j = 0; j < 3; j++) img.data[o + j] = C.zero[j] + (to[j] - C.zero[j]) * f;
      img.data[o + 3] = 255;
    }
    cellG.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(cells, X(W.x0), Y(W.y1), s * (W.x1 - W.x0), s * (W.y1 - W.y0));
    g.lineWidth = 1;
    g.strokeStyle = C.faint;
    g.strokeRect(X(W.x0) + 0.5, Y(W.y1) + 0.5, s * (W.x1 - W.x0) - 1, s * (W.y1 - W.y0) - 1);
    // buildings, with their ridges
    g.strokeStyle = C.ink;
    for (const b of CAL.buildings) {
      g.strokeRect(X(b.x0), Y(b.y1), (b.x1 - b.x0) * s, (b.y1 - b.y0) * s);
      if (b.axis === "flat") continue;
      g.beginPath();
      if (b.axis === "y") g.moveTo(X((b.x0 + b.x1) / 2), Y(b.y0)), g.lineTo(X((b.x0 + b.x1) / 2), Y(b.y1));
      else g.moveTo(X(b.x0), Y((b.y0 + b.y1) / 2)), g.lineTo(X(b.x1), Y((b.y0 + b.y1) / 2));
      g.stroke();
    }
    // the two profile bands
    g.strokeStyle = C.ink;
    g.setLineDash([3, 3]);
    for (const [i, pr] of Object.values(CAL.profiles).entries()) {
      const [x0, x1, y0, y1] = pr.axis === "x" ? [pr.from, pr.to, pr.at - pr.half, pr.at + pr.half] : [pr.at - pr.half, pr.at + pr.half, pr.from, pr.to];
      g.strokeRect(X(x0), Y(y1), (x1 - x0) * s, (y1 - y0) * s);
      g.setLineDash([]);
      g.fillStyle = C.ink;
      g.font = "600 10px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(String(i + 1), pr.axis === "x" ? X(x0) - 7 : X((x0 + x1) / 2), pr.axis === "x" ? Y((y0 + y1) / 2) + 3.5 : Y(y0) + 12);
      g.setLineDash([3, 3]);
    }
    g.setLineDash([]);
    // flight lines: A along the south edge, B the north, C up the east side
    const arrow = (x0, y0, x1, y1, colour, label) => {
      g.strokeStyle = colour;
      g.fillStyle = colour;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x1 - 7 * Math.cos(a - 0.4), y1 - 7 * Math.sin(a - 0.4));
      g.lineTo(x1 - 7 * Math.cos(a + 0.4), y1 - 7 * Math.sin(a + 0.4));
      g.closePath();
      g.fill();
      g.font = "600 10px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "center";
      const lx = x0 + (x1 - x0) * 0.08 - (y1 - y0 ? 0 : 0);
      const ly = y0 + (y1 - y0) * 0.08;
      g.fillText(label, y1 === y0 ? lx : lx - 9, y1 === y0 ? ly - 4 : ly);
      g.lineWidth = 1;
    };
    for (const line of linesOf()) {
      if (line.axis === "x") {
        const y = line.at < 0 ? Y(W.y0) + 12 : Y(W.y1) - 9;
        const [a, b] = line.dir > 0 ? [X(W.x0) + 4, X(W.x1) - 4] : [X(W.x1) - 4, X(W.x0) + 4];
        arrow(a, y, b, y, C[line.id], line.id);
      } else {
        // drawn in a lane off the right edge, like A and B below and above
        const x = X(W.x1) + 10;
        const [a, b] = line.dir > 0 ? [Y(W.y0) - 4, Y(W.y1) + 4] : [Y(W.y1) + 4, Y(W.y0) - 4];
        arrow(x, a, x, b, C[line.id], "");
        g.fillStyle = C[line.id];
        g.textAlign = "center";
        g.fillText(line.id, x, Y(W.y0) + 12);
      }
    }
    // a 10 m scale bar
    const bx = X(W.x1) - 10 * s;
    const by = h - 7;
    g.strokeStyle = C.ink;
    g.fillStyle = C.ink;
    g.beginPath();
    g.moveTo(bx, by - 3);
    g.lineTo(bx, by);
    g.lineTo(bx + 10 * s, by);
    g.lineTo(bx + 10 * s, by - 3);
    g.stroke();
    g.font = "10px ui-sans-serif, system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText("10 m", bx - 5, by + 1);
  }

  // ------------------------------------------------------------ profiles: points from each strip through a roof
  const profCanvases = [...fig.querySelectorAll(".cb-prof")];
  const truthLine = new Map();
  for (const [key, pr] of Object.entries(CAL.profiles)) {
    const pts = [];
    for (let s = pr.from; s <= pr.to; s += 0.1) {
      const [x, y] = pr.axis === "x" ? [s, pr.at] : [pr.at, s];
      pts.push([s, 100 - CALM.cast([x, y, 100], [0, 0, -1]).t]);
    }
    truthLine.set(key, pts);
  }
  function drawProfiles() {
    for (const canvas of profCanvases) {
      const key = canvas.dataset.prof;
      const pr = CAL.profiles[key];
      const { g, w, h } = sharp(canvas);
      g.clearRect(0, 0, w, h);
      const pad = { l: 26, r: 10, t: 10, b: 16 };
      const sx = (w - pad.l - pad.r) / (pr.to - pr.from);
      const sz = (h - pad.t - pad.b) / (pr.z1 - pr.z0);
      const s = Math.min(sx, sz);
      const X = (v) => pad.l + (v - pr.from) * sx;
      const Z = (z) => h - pad.b - (z - pr.z0) * s;
      // true surface, faint
      g.strokeStyle = C.faint;
      g.lineWidth = 3;
      g.beginPath();
      truthLine.get(key).forEach(([v, z], i) => (i ? g.lineTo(X(v), Z(z)) : g.moveTo(X(v), Z(z))));
      g.stroke();
      g.lineWidth = 1;
      // scale: ticks every 2 m up the left edge
      g.strokeStyle = C.faint;
      g.fillStyle = C.ink;
      g.font = "9px ui-sans-serif, system-ui, sans-serif";
      g.textAlign = "right";
      for (let z = 0; z <= pr.z1; z += 4) {
        g.beginPath();
        g.moveTo(pad.l - 3, Z(z) + 0.5);
        g.lineTo(pad.l, Z(z) + 0.5);
        g.stroke();
        g.fillText(`${z}`, pad.l - 5, Z(z) + 3);
      }
      g.textAlign = "left";
      g.fillText(`${key === "along" ? 1 : 2}`, pad.l + 4, pad.t + 4);
      clouds.forEach((xyz, si) => {
        g.fillStyle = C[ms[si].shots.line.id];
        for (let i = 0; i < xyz.length; i += 3) {
          const [x, y, z] = [xyz[i], xyz[i + 1], xyz[i + 2]];
          const [v, off] = pr.axis === "x" ? [x, y - pr.at] : [y, x - pr.at];
          if (Math.abs(off) > pr.half || v < pr.from || v > pr.to) continue;
          g.fillRect(X(v) - 0.9, Z(z) - 0.9, 1.8, 1.8);
        }
      });
    }
  }

  // ------------------------------------------------------------ text
  const fmt = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}°`;
  const cm = (v) => (Number.isFinite(v) ? (v < 10 ? v.toFixed(1) : v.toFixed(0)) : "–");
  function writeText() {
    if (readout) readout.textContent = `strips differ ${cm(stripCm)} cm · points off ${cm(absCm)} cm`;
    for (const key of KEYS) {
      const row = fig.querySelector(`[data-row="${key}"]`);
      row.querySelector('[data-cell="true"]').textContent = fmt(state.truth[key]);
      row.querySelector('[data-cell="est"]').textContent = fmt(state.est[key]);
      const err = state.est[key] - state.truth[key];
      const cell = row.querySelector('[data-cell="err"]');
      cell.textContent = fmt(err);
      cell.classList.toggle("is-bad", Math.abs(err) > 0.02);
      const out = fig.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = `${state.truth[key] >= 0 ? "+" : "−"}${Math.abs(state.truth[key]).toFixed(2)}°`;
      const input = fig.querySelector(`.cb-range[data-key="${key}"]`);
      if (input && document.activeElement !== input) input.value = state.truth[key];
    }
    fig.querySelectorAll('.hd-seg[data-key="pattern"] [role=radio]').forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === state.pattern)));
    fig.querySelectorAll("[data-only]").forEach((el) => (el.hidden = el.dataset.only !== state.pattern));
    const note = fig.querySelector('[data-part="pattern-note"]');
    if (note)
      note.textContent =
        state.pattern === "pair"
          ? "Two opposite lines see every roof from the same two sides. Roll shows at once; pitch and heading can trade off, so the strips can agree while every point is off."
          : "A cross line looks at the same roofs from 90°. Now pitch and heading pull apart and all three angles are found.";
    const profNote = fig.querySelector('[data-part="prof-note"]');
    if (profNote) profNote.textContent = "true roof faint";
    const mapNote = fig.querySelector('[data-part="map-note"]');
    if (mapNote) mapNote.textContent = state.pattern === "pair" ? "A − B" : "C − mean(A, B)";
  }

  // ------------------------------------------------------------ update scheduling
  let dirtyMeasure = true;
  let lastMeasure = 0;
  let scoreTimer = 0;
  function refresh(now = performance.now()) {
    if (dirtyMeasure && now - lastMeasure > 120) {
      remeasure();
      lastMeasure = now;
      dirtyMeasure = false;
    }
    reprocess();
    score({ strips: false });
    drawMap();
    drawProfiles();
    drawEst();
    writeText();
    clearTimeout(scoreTimer);
    scoreTimer = setTimeout(() => {
      if (state.solving) return;
      if (dirtyMeasure) refresh();
      score();
      writeText();
    }, 160);
  }
  let pending = false;
  function request() {
    if (pending) return;
    pending = true;
    requestAnimationFrame((now) => {
      pending = false;
      refresh(now);
      if (dirtyMeasure) request();
    });
  }
  function setTruth(next) {
    Object.assign(state.truth, next);
    dirtyMeasure = true;
    request();
    wake();
  }

  // ------------------------------------------------------------ calibration
  function easeEst(target, ms0 = 1200, done) {
    const from = { ...state.est };
    const t0 = performance.now();
    state.solving = true;
    const step = (now) => {
      const f = reduced ? 1 : Math.min(1, (now - t0) / ms0);
      const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      for (const key of KEYS) state.est[key] = from[key] + (target[key] - from[key]) * e;
      refresh(now);
      if (f < 1) requestAnimationFrame(step);
      else {
        state.solving = false;
        score();
        writeText();
        done?.();
      }
    };
    requestAnimationFrame(step);
  }
  function solveNow(done) {
    if (state.solving) return;
    if (dirtyMeasure) remeasure(), (dirtyMeasure = false);
    stage.classList.add("is-solving");
    setTimeout(() => {
      const est = CALM.solve(ms, state.est);
      stage.classList.remove("is-solving");
      easeEst(est, 1200, () => {
        say(`Solved from the strips: they now agree to ${cm(stripCm)} cm, and the points sit ${cm(absCm)} cm from where the pulses landed.`);
        done?.();
      });
    }, 30);
  }
  function misalign() {
    const r = () => Math.random() * 2 - 1;
    const pick = (key, f) => Math.round(CAL.range[key] * f * r() * 100) / 100;
    setTruth({ roll: pick("roll", 0.8), pitch: pick("pitch", 0.8), heading: pick("heading", 0.8) });
    say("The scanner was knocked: the screws now hold a new boresight, and the old estimate is wrong.");
  }
  function say(text) {
    if (said) said.textContent = text;
  }

  // ------------------------------------------------------------ controls
  let touched = false;
  const touch = () => {
    touched = true;
    clearTimeout(tourTimer);
  };
  fig.querySelectorAll(".cb-range").forEach((input) => {
    input.addEventListener("input", () => {
      touch();
      setTruth({ [input.dataset.key]: +input.value });
    });
  });
  const seg = fig.querySelector('.hd-seg[data-key="pattern"]');
  const choose = (value) => {
    if (value === state.pattern) return;
    state.pattern = value;
    dirtyMeasure = true;
    request();
  };
  seg?.querySelectorAll("[role=radio]").forEach((b) => {
    b.addEventListener("click", () => {
      touch();
      choose(b.dataset.value);
    });
    b.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      const all = [...seg.querySelectorAll("[role=radio]")];
      const next = all[(all.indexOf(b) + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? all.length - 1 : 1)) % all.length];
      next.focus();
      touch();
      choose(next.dataset.value);
    });
  });
  fig.querySelectorAll(".cb-btn").forEach((b) =>
    b.addEventListener("click", () => {
      touch();
      if (b.dataset.act === "solve") solveNow();
      if (b.dataset.act === "misalign") misalign();
      if (b.dataset.act === "reset") {
        easeEst({ ...ZERO }, 600);
        say("The estimate is back to zero: the strips are processed as if the scanner were mounted true.");
      }
    }),
  );

  // ------------------------------------------------------------ bench motion: follow the screws
  let raf = 0;
  let visible = false;
  let last = 0;
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    let moving = false;
    for (const key of KEYS) {
      const d = state.truth[key] - state.shown[key];
      if (Math.abs(d) > 1e-4) moving = true;
      state.shown[key] += reduced ? d : d * (1 - Math.exp(-dt * 7));
    }
    if (!drawn || KEYS.some((key) => Math.abs(drawn[key] - state.shown[key]) > 1e-5)) drawBench(state.shown);
    if (moving && visible) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function wake() {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ idle tour: knock, solve with the pair, add the cross line, solve
  let tourTimer = 0;
  const wait = (ms0, fn) => {
    clearTimeout(tourTimer);
    tourTimer = setTimeout(() => !touched && visible && fn(), ms0);
  };
  function tour() {
    if (touched || reduced) return;
    wait(2600, () => {
      state.pattern = "pair";
      dirtyMeasure = true;
      request();
      solveNow(() =>
        wait(4200, () => {
          choose("full");
          say("A cross line is added: the same roofs, seen from 90°.");
          wait(2600, () =>
            solveNow(() =>
              wait(5200, () => {
                misalign();
                easeEst({ ...ZERO }, 900);
                choose("pair");
                tour();
              }),
            ),
          );
        }),
      );
    });
  }

  // ------------------------------------------------------------ hover cards on the bench's parts
  {
    const D2R = Math.PI / 180;
    const err = (k0) => state.truth[k0] - state.est[k0];
    const cm = (m) => `${Math.round(Math.abs(m) * 100)} cm`;
    const nadir = (k0) => cm(CAL.H * Math.tan(err(k0) * D2R));
    const edge = () => cm(CAL.H * Math.tan(CAL.halfRad) * err("heading") * D2R);
    const lever = Math.hypot(...CAL.leverGnss).toFixed(2);
    const left = (k0) => `${k0} ${fmt(state.truth[k0])} · left after processing ${k0 === "heading" ? `${edge()} at the swath edge` : `${nadir(k0)} at nadir`}`;
    const CARDS = [
      [/^(rod|tip|hub|bezel)$/, () => ({ sys: "Scanner", title: "Boresight pointer", does: "A rod on the scanner's window along the direction the laser really points at the centre of its sweep. The ball is the truth.", why: "Nothing on the aircraft can see this direction; calibration has to recover it from the points alone.", spec: `off the IMU by ${Math.hypot(state.truth.pitch, state.truth.heading).toFixed(2)}° · drawn ×${D.E}` })],
      [/^reticle/, () => ({ sys: "Reference", title: "IMU reticle", does: "Fixed in the IMU's frame: where the scanner would look if its axes lined up exactly with the IMU's.", why: "Georeferencing turns every shot by the IMU's attitude, so any angle between the two lands on the ground as error, growing with height.", spec: `ball off centre by ${Math.hypot(state.truth.pitch, state.truth.heading).toFixed(2)}° · ${cm(CAL.H * Math.tan(Math.hypot(state.truth.pitch, state.truth.heading) * D2R))} at ${CAL.H} m` })],
      [/^est$/, () => ({ sys: "Processing", title: "Estimated boresight", does: "Where processing thinks the scanner points: the angles in the table, applied to every shot before it goes on the map.", why: "On the ball, every point lands true. From one opposite pair the strips can agree while the ring is still off the ball.", spec: `left: roll ${nadir("roll")} · pitch ${nadir("pitch")} · heading ${edge()}` })],
      [/^roll\./, () => ({ sys: "Mount", title: "Roll adjuster", does: "A fine-thread screw under one corner of the tip-tilt plate; it tips the scanner about the flight direction.", why: "Roll tilts the whole swath: one edge rises, the other drops, mirrored on the opposite line, so it shows at once.", spec: left("roll") })],
      [/^pitch\./, () => ({ sys: "Mount", title: "Pitch adjuster", does: "A fine-thread screw under the front of the tip-tilt plate; it tips the scanner forward or back.", why: "Pitch shifts every point along track, forward on one line and back on the opposite one, so roofs and gable ends part.", spec: left("pitch") })],
      [/^(micro|spindle)/, () => ({ sys: "Mount", title: "Heading micrometer", does: "Pushes the turntable's arm; each turn of the thimble is 0.5 mm, read on the barrel and the thimble's 50 lines.", why: "Heading twists the swath: nothing moves at nadir, and the edges move along track in opposite directions.", spec: left("heading") })],
      [/^(arm|pad)$/, () => ({ sys: "Mount", title: "Turntable arm", does: "Carries a hardened pad that the micrometer's spindle pushes on.", why: "A long arm turns a small push into a fine angle.", spec: "pad on a 60 mm lever" })],
      [/^spring/, () => ({ sys: "Mount", title: "Return spring", does: "Pulls the arm back against the micrometer's spindle.", why: "With the arm always loaded, the micrometer has no backlash: the angle depends only on its reading.", spec: "preloaded" })],
      [/^(ring|platter)$/, () => ({ sys: "Mount", title: "Heading turntable", does: "A platter turning in a ring graduated in degrees; the index on the platter reads the angle.", why: "It turns the scanner about the vertical, the axis heading error lives on.", spec: `heading ${fmt(state.truth.heading)}` })],
      [/^(lower|upper|ball)$/, () => ({ sys: "Mount", title: "Tip-tilt plate", does: "The upper plate rests on a pivot ball and two adjuster screws: three points, so it cannot rock.", why: "Each screw tips it about one axis through the ball, so roll and pitch set independently.", spec: `roll ${fmt(state.truth.roll)} · pitch ${fmt(state.truth.pitch)}` })],
      [/^vial$/, () => ({ sys: "Scanner", title: "Level vial", does: "A bubble in curved glass across the scanner; it runs to the high side.", why: "A level measures roll against gravity, but boresight is the angle to the IMU, so a level alone cannot calibrate it.", spec: `roll ${fmt(state.truth.roll)}` })],
      [/^plug$/, () => ({ sys: "Scanner", title: "Scanner connector", does: "Power in; ranges, scan angles and shot times out; the GNSS time pulse in.", why: "Every shot is stamped in GPS time so it can be matched to the IMU's attitude at that instant.", spec: "power · data · PPS" })],
      [/^(scanner|scanner\.foot|fin\d)$/, () => ({ sys: "Scanner", title: "Lidar scanner", does: "Laser, scan mirror and receiver in one housing, bolted to the tip-tilt plate; fins on the cover shed the laser's heat.", why: "Its axes are set by how its optics were assembled, never exactly square to the IMU's. That small angle is the boresight.", spec: `${CAL.prf / 1000} kHz · ±${CAL.half}° · ${CAL.scanHz} lines/s` })],
      [/^imu/, () => ({ sys: "Navigation", title: "Inertial measurement unit", does: "Three gyros and three accelerometers; blended with GNSS, it gives the position and attitude of the axes engraved on its lid.", why: "Every point is placed in the IMU's frame, then turned by the boresight into the scanner's. It is the reference the screws are measured from.", spec: "the reference: 0, 0, 0" })],
      [/^(antenna|mast)/, () => ({ sys: "Navigation", title: "GNSS antenna", does: "Its phase centre is the point satellite positioning actually fixes.", why: "The lever arm from it to the IMU is measured with a tape or total station, not solved from the strips like the boresight.", spec: `lever arm ${lever} m · measured` })],
      [/^gnss/, () => ({ sys: "Navigation", title: "GNSS receiver", does: "Tracks the satellites and keeps GPS time; afterwards the trajectory is processed against base stations to a few centimetres.", why: "Position from GNSS, attitude from the IMU: together they place the scanner for every shot.", spec: "PPS + time to the scanner" })],
      [/^cable/, () => ({ sys: "Navigation", title: "IMU cable", does: "Carries the IMU's data to the receiver, and its time pulse back.", why: "Each attitude sample must match each shot to the microsecond.", spec: "200 Hz attitude · PPS" })],
      [/^ruler$/, () => ({ sys: "Navigation", title: "Lever-arm scale", does: "Marks the offset from the antenna to the IMU along the bench.", why: "A position offset is easy to measure; an angle of a few hundredths of a degree is not, which is why the boresight is flown.", spec: `|L| = ${lever} m` })],
      [/^label$/, () => ({ sys: "Bench", title: "Calibration plate", does: "Records the boresight found for this sensor.", why: "It holds until the scanner or IMU is removed or knocked; then the calibration lines are flown again.", spec: KEYS.map((k0) => `${k0[0]} ${fmt(state.est[k0])}`).join(" · ") })],
      [/^(base|foot)/, () => ({ sys: "Bench", title: "Common mount", does: "One stiff plate the IMU, GNSS and scanner all bolt to.", why: "The boresight is a constant only while the IMU and scanner share a rigid mount; in the aircraft they sit in one sensor head.", spec: `angles drawn ×${D.E}` })],
    ];
    // the measurements each part stands for, drawn over the bench while it is hovered
    const B = CALP.BENCH;
    const ns = "http://www.w3.org/2000/svg";
    const svg = stage.querySelector(".cb-svg");
    const meas = document.createElementNS(ns, "g");
    meas.setAttribute("class", "cb-meas");
    svg.appendChild(meas);
    const ANT = [-87, -52, 70];
    const IMU = [-70, 40, 52];
    const comp = (v) => v.map((c, i) => `${"xyz"[i]} ${c < 0 ? "−" : "+"}${Math.abs(c).toFixed(2)}`).join("  ") + " m";
    const angles = (b) => KEYS.map((k0) => `${k0[0]} ${fmt(b[k0]).replace(/(\.\d\d)\d/, "$1")}`).join("  ");
    const seg = (a, b, cls = "") => `<path class="cb-meas-line ${cls}" d="${pathOf([at(a), at(b)])}"/>`;
    const ends = (pts) => dotsSvg(pts.map(at), { size: 0.75, tone: "lit" });
    const tags = [];
    const tag = (p, text, dx = 6, dy = -6) => tags.push({ p: at(p), text, dx, dy });
    const MEAS = {
      lever() {
        const S = CALP.poseOf(state.shown, D.E).t.p([B.rod.from, B.axis.y, B.axis.z]);
        tag(ANT, "GNSS antenna phase centre", 8, -8);
        tag(IMU.map((c, i) => (c + ANT[i]) / 2), `lever arm  ${comp(CAL.leverGnss)}`, -12, 14);
        tag(IMU.map((c, i) => (c + S[i]) / 2), `IMU → scanner  ${comp(CAL.leverScan)}`, 0, 14);
        return seg(ANT, IMU) + seg(IMU, S) + ends([ANT, IMU, S]);
      },
      bore() {
        const t = CALP.poseOf(state.shown, D.E).t;
        const from = t.p([B.rod.from, B.axis.y, B.axis.z]);
        const ref = [B.reticle.x + B.reticle.w / 2, B.axis.y, B.axis.z];
        tag(ref, "IMU axis", 10, 16);
        tag(t.p([B.rod.to + B.rod.ball, B.axis.y, B.axis.z]), `true boresight  ${angles(state.truth)}`, 12, -18);
        return seg(from, ref, "ref") + ends([from, ref]);
      },
      est() {
        const t = CALP.poseOf(state.est, D.E).t;
        const from = t.p([B.rod.from, B.axis.y, B.axis.z]);
        const tip = t.p([B.rod.to + B.rod.ball, B.axis.y, B.axis.z]);
        tag(tip, `estimate  ${angles(state.est)}`, 12, -18);
        const left = {};
        for (const k0 of KEYS) left[k0] = state.truth[k0] - state.est[k0];
        tag(tip, `left  ${angles(left)}`, 12, 22);
        return seg(from, tip, "ref") + ends([from, tip]);
      },
      heading() {
        const { h } = CALP.poseOf(state.shown, D.E);
        const c = [B.c[0], B.c[1], B.pad.z];
        const pad = h.p([B.pad.s0, B.pad.y, B.pad.z]);
        const r = Math.hypot(B.pad.s0 - B.c[0], B.pad.y - B.c[1]);
        const s0 = r * Math.tan(state.truth.heading * Math.PI / 180);
        tag(c.map((v, i) => (v + pad[i]) / 2), `r ${r.toFixed(0)} mm`, -46, 4);
        tag(pad, `s ${s0 < 0 ? "−" : ""}${Math.abs(s0).toFixed(2)} mm · ${(Math.abs(s0) / B.micro.pitch).toFixed(2)} turns → heading = atan(s / r) ${fmt(state.truth.heading)}`, -40, 30);
        return seg(c, pad) + ends([c, pad]);
      },
      tilt() {
        const { t } = CALP.poseOf(state.shown, D.E);
        const c = B.c;
        const out = [];
        let svg = "";
        for (const k0 of ["roll", "pitch"]) {
          const [x, y] = B.screws[k0];
          const p = t.p([x, y, B.upper[1]]);
          const b = Math.hypot(x - c[0], y - c[1]);
          const dz = b * Math.tan(state.truth[k0] * Math.PI / 180);
          svg += seg(c, p);
          out.push(c, p);
          tag(p, `${k0}: b ${b.toFixed(0)} mm · Δz ${dz < 0 ? "−" : "+"}${Math.abs(dz).toFixed(3)} mm → ${fmt(state.truth[k0])}`, k0 === "roll" ? -60 : 10, k0 === "roll" ? -14 : 18);
        }
        return svg + ends(out);
      },
    };
    const MEAS_OF = [[/^(antenna|mast|gnss|ruler|imu|cable|plug)/, "lever"], [/^(rod|tip|hub|bezel|reticle)/, "bore"], [/^est$/, "est"], [/^(micro|spindle|arm|pad|ring|platter|spring)/, "heading"], [/^(roll|pitch)\.|^(lower|upper|ball)$/, "tilt"]];
    let measKind = null;
    const VB = svg.viewBox.baseVal;
    function drawMeas() {
      tags.length = 0;
      if (!measKind) return void (meas.innerHTML = "");
      meas.innerHTML = MEAS[measKind]();
      for (const { p, text, dx, dy } of tags) {
        const g = document.createElementNS(ns, "g");
        g.setAttribute("class", "cb-tag");
        const rect = document.createElementNS(ns, "rect");
        const tx = document.createElementNS(ns, "text");
        tx.textContent = text;
        g.append(rect, tx);
        meas.appendChild(g);
        const w = tx.getComputedTextLength() + 8;
        const x = Math.max(VB.x + 2, Math.min(VB.x + VB.width - w - 2, p[0] + dx));
        const y = Math.max(VB.y + 2, Math.min(VB.y + VB.height - 13, p[1] + dy));
        Object.entries({ x, y, width: w, height: 11, rx: 2 }).forEach(([k0, v]) => rect.setAttribute(k0, v));
        tx.setAttribute("x", x + 4);
        tx.setAttribute("y", y + 7.9);
      }
    }
    measHook = drawMeas;
    const cardOf = (name) => CARDS.findIndex(([re]) => re.test(name));
    const pick = ".cb-svg .it[data-name], .cb-svg [data-est]";
    const nameOf = (el) => (el.hasAttribute("data-est") ? "est" : el.dataset.name);
    const parts = [...stage.querySelectorAll(pick)].map((el) => [el, cardOf(nameOf(el))]);
    const layout = stage.closest(".hd-layout") ?? stage.parentElement;
    const card = document.createElement("div");
    card.className = "hd-card";
    card.setAttribute("aria-hidden", "true");
    layout.appendChild(card);
    let hot = -1;
    let html = "";
    let avoid = null;
    function hover(event) {
      const el = event.target.closest && event.target.closest(pick);
      const i = el ? cardOf(nameOf(el)) : -1;
      if (i !== hot) {
        hot = i;
        for (const [p, j] of parts) p.classList.toggle("hd-hot", j === i && i >= 0);
        const m = el && i >= 0 ? MEAS_OF.find(([re]) => re.test(nameOf(el))) : null;
        measKind = m ? m[1] : null;
        drawMeas();
        avoid = null;
        if (el && i >= 0) {
          const rs = [el.getBoundingClientRect()];
          if (meas.firstChild) rs.push(meas.getBoundingClientRect());
          avoid = { l: Math.min(...rs.map((r) => r.left)), r: Math.max(...rs.map((r) => r.right)) };
        }
        if (i < 0) card.classList.remove("on"), (html = "");
      }
      if (i < 0) return;
      const c = CARDS[i][1]();
      const next = `<div class="hd-card-sys">${c.sys}</div><div class="hd-card-title">${c.title}</div><p>${c.does}</p><p class="hd-card-why">${c.why}</p><div class="hd-card-spec">${c.spec}</div>`;
      if (next !== html) card.innerHTML = html = next;
      card.classList.add("on");
      const box = layout.getBoundingClientRect();
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      // beside the part and its measurements, never over them
      const l = (avoid ? avoid.l : event.clientX - 16) - box.left;
      const r = (avoid ? avoid.r : event.clientX + 16) - box.left;
      let x = r + 14;
      if (x + w > box.width) x = l - w - 14 >= 0 ? l - w - 14 : box.width - w;
      let y = event.clientY - box.top - h / 2;
      y = Math.min(Math.max(0, y), box.height - h);
      card.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px)`;
    }
    stage.addEventListener("pointermove", hover);
    stage.addEventListener("pointerdown", hover);
    stage.addEventListener("pointerleave", () => hover({ target: stage, clientX: 0, clientY: 0 }));
  }

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    if (visible) {
      wake();
      if (!touched) tour();
    } else clearTimeout(tourTimer);
  }, { threshold: 0.15 }).observe(stage);

  for (const key of KEYS) {
    const input = fig.querySelector(`.cb-range[data-key="${key}"]`);
    if (input) input.value = state.truth[key];
  }
  drawBench(state.shown);
  refresh(performance.now());
  score();
  writeText();
  window.__cal = { state, solveNow, misalign, setTruth, choose, refresh, score, timing: () => {
    const t0 = performance.now();
    remeasure();
    const t1 = performance.now();
    reprocess();
    const t2 = performance.now();
    score();
    const t3 = performance.now();
    drawMap();
    drawProfiles();
    const t4 = performance.now();
    return { measure: t1 - t0, georef: t2 - t1, score: t3 - t2, draw: t4 - t3, shots: ms.map((m) => m.shots.t.length) };
  } };
})();
