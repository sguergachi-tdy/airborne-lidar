// Shared by the build (Node) and the page: a straight prism along any axis drawn with the kit's shading rules.
export function prismPaths(F, poly, s0, s1, ctx) {
  const { at, pathOf, toneOf, V, P } = ctx;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const signed = (pts) => pts.reduce((a, [x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    return a + x * y2 - x2 * y;
  }, 0);
  const screenOriented = (pts) => (signed(pts) < 0 ? [...pts].reverse() : pts);
  const runsOf = (flags, want) => {
    const count = flags.length;
    const runs = [];
    const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
    if (start < 0) return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
    let run = null;
    for (let step = 0; step < count; step++) {
      const index = (start + step) % count;
      if (flags[index] === want) {
        if (!run) run = [index];
        run.push((index + 1) % count);
      } else if (run) {
        runs.push(run);
        run = null;
      }
    }
    if (run) runs.push(run);
    return runs;
  };
  const ring = signed(poly) > 0 ? poly : [...poly].reverse();
  const n = ring.length;
  const W3 = (s, [x, y]) => [0, 1, 2].map((i) => F.o[i] + F.a[i] * s + F.u[i] * x + F.v[i] * y);
  const capNear = dot(F.a, V) > 0;
  const [nearS, farS] = capNear ? [s1, s0] : [s0, s1];
  const near = ring.map((p) => at(W3(nearS, p)));
  const far = ring.map((p) => at(W3(farS, p)));
  const normals = ring.map(([x0, y0], i) => {
    const [x1, y1] = ring[(i + 1) % n];
    const m = [0, 1, 2].map((k) => F.u[k] * (y1 - y0) - F.v[k] * (x1 - x0));
    const l = Math.hypot(m[0], m[1], m[2]) || 1;
    return m.map((c) => c / l);
  });
  const facing = normals.map((m) => dot(m, V) > 1e-9);
  const outline = [];
  const crease = [];
  for (const run of runsOf(facing, false)) outline.push(pathOf(run.map((i) => near[i])));
  for (const run of runsOf(facing, true)) {
    crease.push(pathOf(run.map((i) => near[i])));
    outline.push(pathOf(run.map((i) => far[i])));
  }
  for (let i = 0; i < n; i++) if (facing[(i + n - 1) % n] !== facing[i]) outline.push(pathOf([near[i], far[i]]));
  const parts = [pathOf(screenOriented(near), true), pathOf(screenOriented(far), true)];
  const buckets = [[], [], [], [], []];
  for (let i = 0; i < n; i++) {
    if (!facing[i]) continue;
    const quad = screenOriented([near[i], near[(i + 1) % n], far[(i + 1) % n], far[i]]);
    parts.push(pathOf(quad, true));
    buckets[toneOf(normals[i], P)].push(pathOf(quad, true));
  }
  const capTone = toneOf(capNear ? F.a : F.a.map((c) => -c), P);
  buckets[capTone].push(pathOf(screenOriented(near), true));
  return { fill: parts.join(""), outline: outline.join(""), crease: crease.join(""), top: buckets[4].join(""), shades: buckets.slice(0, 4).map((b) => b.join("")) };
}

// The scan mirror: a plate on the galvo shaft (axis +x). Its coated face looks toward -y and down; phi = 45° + theta / 2.
export const MIRROR = { from: -5.6, to: 6.0, half: 4.6, thick: 1.1 };
export function mirrorPoly(theta) {
  const phi = Math.PI / 4 + theta / 2;
  const n = [-Math.cos(phi), -Math.sin(phi)];
  const w = [-Math.sin(phi), Math.cos(phi)];
  const h = MIRROR.half;
  const t = MIRROR.thick;
  return [
    [w[0] * h, w[1] * h],
    [-w[0] * h, -w[1] * h],
    [-w[0] * h - n[0] * t, -w[1] * h - n[1] * t],
    [w[0] * h - n[0] * t, w[1] * h - n[1] * t],
  ];
}
