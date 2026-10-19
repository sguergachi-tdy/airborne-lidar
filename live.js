const D = __DATA__;
const { LIDAR: L, SCENE: SC } = MODEL;
const P = D.P;
const at = (p) => iso(p, P);
const stage = document.querySelector(".ln-stage");
const craft = stage.querySelector('[data-part="craft"]');
const craftBack = stage.querySelector('[data-part="craft-back"]');
// the aircraft slides as two composited layers, its back half (lifted out of the back drawing, where it was painted
// last) and the cutaway: the GPU moves them and only the parts that change are repainted. Moving an SVG group instead
// repaints everything it covers, old place and new, every frame
const craftFront = craft.ownerSVGElement;
const craftBackSvg = craftFront.cloneNode(false);
craftBackSvg.setAttribute("class", "iso-svg ln-layer ln-craft-back");
craftBackSvg.setAttribute("aria-hidden", "true");
craftBackSvg.appendChild(craftBack);
stage.querySelector(".ln-back").after(craftBackSvg);
const sliding = [craftBackSvg, craftFront];
for (const s of sliding) (s.style.willChange = "transform"), (s.style.overflow = "visible");
let pxPer = 0;
let lastMove = "";
new ResizeObserver(([e]) => ((pxPer = e.contentRect.width / D.W), (lastMove = ""), paint())).observe(stage.querySelector(".ln-back"));
const mirrorHost = stage.querySelector('[data-part="mirror"]');
const beamGroup = stage.querySelector('[data-part="beam"]');
const beamPath = beamGroup.querySelector("path");
const beamSpot = beamGroup.querySelector(".ln-spot circle");
const trace = stage.querySelector('[data-part="trace"]');
const tofText = stage.querySelector('[data-part="tof"]');
const rangeText = stage.querySelector('[data-part="range"]');
const readout = document.querySelector("[data-readout]");
const said = stage.querySelector(".ln-said");
const canvas = stage.querySelector(".ln-gl");
// the kit's WebGL layer reads its canvas box on every draw, which forces a layout after the frame's DOM writes: serve
// it the size last measured, measured again only after a resize
const cacheBox = (el) => {
  let box = null;
  new ResizeObserver(() => (box = null)).observe(el);
  el.getBoundingClientRect = () => box || (box = Element.prototype.getBoundingClientRect.call(el));
};
cacheBox(canvas);
const speed = stage.querySelector(".ln-speed");
const speedValue = speed.querySelector(".ln-speed-v");
const speedNote = speed.querySelector(".ln-speed-note");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const pale = document.body.dataset.theme === "light";
const FROM = L.vis.from;
const TO = L.vis.to;
const SPEED = L.vis.speed;
const ALT = L.alt;
const MF = G.frameOf([0, 0, 220], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const ctx = { at, pathOf, toneOf: G.toneOf, V: D.V, P };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- shader, built from the same scene the model casts against
const fl = (v) => {
  const s = String(Math.round(v * 1e5) / 1e5);
  return /[.e]/.test(s) ? s : `${s}.`;
};
const v4 = (a) => `vec4(${a.map(fl).join(",")})`;
const polytope = (planes, kind) =>
  `{float nr=-1e9;float fr=1e9;vec3 nn=vec3(0.);${planes.map((p) => `pl(o,d,${v4(p)},nr,fr,nn);`).join("")}if(nr<=fr&&nr>0.&&nr<best){best=nr;n=nn;kind=${kind};}}`;
const BUILDINGS = SC.buildings
  .map((b) => {
    const { box, roof } = MODEL.planesOf(b);
    return polytope(box, "3.") + polytope(roof, "(abs(nn.z)>.3?2.:3.)");
  })
  .join("");
const TREES = SC.trees.map((t) => `sp(o,d,vec3(${fl(t.x)},${fl(t.y)},${fl(t.cz)}),${fl(t.r)},best,n,kind);`).join("");
const TRUNKS = SC.trees.map((t) => `cy(o,d,vec2(${fl(t.x)},${fl(t.y)}),${fl(t.trunk)},${fl(t.cz - t.r * 0.6)},best,n,kind);`).join("");
const T = SC.tile;
const FRAG = `
uniform float uX;uniform float uTheta;uniform float uScan;uniform float uCloud;uniform float uBlur;uniform float uLight;
uniform vec4 uPk;uniform vec4 uPa;uniform vec2 uSp;
uniform vec3 uH1;uniform vec3 uH2;uniform float uHas2;
const float ALT=${fl(ALT)};const float FROM=${fl(FROM)};const float SPEED=${fl(SPEED)};const float PULSE=${fl(L.vis.pulse)};
const float SWEEP=${fl(L.vis.sweep)};const float HALF=${fl(L.halfRad)};const float DX=${fl(SPEED * L.vis.pulse)};
void pl(vec3 o,vec3 d,vec4 q,inout float nr,inout float fr,inout vec3 nn){
  float den=dot(q.xyz,d);float dist=q.w-dot(q.xyz,o);
  if(abs(den)<1e-6){if(dist<0.)fr=-1e9;return;}
  float t=dist/den;
  if(den<0.){if(t>nr){nr=t;nn=q.xyz;}}else fr=min(fr,t);
}
void sp(vec3 o,vec3 d,vec3 c,float r,inout float best,inout vec3 n,inout float kind){
  vec3 oc=o-c;float b=dot(oc,d);float h=b*b-dot(oc,oc)+r*r;
  if(h<0.)return;float t=-b-sqrt(h);
  if(t>0.&&t<best){best=t;n=(o+d*t-c)/r;kind=4.;}
}
void cy(vec3 o,vec3 d,vec2 c,float r,float top,inout float best,inout vec3 n,inout float kind){
  vec2 oc=o.xy-c;float a=dot(d.xy,d.xy);if(a<1e-8)return;
  float b=dot(oc,d.xy);float h=b*b-a*(dot(oc,oc)-r*r);if(h<0.)return;
  float t=(-b-sqrt(h))/a;float z=o.z+d.z*t;
  if(t>0.&&t<best&&z>0.&&z<top){best=t;n=vec3((o.xy+d.xy*t-c)/r,0.);kind=5.;}
}
float inTile(vec2 p){
  vec2 q=abs(p-vec2(${fl(T.x + T.w / 2)},${fl(T.y + T.d / 2)}))-vec2(${fl(T.w / 2 - T.r)},${fl(T.d / 2 - T.r)});
  return length(max(q,0.))+min(max(q.x,q.y),0.)-${fl(T.r)};
}
float scene(vec3 o,vec3 d,bool through,bool view,out vec3 n,out float kind){
  float best=1e9;n=vec3(0.,0.,1.);kind=-1.;
  ${BUILDINGS}
  if(!through){${TREES}}
  if(view){${TRUNKS}}
  if(d.z<0.){float t=-o.z/d.z;vec3 q=o+d*t;if(t<best&&inTile(q.xy)<=0.){best=t;n=vec3(0.,0.,1.);kind=(q.y>${fl(SC.road.y0)}&&q.y<${fl(SC.road.y1)})?1.:0.;}}
  return best;
}
// a pulse packet along its path: t is the distance behind its leading centre; a short body and a faint motion trail
float packet(float t){return exp(-t*t/(2.*1.1*1.1))+.32*exp(-max(t,0.)/14.)*smoothstep(0.,2.5,t);}
float tri(float u){float f=mod(u,2.);return f<1.?-1.+2.*f:3.-2.*f;}
// every return is drawn in the laser's red; second returns a little dimmer
vec3 hitInk(){
  return uLight>.5?vec3(.84,.13,.16):vec3(1.,.28,.24);
}
float ampOf(float kind,bool first,bool canopyHit){
  float a=kind<.5?.62:kind<1.5?.3:kind<2.5?.5:kind<3.5?.42:.48;
  if(kind>3.5)a*=.8;
  if(!first)a*=.55;
  return a;
}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 tv=towardViewer();
  vec3 o=rayOf(vb)+tv*3000.;
  vec3 d=-tv;
  vec3 n;float kind;
  float t=scene(o,d,false,true,n,kind);
  bool hit=t<1e8;
  vec3 p=o+d*t;
  float px=1./uK;
  float aD=0.;vec3 cD=vec3(0.);
  if(hit&&uCloud>.001&&kind<4.5&&p.x<uScan+1.5){
    float thp=atan(p.y,ALT-p.z);
    float k0=floor((p.x-FROM)/DX+.5);
    float b1=-1.;float e1=1e9;float b2=-1.;float e2=1e9;
    for(int j=-4;j<=4;j++){
      float ii=k0+float(j);
      if(ii<0.)continue;
      float th=HALF*tri(ii*PULSE/SWEEP);
      float e=abs(th-thp)+abs(float(j))*.0005;
      if(e<e1){b2=b1;e2=e1;b1=ii;e1=e;}else if(e<e2){b2=ii;e2=e;}
    }
    for(int c=0;c<2;c++){
      float ii=c==0?b1:b2;
      if(ii<0.)continue;
      float xi=FROM+DX*ii;
      float lag=uScan-xi;
      if(lag<0.)continue;
      float th=HALF*tri(ii*PULSE/SWEEP);
      vec3 po=vec3(xi,0.,ALT);vec3 pd=vec3(0.,sin(th),-cos(th));
      vec3 hn;float hk;
      float ht=scene(po,pd,false,false,hn,hk);
      if(ht>1e8)continue;
      float fade=smoothstep(0.,.6,lag);
      float glow=1.+1.4*exp(-lag/SPEED/.35);
      for(int r=0;r<2;r++){
        vec3 h=po+pd*ht;
        float ds=length(project(h)-vb);
        float vis=1.-smoothstep(1.4,2.8,length(h-p));
        float a=(1.-smoothstep(.55,1.25,ds))*vis*fade;
        float amp=ampOf(hk,r==0,false);
        float w=a*(.45+.9*amp)*glow;
        if(w>aD){aD=w;cD=hitInk()*(r==0?1.:.8);}
        if(r==1||hk<3.5)break;
        float k2;vec3 n2;
        ht=scene(po,pd,true,false,n2,k2);
        if(ht>1e8)break;
        hk=k2;
      }
    }
    aD*=uCloud;
  }
  // the beam from under the floor to its last hit: a steady line at flight speed (a blur of pulses), and in bullet time
  // single pulse packets going down and echoes coming back, plus the spot each one lights
  vec3 A=vec3(uX,22.*tan(uTheta),198.);
  vec3 E=uHas2>.5?uH2:uH1;
  vec2 a2=project(A);vec2 e2=project(E);vec2 ae=e2-a2;
  float s=clamp(dot(vb-a2,ae)/max(dot(ae,ae),1e-6),0.,1.);
  float Lw=length(E-A);float L1=length(uH1-A);
  float w=s*Lw;
  vec3 q=mix(A,E,s);
  float ds=length(vb-(a2+ae*s));
  float front=hit?smoothstep(-1.2,.4,dot(q-p,tv)):1.;
  float core=exp(-ds*ds/(2.*.3*.3));
  float halo=exp(-ds*ds/(2.*2.4*2.4));
  float beam=(core*.9+halo*.22)*(1.-smoothstep(L1-.4,L1+.4,w))*uBlur;
  float pass=uHas2>.5?mix(1.,uPk.w,smoothstep(L1-1.,L1+1.,w)):1.;
  float pk=uPa.x*packet(uPk.x-w)*pass+uPa.y*packet(w-uPk.y)+uPa.z*packet(w-uPk.z);
  float pkt=(core*1.6+exp(-ds*ds/(2.*1.5*1.5))*.75+halo*.3)*pk;
  float spot=0.;
  if(hit){float dd=length(p-uH1);spot=(exp(-dd*dd/(2.*1.1*1.1))+.35*exp(-dd*dd/(2.*3.6*3.6)))*uSp.x;}
  float under=0.;
  if(hit&&uHas2>.5){float dd=length(p-uH2);under=.45*exp(-dd*dd/(2.*1.*1.))*uSp.y;}
  float aB=clamp((beam+pkt)*front+spot*.85+under,0.,1.);
  float dither=(hash12(gl_FragCoord.xy)-.5)/255.;
  if(uLight>.5){
    vec3 red=vec3(.84,.13,.16);
    float aC=clamp(aD*.95,0.,1.);
    vec3 c=red*aB+cD*aC*(1.-aB);
    float al=aB+aC*(1.-aB);
    gl_FragColor=vec4(c+dither*al,al);
  }else{
    vec3 red=vec3(1.,.28,.24);
    vec3 e=red*aB*1.4+vec3(1.,.8,.7)*core*front*(uBlur*.5+pk*.9)+cD*aD*1.2;
    e=tonemap(e,1.3)+dither;
    gl_FragColor=vec4(e,max(e.r,max(e.g,e.b)));
  }
}`;
const NAMES = ["uX", "uTheta", "uScan", "uCloud", "uBlur", "uLight", "uH1", "uH2", "uHas2", "uPk", "uPa", "uSp"];
const layer = typeof glLayer === "function" ? glLayer({ canvas, fragment: FRAG, view: [D.W, D.H], camera: D.camera, uniforms: NAMES }) : null;
if (layer) stage.setAttribute("data-gl", "");

// ---------------------------------------------------------------- the scope: row a is a whole pulse period, row b zooms on the echo gate
const SA = D.scope.a;
const SB = D.scope.b;
const PERIOD = L.period * 1e6;
const CU = L.unitsPerMicro;
const cursor = stage.querySelector('[data-part="cursor"]');
const uOfA = (t) => SA.u0 + ((t - SA.t0) / (SA.t1 - SA.t0)) * (SA.u1 - SA.u0);
const uOfB = (t) => SB.u0 + ((t - SB.t0) / (SB.t1 - SB.t0)) * (SB.u1 - SB.u0);
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));
let seedNoise = 1;
const noise = () => {
  seedNoise = (seedNoise * 16807) % 2147483647;
  return seedNoise / 2147483647 - 0.5;
};
// upTo: microseconds after the first T0 that the sweep has drawn (Infinity draws it all). Samples are [t µs, height, noise].
function samplesOf(returns, index, level, upTo = Infinity, fine = 1) {
  const echoes = returns.map((r) => ({ t: r.tof * 1e6, amp: r.amp }));
  seedNoise = 1 + ((index * 7919 * fine) % 2147483000);
  const a = [];
  const da = ((0.1 / fine) * (SA.t1 - SA.t0)) / (SA.u1 - SA.u0);
  for (let i = 0; SA.t0 + i * da <= SA.t1 + 1e-9; i++) {
    const t = SA.t0 + i * da;
    let v = 0;
    for (const k of [0, PERIOD]) {
      v += SA.spike * level * gauss(uOfA(t) - uOfA(k), SA.sigma);
      for (const e of echoes) v += e.amp * SA.height * level * gauss(uOfA(t) - uOfA(k + e.t), SA.sigma);
    }
    const n = noise();
    if (t > upTo) break;
    a.push([t, v, n]);
  }
  seedNoise = 7 + ((index * 104729 * fine) % 2147483000);
  const local = upTo >= PERIOD ? upTo - PERIOD : upTo;
  const b = [];
  const db = ((0.12 / fine) * (SB.t1 - SB.t0)) / (SB.u1 - SB.u0);
  for (let i = 0; SB.t0 + i * db <= SB.t1 + 1e-9; i++) {
    const t = SB.t0 + i * db;
    let v = 0;
    for (const e of echoes) v += e.amp * SB.height * level * gauss(uOfB(t) - uOfB(e.t), SB.sigma);
    const n = noise();
    if (t > local) break;
    b.push([t, v, n]);
  }
  return { a, b };
}
const pathFrom = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("");
function scopeOf(returns, index, level, upTo = Infinity) {
  const s = samplesOf(returns, index, level, upTo);
  const a = s.a.map(([t, v, n]) => [uOfA(t), SA.y - v + n * 0.18]);
  const b = s.b.map(([t, v, n]) => [uOfB(t), SB.y - v + n * 0.25]);
  return { d: pathFrom(a) + pathFrom(b), head: a.length ? a[a.length - 1] : [SA.u0, SA.y] };
}

// ---------------------------------------------------------------- the enlarged flat scope under the drawing
const BG = D.big;
const big = document.querySelector(".ln-big");
const bigTrace = big.querySelector('[data-part="big-trace"]');
const bigCursor = big.querySelector('[data-part="big-cursor"]');
const bigRead = big.querySelector('[data-part="big-read"]');
const bigEchoA = big.querySelector('[data-part="big-echoA"]');
const bigEcho = [0, 1].map((i) => big.querySelector(`[data-part="big-echo${i}"]`));
const xBA = (t) => BG.a.x0 + ((t - SA.t0) / (SA.t1 - SA.t0)) * (BG.a.x1 - BG.a.x0);
const xBB = (t) => BG.b.x0 + ((t - SB.t0) / (SB.t1 - SB.t0)) * (BG.b.x1 - BG.b.x0);
let charW = 0;
function bigOf(returns, index, level, upTo, cursorOn, echoOn) {
  const s = samplesOf(returns, index, level, upTo, 2);
  const a = s.a.map(([t, v, n]) => [xBA(t), BG.a.base - v * BG.a.k + n * 0.1 * BG.a.k]);
  const b = s.b.map(([t, v, n]) => [xBB(t), BG.b.base - v * BG.b.k + n * 0.14 * BG.b.k]);
  bigTrace.setAttribute("d", pathFrom(a) + pathFrom(b));
  const head = a.length ? a[a.length - 1] : [BG.a.x0, BG.a.base];
  bigCursor.setAttribute("cx", head[0].toFixed(2));
  bigCursor.setAttribute("cy", head[1].toFixed(2));
  bigCursor.setAttribute("opacity", cursorOn.toFixed(3));
  const first = returns[0];
  const show = first && echoOn && level > 0.5;
  bigRead.textContent = show
    ? `Δt ${(first.tof * 1e6).toFixed(3)} µs → R ${first.metres.toFixed(1)} m · ${first.name}${returns.length > 1 ? ` · last ${returns[returns.length - 1].metres.toFixed(1)} m` : ""}`
    : first && level > 0.5 ? "Δt counting…" : "—";
  bigEchoA.setAttribute("opacity", show ? "1" : "0");
  if (first) {
    const t = first.tof * 1e6;
    bigEchoA.setAttribute("x", xBA(t).toFixed(2));
    bigEchoA.setAttribute("y", (BG.a.base - first.amp * SA.height * BG.a.k - 8).toFixed(2));
  }
  bigEcho.forEach((g, i) => {
    const r = i === 0 ? first : returns.length > 1 ? returns[returns.length - 1] : null;
    g.setAttribute("opacity", show && r ? "1" : "0");
    if (!r) return;
    const x = xBB(r.tof * 1e6);
    g.setAttribute("transform", `translate(${x.toFixed(2)} 0)`);
    const label = `${i ? "last" : returns.length > 1 ? "first" : "echo"} · ${r.name} · ${r.metres.toFixed(1)} m`;
    const text = g.querySelector("text");
    if (text.textContent !== label) text.textContent = label;
    // first to the left of its peak, last to the right, unless that would run off the panel; the face is monospaced,
    // so one measured character sizes every label without a layout each frame
    if (!charW) charW = text.getComputedTextLength() / label.length;
    const w = charW * label.length;
    let anchor = i ? "start" : returns.length > 1 ? "end" : "middle";
    const left = x - (anchor === "end" ? w : anchor === "middle" ? w / 2 : 0);
    if (left < BG.b.x0) anchor = "start";
    else if (left + w > BG.b.x1) anchor = "end";
    text.setAttribute("text-anchor", anchor);
  });
}

// ---------------------------------------------------------------- bullet time: one microsecond of the real thing lasts one second
const TB = 0.22;
function packetsOf(returns, theta, tau) {
  const out = { pk: [-1e4, 1e4, 1e4, 0.55], pa: [0, 0, 0, 0], sp: [0, 0], flash: 0, local: tau };
  if (tau < 0 || !returns.length) return out;
  const sig = tau >= PERIOD ? tau - PERIOD : tau;
  out.local = sig;
  const dist = sig * CU;
  const dA = 22 / Math.cos(theta);
  const lastT = returns[returns.length - 1].t;
  out.pk[0] = dist - dA;
  out.pa[0] = smooth(-3, 1, dist - dA) * (1 - smooth(lastT - 2, lastT + 1.5, dist));
  returns.slice(0, 2).forEach((r, i) => {
    if (dist < r.t) return;
    const back = 2 * r.t - dist;
    out.pk[1 + i] = back - dA;
    out.pa[1 + i] = (i ? 0.38 : 0.6) * smooth(0, 3, dist - r.t) * smooth(-3, 1, back - dA);
    const e = (dist - r.t) / CU;
    out.sp[i] = (1 - Math.exp(-e / 0.02)) * Math.exp(-e / 0.2) * (i ? 1.6 : 1);
  });
  out.flash = (1 - Math.exp(-sig / 0.012)) * Math.exp(-sig / 0.14);
  const tof = returns[0].tof * 1e6;
  if (sig > tof) out.flash += 0.6 * (1 - Math.exp(-(sig - tof) / 0.012)) * Math.exp(-(sig - tof) / 0.14);
  return out;
}

// ---------------------------------------------------------------- state
const state = { x: still.matches ? D.start : FROM, v: 0, target: still.matches ? D.start : FROM, scan: FROM, cloud: { x: 1, v: 0 }, laser: { x: 0, v: 0 }, galvo: { x: 1, v: 0 }, bt: 0 };
let mode = still.matches ? "still" : "fly";
let modeClock = 0;
let idle = 0;
let visible = true;
let lastTheta = null;
let lastText = "";
let lastTrace = -1;
let running = false;
let last = 0;
let bullet = null;
let bulletDone = false;

function thetaAt(x) {
  return MODEL.angleAt(MODEL.timeAt(x)) * state.galvo.x;
}

function startBullet(x0) {
  if (still.matches || mode === "bullet" || mode === "return" || state.laser.x < 0.5) return;
  const flying = mode === "fly";
  const from = x0 ?? state.x;
  const xs = flying ? Math.min(TO, from + SPEED * TB) : state.x;
  if (flying) state.x = from;
  const returns = MODEL.returnsOf(xs, thetaAt(xs));
  bullet = { resume: mode, hold: modeClock, flying, x0: from, xs, phase: "in", clock: 0, tau: SA.t0, lastTof: returns.length ? returns[returns.length - 1].tof * 1e6 : 0.8 };
  mode = "bullet";
  idle = 0;
  start();
}

function stepBullet(dt) {
  const b = bullet;
  b.clock += dt;
  settle(state.laser, 1, dt, 0.25);
  settle(state.galvo, 1, dt, 0.3);
  settle(state.cloud, 1, dt, 0.3);
  if (b.phase === "in") {
    state.bt = 1 - Math.exp(-b.clock / TB);
    if (b.flying) state.x = b.x0 + (b.xs - b.x0) * state.bt;
    state.scan = Math.max(state.scan, state.x);
    if (b.clock > 0.9) {
      b.phase = "run";
      b.clock = 0;
      state.x = b.xs;
      state.scan = Math.max(state.scan, state.x);
    }
  } else if (b.phase === "run") {
    state.bt = 1 - Math.exp(-(b.clock + 0.9) / TB);
    b.tau = SA.t0 + b.clock;
    if (b.tau > PERIOD + b.lastTof + 0.35) (b.phase = "out"), (b.clock = 0), (b.top = state.bt);
  } else {
    state.bt = b.top * Math.exp(-b.clock / 0.3);
    if (b.flying && b.resume === "fly") {
      state.x = Math.min(TO, state.x + SPEED * dt * (1 - state.bt));
      state.scan = Math.max(state.scan, state.x);
    }
    if (b.clock > 1.5) {
      state.bt = 0;
      mode = b.resume;
      modeClock = mode === "hold" ? b.hold : mode === "fly" ? 1 : 0;
      bullet = null;
    }
  }
}

const us = (v) => `${v.toFixed(3)} µs`;

// the time-scale badge: 1× at the drawing's normal pace, easing on a log scale down to 1/1,000,000× in bullet time
let lastSpeed = "";
function paintSpeed() {
  const e = Math.min(1, state.bt / (1 - Math.exp(-0.9 / TB)));
  const n = Math.pow(10, 6 * e);
  const digits = Math.max(0, Math.floor(Math.log10(n)) - 1);
  const value = n < 1.05 ? "1×" : `1/${(Math.round(n / 10 ** digits) * 10 ** digits).toLocaleString("en-US")}×`;
  const note = e < 0.01 ? "normal pace" : e > 0.995 ? "1 µs lasts 1 s" : bullet && bullet.phase === "out" ? "speeding up" : "slowing down";
  const key = value + note;
  speed.style.setProperty("--e", e.toFixed(4));
  if (key === lastSpeed) return;
  lastSpeed = key;
  speedValue.textContent = value;
  speedNote.textContent = note;
  speed.classList.toggle("is-slow", e > 0.01);
}
function bulletText(returns, P0) {
  const b = bullet;
  if (b.phase === "in" || b.tau < 0) return "slowing time 1,000,000×";
  if (b.phase === "out") return MODEL.readoutOf(state.x);
  const p = P0.local;
  const first = returns[0];
  if (!first) return `10⁶× slower · ${us(p)} · no echo`;
  const lastTof = returns[returns.length - 1].tof * 1e6;
  if (p < first.tof * 1e6) return `10⁶× slower · pulse out · ${us(p)}`;
  if (p < lastTof + 0.08) return `echo at ${us(first.tof * 1e6)} → ${first.metres.toFixed(1)} m · ${first.name}${returns.length > 1 ? ` · last ${returns[returns.length - 1].metres.toFixed(1)} m` : ""}`;
  return `10⁶× slower · next pulse in ${us(Math.max(0, PERIOD - p))}`;
}

function paint() {
  const x = state.x;
  const theta = thetaAt(x);
  // whole device pixels, so the layers' lines stay as sharp as the drawing they sit on
  const o = at([0, 0, 0]);
  const to = at([x, 0, 0]);
  const dpr = devicePixelRatio || 1;
  const snap = (v) => (Math.round(v * pxPer * dpr) / dpr).toFixed(2);
  const move = `translate(${snap(to[0] - o[0])}px, ${snap(to[1] - o[1])}px)`;
  if (move !== lastMove) for (const s of sliding) s.style.transform = lastMove = move;
  if (lastTheta === null || Math.abs(theta - lastTheta) > 0.0008) {
    lastTheta = theta;
    mirrorHost.innerHTML = solidSvg(PARTS.prismPaths(MF, PARTS.mirrorPoly(theta), PARTS.MIRROR.from, PARTS.MIRROR.to, ctx), { tone: "hi", lit: true });
    const down = [0, (220 - 211.2) * Math.tan(theta), 211.2];
    const spot = at(down);
    beamSpot.setAttribute("cx", spot[0].toFixed(2));
    beamSpot.setAttribute("cy", spot[1].toFixed(2));
    beamPath.setAttribute("d", pathOf([...D.beam.slice(0, 3), down].map(at)));
  }
  const returns = MODEL.returnsOf(x, theta);
  const blur = state.laser.x * (1 - state.bt);
  const run = bullet && bullet.phase === "run";
  const pk = run ? packetsOf(returns, theta, bullet.tau) : null;
  beamGroup.style.opacity = Math.min(1, Math.max(blur, pk ? pk.flash : 0)).toFixed(3);
  const index = Math.round(MODEL.timeAt(x) / L.vis.pulse);
  if (bullet) {
    const sweep = scopeOf(returns, index, state.laser.x, run ? bullet.tau : Infinity);
    trace.setAttribute("d", sweep.d);
    cursor.setAttribute("cx", sweep.head[0].toFixed(2));
    cursor.setAttribute("cy", sweep.head[1].toFixed(2));
    cursor.setAttribute("opacity", (run ? smooth(SA.t0, SA.t0 + 0.15, bullet.tau) : bullet.phase === "out" ? state.bt : 0).toFixed(3));
    const first = returns[0];
    const local = pk ? Math.max(0, pk.local) : 0;
    const landed = run && first && bullet.tau >= 0 && local >= first.tof * 1e6;
    tofText.textContent = run && bullet.tau >= 0 && first ? us(Math.min(local, first.tof * 1e6)) : first ? us(first.tof * 1e6) : "—";
    rangeText.textContent = !run || landed ? (first ? `${first.metres.toFixed(1)} m` : "—") : "—";
    bigOf(returns, index, state.laser.x, run ? bullet.tau : Infinity, run ? smooth(SA.t0, SA.t0 + 0.15, bullet.tau) : 0, !run || landed);
    lastTrace = -1;
  } else if (index !== lastTrace || mode === "return") {
    lastTrace = index;
    trace.setAttribute("d", scopeOf(returns, index, state.laser.x).d);
    bigOf(returns, index, state.laser.x, Infinity, 0, true);
    cursor.setAttribute("opacity", "0");
    const first = returns[0];
    tofText.textContent = first && state.laser.x > 0.5 ? us(first.tof * 1e6) : "—";
    rangeText.textContent = first && state.laser.x > 0.5 ? `${first.metres.toFixed(1)} m` : "—";
  }
  paintSpeed();
  const text = bullet ? bulletText(returns, pk || { local: 0 }) : state.laser.x > 0.5 ? MODEL.readoutOf(x) : "laser off · returning";
  if (text !== lastText) {
    lastText = text;
    readout.textContent = text;
  }
  if (layer) {
    const h1 = returns[0] ? returns[0].p : [x, 0, 0];
    const h2 = returns[1] ? returns[1].p : h1;
    layer.draw({
      uX: x,
      uTheta: theta,
      uScan: state.scan,
      uCloud: state.cloud.x,
      uBlur: blur,
      uLight: pale ? 1 : 0,
      uH1: h1,
      uH2: h2,
      uHas2: returns[1] ? 1 : 0,
      uPk: pk ? pk.pk : [-1e4, 1e4, 1e4, 0.55],
      uPa: pk ? pk.pa : [0, 0, 0, 0],
      uSp: pk ? [Math.max(blur, pk.sp[0]), Math.max(blur, pk.sp[1])] : [blur, blur],
    }, 0);
  }
}

function step(dt) {
  modeClock += dt;
  if (mode === "bullet") return stepBullet(dt);
  if (mode === "fly") {
    settle(state.laser, 1, dt, 0.25);
    settle(state.galvo, 1, dt, 0.3);
    settle(state.cloud, 1, dt, 0.3);
    state.x = Math.min(TO, state.x + SPEED * dt * smooth(0, 0.6, modeClock));
    state.scan = Math.max(state.scan, state.x);
    if (!bulletDone && state.x >= D.bullet - SPEED * TB) {
      bulletDone = true;
      return startBullet(D.bullet - SPEED * TB);
    }
    if (state.x >= TO) (mode = "hold"), (modeClock = 0);
  } else if (mode === "hold") {
    if (modeClock > 2.2) (mode = "return"), (modeClock = 0), (state.from = state.x);
  } else if (mode === "return") {
    settle(state.laser, 0, dt, 0.18);
    settle(state.galvo, 0, dt, 0.35);
    settle(state.cloud, 0, dt, 0.6);
    const u = smooth(0.4, 3.4, modeClock);
    state.x = state.from + (FROM - state.from) * u;
    if (modeClock > 3.8) {
      mode = "fly";
      modeClock = 0;
      state.x = FROM;
      state.scan = FROM;
      bulletDone = false;
    }
  } else if (mode === "user") {
    idle += dt;
    settle(state.laser, 1, dt, 0.2);
    settle(state.galvo, 1, dt, 0.25);
    settle(state.cloud, 1, dt, 0.25);
    const k = 1 - Math.exp(-dt / (drag && drag.moved ? 0.06 : 0.3));
    state.x += (state.target - state.x) * k;
    state.scan = state.x;
    if (drag && drag.moved) idle = 0;
    if (idle > 3.5 && Math.abs(state.target - state.x) < 0.05) {
      mode = state.x >= TO - 0.5 ? "hold" : "fly";
      modeClock = 0.6;
      if (state.x > D.bullet) bulletDone = true;
    }
  }
}

function frame(now) {
  if (!running) return;
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  step(dt);
  paint();
  look(dt);
  requestAnimationFrame(frame);
}
function start() {
  if (running || still.matches || !visible) return;
  running = true;
  last = 0;
  requestAnimationFrame(frame);
}
function stop() {
  running = false;
}

function take(x) {
  idle = 0;
  state.target = clamp(x, FROM, TO);
  if (mode === "bullet") {
    bullet.resume = "user";
    return;
  }
  if (mode !== "user") {
    mode = "user";
    state.cloud.x = Math.max(state.cloud.x, 0.001);
  }
  if (still.matches) {
    state.x = state.target;
    state.scan = state.x;
    paint();
  } else start();
}
// drag: the aircraft follows the pointer along its track, the screen motion projected onto the world x axis
const backSvg = stage.querySelector(".ln-back");
const AX = (() => {
  const a = at([0, 0, 0]);
  const b = at([1, 0, 0]);
  return [b[0] - a[0], b[1] - a[1]];
})();
let drag = null;
let dragged = false;
stage.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, from: mode === "user" || mode === "bullet" ? state.target : state.x, moved: false };
  dragged = false;
  pointer = { clientX: event.clientX, clientY: event.clientY };
  hover(event);
});
stage.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("ln-held");
    hover(null);
  }
  const s = backSvg.getBoundingClientRect().width / D.W;
  const du = (dx * AX[0] + dy * AX[1]) / s / (AX[0] * AX[0] + AX[1] * AX[1]);
  take(drag.from + du);
});
const release = (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  dragged = drag.moved;
  drag = null;
  stage.classList.remove("ln-held");
};
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("click", () => {
  if (dragged) return void (dragged = false);
  startBullet();
});

// ---------------------------------------------------------------- hover cards: what each part is and why the lidar needs it
const fx = (v, d = 0) => v.toFixed(d);
const deg = (r) => `${r < 0 ? "−" : "+"}${Math.abs((r * 180) / Math.PI).toFixed(1).padStart(4, "\u2007")}°`;
const m = (u) => fx(u * L.unit, 1);
const footprint = L.divergence * L.metres;
const now = () => MODEL.returnsOf(state.x, thetaAt(state.x));
const firstNow = () => {
  const r = now();
  return r.length ? `now ${deg(thetaAt(state.x))} · ${(r[0].tof * 1e6).toFixed(3)} µs → ${r[0].metres.toFixed(1)} m · ${r[0].name}` : `now ${deg(thetaAt(state.x))} · no return`;
};
const housing = (title, does) => () => ({ sys: "Housing", title, does, why: "The sealed box keeps dust, moisture and stray light off the optics and holds them in alignment; two walls and most of the lid are cut away here.", spec: "drawn far larger than real" });
const cable = (title, sys, does, why, spec) => () => ({ sys, title, does, why, spec });
const tree = (t) => () => ({ sys: "Ground", title: "Tree", does: "Leaves and branches catch part of each pulse and let the rest through to the ground; one pulse comes back as several echoes.", why: "The first return maps the canopy top, the last the ground beneath: multiple returns are how lidar measures forest height and sees terrain under trees.", spec: `crown top ${m(t.cz + t.r)} m · crown ø ${m(2 * t.r)} m` });
const house = (b, title) => () => ({ sys: "Ground", title, does: "Pitched roof planes return one strong echo each; the walls are seen only obliquely, near the swath edges.", why: "Hard, sharp-edged surfaces give single returns; their planes and ridge lines are what building models are fitted to.", spec: `ridge ${m(b.ridge)} m · eave ${m(b.eave)} m · ${m(b.x1 - b.x0)} × ${m(b.y1 - b.y0)} m` });
const CARDS = [
  [/^frame/, () => ({ sys: "Airframe", title: "Fuselage frames", does: "Ring frames that give the hull its shape; the skin is riveted to them. The top and near side are cut away so you can see in.", why: "The sensor flies inside a pressurised or unpressurised cabin, looking down through a hatch cut in the belly.", spec: "cutaway section" })],
  [/^skin/, () => ({ sys: "Airframe", title: "Belly skin (cut)", does: "The aluminium skin of the near side, cut away above the floor line.", why: "Under the sensor the belly has a camera hatch: the beam and its echoes pass through a hole, not the skin.", spec: "cut to show the cabin" })],
  [/^floor\.beam/, () => ({ sys: "Airframe", title: "Floor beam", does: "Cross beams that carry the cabin floor and everything bolted to it.", why: "The mount's loads go through the seat tracks into these beams.", spec: "structure" })],
  [/^floor$/, () => ({ sys: "Airframe", title: "Cabin floor", does: "Floor panels over the beams, with the survey port cut under the sensor.", why: "The head looks straight down through the port; the PDU and operator console sit beside it.", spec: "survey port under the head" })],
  [/^track/, () => ({ sys: "Airframe", title: "Seat track", does: "Slotted rails in the floor that seats normally lock into.", why: "Survey kit bolts to the same rails, so a sensor can be installed without cutting the aircraft.", spec: "certified attach points" })],
  [/^mount\.plate/, () => ({ sys: "Mount", title: "Adapter plate", does: "Bolts to both seat tracks and carries the stabilised mount over the port.", why: "It fixes where the sensor sits relative to the airframe and the GNSS antenna: the lever arm starts here.", spec: "bolted to the seat tracks" })],
  [/^mount\.act/, () => ({ sys: "Mount", title: "Levelling actuator", does: "One of four bellows-booted actuators that tilt the cradle against the aircraft's roll and pitch.", why: "A level head keeps the swath centred under the aircraft; the IMU still records whatever motion is left.", spec: "about ±6° roll · ±8° pitch" })],
  [/^mount\.cradle/, () => ({ sys: "Mount", title: "Mount cradle", does: "The stabilised platform the housing sits on, carried by the actuators and turned against drift.", why: "The IMU on the head measures its moves, and the mount logs its angles so the changing lever arm to the antenna is corrected.", spec: "roll · pitch · drift" })],
  [/^mount\.drive/, () => ({ sys: "Mount", title: "Mount controller", does: "Drives the actuators from attitude data; the LEDs show power and lock.", why: "It closes the loop between what the aircraft does and where the head points.", spec: "power · locked" })],
  [/^case\.(socket|port)/, () => ({ sys: "Housing", title: "GNSS bulkhead receptacle", does: "A sealed coax connector through the back wall: the antenna cable plugs in outside, and a short coax inside goes on to the INS board.", why: "The signal gets through the wall without breaking the seal, and the head can be swapped without rewiring.", spec: "sealed, panel-mounted" })],
  [/^case\.gland/, () => ({ sys: "Housing", title: "Cable gland", does: "Where the harness leaves the housing, clamped and sealed.", why: "Keeps the box sealed and the harness from pulling on the connectors.", spec: "sealed" })],
  [/^case\.plate/, () => ({ sys: "Housing", title: "Nameplate", does: "Model, serial number and laser class.", why: "The laser class says how the beam must be handled on the ground.", spec: `Class 4 · ${L.wavelength} nm` })],
  [/^case\.floor/, housing("Housing floor", "The base of the sealed housing that every optic bolts to, with the exit window cut through it.")],
  [/^case\./, housing("Sensor housing (cut away)", "A sealed box around the laser, scanner, receiver, timing board, INS and sensor computer.")],
  [/^window/, () => ({ sys: "Housing", title: "Exit window", does: "Flat coated glass in the housing floor, sealed in its ring.", why: "Both the pulse and its echo pass through it; the coating is matched to the laser so little light is lost.", spec: `AR-coated at ${L.wavelength} nm` })],
  [/^mirror$/, () => ({ sys: "Scanner", title: "Scan mirror", does: "A light, stiff mirror on the galvanometer shaft that swings the beam from side to side across the track.", why: "Its angle at the instant of each shot, with the range, places the point; the aircraft's motion supplies the step along track.", spec: `${deg(thetaAt(state.x))} now · ±${L.half}° · ${L.scanHz} Hz` })],
  [/^galvo\.encoder/, () => ({ sys: "Scanner", title: "Angle encoder", does: "An optical encoder on the shaft that reads the mirror's angle for every shot.", why: `A range is only a point once its direction is known; an angle error of 0.01° is ${fx(L.metres * Math.tan(1e-2 * Math.PI / 180) * 100)} cm at ${L.metres} m.`, spec: `${deg(thetaAt(state.x))} now` })],
  [/^galvo\./, () => ({ sys: "Scanner", title: "Galvanometer", does: "A moving-magnet motor that swings the mirror back and forth on a servo, slowing and turning at each edge.", why: "It sweeps the beam across track; points bunch at the swath edges where the mirror turns.", spec: `±${L.half}° · ${L.scanHz} Hz · ${fx(L.swath)} m swath · lines ${fx(L.lineSpacing, 2)} m apart` })],
  [/^beam$/, () => ({ sys: "Optical path", title: "Outgoing beam", does: "Each pulse leaves the expander, turns off the injection mirror onto the scan mirror and goes down through the window.", why: "One pulse becomes one point, or several when it passes through layers like leaves.", spec: `${L.wavelength} nm · ${L.prf / 1000} kHz · footprint ø ${fx(footprint * 100)} cm` })],
  [/^tx\.expander/, () => ({ sys: "Transmitter", title: "Beam expander", does: "A small telescope that widens the laser's beam and keeps it parallel.", why: "A wider beam diverges less: divergence sets the footprint each pulse lights on the ground.", spec: `${fx(L.divergence * 1e3, 2)} mrad → ø ${fx(footprint * 100)} cm at ${L.metres} m` })],
  [/^tx\./, () => ({ sys: "Transmitter", title: "Pulsed laser", does: "A diode-pumped, Q-switched laser that fires a few-nanosecond pulse on every trigger; the fins carry away its heat.", why: "The pulse rate sets how many points per second; the pulse length sets how close two echoes can be and still be told apart.", spec: `${L.wavelength} nm · ${L.prf / 1000} kHz · ${fx(L.pulseWidth * 1e9)} ns → ${fx(L.pulseMetres / 2, 2)} m apart` })],
  [/^t0\./, () => ({ sys: "Transmitter", title: "T0 photodiode", does: "Catches a sliver of each outgoing pulse and fires the start signal.", why: "Every range is timed from this instant, T0, so the laser's own jitter cancels out.", spec: `T0 every ${fx(L.period * 1e6)} µs` })],
  [/^rx\.lens/, () => ({ sys: "Receiver", title: "Receiving lens", does: "Collects the faint echo coming back up through the window and focuses it down the tube.", why: `An echo from ${L.metres} m is many orders of magnitude weaker than the pulse, so collecting area counts.`, spec: "coaxial with the beam" })],
  [/^rx\.inject/, () => ({ sys: "Receiver", title: "Injection mirror", does: "A small mirror on a stalk in front of the lens that puts the outgoing pulse onto the receiver's axis.", why: "Transmit and receive share one axis, so the receiver always looks where the laser points.", spec: "shades only the centre of the echo" })],
  [/^rx\.filter/, () => ({ sys: "Receiver", title: "Interference filter", does: "A narrowband filter that passes only the laser's wavelength.", why: "Sunlight off the ground swamps a weak echo; the filter keeps out nearly all of it.", spec: `${L.wavelength} ± 1 nm` })],
  [/^rx\.apd/, () => ({ sys: "Receiver", title: "Avalanche photodiode", does: "A fast photodiode with internal gain that turns the echo's photons into a current pulse.", why: "Its speed and noise set how precisely each echo can be timed.", spec: "1 ns of flight = 15 cm of range" })],
  [/^rx\.board/, () => ({ sys: "Receiver", title: "APD board", does: "Bias supply and amplifier right behind the detector.", why: "The weak current pulse is amplified before the cable, so noise can't swamp it.", spec: "transimpedance amp" })],
  [/^rx\./, () => ({ sys: "Receiver", title: "Receiver tube", does: "Holds the lens, filter and detector on one axis on its cradle.", why: "Alignment between receiver and laser decides whether the echo lands on the detector.", spec: "lens · filter · APD" })],
  [/^pcb\.fpga/, () => ({ sys: "Timing", title: "FPGA", does: "Matches each echo to its pulse, times it and streams it to the sensor computer.", why: `At ${L.prf / 1000} kHz a pulse leaves every ${fx(L.period * 1e6)} µs, so the logic must keep up in real time.`, spec: `unambiguous to ${fx(L.maxRange)} m` })],
  [/^pcb\.tdc/, () => ({ sys: "Timing", title: "Time-to-digital converter", does: "Measures the time from T0 to each echo to tens of picoseconds.", why: "Range is R = c·Δt/2: every nanosecond is 15 cm.", spec: firstNow() })],
  [/^pcb\.adc/, () => ({ sys: "Timing", title: "Waveform digitiser", does: "Samples the detector's output once a nanosecond.", why: "Keeping the whole waveform finds weak and overlapping echoes a trigger would miss.", spec: "1 GS/s · 15 cm per sample" })],
  [/^pcb\.xtal/, () => ({ sys: "Timing", title: "Reference crystal", does: "The stable oscillator every timer on the board counts from.", why: `A clock off by 1 part in a million moves a ${L.metres} m range by ${fx(L.metres * 1e-3, 2)} mm; the PPS then ties its counts to GPS time.`, spec: "stable oscillator" })],
  [/^pcb\.(header|sma|jack)/, () => ({ sys: "Timing", title: "Board connector", does: "Where the APD signal comes in and the shot stream goes out.", why: "Fast, shielded connections keep the timing edges clean.", spec: "SMA · header · data jack" })],
  [/^pcb/, () => ({ sys: "Timing", title: "Timing board", does: "Carries the FPGA, TDC, digitiser and clock on standoffs above the housing floor.", why: "Every range is a time measured on this board.", spec: firstNow() })],
  [/^ins\.board/, () => ({ sys: "Navigation", title: "INS: GNSS-inertial board", does: "The GNSS receiver and the POS processor in one small enclosure: the antenna coax comes in on one side, the IMU's jumper on the other, and its Kalman filter blends the two into position and attitude; the LEDs show GNSS and IMU status.", why: "It sends the trajectory and a PPS to the sensor computer, so every shot can be put on GPS time.", spec: "GNSS receiver · Kalman filter · PPS" })],
  [/^ins\./, () => ({ sys: "Navigation", title: "INS: IMU", does: "Three gyros and three accelerometers, read 200 times a second, in a block bolted on its flange to the bench beside the scanner.", why: `The aircraft rolls, pitches and yaws in every gust: 1° of roll moves a point ${fx(L.metres * Math.tan(Math.PI / 180), 1)} m at ${L.metres} m. Bolted rigidly to the scanner, the IMU measures the turn the sensor itself makes.`, spec: "IMU 200 Hz · rigid mount" })],
  [/^cpu/, () => ({ sys: "Control", title: "Sensor computer", does: "Fires the laser, drives the scanner, and logs every range and scan angle with its time, beside the INS's trajectory and PPS marks; the LEDs show power and logging.", why: "Its clock is not GPS time: after the flight the PPS marks convert every shot's time to GPS time, so each range meets the trajectory at its instant.", spec: "laser and scanner control · logger" })],
  [/^nav\.(monitor|stand)/, () => ({ sys: "Operator", title: "Operator console", does: "The flight management display: it shows the sensor computer's live view, sent down the harness; here the waveform: T0, the echo, and the next T0.", why: "The operator watches the returns and coverage in flight, starts and stops each line, and can refly a gap before landing.", spec: firstNow() })],
  [/^nav\.computer|^nav\.socket/, () => ({ sys: "Power", title: "Power distribution unit", does: "Takes the aircraft's 28 V supply, protects and switches it, and sends it down the harness to the sensor head.", why: "Everything that measures rides in the head; the cabin needs only power and the operator console.", spec: "28 V DC in · sensor power out" })],
  [/^nav\.|^tray/, () => ({ sys: "Operator", title: "Equipment tray", does: "Holds the PDU and the operator console on the seat track beside the head.", why: "Keeps the operator's kit secured within reach.", spec: "on the near seat track" })],
  [/^gnss\.dome/, () => ({ sys: "Navigation", title: "GNSS antenna", does: "Receives satellite signals on the crown of the fuselage.", why: "Its position is where the trajectory is measured; the lever arm carries it down to the sensor.", spec: "L1/L2 · on the crown" })],
  [/^gnss\.arrestor/, () => ({ sys: "Navigation", title: "Lightning arrestor", does: "An inline protector on the antenna coax.", why: "A strike or static on the antenna can't reach the receiver.", spec: "inline on the coax" })],
  [/^gnss\./, () => ({ sys: "Navigation", title: "Antenna mount", does: "A riveted doubler and base that carry the antenna through the skin.", why: "A rigid mount keeps the measured lever arm true.", spec: "riveted doubler" })],
  [/^cable\.gnss/, cable("GNSS coax", "Cabling", "Runs from the antenna down the inside of the fuselage wall and across the floor to the bulkhead on the back of the sensor housing.", "It sends its signals to the GNSS receiver on the INS board.", "low-loss coax")],
  [/^cable\.harness/, cable("Sensor harness", "Cabling", "Runs from the housing to the PDU and the operator console.", "Aircraft power goes down to the head; the sensor computer's live view and the operator's commands come back over Ethernet.", "28 V DC · Ethernet")],
  [/^cable\.link/, cable("Harness, inside", "Cabling", "Carries the harness on from the gland to the sensor computer.", "The computer passes the power on to the laser and scanner.", "28 V DC · Ethernet")],
  [/^cable\.apd/, cable("APD signal cable", "Cabling", "Shielded line from the APD board to the timing board.", "Nanosecond echoes need a shielded, matched line to arrive clean.", "50 Ω")],
  [/^cable\.t0/, cable("T0 cable", "Cabling", "Brings the start pulse from the T0 photodiode to the timing board.", "Its delay is calibrated out, so only the flight time is left.", "start signal")],
  [/^cable\.encoder/, cable("Encoder cable", "Cabling", "Carries the mirror angle from the encoder to the sensor computer.", "The angle must arrive in step with every shot.", "encoder")],
  [/^cable\.ins/, cable("INS cable", "Cabling", "Carries the INS board's position, attitude and PPS to the sensor computer.", "The computer logs when each PPS arrives on its own clock; those marks tie every shot to GPS time.", "trajectory · PPS")],
  [/^cable\.imu/, cable("IMU jumper", "Cabling", "Carries the IMU's 200 Hz gyro and accelerometer readings to the INS board.", "The board's Kalman filter needs every reading, on time.", "IMU data")],
  [/^cable\.coax/, cable("GNSS coax, inside", "Cabling", "Carries the antenna signal from the bulkhead receptacle to the GNSS receiver on the INS board.", "A short, sealed run keeps the signal clean.", "coax")],
  [/^cable\.data/, cable("Data cable", "Cabling", "Takes the shot stream from the timing board to the sensor computer.", "Ranges, angles and timestamps are logged there for processing after the flight.", `${L.prf / 1000} kHz shot stream`)],
  [/^cable\.power/, cable("Power cable", "Cabling", "Feeds the laser from the sensor computer's power distribution.", "The laser and scanner draw the most current.", "28 V DC")],
  [/^scene\.ground/, () => ({ sys: "Ground", title: "Bare earth", does: "Open ground between the buildings and trees.", why: "Bare-earth points, mostly last returns, are what a terrain model (DTM) is built from.", spec: `${fx(L.density)} pts/m² · ${L.metres} m below` })],
  [/^scene\.field/, () => ({ sys: "Ground", title: "Ploughed field", does: "Furrowed soil: a strong, diffuse reflector at 1064 nm.", why: "Bare soil returns one clean echo per pulse; its furrows show in a dense cloud.", spec: "single return" })],
  [/^scene\.road/, () => ({ sys: "Ground", title: "Road", does: "Asphalt with painted lines, and a driveway to the house.", why: "Dark asphalt returns a weak echo, so it shows dark in an intensity image; the paint stands out bright.", spec: `intensity ~${fx(MODEL.SURFACE.road.amp * 100)}% of soil` })],
  [/^scene\.ruler/, () => ({ sys: "Ground", title: "Scale bar", does: "100 m, minor ticks every 2 m, major every 10 m.", why: `For scale: the swath is ${fx(L.swath)} m wide at ${L.metres} m.`, spec: "100 m" })],
  [/^scene\.label/, () => ({ sys: "Ground", title: "Sheet legend", does: "A plate standing for the map sheet's legend.", why: "Every point cloud is delivered with its datum, projection and date.", spec: "datum · projection · date" })],
  [/^scene\.gnss/, () => ({ sys: "Ground", title: "GNSS base station", does: "A receiver on a surveyed mark, logging the same satellites as the aircraft.", why: "Differencing the two (PPK) removes most orbit and atmosphere error: the trajectory, and every point, to a few centimetres.", spec: "tripod · choke-ring antenna" })],
  [/^scene\.b0/, house(SC.buildings[0], "House")],
  [/^scene\.b1/, house(SC.buildings[1], "Shed")],
  ...SC.trees.map((t, i) => [new RegExp(`^scene\\.t${i}$`), tree(t)]),
];
const nameOf = (el) => (el.dataset.name ? el.dataset.name : `scene.${el.dataset.thing}`);
const cardOf = (name) => CARDS.findIndex(([re]) => re.test(name));
const hotEls = [...stage.querySelectorAll(".ln-front .it[data-name], .ln-back [data-thing]")].map((el) => [el, cardOf(nameOf(el))]);
const card = document.createElement("div");
card.className = "hd-card";
card.setAttribute("aria-hidden", "true");
stage.appendChild(card);
let hot = -1;
let spec = null;
let pointer = null;
function hover(event) {
  const el = event && !drag?.moved && event.target.closest && event.target.closest(".ln-front .it[data-name], .ln-back [data-thing]");
  const i = el ? cardOf(nameOf(el)) : -1;
  if (i !== hot) {
    hot = i;
    for (const [p, j] of hotEls) p.classList.toggle("hd-hot", j === i && i >= 0);
    if (i < 0) return void card.classList.remove("on");
    const c = CARDS[i][1]();
    card.innerHTML = `<div class="hd-card-sys">${c.sys}</div><div class="hd-card-title">${c.title}</div><p>${c.does}</p><p class="hd-card-why">${c.why}</p><div class="hd-card-spec">${c.spec}</div>`;
    spec = card.querySelector(".hd-card-spec");
    card.classList.add("on");
  }
  if (i < 0) return;
  const box = stage.getBoundingClientRect();
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  let x = event.clientX - box.left + 16;
  let y = event.clientY - box.top + 16;
  if (x + w > box.width) x = event.clientX - box.left - w - 16;
  if (y + h > box.height) y = event.clientY - box.top - h - 16;
  card.style.transform = `translate(${clamp(x, 0, Math.max(0, box.width - w))}px, ${clamp(y, 0, Math.max(0, box.height - h))}px)`;
}
stage.addEventListener("pointermove", (event) => {
  pointer = { clientX: event.clientX, clientY: event.clientY };
  if (!drag?.moved) hover(event);
});
stage.addEventListener("pointerleave", () => {
  pointer = null;
  hover(null);
});
// the aircraft moves under a still pointer: look again a few times a second, and keep live specs current
let lookClock = 0;
function look(dt) {
  lookClock += dt;
  if (lookClock < 0.2) return;
  lookClock = 0;
  if (pointer && !drag?.moved) {
    const target = document.elementFromPoint(pointer.clientX, pointer.clientY);
    if (target && stage.contains(target)) hover({ target, ...pointer });
  }
  if (hot >= 0 && spec) {
    const text = CARDS[hot][1]().spec;
    if (spec.textContent !== text) spec.textContent = text;
  }
}
stage.addEventListener("keydown", (event) => {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    startBullet();
    said.textContent = "Time slowed a million-fold: one pulse goes down, its echo comes back, then the beam waits for the next pulse.";
    return;
  }
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const by = (event.shiftKey ? 32 : 8) * (event.key === "ArrowLeft" ? -1 : 1);
  take((mode === "user" ? state.target : mode === "bullet" ? state.target : state.x) + by);
  said.textContent = MODEL.readoutOf(state.target);
});

new IntersectionObserver((entries) => {
  visible = entries.some((entry) => entry.isIntersecting);
  if (visible) start();
  else stop();
}).observe(stage);

if (still.matches) {
  state.laser.x = 1;
  state.galvo.x = 1;
  state.cloud.x = 1;
  state.x = D.start;
  state.scan = D.start;
  paint();
} else {
  paint();
  start();
}