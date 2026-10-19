// Fig 2 head geometry shared by the build (Node) and the page: the scan elements that move, drawn in their own frames.
export const HEADX = {
  zb: 50,
  // galvo mirror: a plate on a shaft along +x, coated face toward -y and down at rest
  galvo: { from: -13, to: 13, half: 12.5, thick: 2.6 },
  // polygon: an N-sided prism on a shaft along +x; the facet facing (0,-1,-1) sits on the beam at the origin
  polygon: { rin: 12, from: -9.5, to: 9.5 },
  // Palmer: a round mirror whose normal nutates about the rest normal
  palmer: { r: 13, thick: 2.6 },
};
HEADX.polygon.axis = [0, HEADX.polygon.rin / Math.SQRT2, HEADX.zb + HEADX.polygon.rin / Math.SQRT2];

export function galvoPoly(theta) {
  const { half: h, thick: t } = HEADX.galvo;
  const phi = Math.PI / 4 + theta / 2;
  const n = [-Math.cos(phi), -Math.sin(phi)];
  const w = [-Math.sin(phi), Math.cos(phi)];
  return [
    [w[0] * h, w[1] * h],
    [-w[0] * h, -w[1] * h],
    [-w[0] * h - n[0] * t, -w[1] * h - n[1] * t],
    [w[0] * h - n[0] * t, w[1] * h - n[1] * t],
  ];
}

// The polygon's outline in (y, z) about its axis, turned so that facet 0's normal points at 225° + local.
export function polygonPoly(N, local) {
  const R = HEADX.polygon.rin / Math.cos(Math.PI / N);
  const out = [];
  const base = (225 * Math.PI) / 180 + local;
  for (let i = 0; i < N; i++) {
    const a = base + ((i + 0.5) * 2 * Math.PI) / N;
    out.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  return out;
}

export function circlePoly(r, n = 36) {
  return Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)]);
}

// A frame whose axis is the mirror normal n, with u and v spanning the mirror face.
export function frameOn(o, n) {
  const l = Math.hypot(n[0], n[1], n[2]);
  const a = [n[0] / l, n[1] / l, n[2] / l];
  const ref = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const c = [a[1] * ref[2] - a[2] * ref[1], a[2] * ref[0] - a[0] * ref[2], a[0] * ref[1] - a[1] * ref[0]];
  const cl = Math.hypot(c[0], c[1], c[2]);
  const u = [c[0] / cl, c[1] / cl, c[2] / cl];
  const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  return { o, a, u, v };
}
