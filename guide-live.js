// The guide's flat drawings: each plays its animation once when it scrolls into view, redrawn every frame by the same
// functions that drew it at build time, then offers a Replay button. Under reduced motion they wait for the button.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const ICON = `<svg class="gd-replay-icon" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.4 4.3A4 4 0 1 1 2.6 8.1M2.1 1.6v2.9h2.9"/></svg>`;
  for (const fig of document.querySelectorAll("figure[data-anim]")) {
    const A = GFIG.ANIMS[fig.dataset.anim];
    const draw = GFIG.FIGS[fig.dataset.anim];
    const svg = fig.querySelector("svg.gq");
    if (!A || !draw || !svg) continue;
    const rest = svg.innerHTML;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gd-replay";
    btn.innerHTML = `${ICON}<span>${still.matches ? "Play" : "Replay"}</span>`;
    btn.hidden = !still.matches;
    fig.append(btn);
    let t = 0;
    let last = 0;
    let raf = 0;
    let playing = false;
    let played = false;
    let onscreen = false;
    const inner = (html) => html.slice(html.indexOf(">") + 1, html.lastIndexOf("</svg>"));
    const paint = () => {
      const s = A.at(t);
      svg.innerHTML = inner(draw(GFIG.lidarWith(MODEL.LIDAR, s.L), s.a));
      fig.dispatchEvent(new CustomEvent("gd-frame", { detail: s.L }));
    };
    const finish = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      playing = false;
      fig.classList.remove("gd-playing");
      btn.querySelector("span").textContent = "Replay";
      btn.hidden = false;
    };
    const frame = (now) => {
      raf = 0;
      t += Math.min(0.05, (now - last) / 1000);
      last = now;
      if (t >= A.dur) {
        finish();
        svg.innerHTML = rest;
        fig.dispatchEvent(new CustomEvent("gd-frame", { detail: {} }));
        return;
      }
      paint();
      if (onscreen) raf = requestAnimationFrame(frame);
    };
    const resume = () => {
      if (!playing || raf || !onscreen) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const play = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      t = 0;
      playing = played = true;
      btn.hidden = true;
      fig.classList.add("gd-playing");
      paint();
      resume();
    };
    btn.addEventListener("click", play);
    fig.addEventListener("gd-set", (e) => {
      played = true;
      if (playing) finish();
      btn.hidden = false;
      svg.innerHTML = inner(draw(GFIG.lidarWith(MODEL.LIDAR, e.detail)));
    });
    new IntersectionObserver(
      ([e]) => {
        onscreen = e.isIntersecting;
        if (onscreen && !played && !still.matches) play();
        else resume();
      },
      { threshold: 0.6 }
    ).observe(svg);
  }

  // the number strip under "Pulses and the PRF": PRF and pulse width are sliders, and the numbers made from them, the
  // prose, the Rmax equation and its drawing follow. While the drawing animates, its PRF moves the slider.
  for (const strip of document.querySelectorAll(".gd-tune")) {
    const fig = document.querySelector(`figure[data-anim="${strip.dataset.target}"]`);
    const L = MODEL.LIDAR;
    const C = 299792458;
    const inPrf = strip.querySelector('[data-in="prf"]');
    const inPw = strip.querySelector('[data-in="pw"]');
    const show = (prf, pw) => {
      // fixed decimals and tabular figures: a number's width never changes, so the sentence around it never reflows
      const v = { prf: (prf / 1e3).toFixed(0), pw: (pw * 1e9).toFixed(1), metres: (C * pw).toFixed(1), period: (1e6 / prf).toFixed(2), rmax: (C / (2 * prf)).toFixed(0) };
      for (const [key, s] of Object.entries(v)) for (const el of document.querySelectorAll(`[data-k="${key}"]`)) el.textContent = s;
      inPrf.setAttribute("aria-valuetext", `${v.prf} kilohertz`);
      inPw.setAttribute("aria-valuetext", `${v.pw} nanoseconds`);
    };
    const pw = () => +inPw.value * 1e-9;
    inPrf.addEventListener("input", () => {
      show(+inPrf.value * 1e3, pw());
      fig?.dispatchEvent(new CustomEvent("gd-set", { detail: { prf: +inPrf.value * 1e3 } }));
    });
    inPw.addEventListener("input", () => show(+inPrf.value * 1e3, pw()));
    fig?.addEventListener("gd-frame", (e) => {
      const prf = e.detail.prf ?? L.prf;
      inPrf.value = prf / 1e3;
      show(prf, pw());
    });
  }
})();

// The masthead's theme switch: Auto follows the system, Light and Dark override it. The choice is saved, and the page
// reloads into it (keeping its place) because the figures pick their inks once at start.
(() => {
  const group = document.querySelector(".gd-theme");
  const b = document.body;
  if (!group || !b.dataset.themePref) return;
  const K = "lidar-theme";
  const Y = "lidar-theme-y";
  const sys = matchMedia("(prefers-color-scheme: light)");
  const mark = (p) => {
    for (const btn of group.querySelectorAll("button")) btn.setAttribute("aria-pressed", String(btn.dataset.themePick === p));
  };
  mark(b.dataset.themePref);
  group.hidden = false;
  const y = sessionStorage.getItem(Y);
  if (y !== null) {
    sessionStorage.removeItem(Y);
    const go = () => scrollTo({ top: +y, behavior: "instant" });
    if (document.readyState === "complete") go();
    else addEventListener("load", go, { once: true });
  }
  group.addEventListener("click", (e) => {
    const p = e.target.closest("button[data-theme-pick]")?.dataset.themePick;
    if (!p || p === b.dataset.themePref) return;
    try {
      if (p === "auto") localStorage.removeItem(K);
      else localStorage.setItem(K, p);
    } catch {}
    b.dataset.themePref = p;
    mark(p);
    const url = new URL(location.href);
    const forced = url.searchParams.has("theme");
    url.searchParams.delete("theme");
    const want = p === "auto" ? (sys.matches ? "light" : "dark") : p;
    if (want === b.dataset.theme && !forced) return;
    sessionStorage.setItem(Y, String(scrollY));
    if (forced) location.replace(url);
    else location.reload();
  });
})();
