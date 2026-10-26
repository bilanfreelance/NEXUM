/* NEXUM M1 — scroll story engine
   One pinned stage, one scroll value `u` (1u ≈ 100vh of scroll on desktop).
   Product frames and micro frames are "camera tracks": every frame knows the
   log-zoom (z) at which it fills the reference width, and its focus point
   (fx, fy). The camera zoom C(u) decides scale + crossfade of every frame,
   so scrolling forward and backward is always the same deterministic state. */

import * as THREE from 'three';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) root.classList.add('reduced');

/* ---------------- helpers ---------------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
const easeO = t => 1 - Math.pow(1 - clamp(t), 3);
const range = (a, b, x) => clamp((x - a) / (b - a));
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const piece = (pts, x) => { // piecewise linear
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return lerp(y0, y1, easeIO((x - x0) / (x1 - x0)));
  }
  return pts[pts.length - 1][1];
};

/* ---------------- frames ---------------- */
const IMG = 'assets/img/';
const A = [ // product track
  { id: 'p02-product', fx: .47,  fy: .645, z: 0,    ar: 1672 / 941, cover: false, dark: 0 },
  { id: 'p01-hero',    fx: .46,  fy: .66,  z: .49,  ar: 1.5,        cover: false, dark: 0 },
  { id: 'p03-angle',   fx: .455, fy: .66,  z: .97,  ar: 1.5,        cover: true,  dark: 0 },
  { id: 'p04-front',   fx: .5,   fy: .71,  z: 1.29, ar: 1672 / 941, cover: true,  dark: 1, xf: .13, blur: 1 },
  { id: 'p05-lens',    fx: .5,   fy: .65,  z: 1.56, ar: 1618 / 910, cover: true,  dark: 1 },
  { id: 'p06-core',    fx: .5,   fy: .52,  z: 2.1,  ar: 1672 / 941, cover: true,  dark: 1 },
];
const B = [ // micro track
  { id: 'm01', fx: .50, fy: .48, z: 0 },
  { id: 'm02', fx: .56, fy: .52, z: .51 },
  { id: 'm03', fx: .53, fy: .60, z: .76 },
  { id: 'm04', fx: .55, fy: .68, z: 1.02 },
  { id: 'm05', fx: .55, fy: .50, z: 1.44 },
  { id: 'm06', fx: .45, fy: .50, z: 1.80 },
  { id: 'm07', fx: .50, fy: .50, z: 2.12 },
  { id: 'm08', fx: .50, fy: .50, z: 2.44 },
  { id: 'm09', fx: .68, fy: .45, z: 2.76 },
].map(f => ({ ...f, ar: 1672 / 941, cover: true, dark: 1 }));

/* ---------------- timeline (u) ---------------- */
const T = {
  total: 20.4,
  camA: [0.1, 4.4], cA: [-0.18, 2.8],
  portal: [3.5, 4.4],
  camB: [3.5, 10.6], cB: [-0.1, 3.15],
  whiteIn: [9.9, 10.6],
  molIn: [10.4, 11.1], morph: [12.4, 13.3], collapse: [14.4, 15.1],
  whiteOut: [14.5, 15.1], glowIn: [14.45, 15.2], glowOut: [15.45, 15.95],
  retMask: [15.0, 15.85], camR: [15.0, 18.0], cR: [2.95, -0.36],
  retS: [16.7, 18.0],
};
const SCENES = [
  [0, '01', 'SEE BEYOND'], [0.8, '02', 'INTO THE LENS'], [3.9, '03', 'A WORLD WITHIN'],
  [6.5, '04', 'LAYERS OF DETAIL'], [10.4, '05', 'BEYOND THE VISIBLE'], [15.2, '06', 'ENGINEERED TO REVEAL'],
];
const DEPTH = [[0, 0], [3.0, .25], [4.4, .5], [9.9, .6], [10.9, .75], [12.6, .78], [13.3, 1], [14.6, 1], [15.8, .25], [18, 0]];
const SCALE_LABELS = ['≈ 10⁻¹ m', '≈ 10⁻² m', '≈ 10⁻⁵ m', '≈ 10⁻⁹ m', '≈ 10⁻¹⁰ m'];

/* ---------------- DOM ---------------- */
const stage = $('#stage'), journey = $('#journey');
const grpA = $('#grpA'), intro = $('#intro'), grpB = $('#grpB');
const white = $('#white'), glow = $('#glow'), ring = $('#ring'), stageBg = $('#stageBg');
const hud = $('#hud'), hdr = $('#hdr'), rail = $('#rail');
const hudNum = $('#hudNum'), hudName = $('#hudName'), hudType = $('#hudType');
const railMarker = $('#railMarker'), railScale = $('#railScale'), railLabels = $$('.rail__track span');
const overlays = $$('.stage .ov');
const callouts = $$('.callout');
const svg = $('#calloutSvg');

function mkFrames(list, parent) {
  return list.map(f => {
    const img = new Image();
    img.src = IMG + f.id + '.webp';
    img.alt = '';
    img.className = 'frame';
    img.decoding = 'async';
    img.draggable = false;
    parent.appendChild(img);
    return img;
  });
}
const elA = mkFrames(A, intro);
const elB = mkFrames(B, grpB);

/* ---------------- viewport ---------------- */
let vw = innerWidth, vh = innerHeight, k = vw, portrait = false, mobile = false, scrollLen = 1;
function layout() {
  vw = innerWidth; vh = innerHeight;
  portrait = vw / vh < 1.05; mobile = vw < 760;
  k = portrait ? vw * 1.95 : Math.max(vw, vh * 16 / 9);
  const f = mobile ? 0.62 : 0.9;
  scrollLen = T.total * f * vh;
  journey.style.height = (scrollLen + vh) + 'px';
  [[A, elA], [B, elB]].forEach(([list, els]) => list.forEach((fr, i) => {
    els[i].style.width = k + 'px';
    els[i].style.height = (k / fr.ar) + 'px';
  }));
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  if (gl.renderer) resizeGL();
}

/* ---------------- camera track renderer ---------------- */
function placeTrack(list, els, C, Sx, Sy, xf) {
  // opacities
  const op = list.map((f, i) => i === 0 ? 1 : sm(f.z - (f.xf || xf), f.z, C));
  const st = [];
  let covered = false, darkTop = null;
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i], el = els[i];
    if (covered || op[i] <= 0.001) { el.style.visibility = 'hidden'; st[i] = null; continue; }
    const w = k, h = k / f.ar;
    let s = Math.exp(C - f.z);
    const coverS = Math.max(vw / w, vh / h);
    if (f.cover) s = Math.max(s, coverS);
    let x = Sx - f.fx * w * s, y = Sy - f.fy * h * s;
    if (w * s >= vw) x = clamp(x, vw - w * s, 0);
    if (h * s >= vh) y = clamp(y, vh - h * s, 0);
    el.style.visibility = 'visible';
    el.style.opacity = op[i].toFixed(3);
    if (f.blur) el.style.filter = op[i] < .999 ? `blur(${((1 - op[i]) * 10).toFixed(1)}px)` : '';
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(4)})`;
    st[i] = { x, y, s, w, h };
    if (darkTop === null && op[i] > .5) darkTop = f.dark;
    if (op[i] >= .999 && s >= coverS - 1e-3) covered = true;
  }
  return { st, dark: darkTop ?? 0 };
}

function showGrp(el, on) { const d = on ? '' : 'none'; if (el.style.display !== d) el.style.display = d; }
function maskGroup(el, r, feather = 80) {
  if (r <= 0) { showGrp(el, false); return; }
  showGrp(el, true);
  const max = Math.hypot(vw, vh) / 2 + feather;
  if (r >= max) { el.style.webkitMaskImage = el.style.maskImage = 'none'; return; }
  const g = `radial-gradient(circle at ${vw / 2}px ${vh / 2}px, #000 ${Math.max(0, r - feather)}px, transparent ${r}px)`;
  el.style.webkitMaskImage = el.style.maskImage = g;
}

/* ---------------- three.js: molecule + orbital ---------------- */
const gl = {};
const CAFFEINE = { "a": [["C", 3.324, 0.059, -0.234], ["N", 2.058, -0.627, -0.193], ["C", 1.868, -1.981, -0.278], ["N", 0.59, -2.298, -0.209], ["C", -0.049, -1.103, -0.076], ["C", 0.824, -0.058, -0.063], ["C", 0.414, 1.297, 0.064], ["O", 1.21, 2.232, 0.075], ["N", -0.972, 1.436, 0.174], ["C", -1.908, 0.38, 0.164], ["O", -3.118, 0.603, 0.267], ["N", -1.406, -0.916, 0.034], ["C", -2.301, -2.058, 0.016], ["C", -1.517, 2.772, 0.31], ["H", 4.13, -0.671, -0.345], ["H", 3.323, 0.739, -1.089], ["H", 3.452, 0.61, 0.701], ["H", 2.684, -2.684, -0.387], ["H", -3.348, -1.757, 0.112], ["H", -2.05, -2.722, 0.849], ["H", -2.178, -2.593, -0.931], ["H", -2.207, 2.962, -0.519], ["H", -2.079, 2.834, 1.247], ["H", -0.743, 3.544, 0.31]], "b": [[0, 1, 1], [1, 2, 1.5], [2, 3, 1.5], [3, 4, 1.5], [4, 5, 1.5], [5, 6, 1], [6, 7, 2], [6, 8, 1], [8, 9, 1], [9, 10, 2], [9, 11, 1], [11, 12, 1], [8, 13, 1], [5, 1, 1.5], [11, 4, 1], [0, 14, 1], [0, 15, 1], [0, 16, 1], [2, 17, 1], [12, 18, 1], [12, 19, 1], [12, 20, 1], [13, 21, 1], [13, 22, 1], [13, 23, 1]] };

function initGL() {
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, .1, 100);
  cam.position.set(0, 0, 15);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d9d9, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb48a, 1.1); rim.position.set(-6, -2, -5); scene.add(rim);

  const holder = new THREE.Group(); scene.add(holder);

  // molecule
  const mol = new THREE.Group(); holder.add(mol);
  const COL = { C: 0x2b2b2b, N: 0x9a9a9a, O: 0xff6b35, H: 0xf4f4f4 };
  const RAD = { C: .36, N: .34, O: .34, H: .2 };
  const sph = new THREE.SphereGeometry(1, 40, 28);
  const mats = {};
  for (const e in COL) mats[e] = new THREE.MeshPhysicalMaterial({ color: COL[e], roughness: e === 'H' ? .35 : .28, metalness: e === 'C' ? .15 : 0, clearcoat: .6, clearcoatRoughness: .25 });
  const P = CAFFEINE.a.map(([e, x, y, z]) => new THREE.Vector3(x, y, z));
  CAFFEINE.a.forEach(([e], i) => { const m = new THREE.Mesh(sph, mats[e]); m.position.copy(P[i]); m.scale.setScalar(RAD[e]); mol.add(m); });
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  const bondMat = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: .4, metalness: .2 });
  const up = new THREE.Vector3(0, 1, 0);
  CAFFEINE.b.forEach(([a, b, o]) => {
    const pa = P[a], pb = P[b], d = pb.clone().sub(pa), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize());
    const off = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(.1);
    const n = o === 2 ? 2 : 1, r = o === 1.5 ? .085 : .06;
    for (let j = 0; j < n; j++) {
      const m = new THREE.Mesh(cyl, bondMat);
      m.position.copy(pa).addScaledVector(d, .5);
      if (n === 2) m.position.addScaledVector(off, j ? 1 : -1);
      m.quaternion.copy(q); m.scale.set(r, len, r);
      mol.add(m);
    }
  });
  mol.rotation.set(.4, 0, .15);

  // orbital: hydrogen 3d_z2, |ψ|² ∝ r⁴ e^(−2r/3) (3cos²θ − 1)²   (Bohr units)
  const N = mobile ? 14000 : 30000;
  const pos = new Float32Array(N * 3), den = new Float32Array(N);
  let n = 0; const R = 26, MAX = 95;
  while (n < N) {
    const x = (Math.random() * 2 - 1) * R, y = (Math.random() * 2 - 1) * R, z = (Math.random() * 2 - 1) * R;
    const r = Math.hypot(x, y, z); if (r < 1e-3 || r > R) continue;
    const c = y / r, ang = 3 * c * c - 1;
    const d = Math.pow(r, 4) * Math.exp(-2 * r / 3) * ang * ang;
    if (Math.random() * MAX < d) { pos.set([x * .17, y * .17, z * .17], n * 3); den[n] = clamp(d / 60); n++; }
  }
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  og.setAttribute('aD', new THREE.BufferAttribute(den, 1));
  const orbMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uExpand: { value: 0 }, uCollapse: { value: 0 }, uSize: { value: mobile ? 2.2 : 2.6 }, uPR: { value: renderer.getPixelRatio() }, uOpacity: { value: 0 } },
    vertexShader: `attribute float aD; uniform float uExpand,uCollapse,uSize,uPR; varying float vD;
      void main(){ vec3 p=position*max(uExpand,.001)*(1.0-uCollapse*.992);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=uSize*uPR*(.55+aD*.9)*(10./-mv.z)*(1.0+uCollapse*.6); vD=aD; }`,
    fragmentShader: `uniform float uOpacity,uCollapse; varying float vD;
      void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard;
        float a=smoothstep(.5,.05,d)*uOpacity*(.28+.72*vD);
        vec3 lo=vec3(.42), hi=vec3(.09);
        vec3 col=mix(lo,hi,smoothstep(.15,.9,vD));
        col=mix(col,vec3(1.,.42,.21),smoothstep(.55,1.,vD)*.85);
        col=mix(col,vec3(1.,.55,.3),uCollapse);
        gl_FragColor=vec4(col,a); }`,
  });
  const orb = new THREE.Points(og, orbMat); holder.add(orb);
  orb.rotation.set(.35, 0, .2);

  Object.assign(gl, { renderer, scene, cam, holder, mol, orb, orbMat, canvas });
  resizeGL();
}
function resizeGL() {
  gl.renderer.setSize(vw, vh, false);
  gl.cam.aspect = vw / vh; gl.cam.updateProjectionMatrix();
}
function renderGL(u, t) {
  if (!gl.renderer) return;
  const vis = sm(9.95, 10.4, u) * (1 - sm(15.0, 15.3, u));
  gl.canvas.style.opacity = vis.toFixed(3);
  if (vis <= 0) return;
  const mIn = easeO(range(...T.molIn, u)), morph = sm(...T.morph, u), col = sm(...T.collapse, u);
  const ms = mIn * (1 - morph) * (mobile ? .62 : .8);
  gl.mol.visible = ms > .002;
  gl.mol.scale.setScalar(Math.max(ms, .001));
  gl.mol.rotation.y = u * 1.1 + t * .12;
  gl.mol.rotation.x = .4 + Math.sin(u * .9) * .25;
  gl.orb.visible = morph > 0;
  gl.orbMat.uniforms.uExpand.value = easeO(morph);
  gl.orbMat.uniforms.uCollapse.value = col;
  gl.orbMat.uniforms.uOpacity.value = morph * (1 - sm(14.85, 15.1, u));
  gl.orb.rotation.y = u * .7 + t * .08;
  // object sits right of text on desktop, drifts to centre for the collapse into light
  const baseX = portrait ? 0 : 3.1, baseY = portrait ? .9 : 0;
  gl.holder.position.x = lerp(baseX, 0, sm(13.9, 14.7, u));
  gl.holder.position.y = lerp(baseY, 0, sm(13.9, 14.7, u));
  gl.renderer.render(gl.scene, gl.cam);
}

/* ---------------- callouts ---------------- */
const svgNS = 'http://www.w3.org/2000/svg';
const co = callouts.map(el => {
  const [ax, ay] = el.dataset.a.split(',').map(Number);
  const line = document.createElementNS(svgNS, 'line');
  const d = document.createElementNS(svgNS, 'circle'); d.setAttribute('class', 'd'); d.setAttribute('r', 4);
  const r = document.createElementNS(svgNS, 'circle'); r.setAttribute('class', 'r'); r.setAttribute('r', 11);
  svg.append(line, r, d);
  return { el, ax, ay, side: el.dataset.l, ly: +el.dataset.y, tin: +el.dataset.in, line, d, r };
});
function placeCallouts(u, frame) {
  co.forEach((c, i) => {
    const o = sm(c.tin, c.tin + .45, u);
    if (!frame || o <= 0) { c.el.style.visibility = 'hidden'; c.line.style.opacity = c.d.style.opacity = c.r.style.opacity = 0; return; }
    const px = frame.x + c.ax * frame.w * frame.s, py = frame.y + c.ay * frame.h * frame.s;
    let lx, ly, ex;
    if (mobile) {
      lx = 16; ly = vh * .64 + i * 62;
      c.el.style.width = (vw - 32) + 'px';
      ex = null;
    } else {
      const wl = 220;
      ly = vh * c.ly;
      const prodLeft = frame.x + .29 * frame.w * frame.s;
      lx = Math.max(vw * .045, prodLeft - wl - 70);
      ex = lx + wl;
      c.el.style.width = wl + 'px';
    }
    c.el.style.visibility = 'visible';
    c.el.style.opacity = o;
    c.el.style.transform = `translate3d(${lx}px,${ly + (1 - o) * 16}px,0)`;
    c.d.setAttribute('cx', px); c.d.setAttribute('cy', py);
    c.r.setAttribute('cx', px); c.r.setAttribute('cy', py);
    c.d.style.opacity = o; c.r.style.opacity = o * .9;
    c.r.setAttribute('r', 6 + 6 * o);
    if (ex !== null) {
      const tx = lerp(px, ex, o), ty = lerp(py, ly, o);
      c.line.setAttribute('x1', px); c.line.setAttribute('y1', py);
      c.line.setAttribute('x2', tx); c.line.setAttribute('y2', ty);
      c.line.style.opacity = 1;
    } else c.line.style.opacity = 0;
  });
}

/* ---------------- overlays ---------------- */
const ovData = overlays.map(el => ({ el, a: +el.dataset.in, b: el.dataset.out ? +el.dataset.out : 99, hero: el.classList.contains('ov--hero') }));
function placeOverlays(u) {
  ovData.forEach(o => {
    const fi = o.a < 0 ? 1 : sm(o.a, o.a + .4, u);
    const fo = 1 - sm(o.b - .4, o.b, u);
    const v = fi * fo;
    o.el.style.visibility = v > .002 ? 'visible' : 'hidden';
    o.el.style.opacity = v.toFixed(3);
    if (o.hero) {
      const p = sm(.05, o.b, u);
      o.el.style.transform = `translate3d(0,${-p * 8}vh,0)`;
      o.el.style.filter = p > .01 ? `blur(${(p * 6).toFixed(1)}px)` : '';
    } else {
      const dy = (1 - fi) * 28 - (1 - fo) * 28;
      const base = o.el.classList.contains('ov--beyond') || o.el.classList.contains('ov--smaller') ? (mobile ? '' : ' translateY(-50%)') : '';
      o.el.style.transform = `translate3d(0,${dy.toFixed(1)}px,0)${base}`;
    }
  });
}

/* ---------------- main render ---------------- */
let uTarget = 0, u = 0, lastSceneIdx = -1, inJourney = true, afterScene = null;
function render(t) {
  // --- product track (forward + return share the same frames)
  const fwd = u < 12;
  let CA, Sx, Sy, vis;
  const heroSx = portrait ? .5 : .67, heroSy = portrait ? .7 : .6;
  if (fwd) {
    CA = lerp(T.cA[0], T.cA[1], easeIO(range(...T.camA, u)));
    const s = easeIO(range(0.15, 1.9, u));
    Sx = lerp(heroSx, .5, s) * vw; Sy = lerp(heroSy, .5, s) * vh;
    vis = u < T.portal[1] + .05;
  } else {
    CA = lerp(T.cR[0], T.cR[1], easeIO(range(...T.camR, u)));
    const s = easeIO(range(...T.retS, u));
    const endSx = portrait ? .5 : .63, endSy = portrait ? .5 : .6;
    Sx = lerp(.5, endSx, s) * vw; Sy = lerp(.5, endSy, s) * vh;
    vis = u > T.retMask[0];
  }
  let dark = 0, lastA = null;
  if (vis) {
    const r = placeTrack(A, elA, CA, Sx, Sy, .22);
    dark = r.dark; lastA = r.st[0];
    grpA.classList.toggle('top', !fwd);
    if (fwd) { showGrp(grpA, true); grpA.style.webkitMaskImage = grpA.style.maskImage = 'none'; }
    else maskGroup(grpA, easeIO(range(...T.retMask, u)) * (Math.hypot(vw, vh) / 2 + 80), 120);
  } else showGrp(grpA, false);

  // --- micro track
  const bVis = u > T.portal[0] && u < T.whiteIn[1] + .05;
  if (bVis) {
    const CB = lerp(T.cB[0], T.cB[1], range(...T.camB, u));
    const r = placeTrack(B, elB, CB, vw / 2, vh / 2, .2);
    const pr = range(...T.portal, u);
    const R = Math.pow(pr, 1.6) * (Math.hypot(vw, vh) / 2 + 90);
    maskGroup(grpB, R, 90);
    ring.style.opacity = (Math.sin(pr * Math.PI) * .9).toFixed(3);
    ring.style.width = ring.style.height = (R * 2 - 90) + 'px';
    if (pr > .5) dark = 1;
  } else { showGrp(grpB, false); ring.style.opacity = 0; }

  // --- white / dark background states
  const wv = sm(...T.whiteIn, u) * (1 - sm(...T.whiteOut, u));
  white.style.opacity = wv.toFixed(3);
  white.style.visibility = wv > 0 ? 'visible' : 'hidden';
  stageBg.style.background = (u > 9.5 && u < 17) ? '#0a0a0a' : '#fff';
  if (u > 10.3 && u < 14.75) dark = 0;
  if (u >= 14.75 && u < 15.4) dark = 1;

  // --- glow bridge (light returns gradually, never as a flash)
  const gi = sm(...T.glowIn, u), go = 1 - sm(...T.glowOut, u);
  glow.style.opacity = (gi * go).toFixed(3);
  glow.style.transform = `scale(${(.05 + gi * .95 + (1 - go) * .4).toFixed(3)})`;

  renderGL(u, t);
  placeOverlays(u);
  placeCallouts(u, !fwd && vis ? lastA : null);

  // --- HUD
  const isDark = inJourney && dark > .5;
  hud.classList.toggle('is-dark', isDark);
  hdr.classList.toggle('is-dark', isDark);
  if (inJourney) {
    let idx = 0; SCENES.forEach((s, i) => { if (u >= s[0]) idx = i; });
    if (idx !== lastSceneIdx) { lastSceneIdx = idx; hudNum.textContent = SCENES[idx][1]; hudName.textContent = SCENES[idx][2]; }
    const d = piece(DEPTH, u);
    railMarker.style.top = (d * 100) + '%';
    const li = Math.round(d * 4);
    railLabels.forEach((l, i) => l.classList.toggle('on', i === li));
    railScale.textContent = SCALE_LABELS[li];
    let type = 'PRODUCT RENDER · NEXUM M1';
    if (u > 3.9 && u < 10.3) type = 'ARTISTIC MICROSTRUCTURE VISUALIZATION · NOT AN M1 CAPTURE';
    else if (u >= 10.3 && u < 12.9) type = 'MOLECULAR MODEL · CAFFEINE C₈H₁₀N₄O₂';
    else if (u >= 12.9 && u < 14.9) type = 'ATOMIC MODEL · HYDROGEN 3dz² |ψ|²';
    if (hudType.textContent !== type) hudType.textContent = type;
  }
}

/* ---------------- scroll ---------------- */
let lenis = null;
function journeyTop() { return journey.getBoundingClientRect().top + scrollY; }
function readScroll() {
  const y = (lenis ? lenis.scroll : scrollY) - journeyTop();
  uTarget = clamp(y / scrollLen) * T.total;
  const rect = journey.getBoundingClientRect();
  inJourney = rect.bottom > vh * .5;
  rail.classList.toggle('off', !inJourney);
  hudType.style.opacity = inJourney ? '' : 0;
}
function goTo(uVal) {
  const y = journeyTop() + (uVal / T.total) * scrollLen;
  if (lenis) lenis.scrollTo(y, { duration: 2.2 }); else scrollTo({ top: y, behavior: 'smooth' });
}

/* ---------------- after-journey scenes ---------------- */
function setupSections() {
  gsap.registerPlugin(ScrollTrigger);
  $$('section[data-scene]').forEach(sec => {
    ScrollTrigger.create({
      trigger: sec, start: 'top 55%', end: 'bottom 55%',
      onToggle: s => { if (s.isActive) { hudNum.textContent = sec.dataset.scene; hudName.textContent = sec.dataset.name; lastSceneIdx = -1; } },
      onLeaveBack: () => { lastSceneIdx = -1; },
    });
  });
  if (reduced) return;
  $$('.specs .row').forEach((r, i) => r.classList.add('rv'));
  gsap.to('.specs .row', { opacity: 1, y: 0, duration: .8, ease: 'expo.out', stagger: .08, scrollTrigger: { trigger: '.specs__table', start: 'top 75%' } });
  ['.specs__head > *', '.cta__text > *:not(.form)', '.cta__img'].forEach(sel => {
    gsap.from(sel, { opacity: 0, y: 40, duration: 1.1, ease: 'expo.out', stagger: .08, scrollTrigger: { trigger: sel, start: 'top 85%' } });
  });
}

/* ---------------- boot ---------------- */
function preload(urls, onProgress) {
  let done = 0;
  return Promise.all(urls.map(u => new Promise(res => {
    const im = new Image(); im.onload = im.onerror = () => { done++; onProgress(done / urls.length); res(); }; im.src = u;
  })));
}

async function boot() {
  layout();
  const loadNum = $('#loadNum'), loadBar = $('#loadBar');
  let shown = 0, target = 0;
  const tickLoader = () => { shown += (target - shown) * .15; loadNum.textContent = String(Math.round(shown * 100)).padStart(2, '0'); loadBar.style.transform = `scaleX(${shown})`; if (shown < .995) requestAnimationFrame(tickLoader); else { loadNum.textContent = '100'; } };
  requestAnimationFrame(tickLoader);
  const first = A.map(f => IMG + f.id + '.webp');
  const rest = B.map(f => IMG + f.id + '.webp');
  await preload(first, p => target = p * .6);
  const restP = preload(rest, p => target = .6 + p * .4);
  if (!reduced) await Promise.race([restP, new Promise(r => setTimeout(r, 6000))]);
  target = 1;
  await new Promise(r => setTimeout(r, 450));
  $('#loader').classList.add('done');

  if (reduced) { setupSections(); bindUI(); return; }

  try { initGL(); } catch (e) { console.warn('WebGL unavailable', e); }

  lenis = new Lenis({ lerp: .09, wheelMultiplier: .9, touchMultiplier: 1.4 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(time => { lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);

  setupSections();
  bindUI();

  // hero intro
  gsap.from('.hero__title .line > span', { yPercent: 110, duration: 1.3, ease: 'expo.out', stagger: .09, delay: .1 });
  gsap.from(['.hero__meta', '.hero__sub', '.hero__cta', '.hero__foot'], { opacity: 0, y: 18, duration: 1, ease: 'expo.out', stagger: .07, delay: .35 });
  gsap.from(intro, { opacity: 0, x: 60, scale: 1.03, transformOrigin: '70% 60%', duration: 1.8, ease: 'expo.out', delay: .05 });
  gsap.from(['.hdr', '.hud'], { opacity: 0, duration: 1, delay: .6 });

  readScroll(); u = uTarget;
  gsap.ticker.add(time => {
    readScroll();
    u += (uTarget - u) * .35;
    if (Math.abs(uTarget - u) < 1e-4) u = uTarget;
    render(time);
  });
}

function bindUI() {
  $$('[data-go]').forEach(a => a.addEventListener('click', e => {
    if (reduced) return;
    e.preventDefault(); goTo(+a.dataset.go);
  }));
  $$('a[href="#specs"], a[href="#demo"]').forEach(a => a.addEventListener('click', e => {
    if (!lenis) return; e.preventDefault(); lenis.scrollTo(a.getAttribute('href'), { duration: 1.6 });
  }));
  const form = $('#form');
  $('#openForm').addEventListener('click', () => { form.classList.add('open'); setTimeout(() => form.querySelector('input').focus({ preventScroll: true }), 300); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const ok = form.name.value.trim() && /\S+@\S+\.\S+/.test(form.email.value);
    $('#formMsg').textContent = ok ? 'Thank you — this is a concept form, no data was sent.' : 'Please add your name and a valid email.';
  });
}

let rT;
let lastW = innerWidth, lastH = innerHeight;
addEventListener('resize', () => {
  // ignore mobile URL-bar height jitter
  if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 160) return;
  lastW = innerWidth; lastH = innerHeight;
  clearTimeout(rT); rT = setTimeout(() => { layout(); if (window.ScrollTrigger) ScrollTrigger.refresh(); }, 120);
});
boot();
