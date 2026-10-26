/* NEXUM M1 — v2
   Everything visual runs through one WebGL pipeline:
   particles (6 morphing shapes) + DOM-synced image planes → render target →
   post pass (noise-dissolve page background, bloom, velocity chromatic shift,
   grain, vignette). DOM keeps text, layout and accessibility. */

import * as THREE from 'three';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
if (reduced) root.classList.add('reduced');
let mobile = innerWidth < 760;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const curve = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return lerp(y0, y1, ease((x - x0) / (x1 - x0)));
  }
  return pts[pts.length - 1][1];
};

/* ================= story curves (key units, see .k markers) ================= */
const C = {
  light: [[0, 0], [6.6, 0], [6.92, 1], [10.5, 1], [10.85, 0], [11.66, 0], [11.95, 1], [12.5, 1], [12.82, 0]],
  opacity: [[0, 1], [3.05, 1], [3.25, .3], [3.85, .3], [4.05, 0], [4.7, 0], [5.0, 1], [11.0, 1], [11.35, 0], [12.5, 0], [12.95, 1]],
  shape: [[0.25, 0], [0.95, 1], [2.0, 1], [2.5, 2], [4.6, 2], [4.95, 3], [6.6, 3], [7.05, 4], [8.55, 4], [9.05, 5], [10.55, 5], [11.15, 6]],
  halo: [[12.45, 0], [13.0, 1]],
  heroA: [[0.3, 1], [0.95, 0]],
  gz: [[1.12, 0], [2.02, 34], [2.5, 0]],
  gx: [[0.95, 2.4], [1.3, 0], [2.25, 0], [2.6, 2.9], [4.6, 2.9], [5.0, 0], [6.6, 0], [7.05, 3], [10.55, 3], [11.1, 0]],
  rotY: [[1.0, -.75], [1.3, 0]],
  spin: [[2.1, 0], [2.5, 1]],
  mscale: [[0.9, .64], [1.1, .85], [2.25, .85], [2.6, .74], [4.6, .74], [4.95, .7], [6.6, .7], [7.05, .56], [8.55, .56], [9.05, .7], [11, .7]],
  depth: [[0, 0], [1.6, .25], [2.4, .5], [6.6, .5], [7.05, .75], [8.6, .75], [9.05, 1], [10.6, 1], [11.3, 0]],
};
const SCENES = [[-1, '01', 'SEE BEYOND'], [0.75, '02', 'INTO THE LENS'], [2.25, '03', 'A WORLD WITHIN'], [4.4, '04', 'LAYERS OF DETAIL'],
  [6.8, '05', 'BEYOND THE VISIBLE'], [10.9, '06', 'ENGINEERED TO REVEAL'], [11.9, '07', 'PRECISION, DEFINED'], [12.9, '08', 'LOOK CLOSER']];
const TYPES = [[-1, 'PRODUCT RENDER · PARTICLE OPTICS'], [1.0, 'PARTICLE MODEL · OPTICAL PATH'], [2.3, 'PARTICLE MODEL · SPORE-LIKE STRUCTURE'],
  [3.05, 'ARTISTIC VISUALIZATIONS · NOT M1 CAPTURES'], [4.85, 'MODEL · GYROID MINIMAL SURFACE'], [6.9, 'MOLECULAR MODEL · CAFFEINE C₈H₁₀N₄O₂'],
  [8.9, 'ATOMIC MODEL · HYDROGEN 3dz² |ψ|²'], [10.9, 'PRODUCT RENDER · NEXUM M1'], [11.7, '']];
const SCALES = ['≈ 10⁻¹ m', '≈ 10⁻² m', '≈ 10⁻⁵ m', '≈ 10⁻⁹ m', '≈ 10⁻¹⁰ m'];

/* ================= particle shapes ================= */
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
const randSphere = () => { const z = Math.random() * 2 - 1, t = Math.random() * 6.2832, r = Math.sqrt(1 - z * z); return [r * Math.cos(t), r * Math.sin(t), z]; };
const rot = (p, ax, az) => { // rotate around X then Z
  let [x, y, z] = p; const c = Math.cos(ax), s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  const c2 = Math.cos(az), s2 = Math.sin(az);
  return [x * c2 - y * s2, x * s2 + y * c2, z];
};
function shHalo(N) { // optical halo: tilted rings + an orange equator + fine dust
  const a = new Float32Array(N * 4);
  const R = [[4.25, 1.25, .25, .06, 0], [3.7, -.95, .85, .05, -.45], [5.1, .45, -1.1, .03, -.6], [4.55, 1.47, .08, .1, 1], [2.9, .2, .4, .03, -.3]];
  const wsum = [.22, .18, .14, .26, .08];
  for (let i = 0; i < N; i++) {
    const r = Math.random(); let x, y, z, w;
    let acc = 0, k = -1; for (let j = 0; j < 5; j++) { acc += wsum[j]; if (r < acc) { k = j; break; } }
    if (k >= 0) {
      const [rad, ax, az, th, ww] = R[k], t = Math.random() * 6.2832, rr = rad + gauss() * th;
      [x, y, z] = rot([Math.cos(t) * rr, Math.sin(t) * rr * (k === 3 ? 1 : 1), gauss() * th * .6], ax, az); w = ww;
    } else {
      const d = randSphere(), rr = 2.6 + Math.random() * 5.2; x = d[0] * rr; y = d[1] * rr; z = d[2] * rr; w = Math.random() < .12 ? .8 : -.55;
    }
    a.set([x, y, z, w], i * 4);
  }
  return a;
}
function shBarrel(N) {
  const a = new Float32Array(N * 4), K = 18, step = 1.5, off = 4;
  const rad = k => 2.3 + .7 * Math.sin(k * .75) + (k % 5 === 0 ? .35 : 0);
  for (let i = 0; i < N; i++) {
    const r = Math.random(); let x, y, z, w;
    if (r < .68) {
      const k = (Math.random() * K) | 0, band = k === 4 || k === 11, th = Math.random() * 6.2832, rr = rad(k) + (Math.random() - .5) * .07;
      x = Math.cos(th) * rr; y = Math.sin(th) * rr; z = -k * step + (Math.random() - .5) * (band ? .55 : .08); w = band ? .95 : (k % 3 === 0 ? -.55 : 0);
    } else if (r < .86) {
      const k = [2, 7, 13][(Math.random() * 3) | 0], R = rad(k) * .93, q = Math.sqrt(Math.random()) * R, th = Math.random() * 6.2832;
      x = Math.cos(th) * q; y = Math.sin(th) * q; z = -k * step + .4 * (1 - (q / R) ** 2); w = -.72;
    } else { x = gauss() * .22; y = gauss() * .22; z = -K * step + gauss() * .5; w = .95; }
    a.set([x, y, z + off, w], i * 4);
  }
  return a;
}
function shSpore(N) {
  const a = new Float32Array(N * 4), R = 2.45, dirs = Array.from({ length: 90 }, randSphere);
  for (let i = 0; i < N; i++) {
    const r = Math.random(); let x, y, z, w;
    if (r < .52) {
      const [u, v, t] = randSphere(); const cell = Math.abs(Math.sin(u * 9) * Math.sin(v * 9) * Math.sin(t * 9));
      const rr = R * (1 + .045 * cell) + (Math.random() - .5) * .03; x = u * rr; y = v * rr; z = t * rr; w = cell > .55 ? -.6 : 0;
    } else if (r < .7) {
      const d = dirs[(Math.random() * dirs.length) | 0], l = Math.random(), rr = R + l * .95, j = (1 - l) * .05;
      x = d[0] * rr + gauss() * j; y = d[1] * rr + gauss() * j; z = d[2] * rr + gauss() * j; w = -.35;
    } else {
      let p; do { p = [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]; } while (Math.hypot(...p) > 1 || (Math.sin(p[0] * 7) + Math.sin(p[1] * 7) + Math.sin(p[2] * 7)) < .9);
      x = p[0] * R * .9; y = p[1] * R * .9; z = p[2] * R * .9; w = .9;
    }
    a.set([x, y, z, w], i * 4);
  }
  return a;
}
function shGyroid(N) {
  const a = new Float32Array(N * 4), R = 6.2, f = 1.15; let i = 0;
  while (i < N) {
    const x = (Math.random() * 2 - 1) * R, y = (Math.random() * 2 - 1) * R, z = (Math.random() * 2 - 1) * R;
    const d = Math.hypot(x, y, z); if (d > R) continue;
    const g = Math.sin(x * f) * Math.cos(y * f) + Math.sin(y * f) * Math.cos(z * f) + Math.sin(z * f) * Math.cos(x * f);
    if (Math.abs(g) > .07) continue;
    const hot = Math.sin(x * .55 + 1) * Math.cos(y * .5 - .5) * Math.sin(z * .4) > .22;
    a.set([x, y, z, hot ? .9 : (d > 4.6 ? -.6 : 0)], i * 4); i++;
  }
  return a;
}
const CAFFEINE = { a: [["C", 3.324, 0.059, -0.234], ["N", 2.058, -0.627, -0.193], ["C", 1.868, -1.981, -0.278], ["N", 0.59, -2.298, -0.209], ["C", -0.049, -1.103, -0.076], ["C", 0.824, -0.058, -0.063], ["C", 0.414, 1.297, 0.064], ["O", 1.21, 2.232, 0.075], ["N", -0.972, 1.436, 0.174], ["C", -1.908, 0.38, 0.164], ["O", -3.118, 0.603, 0.267], ["N", -1.406, -0.916, 0.034], ["C", -2.301, -2.058, 0.016], ["C", -1.517, 2.772, 0.31], ["H", 4.13, -0.671, -0.345], ["H", 3.323, 0.739, -1.089], ["H", 3.452, 0.61, 0.701], ["H", 2.684, -2.684, -0.387], ["H", -3.348, -1.757, 0.112], ["H", -2.05, -2.722, 0.849], ["H", -2.178, -2.593, -0.931], ["H", -2.207, 2.962, -0.519], ["H", -2.079, 2.834, 1.247], ["H", -0.743, 3.544, 0.31]], b: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [6, 8], [8, 9], [9, 10], [9, 11], [11, 12], [8, 13], [5, 1], [11, 4], [0, 14], [0, 15], [0, 16], [2, 17], [12, 18], [12, 19], [12, 20], [13, 21], [13, 22], [13, 23]] };
function shMolecule(N) {
  const a = new Float32Array(N * 4), S = 1.05;
  const RAD = { C: .44, N: .42, O: .42, H: .27 }, W = { C: 0, N: -.45, O: 1, H: -.78 };
  const atoms = CAFFEINE.a.map(([e, x, y, z]) => ({ e, p: [x * S, y * S, z * S], r: RAD[e] }));
  const areaSum = atoms.reduce((s, t) => s + t.r * t.r, 0);
  const bonds = CAFFEINE.b.map(([i, j]) => [atoms[i], atoms[j]]);
  for (let i = 0; i < N; i++) {
    let x, y, z, w;
    if (Math.random() < .7) {
      let r = Math.random() * areaSum, t = atoms[0]; for (const at of atoms) { r -= at.r * at.r; if (r <= 0) { t = at; break; } }
      const d = randSphere(); x = t.p[0] + d[0] * t.r; y = t.p[1] + d[1] * t.r; z = t.p[2] + d[2] * t.r; w = W[t.e];
    } else {
      const [A, B] = bonds[(Math.random() * bonds.length) | 0], u = Math.random();
      x = lerp(A.p[0], B.p[0], u) + gauss() * .035; y = lerp(A.p[1], B.p[1], u) + gauss() * .035; z = lerp(A.p[2], B.p[2], u) + gauss() * .035; w = -.5;
    }
    a.set([x, y, z, w], i * 4);
  }
  return a;
}
function shOrbital(N) { // hydrogen 3d_z2: |ψ|² ∝ r⁴ e^(−2r/3) (3cos²θ − 1)²
  const a = new Float32Array(N * 4), R = 26, MAX = 95, S = .19; let i = 0;
  while (i < N) {
    const x = (Math.random() * 2 - 1) * R, y = (Math.random() * 2 - 1) * R, z = (Math.random() * 2 - 1) * R;
    const r = Math.hypot(x, y, z); if (r < 1e-3 || r > R) continue;
    const c = y / r, ang = 3 * c * c - 1, d = r ** 4 * Math.exp(-2 * r / 3) * ang * ang;
    if (Math.random() * MAX >= d) continue;
    const n = clamp(d / 55);
    a.set([x * S, y * S, z * S, n > .45 ? (n - .45) * 1.7 : -(1 - n) * .55], i * 4); i++;
  }
  return a;
}

/* ================= shaders ================= */
const NOISE = /* glsl */`
  float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=.5; } return v; }`;

const P_VERT = /* glsl */`
  attribute vec4 aS0,aS1,aS2,aS3,aS4,aS5; attribute float aR;
  uniform float uS,uT,uSize,uPR,uScatter,uHalo,uAspect,uMouseOn; uniform vec2 uMouse;
  varying float vW; varying float vA; varying float vSc;
  vec4 shp(float i){ if(i<.5) return aS0; if(i<1.5) return aS1; if(i<2.5) return aS2; if(i<3.5) return aS3; if(i<4.5) return aS4; return aS5; }
  void main(){
    float s=clamp(uS,0.,5.);
    float i0=min(floor(s),4.); float t=s-i0;
    float tt=smoothstep(aR*.42, aR*.42+.58, t);
    vec4 p=mix(shp(i0), shp(i0+1.), tt);
    float arc=sin(3.14159*tt);
    vec3 dir=normalize(vec3(sin(aR*91.7),cos(aR*53.3),sin(aR*17.9+1.)));
    p.xyz+=dir*arc*(1.2+aR*2.8);
    float c=clamp(uS-5.,0.,1.)*(1.-uHalo);
    p.xyz*=1.-c*.988;
    float th=smoothstep(aR*.4, aR*.4+.6, uHalo);
    p=mix(p, aS0, th); p.xyz+=dir*sin(3.14159*th)*(2.+aR*3.);
    vec3 sd=normalize(vec3(sin(aR*91.3+1.7),cos(aR*47.1+.3),sin(aR*23.9+2.9)));
    p.xyz=mix(p.xyz, sd*(4.5+fract(aR*43.7)*15.), uScatter);
    p.xyz+=.04*vec3(sin(uT*.8+aR*50.+p.y*1.7),cos(uT*.7+aR*31.+p.z*1.3),sin(uT*.6+aR*17.+p.x*1.5));
    vec4 mv=modelViewMatrix*vec4(p.xyz,1.);
    // cursor magnifier: fisheye lens in screen space (magnifies, no hole)
    vec4 cl=projectionMatrix*mv; vec2 nd=cl.xy/cl.w;
    vec2 asp=vec2(uAspect,1.);
    vec2 dd=(nd-uMouse)*asp; float L=length(dd); float R=.3;
    float x=clamp(L/R,0.,1.); float kk=1.35*uMouseOn;
    float fx=x*(1.+kk)/(1.+kk*x);
    float inL=1.-step(1.,L/R);
    vec2 nd2=uMouse+(dd/max(L,1e-5))*fx*R/asp;
    nd=mix(nd,nd2,inL);
    gl_Position=vec4(nd*cl.w,cl.z,cl.w);
    float z=-mv.z;
    float mag=inL*uMouseOn*(1.-x)*(1.-x);
    gl_PointSize=min(uSize*uPR*(.5+aR*.9)*(15./max(z,.3))*(1.+c*2.)*(1.+uScatter*2.6)*(1.+mag*1.6), 56.);
    vW=mix(p.w,1.,c); vSc=uScatter;
    vA=smoothstep(.35,2.6,z)*(1.-smoothstep(40.,70.,z));
  }`;
const P_FRAG = /* glsl */`
  uniform float uDark,uOpacity; varying float vW,vA,vSc;
  void main(){
    vec2 q=gl_PointCoord-.5; float d=length(q); if(d>.5) discard;
    float a=smoothstep(.5,mix(.12,0.,vSc),d)*(1.-vSc*.55);
    vec3 ink=mix(vec3(.09),vec3(.95),uDark);
    vec3 grey=mix(vec3(.62),vec3(.42),uDark);
    vec3 org=mix(vec3(1.,.42,.21),vec3(1.,.5,.26),uDark);
    vec3 col= vW>=0. ? mix(ink,org,vW) : mix(ink,grey,-vW);
    float al=a*uOpacity*vA*mix(.8,.95,uDark);
    gl_FragColor=vec4(col*al, al);
  }`;

const I_VERT = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const I_FRAG = /* glsl */`
  uniform sampler2D uTex; uniform vec2 uPlane,uImg,uPos; uniform float uZoom,uShift,uHover,uReveal,uTime,uOpacity,uSeed;
  varying vec2 vUv;
  vec2 cover(vec2 uv){ float rs=uPlane.x/uPlane.y, ri=uImg.x/uImg.y;
    vec2 s= rs>ri ? vec2(1., ri/rs) : vec2(rs/ri, 1.);
    return uv*s+(1.-s)*uPos; }
  void main(){
    float r=smoothstep(0.,1.,uReveal);
    float breathe=.018*sin(uTime*.35+uSeed*6.28);
    vec2 drift=vec2(sin(uTime*.22+uSeed*4.),cos(uTime*.18+uSeed*3.))*.008;
    float z=uZoom+breathe+uHover*.045+(1.-r)*.12;
    vec2 uv=(vUv-.5)/z+.5+vec2(0.,uShift)+drift;
    vec3 col=texture2D(uTex,cover(uv)).rgb;
    float al=r*uOpacity;
    gl_FragColor=vec4(col*al,al);
  }`;

const Q_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const Q_FRAG = /* glsl */`
  uniform sampler2D tScene; uniform vec2 uRes; uniform float uTime,uVel,uLight,uGlow,uGrain;
  varying vec2 vUv;
  ${NOISE}
  void main(){
    vec2 uv=vUv, c=uv-.5;
    float ca=.0004+min(abs(uVel),1.)*.0025;
    vec4 base=texture2D(tScene,uv);
    vec3 s=vec3(texture2D(tScene,uv+c*ca).r, base.g, texture2D(tScene,uv-c*ca).b);
    // bloom-lite: two rings of taps
    vec3 g=vec3(0.); vec2 px=1./uRes;
    for(int i=0;i<TAPS;i++){ float a=float(i)*6.2832/float(TAPS)+.3;
      vec2 d=vec2(cos(a),sin(a));
      g+=texture2D(tScene,uv+d*px*7.).rgb*.6; g+=texture2D(tScene,uv+d*px*18.).rgb*.4; }
    g/=float(TAPS); g=max(g-vec3(.32),0.)*1.7;
    // page background with noise dissolve between dark and light
    float asp=uRes.x/uRes.y;
    float n=fbm(vec2(uv.x*asp,uv.y)*3.6+vec2(0.,uTime*.02));
    float p=uLight*1.3-.15;
    float m=smoothstep(n-.012,n+.012,p);
    float edge=(1.-smoothstep(0.,.016,abs(p-n)))*sin(3.14159*clamp(uLight,0.,1.));
    vec3 dark=vec3(.039), light=vec3(1.);
    vec3 bg=mix(dark,light,m)+vec3(1.,.42,.21)*edge*.95;
    vec3 col=s+bg*(1.-base.a);
    col+=g*uGlow*(1.-m*.75);
    float vig=smoothstep(1.15,.25,length(c*vec2(asp*.75,1.)));
    col*=mix(1.,vig,.32*(1.-m));
    col+=(h21(uv*uRes+fract(uTime*7.)*91.)-.5)*uGrain;
    gl_FragColor=vec4(col,1.);
  }`;

/* ================= WebGL setup ================= */
const gl = {};
function initGL() {
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  const dpr = Math.min(devicePixelRatio, mobile ? 1.3 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  // particles
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, .1, 200);
  cam.position.set(0, 0, 16);
  const N = mobile ? 26000 : 44000;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  [shHalo, shBarrel, shSpore, shGyroid, shMolecule, shOrbital].forEach((fn, i) => geo.setAttribute('aS' + i, new THREE.BufferAttribute(fn(N), 4)));
  const rnd = new Float32Array(N); for (let i = 0; i < N; i++) rnd[i] = Math.random();
  geo.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  const pmat = new THREE.ShaderMaterial({
    vertexShader: P_VERT, fragmentShader: P_FRAG, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { uS: { value: 0 }, uT: { value: 0 }, uSize: { value: mobile ? 2.4 : 2.1 }, uPR: { value: dpr }, uDark: { value: 1 }, uOpacity: { value: 0 }, uScatter: { value: 1 }, uHalo: { value: 0 }, uAspect: { value: 1 }, uMouse: { value: new THREE.Vector2(9, 9) }, uMouseOn: { value: finePointer ? 1 : 0 } },
  });
  const holder = new THREE.Group(); holder.add(new THREE.Points(geo, pmat)); scene.add(holder);

  // image planes
  const iscene = new THREE.Scene();
  const icam = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);

  // post
  const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const qmat = new THREE.ShaderMaterial({
    vertexShader: Q_VERT, fragmentShader: Q_FRAG, depthTest: false, depthWrite: false, defines: { TAPS: mobile ? 6 : 10 },
    uniforms: { tScene: { value: rt.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uVel: { value: 0 }, uLight: { value: 0 }, uGlow: { value: mobile ? .9 : 1.25 }, uGrain: { value: .045 } },
  });
  const qscene = new THREE.Scene(); qscene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), qmat));
  const qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  Object.assign(gl, { renderer, scene, cam, holder, pmat, iscene, icam, rt, qmat, qscene, qcam, canvas, planes: [] });
  resizeGL();
  root.classList.add('gl-on');
}
function resizeGL() {
  if (!gl.renderer) return;
  const w = innerWidth, h = innerHeight;
  gl.renderer.setSize(w, h, false);
  const pr = gl.renderer.getPixelRatio();
  gl.rt.setSize(Math.round(w * pr), Math.round(h * pr));
  gl.qmat.uniforms.uRes.value.set(w * pr, h * pr);
  gl.cam.aspect = w / h; gl.cam.updateProjectionMatrix();
  gl.pmat.uniforms.uAspect.value = w / h;
  Object.assign(gl.icam, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 }); gl.icam.updateProjectionMatrix();
}
function initPlanes() {
  const loader = new THREE.TextureLoader();
  const geo = new THREE.PlaneGeometry(1, 1, 32, 24);
  $$('.glm[data-gl]').forEach(el => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: I_VERT, fragmentShader: I_FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uTex: { value: null }, uPlane: { value: new THREE.Vector2(1, 1) }, uImg: { value: new THREE.Vector2(1, 1) }, uMouse: { value: new THREE.Vector2(.5, .5) }, uPos: { value: new THREE.Vector2(.5, .5) },
        uZoom: { value: 1.1 }, uShift: { value: 0 }, uHover: { value: 0 }, uReveal: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uSeed: { value: Math.random() } },
    });
    const pos = (el.dataset.pos || '50% 50%').split(' ').map(v => parseFloat(v) / 100);
    mat.uniforms.uPos.value.set(pos[0], 1 - pos[1]);
    const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; gl.iscene.add(mesh);
    const p = { el, mesh, mat, hover: 0, hoverT: 0, reveal: 0, revealT: 0, mx: .5, my: .5, ready: false };
    loader.load(el.dataset.gl, tex => {
      tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      mat.uniforms.uTex.value = tex; mat.uniforms.uImg.value.set(tex.image.width, tex.image.height); p.ready = true;
    });
    el.addEventListener('pointerenter', () => { p.hoverT = 1; });
    el.addEventListener('pointerleave', () => { p.hoverT = 0; });
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); p.mx = (e.clientX - r.left) / r.width; p.my = 1 - (e.clientY - r.top) / r.height; });
    gl.planes.push(p);
  });
}
function updatePlanes(dt, time, vel) {
  const vw = innerWidth, vh = innerHeight, k = 1 - Math.exp(-dt * 6);
  for (const p of gl.planes) {
    const r = p.el.getBoundingClientRect();
    const vis = p.ready && r.bottom > -50 && r.top < vh + 50 && r.right > -50 && r.left < vw + 50 && r.width > 2;
    p.mesh.visible = vis;
    if (!vis) continue;
    if (r.top < vh * .95 && r.left < vw * .95) p.revealT = 1;
    p.reveal = Math.min(p.revealT, p.reveal + dt * .7 * p.revealT);
    p.hover += (p.hoverT - p.hover) * (1 - Math.exp(-dt * 3));
    const u = p.mat.uniforms;
    p.mesh.position.set(r.left + r.width / 2 - vw / 2, -(r.top + r.height / 2) + vh / 2, 0);
    p.mesh.scale.set(r.width, r.height, 1);
    u.uPlane.value.set(r.width, r.height);
    const prog = clamp((r.top + r.height) / (vh + r.height));
    u.uShift.value = (prog - .5) * .05;
    u.uZoom.value = 1.1;
    u.uHover.value = p.hover; u.uReveal.value = p.reveal; u.uTime.value = time;
  }
}

/* ================= scroll → story ================= */
let keys = [];
function measureKeys() { keys = $$('.k').map(el => [el.getBoundingClientRect().top + scrollY, +el.dataset.k]).sort((a, b) => a[0] - b[0]); }
function storyAt(y) {
  if (!keys.length || y <= keys[0][0]) return 0;
  for (let i = 1; i < keys.length; i++) if (y <= keys[i][0]) { const [y0, k0] = keys[i - 1], [y1, k1] = keys[i]; return lerp(k0, k1, (y - y0) / (y1 - y0)); }
  return keys[keys.length - 1][1];
}
function screenToWorld(px, py) { // point on z=0 plane under screen pixel
  const halfH = Math.tan(THREE.MathUtils.degToRad(17.5)) * 16, halfW = halfH * innerWidth / innerHeight;
  return [(px / innerWidth * 2 - 1) * halfW, -(py / innerHeight * 2 - 1) * halfH];
}
function anchorOf(el) { const r = el.getBoundingClientRect(); return screenToWorld(r.left + r.width * .5, r.top + r.height * .5); }

/* ================= text ================= */
function split(el) {
  const walk = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const w = document.createElement('span'); w.className = 'split-w';
          const inner = document.createElement('span'); inner.textContent = part; w.append(inner); frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') {
        if (n.tagName === 'EM') { const w = document.createElement('span'); w.className = 'split-w'; n.replaceWith(w); const inner = document.createElement('span'); inner.append(n); w.append(inner); }
        else walk(n);
      }
    });
  };
  walk(el);
  return el.querySelectorAll('.split-w>span');
}
const GLYPHS = '▮▯01<>/\\#*+=-_';
function scramble(node, dur = .8) {
  const final = node.dataset.txt ?? (node.dataset.txt = node.textContent);
  const o = { p: 0 };
  gsap.to(o, { p: 1, duration: dur, ease: 'power2.out', onUpdate: () => {
    const n = Math.floor(o.p * final.length);
    let s = final.slice(0, n);
    for (let i = n; i < final.length; i++) s += final[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    node.textContent = s;
  }, onComplete: () => { node.textContent = final; } });
}

/* ================= state ================= */
const hud = { el: $('#hud'), num: $('#hudNum'), name: $('#hudName'), type: $('#hudType'), marker: $('#railMarker'), scale: $('#railScale'), labels: $$('.rail__track span'), rail: $('#rail') };
let lastScene = '', lastType = '', lastLight = -1, footIn = false;
let mxN = 9, myN = 9, mxS = 0, myS = 0, tmx = 0, tmy = 0;
const heroImg = $('.hero__product'), ctaImg = $('.cta__img'), lensHot = $$('.hot')[1];
const sig1 = $('#sigPath'), sig2 = $('#sigPath2'), sigVal = $('#sigVal');

function preload(urls, onP) {
  let n = 0;
  return Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = i.onerror = () => { onP(++n / urls.length); r(); }; i.src = u; })));
}

/* ================= boot ================= */
async function boot() {
  window.__nxBooted = true;
  gsap.registerPlugin(ScrollTrigger);
  gsap.config({ force3D: true });
  root.classList.add('is-loading');
  const imgs = ['p01-cut', 'p02-cut', 'p05-lens', 'p03-angle', 'p04-front', 'm01', 'm02', 'm04', 'm05', 'm06', 'm07', 'm09'].map(n => `../assets/img/${n}.webp`);
  const splits = $$('[data-split]').map(el => ({ el, parts: split(el) }));
  gsap.set('.hero__title .split-w>span', { yPercent: 105 });
  gsap.set('#heroImg', { opacity: 0 });

  if (!reduced) { try { initGL(); } catch (e) { console.warn('WebGL off', e); } }

  // ---- loader HUD ----
  const loadNum = $('#loadNum'), prog = $('#luiProg'), status = $('#luiStatus'), scan = $('#luiScan'), layer = $('#luiLayer'), ticks = $('#luiTicks');
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r0 = i % 5 ? 98 : 94; const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('x1', Math.cos(a) * r0); l.setAttribute('y1', Math.sin(a) * r0); l.setAttribute('x2', Math.cos(a) * 102); l.setAttribute('y2', Math.sin(a) * 102); ticks.append(l); }
  const L = { p: 0, real: 0, z: -6, rz: 0, op: 0, shape: 1, px: 0, py: 0, rx: 0, ry: 0, yk: 0, live: true };
  const STAT = ['INITIALIZING OPTICAL PATH', 'ALIGNING ELEMENTS', 'LOADING SPECIMENS', 'FOCUSING', 'READY'];
  const t0 = performance.now();
  const loaderTick = (time, dtMs) => {
    const dt = dtMs / 1000;
    const target = Math.min(L.real, clamp((performance.now() - t0) / 2600));
    L.p += (target - L.p) * (1 - Math.exp(-dt * 4));
    if (L.live) {
      loadNum.textContent = String(Math.round(L.p * 100)).padStart(3, '0');
      prog.style.strokeDashoffset = (1 - L.p).toFixed(4);
      ticks.style.transform = `rotate(${time * 6}deg)`;
      scan.textContent = (L.p * .987 + Math.sin(time * 9) * .002).toFixed(3);
      layer.textContent = String(1 + Math.min(4, Math.floor(L.p * 5))).padStart(2, '0') + ' / 05';
      const st = STAT[Math.min(4, Math.floor(L.p * 4.999))]; if (status.textContent !== st) status.textContent = st;
      L.rz += dt * .12;
    }
    if (!gl.renderer) return;
    const u = gl.pmat.uniforms;
    u.uS.value = L.shape; u.uT.value = time; u.uDark.value = 1; u.uScatter.value = Math.max(0, 1 - ease(L.p * 1.08)); u.uOpacity.value = Math.min(1, L.op); u.uHalo.value = 0;
    gl.holder.position.set(L.px, L.py, L.z);
    gl.holder.rotation.set(L.rx, time * .1 * L.yk + L.ry, L.rz);
    renderGL(time, 0, 0);
  };
  gsap.ticker.add(loaderTick);
  gsap.to(L, { op: 1, z: 0, duration: 2.2, ease: 'power3.out' });
  await preload(imgs, p => { L.real = p; });
  await document.fonts.ready;
  if (gl.renderer) initPlanes();
  L.real = 1;
  await new Promise(r => { const c = () => (L.p > .985 ? r() : requestAnimationFrame(c)); c(); });
  L.p = 1; loaderTick(gsap.ticker.time, 16); L.live = false;

  // ---- exit: dive through the rings; they re-form as the halo around the product ----
  const [hx, hy] = anchorOf(heroImg);
  const twoPi = Math.PI * 2;
  const tl = gsap.timeline();
  tl.to('#lui > *', { opacity: 0, duration: .5, ease: 'power2.in', stagger: .04 })
    .to('.lui__reticle', { scale: 2.6, opacity: 0, duration: 1.1, ease: 'power3.in' }, 0)
    .to(L, { z: 30, duration: 1.3, ease: 'power3.in' }, .1)
    .to(L, { rz: Math.ceil(L.rz / twoPi) * twoPi + twoPi, duration: 2.6, ease: 'power2.inOut' }, .1)
    .fromTo('#shock1', { scale: 0, opacity: 1 }, { scale: Math.hypot(innerWidth, innerHeight) / 18, opacity: 0, duration: 1.1, ease: 'expo.out' }, 1.25)
    .fromTo('#shock2', { scale: 0, opacity: .7 }, { scale: Math.hypot(innerWidth, innerHeight) / 26, opacity: 0, duration: 1.3, ease: 'expo.out' }, 1.35)
    .set(L, { shape: 1 }, 1.3)
    .to(L, { shape: 0, duration: 1.5, ease: 'power2.inOut' }, 1.3)
    .to(L, { z: 0, px: hx, py: hy, yk: 1, duration: 1.6, ease: 'power3.out' }, 1.3)
    .add(() => { root.classList.remove('is-loading'); $('#lui').style.display = 'none'; }, 1.55);
  if (!reduced) {
    tl.to('.hero__title .split-w>span', { yPercent: 0, duration: 1.3, ease: 'power4.out', stagger: .08, force3D: true }, 1.6)
      .fromTo('#heroImg', { yPercent: 18, opacity: 0, scale: .88 }, { yPercent: 0, opacity: 1, scale: 1, duration: 1.8, ease: 'power3.out', force3D: true }, 1.7)
      .from(['.hero__meta', '.hero__bottom', '.signal', '.marquee', '.hdr', '.hud'], { opacity: 0, y: 16, duration: 1, ease: 'expo.out', stagger: .05 }, 2.0);
  } else gsap.set('.hero__title .split-w>span', { yPercent: 0 });
  tl.add(() => { gsap.ticker.remove(loaderTick); startScroll(splits); }, 2.95);
}

function startScroll(splits) {
  if (reduced) { bindUI(); colorLoop(); return; }
  const lenis = new Lenis({ lerp: .085, wheelMultiplier: .95, touchMultiplier: 1.3 });
  window.__lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  splits.forEach(({ el, parts }) => {
    if (el.closest('.hero')) return;
    gsap.fromTo(parts, { yPercent: 108 }, { yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: .06, force3D: true, scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' } });
  });
  $$('.lead, .note').forEach(el => {
    if (el.closest('.hero')) return;
    gsap.from(el, { opacity: 0, y: 24, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' } });
  });
  $$('.kicker').forEach(k => {
    const node = [...k.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (!node) return;
    const span = document.createElement('span'); span.className = 'scr'; span.textContent = node.textContent; node.replaceWith(span);
    ScrollTrigger.create({ trigger: k, start: 'top 90%', onEnter: () => scramble(span), onEnterBack: () => scramble(span, .5) });
  });

  if (finePointer) {
    const hx = gsap.quickTo('#heroMouse', 'x', { duration: 1.2, ease: 'power3' }), hy = gsap.quickTo('#heroMouse', 'y', { duration: 1.2, ease: 'power3' });
    const hr = gsap.quickTo('#heroMouse', 'rotation', { duration: 1.4, ease: 'power3' });
    const tx = gsap.quickTo('.hero__line', 'x', { duration: 1.6, ease: 'power3' });
    addEventListener('pointermove', e => {
      const nx = e.clientX / innerWidth - .5, ny = e.clientY / innerHeight - .5;
      hx(nx * 46); hy(ny * 30); hr(nx * 2.2); tx(nx * -18);
    }, { passive: true });
  }
  gsap.to('#heroPar', { yPercent: -12, scale: 1.05, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__line.l1', { xPercent: -14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__line.l2', { xPercent: 14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  const mq = gsap.to('#marquee', { xPercent: -50, duration: 22, ease: 'none', repeat: -1 });
  lenis.on('scroll', e => { gsap.to(mq, { timeScale: 1 + Math.min(Math.abs(e.velocity) * .25, 6), duration: .2, overwrite: true }); gsap.to(mq, { timeScale: 1, duration: 1.2, delay: .2 }); });

  gsap.fromTo('#lwLi', { xPercent: -115, opacity: 0 }, { xPercent: 0, opacity: 1, ease: 'power3.out', scrollTrigger: { trigger: '#lens', start: 'top 95%', end: 'top 5%', scrub: 1.2 } });
  gsap.fromTo('#lwRi', { xPercent: 115, opacity: 0 }, { xPercent: 0, opacity: 1, ease: 'power3.out', scrollTrigger: { trigger: '#lens', start: 'top 85%', end: 'top -5%', scrub: 1.2 } });
  const ltl = gsap.timeline({ scrollTrigger: { trigger: '#lens .pinblock', start: 'top top', end: 'bottom bottom', scrub: true } });
  ltl.fromTo('#lwL', { xPercent: 0 }, { xPercent: -95, ease: 'power2.in', duration: 1 }, .25)
    .fromTo('#lwR', { xPercent: 0 }, { xPercent: 95, ease: 'power2.in', duration: 1 }, .25)
    .fromTo('#lensCard', { y: 0 }, { y: () => -(innerHeight + 420), ease: 'none', duration: .9 }, 0)
    .to('#lensSub', { opacity: 0, duration: .2 }, .45);

  const track = $('#galTrack'), galNum = $('#galNum');
  gsap.to(track, { x: () => -(track.scrollWidth - innerWidth), ease: 'none',
    scrollTrigger: { trigger: '#gallery', start: 'top top', end: 'bottom bottom', scrub: true, invalidateOnRefresh: true,
      onUpdate: st => { galNum.textContent = String(Math.min(5, 1 + Math.floor(st.progress * 5.2))).padStart(2, '0'); } } });

  gsap.fromTo('#clipWord', { scale: 1.35, yPercent: 10 }, { scale: 1, yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.clip', start: 'top bottom', end: 'center center', scrub: true } });

  const etl = gsap.timeline({ scrollTrigger: { trigger: '#engPin', start: 'top top', end: 'bottom bottom', scrub: true } });
  etl.from('#engFig', { yPercent: 12, scale: .9, opacity: 0, duration: .5, ease: 'power2.out' }, 0);
  $$('.eng__lines path').forEach((p, i) => {
    const at = .55 + i * .45;
    etl.fromTo($$('.hot')[i], { scale: 0 }, { scale: 1, duration: .15 }, at)
      .fromTo(p, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: .3, ease: 'power1.inOut' }, at + .05)
      .fromTo($$('.co')[i], { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: .25 }, at + .25);
  });
  etl.to({}, { duration: .4 });
  $$('.dcard').forEach((c, i) => gsap.from(c.querySelector('figcaption'), { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', delay: .2 + i * .08, scrollTrigger: { trigger: '.details', start: 'top 80%' } }));
  gsap.from('.row', { y: 50, opacity: 0, duration: 1, ease: 'expo.out', stagger: .08, scrollTrigger: { trigger: '.specs__table', start: 'top 80%' } });
  gsap.fromTo('.specs__img img', { scale: 1.35 }, { scale: 1.05, ease: 'none', scrollTrigger: { trigger: '.specs', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.fromTo('.cta__img', { yPercent: 14 }, { yPercent: -6, ease: 'none', scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('.foot__word', { yPercent: 60, ease: 'expo.out', duration: 1.6, scrollTrigger: { trigger: '.foot', start: 'top 85%' } });
  ScrollTrigger.create({ trigger: '.foot', start: 'top 92%', onToggle: st => { footIn = st.isActive; } });

  bindUI(lenis);
  measureKeys();
  ScrollTrigger.addEventListener('refresh', measureKeys);

  let s = storyAt(lenis.scroll), vel = 0;
  window.__nx = { storyAt, keys: () => keys, get s() { return s; } };
  gsap.ticker.add((time, dtMs) => {
    const dt = Math.min(dtMs / 1000, .1), k = 1 - Math.exp(-dt * 7);
    const target = storyAt(lenis.scroll);
    s += (target - s) * k; if (Math.abs(target - s) < 1e-4) s = target;
    vel += (clamp(lenis.velocity / 45, -1, 1) - vel) * (1 - Math.exp(-dt * 5));
    mxS += (tmx - mxS) * k; myS += (tmy - myS) * k;
    frame(s, time, dt, vel);
  });
}

function setColors(light) {
  const q = Math.round(light * 100) / 100;
  if (q === lastLight) return;
  lastLight = q;
  const onLight = q > .5;
  root.style.setProperty('--bg', onLight ? '#ffffff' : '#0a0a0a');
  root.style.setProperty('--fg', onLight ? '#171717' : '#f2f2f2');
  root.style.setProperty('--fgr', onLight ? '23,23,23' : '242,242,242');
}
function colorLoop() { // reduced-motion: colours only
  measureKeys();
  const f = () => { setColors(curve(C.light, storyAt(scrollY))); requestAnimationFrame(f); }; f();
}

function frame(s, time, dt, vel) {
  const light = curve(C.light, s);
  setColors(light);

  let sc = SCENES[0]; for (const x of SCENES) if (s >= x[0]) sc = x;
  if (sc[1] !== lastScene) { lastScene = sc[1]; hud.num.textContent = sc[1]; hud.name.textContent = sc[2]; }
  let ty = TYPES[0]; for (const x of TYPES) if (s >= x[0]) ty = x;
  if (ty[1] !== lastType) { lastType = ty[1]; hud.type.textContent = ty[1]; }
  const d = curve(C.depth, s);
  hud.marker.style.top = (d * 100) + '%';
  const li = Math.round(d * 4);
  hud.labels.forEach((l, i) => l.classList.toggle('on', i === li));
  if (hud.scale.textContent !== SCALES[li]) hud.scale.textContent = SCALES[li];
  hud.rail.classList.toggle('off', s < .7 || s > 11.3);
  hud.el.style.opacity = (s < .55 || footIn) ? 0 : 1;

  // live signal in hero
  if (s < 1 && sig1) {
    let a = 'M0 27', b = 'M0 27';
    for (let i = 1; i <= 50; i++) {
      const x = i * 4, t = time * 2.4;
      const y1 = 27 + Math.sin(i * .35 + t) * 9 * Math.sin(i * .07 + t * .3) + Math.sin(i * 1.7 + t * 3) * 2;
      const y2 = 27 + Math.sin(i * .22 - t * 1.3) * 13 * Math.exp(-((i - 25 - Math.sin(t * .5) * 12) ** 2) / 90);
      a += ` L${x} ${y1.toFixed(1)}`; b += ` L${x} ${y2.toFixed(1)}`;
    }
    sig1.setAttribute('d', a); sig2.setAttribute('d', b);
    sigVal.textContent = (0.5 + Math.sin(time * 1.3) * .3 + Math.sin(time * 7) * .02).toFixed(3);
  }

  if (!gl.renderer) return;
  const u = gl.pmat.uniforms;
  u.uS.value = curve(C.shape, s);
  u.uT.value = time; u.uScatter.value = 0;
  u.uDark.value = 1 - light;
  u.uOpacity.value = curve(C.opacity, s);
  const halo = curve(C.halo, s); u.uHalo.value = halo;
  u.uMouse.value.set(mxN, myN);

  // placement: hero/cta anchor to the product image, otherwise layout curves
  const heroA = curve(C.heroA, s);
  let gx = mobile ? 0 : curve(C.gx, s), gy = mobile ? curve(C.gx, s) * .62 : 0;
  if (heroA > 0) { const [ax, ay] = anchorOf(heroImg); gx = lerp(gx, ax, heroA); gy = lerp(gy, ay, heroA); }
  const intoLens = curve([[10.6, 0], [11.05, 1], [11.4, 1], [11.6, 0]], s);
  if (intoLens > 0 && lensHot) { const [ax, ay] = anchorOf(lensHot); gx = lerp(gx, ax, intoLens); gy = lerp(gy, ay, intoLens); }
  if (halo > 0) { const [ax, ay] = anchorOf(ctaImg); gx = lerp(gx, ax, halo); gy = lerp(gy, ay, halo); }
  gl.holder.position.set(gx, gy, curve(C.gz, s));
  gl.holder.scale.setScalar(mobile ? lerp(curve(C.mscale, s), .64, Math.max(heroA, halo)) : 1);
  const spin = curve(C.spin, s);
  const haloW = Math.max(heroA, halo);
  const ry = curve(C.rotY, s) + spin * (s * .55 + time * .07);
  gl.holder.rotation.set(lerp(spin * .25 * Math.sin(s * .6), 0, haloW) + myS * .18, lerp(ry, time * .1, haloW) + mxS * .25, 0);

  updatePlanes(dt, time, vel);
  renderGL(time, vel, light);
}

function renderGL(time, vel, light) {
  const r = gl.renderer;
  r.setRenderTarget(gl.rt); r.setClearColor(0x000000, 0); r.clear();
  if (gl.pmat.uniforms.uOpacity.value > .001) r.render(gl.scene, gl.cam);
  r.setRenderTarget(null);
  const q = gl.qmat.uniforms; q.uTime.value = time; q.uVel.value = vel; q.uLight.value = light;
  r.render(gl.qscene, gl.qcam);
  if (gl.planes.some(p => p.mesh.visible)) r.render(gl.iscene, gl.icam); // images sit above the post pass: no bloom wash
}

/* ================= UI ================= */
function bindUI(lenis) {
  $$('[data-to]').forEach(a => a.addEventListener('click', e => {
    const t = $(a.dataset.to); if (!t) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(t, { duration: 2.4, easing: x => 1 - Math.pow(1 - x, 4) }); else t.scrollIntoView();
  }));
  const form = $('#form');
  $('#openForm').addEventListener('click', () => { form.classList.add('open'); setTimeout(() => form.querySelector('input').focus({ preventScroll: true }), 350); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const ok = form.name.value.trim() && /\S+@\S+\.\S+/.test(form.email.value);
    $('#formMsg').textContent = ok ? 'Thank you — concept form, nothing was sent.' : 'Please add your name and a valid email.';
  });
  if (!finePointer || reduced) return;
  root.classList.add('has-cursor');
  const cur = $('#cursor'), txt = $('#cursorTxt');
  const xTo = gsap.quickTo(cur, 'x', { duration: .45, ease: 'power3' }), yTo = gsap.quickTo(cur, 'y', { duration: .45, ease: 'power3' });
  document.addEventListener('pointerover', e => {
    const c = e.target.closest('[data-cursor]'), l = e.target.closest('a,button,input');
    cur.classList.toggle('big', !!c); cur.classList.toggle('link', !c && !!l);
    txt.textContent = c ? c.dataset.cursor : '';
  });
  addEventListener('pointermove', e => { xTo(e.clientX); yTo(e.clientY); }, { passive: true });
  $$('.magnetic').forEach(b => {
    const bx = gsap.quickTo(b, 'x', { duration: .6, ease: 'elastic.out(1,.4)' }), by = gsap.quickTo(b, 'y', { duration: .6, ease: 'elastic.out(1,.4)' });
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); bx((e.clientX - r.left - r.width / 2) * .3); by((e.clientY - r.top - r.height / 2) * .35); });
    b.addEventListener('pointerleave', () => { bx(0); by(0); });
  });
}
addEventListener('pointermove', e => {
  mxN = e.clientX / innerWidth * 2 - 1; myN = -(e.clientY / innerHeight * 2 - 1);
  tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5;
}, { passive: true });
document.addEventListener('pointerleave', () => { mxN = myN = 9; });

let lastW = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastW && mobile) return;
  lastW = innerWidth; mobile = innerWidth < 760;
  resizeGL(); ScrollTrigger.refresh();
});
boot();
