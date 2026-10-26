/* NEXUM M1 — GPU particle story.
   One fixed WebGL canvas behind the page. 42k particles hold five shapes at once
   (objective barrel, spore, gyroid, molecule, orbital) and morph between them in
   the vertex shader, driven by a single damped scroll value `s`.
   Photos live in the DOM as editorial blocks animated with transforms only. */

import * as THREE from 'three';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
if (reduced) root.classList.add('reduced');

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
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
let mobile = innerWidth < 760;

/* ============ story curves (in "key" units, see .k markers) ============ */
const C = {
  opacity: [[0, 1], [1.08, 1], [3.05, 1], [3.25, .3], [3.85, .3], [4.05, 0], [4.7, 0], [5.0, 1], [11.0, 1], [11.35, 0]],
  heroA: [[0.3, 1], [0.95, 0]],
  shape: [[2.0, 0], [2.5, 1], [4.6, 1], [4.95, 2], [6.6, 2], [7.05, 3], [8.55, 3], [9.05, 4], [10.55, 4], [11.15, 5]],
  dark: [[1.3, 0], [1.5, 1], [6.62, 1], [6.82, 0]],
  gz: [[1.12, 0], [2.02, 34], [2.5, 0]],
  gx: [[1.0, 2.4], [1.3, 0], [2.25, 0], [2.6, 2.9], [4.6, 2.9], [5.0, 0], [6.6, 0], [7.05, 3], [10.55, 3], [11.1, 0]],
  rotY: [[1.0, -.75], [1.3, 0]],
  spin: [[2.1, 0], [2.5, 1]],
  depth: [[0, 0], [1.6, .25], [2.4, .5], [6.6, .5], [7.05, .75], [8.6, .75], [9.05, 1], [10.6, 1], [11.3, 0]],
};
const SCENES = [[-1, '01', 'SEE BEYOND'], [0.75, '02', 'INTO THE LENS'], [2.25, '03', 'A WORLD WITHIN'], [4.4, '04', 'LAYERS OF DETAIL'],
  [6.8, '05', 'BEYOND THE VISIBLE'], [10.9, '06', 'ENGINEERED TO REVEAL'], [11.9, '07', 'PRECISION, DEFINED'], [12.9, '08', 'LOOK CLOSER']];
const TYPES = [[-1, 'PRODUCT RENDER · NEXUM M1'], [1.0, 'PARTICLE MODEL · OPTICAL PATH'], [2.3, 'PARTICLE MODEL · SPORE-LIKE STRUCTURE'],
  [3.05, 'ARTISTIC VISUALIZATIONS · NOT M1 CAPTURES'], [4.85, 'MODEL · GYROID MINIMAL SURFACE'], [6.9, 'MOLECULAR MODEL · CAFFEINE C₈H₁₀N₄O₂'],
  [8.9, 'ATOMIC MODEL · HYDROGEN 3dz² |ψ|²'], [10.9, 'PRODUCT RENDER · NEXUM M1']];
const SCALES = ['≈ 10⁻¹ m', '≈ 10⁻² m', '≈ 10⁻⁵ m', '≈ 10⁻⁹ m', '≈ 10⁻¹⁰ m'];

/* ============ particle shapes ============ */
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
function shBarrel(N) { // objective barrel: rings + lens discs + glowing core at the end
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
    } else {
      x = gauss() * .22; y = gauss() * .22; z = -K * step + gauss() * .5; w = .95;
    }
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
  const a = new Float32Array(N * 4), R = 6.2, f = 1.15;
  let i = 0;
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
  const a = new Float32Array(N * 4), R = 26, MAX = 95, S = .19;
  let i = 0;
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

/* ============ WebGL ============ */
const gl = {};
function initGL() {
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.6));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, .1, 200);
  cam.position.set(0, 0, 16);
  const N = mobile ? 22000 : 44000;
  const geo = new THREE.BufferGeometry();
  const base = new Float32Array(N * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  [shBarrel, shSpore, shGyroid, shMolecule, shOrbital, shHalo].forEach((fn, i) => geo.setAttribute('aS' + i, new THREE.BufferAttribute(fn(N), 4)));
  const rnd = new Float32Array(N); for (let i = 0; i < N; i++) rnd[i] = Math.random();
  geo.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    uniforms: { uS: { value: 0 }, uT: { value: 0 }, uSize: { value: mobile ? 2.4 : 2.1 }, uPR: { value: renderer.getPixelRatio() }, uDark: { value: 0 }, uOpacity: { value: 0 }, uScatter: { value: 0 }, uHero: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec4 aS0,aS1,aS2,aS3,aS4,aS5; attribute float aR;
      uniform float uS,uT,uSize,uPR,uScatter,uHero;
      varying float vW; varying float vA; varying float vSc;
      vec4 shp(float i){ if(i<.5) return aS0; if(i<1.5) return aS1; if(i<2.5) return aS2; if(i<3.5) return aS3; return aS4; }
      void main(){
        float s=clamp(uS,0.,4.);
        float i0=min(floor(s),3.); float t=s-i0;
        float tt=smoothstep(aR*.42, aR*.42+.58, t);
        vec4 p=mix(shp(i0), shp(i0+1.), tt);
        float arc=sin(3.14159*tt);
        vec3 dir=normalize(vec3(sin(aR*91.7),cos(aR*53.3),sin(aR*17.9+1.)));
        p.xyz+=dir*arc*(1.2+aR*2.8);
        float th=smoothstep(aR*.4,aR*.4+.6,uHero); p=mix(p,aS5,th); p.xyz+=dir*sin(3.14159*th)*(1.5+aR*2.5);
        vec3 sd=normalize(vec3(sin(aR*91.3+1.7),cos(aR*47.1+.3),sin(aR*23.9+2.9)));
        p.xyz=mix(p.xyz, sd*(4.5+fract(aR*43.7)*15.), uScatter);
        p.xyz+=.04*vec3(sin(uT*.8+aR*50.+p.y*1.7),cos(uT*.7+aR*31.+p.z*1.3),sin(uT*.6+aR*17.+p.x*1.5));
        float c=clamp(uS-4.,0.,1.)*(1.-uHero);
        p.xyz*=1.-c*.988;
        vec4 mv=modelViewMatrix*vec4(p.xyz,1.);
        gl_Position=projectionMatrix*mv;
        float z=-mv.z;
        gl_PointSize=min(uSize*uPR*(.5+aR*.9)*(15./max(z,.3))*(1.+c*2.)*(1.+uScatter*2.6), 48.);
        vSc=uScatter;
        vW=mix(p.w,1.,c);
        vA=smoothstep(.35,2.6,z)*(1.-smoothstep(40.,70.,z));
      }`,
    fragmentShader: /* glsl */`
      uniform float uDark,uOpacity; varying float vW,vA,vSc;
      void main(){
        vec2 q=gl_PointCoord-.5; float d=length(q); if(d>.5) discard;
        float a=smoothstep(.5,mix(.12,0.,vSc),d)*(1.-vSc*.55);
        vec3 ink=mix(vec3(.09),vec3(.95),uDark);
        vec3 grey=mix(vec3(.66),vec3(.42),uDark);
        vec3 org=mix(vec3(1.,.42,.21),vec3(1.,.5,.26),uDark);
        vec3 col= vW>=0. ? mix(ink,org,vW) : mix(ink,grey,-vW);
        gl_FragColor=vec4(col, a*uOpacity*vA*mix(.78,.92,uDark));
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  const holder = new THREE.Group(); holder.add(pts); scene.add(holder);
  Object.assign(gl, { renderer, scene, cam, mat, holder, pts, canvas });
  resizeGL();
}
function resizeGL() {
  if (!gl.renderer) return;
  gl.renderer.setSize(innerWidth, innerHeight, false);
  gl.cam.aspect = innerWidth / innerHeight; gl.cam.updateProjectionMatrix();
}

/* ============ scroll → story value ============ */
let keys = [];
function measureKeys() {
  keys = $$('.k').map(el => [el.getBoundingClientRect().top + scrollY, +el.dataset.k]).sort((a, b) => a[0] - b[0]);
}
function storyAt(y) {
  if (y <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (y <= keys[i][0]) {
    const [y0, k0] = keys[i - 1], [y1, k1] = keys[i];
    return lerp(k0, k1, (y - y0) / (y1 - y0));
  }
  return keys[keys.length - 1][1];
}

/* ============ text splitting ============ */
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

/* ============ DOM refs ============ */
const hud = { num: $('#hudNum'), name: $('#hudName'), type: $('#hudType'), marker: $('#railMarker'), scale: $('#railScale'), labels: $$('.rail__track span'), rail: $('#rail') };
let lastScene = '', lastType = '', lastDark = -1, footIn = false;

/* ============ boot ============ */
function preload(urls, onP) {
  let n = 0;
  return Promise.all(urls.map(u => new Promise(r => { const i = new Image(); i.onload = i.onerror = () => { onP(++n / urls.length); r(); }; i.src = u; })));
}

async function boot() {
  gsap.registerPlugin(ScrollTrigger);
  gsap.config({ force3D: true });
  const imgs = ['p01-cut', 'p02-cut', 'p05-lens', 'p01-hero', 'm01', 'm02', 'm04', 'm05', 'm06', 'm07', 'm09'].map(n => `assets/img/${innerWidth < 760 ? 'sm/' : ''}${n}.webp`);
  const splits = $$('[data-split]').map(el => ({ el, parts: split(el) }));
  gsap.set('#heroImg', { opacity: 0 });
  gsap.set('.hero__title .split-w>span', { yPercent: 105 });

  // ---- loader: particles focus from bokeh into the objective rings ----
  if (!reduced) { try { initGL(); } catch (e) { console.warn('WebGL off', e); } }
  root.classList.add('is-loading');
  const loadNum = $('#loadNum'), prog = $('#luiProg'), status = $('#luiStatus'), scan = $('#luiScan'), layer = $('#luiLayer');
  const ticks = $('#luiTicks');
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, r0 = i % 5 ? 98 : 94; const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); l.setAttribute('x1', Math.cos(a) * r0); l.setAttribute('y1', Math.sin(a) * r0); l.setAttribute('x2', Math.cos(a) * 102); l.setAttribute('y2', Math.sin(a) * 102); ticks.append(l); }
  const L = { p: 0, real: 0, scatter: 1, z: -6, spin: 0, op: 0, active: !!gl.renderer };
  const STAT = ['INITIALIZING OPTICAL PATH', 'ALIGNING ELEMENTS', 'LOADING SPECIMENS', 'FOCUSING', 'READY'];
  const t0 = performance.now();
  const loaderTick = (time, dt) => {
    const minT = clamp((performance.now() - t0) / 2600);
    const target = Math.min(L.real, minT);
    L.p += (target - L.p) * (1 - Math.exp(-dt / 1000 * 4));
    const pct = Math.round(L.p * 100);
    loadNum.textContent = String(pct).padStart(3, '0');
    prog.style.strokeDashoffset = (1 - L.p).toFixed(4);
    ticks.style.transform = `rotate(${time * 6}deg)`;
    scan.textContent = (L.p * 0.987 + Math.sin(time * 9) * .002).toFixed(3);
    layer.textContent = String(1 + Math.min(4, Math.floor(L.p * 5))).padStart(2, '0') + ' / 05';
    const st = STAT[Math.min(4, Math.floor(L.p * 4.999))]; if (status.textContent !== st) status.textContent = st;
    if (!L.active) return;
    L.scatter = Math.max(0, 1 - ease(L.p * 1.08));
    const u = gl.mat.uniforms;
    u.uS.value = 0; u.uT.value = time; u.uDark.value = 1; u.uScatter.value = L.scatter;
    u.uOpacity.value = Math.min(1, L.op);
    gl.canvas.style.opacity = 1;
    gl.holder.position.set(0, 0, L.z);
    gl.holder.rotation.set(0, 0, time * .12 + L.spin);
    gl.renderer.render(gl.scene, gl.cam);
  };
  gsap.ticker.add(loaderTick);
  gsap.to(L, { op: 1, z: 0, duration: 2.2, ease: 'power3.out' });
  await preload(imgs, p => { L.real = p; });
  await document.fonts.ready;
  L.real = 1;
  await new Promise(r => { const c = () => (L.p > .985 ? r() : requestAnimationFrame(c)); c(); });
  L.p = 1; loaderTick(gsap.ticker.time, 16);

  // ---- exit: dive through the rings, iris opens onto the hero ----
  const diag = Math.hypot(innerWidth, innerHeight) / 20 * 1.08;
  const tl = gsap.timeline();
  tl.to('#lui > *', { opacity: 0, duration: .5, ease: 'power2.in', stagger: .04 })
    .to('.lui__reticle', { scale: 2.4, opacity: 0, duration: 1.1, ease: 'power3.in' }, 0)
    .to(L, { z: 30, spin: 1.4, duration: 1.5, ease: 'power3.in' }, .15)
    .to('#irisRing', { scale: diag, duration: 1.15, ease: 'expo.inOut' }, .95)
    .to('#irisFill', { scale: diag, duration: 1.05, ease: 'expo.inOut' }, 1.08)
    .add(() => {
      gsap.ticker.remove(loaderTick);
      root.classList.remove('is-loading');
      $('#loader').style.display = 'none'; $('#lui').style.display = 'none';
      if (gl.mat) { gl.mat.uniforms.uScatter.value = 0; gl.canvas.style.opacity = 0; }
    }, 2.1)
    .to(intro, { k: 1, duration: 2.2, ease: 'power2.out' }, 2.1)
    .to('#iris', { opacity: 0, duration: .45, ease: 'power1.out', onComplete: () => { $('#iris').style.display = 'none'; } }, 2.12);
  if (!reduced) {
    tl.to('.hero__title .split-w>span', { yPercent: 0, duration: 1.3, ease: 'power4.out', stagger: .08, force3D: true }, 2.22)
      .fromTo('#heroImg', { yPercent: 16, opacity: 0, scale: .9, rotate: -2 }, { yPercent: 0, opacity: 1, scale: 1, rotate: 0, duration: 1.7, ease: 'power3.out', force3D: true }, 2.3)
      .from(['.hero__meta', '.hero__bottom', '.marquee', '.hdr', '.hud'], { opacity: 0, y: 16, duration: 1, ease: 'expo.out', stagger: .05 }, 2.55);
  } else {
    gsap.set('.hero__title .split-w>span', { yPercent: 0 }); gsap.set('#heroImg', { opacity: 1 });
  }
  if (reduced) { bindUI(); return; }

  // smooth scroll
  const lenis = new Lenis({ lerp: .085, wheelMultiplier: .95, touchMultiplier: 1.3 });
  window.__lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  // heading reveals
  splits.forEach(({ el, parts }) => {
    if (el.closest('.hero')) return;
    gsap.fromTo(parts, { yPercent: 108 }, { yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: .06, force3D: true, scrollTrigger: { trigger: el, start: 'top 82%', toggleActions: 'play none none reverse' } });
  });
  $$('.lead, .note, .kicker').forEach(el => {
    if (el.closest('.hero')) return;
    gsap.from(el, { opacity: 0, y: 24, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' } });
  });

  // hero parallax on exit
  if (finePointer) {
    const hx = gsap.quickTo('#heroMouse', 'x', { duration: 1.2, ease: 'power3' }), hy = gsap.quickTo('#heroMouse', 'y', { duration: 1.2, ease: 'power3' });
    const hr = gsap.quickTo('#heroMouse', 'rotation', { duration: 1.4, ease: 'power3' }), tx = gsap.quickTo('.hero__line', 'x', { duration: 1.6, ease: 'power3' });
    addEventListener('pointermove', e => { const nx = e.clientX / innerWidth - .5, ny = e.clientY / innerHeight - .5; hx(nx * 46); hy(ny * 30); hr(nx * 2.2); tx(nx * -18); }, { passive: true });
  }
  gsap.fromTo('#lwLi', { xPercent: -115, opacity: 0 }, { xPercent: 0, opacity: 1, ease: 'power3.out', scrollTrigger: { trigger: '#lens', start: 'top 95%', end: 'top 5%', scrub: 1.2 } });
  gsap.fromTo('#lwRi', { xPercent: 115, opacity: 0 }, { xPercent: 0, opacity: 1, ease: 'power3.out', scrollTrigger: { trigger: '#lens', start: 'top 85%', end: 'top -5%', scrub: 1.2 } });
  gsap.to('#heroPar', { yPercent: -12, scale: 1.05, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__line.l1', { xPercent: -14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__line.l2', { xPercent: 14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

  // marquee (speeds up with scroll velocity)
  const mq = gsap.to('#marquee', { xPercent: -50, duration: 22, ease: 'none', repeat: -1 });
  lenis.on('scroll', e => { gsap.to(mq, { timeScale: 1 + Math.min(Math.abs(e.velocity) * .25, 6), duration: .2, overwrite: true }); gsap.to(mq, { timeScale: 1, duration: 1.2, delay: .2 }); });

  // lens: words split apart while we dive
  const lensPin = $('#lens .pinblock');
  const ltl = gsap.timeline({ scrollTrigger: { trigger: lensPin, start: 'top top', end: 'bottom bottom', scrub: true } });
  ltl.fromTo('#lwL', { xPercent: 0 }, { xPercent: -95, ease: 'power2.in', duration: 1 }, .25)
    .fromTo('#lwR', { xPercent: 0 }, { xPercent: 95, ease: 'power2.in', duration: 1 }, .25)
    .fromTo('#lensCard', { y: 0 }, { y: () => -(innerHeight * 1.0 + 420), ease: 'none', duration: .9 }, 0)
    .to('#lensSub', { opacity: 0, duration: .2 }, .45);

  // gallery horizontal scroll
  const track = $('#galTrack'), galNum = $('#galNum');
  gsap.to(track, {
    x: () => -(track.scrollWidth - innerWidth), ease: 'none',
    scrollTrigger: { trigger: '#gallery', start: 'top top', end: 'bottom bottom', scrub: true, invalidateOnRefresh: true,
      onUpdate: st => { galNum.textContent = String(Math.min(5, 1 + Math.floor(st.progress * 5.2))).padStart(2, '0'); } },
  });
  $$('.gcard img').forEach(img => gsap.fromTo(img, { scale: 1.18 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '#gallery', start: 'top top', end: 'bottom bottom', scrub: true } }));

  // clip word + bleed
  gsap.fromTo('#clipWord', { scale: 1.35, yPercent: 10 }, { scale: 1, yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.clip', start: 'top bottom', end: 'center center', scrub: true } });
  gsap.fromTo('#bleed1 img', { scale: 1.3, yPercent: -6 }, { scale: 1, yPercent: 6, ease: 'none', scrollTrigger: { trigger: '#bleed1', start: 'top bottom', end: 'bottom top', scrub: true } });

  // engineered: callouts draw in
  const etl = gsap.timeline({ scrollTrigger: { trigger: '#engPin', start: 'top top', end: 'bottom bottom', scrub: true } });
  etl.from('#engFig', { yPercent: 12, scale: .9, opacity: 0, duration: .5, ease: 'power2.out' }, 0);
  $$('.eng__lines path').forEach((p, i) => {
    const at = .55 + i * .45;
    etl.fromTo($$('.hot')[i], { scale: 0 }, { scale: 1, duration: .15 }, at)
      .fromTo(p, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: .3, ease: 'power1.inOut' }, at + .05)
      .fromTo($$('.co')[i], { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: .25 }, at + .25);
  });
  etl.to({}, { duration: .4 });
  $$('.dcard').forEach((c, i) => gsap.from(c, { y: 90, opacity: 0, duration: 1.2, ease: 'expo.out', delay: i * .08, scrollTrigger: { trigger: '.details', start: 'top 85%' } }));

  // specs rows
  gsap.from('.row', { y: 50, opacity: 0, duration: 1, ease: 'expo.out', stagger: .08, scrollTrigger: { trigger: '.specs__table', start: 'top 80%' } });
  gsap.fromTo('.specs__img img', { scale: 1.35 }, { scale: 1.05, ease: 'none', scrollTrigger: { trigger: '.specs', start: 'top bottom', end: 'bottom top', scrub: true } });

  // cta
  gsap.fromTo('.cta__img', { yPercent: 18 }, { yPercent: -8, ease: 'none', scrollTrigger: { trigger: '.cta', start: 'top bottom', end: 'bottom top', scrub: true } });
  gsap.from('.foot__word', { yPercent: 60, ease: 'expo.out', duration: 1.6, scrollTrigger: { trigger: '.foot', start: 'top 85%' } });

  ScrollTrigger.create({ trigger: '.foot', start: 'top 92%', onToggle: st => { footIn = st.isActive; } });
  bindUI(lenis);
  measureKeys();
  ScrollTrigger.addEventListener('refresh', measureKeys);

  // story loop
  let s = storyAt(scrollY), mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - .5; tmy = e.clientY / innerHeight - .5; }, { passive: true });
  gsap.ticker.add((time, dt) => {
    const target = storyAt(lenis.scroll);
    const k = 1 - Math.exp(-(dt / 1000) * 7);
    s += (target - s) * k; if (Math.abs(target - s) < 1e-4) s = target;
    mx += (tmx - mx) * k; my += (tmy - my) * k;
    frame(s, time, mx, my);
  });
}

function frame(s, time, mx, my) {
  // background + foreground colours
  const dark = curve(C.dark, s);
  const dq = Math.round(dark * 100) / 100;
  if (dq !== lastDark) {
    lastDark = dq;
    const bg = Math.round(lerp(255, 10, dq)), fg = Math.round(lerp(23, 245, dq));
    root.style.setProperty('--bg', `rgb(${bg},${bg},${bg})`);
    root.style.setProperty('--fg', `rgb(${fg},${fg},${fg})`);
    const onDark = dq > .5 && s > 1 && s < 10.9;
    $('#hdr').style.color = onDark ? '#f5f5f5' : '';
  }
  // HUD
  let sc = SCENES[0]; for (const x of SCENES) if (s >= x[0]) sc = x;
  if (sc[1] !== lastScene) { lastScene = sc[1]; hud.num.textContent = sc[1]; hud.name.textContent = sc[2]; }
  let ty = TYPES[0]; for (const x of TYPES) if (s >= x[0]) ty = x;
  if (s > 11.6) ty = [0, ''];
  if (ty[1] !== lastType) { lastType = ty[1]; hud.type.textContent = ty[1]; }
  const d = curve(C.depth, s);
  hud.marker.style.top = (d * 100) + '%';
  const li = Math.round(d * 4);
  hud.labels.forEach((l, i) => l.classList.toggle('on', i === li));
  if (hud.scale.textContent !== SCALES[li]) hud.scale.textContent = SCALES[li];
  hud.rail.classList.toggle('off', s < .7 || s > 11.3);
  const hudEl = $('#hud'); const hudDark = (s > 11.7 && s < 12.9) || (s > 13.85);
  hudEl.style.color = hudDark ? '#f5f5f5' : '';
  hudEl.style.opacity = (s < .55 || footIn) ? 0 : 1;

  // particles
  if (!gl.renderer || root.classList.contains('is-loading')) return;
  const op = curve(C.opacity, s);
  gl.canvas.style.opacity = op > 0 ? 1 : 0;
  if (op <= 0.001) return;
  const u = gl.mat.uniforms;
  const heroA = curve(C.heroA, s);
  u.uS.value = curve(C.shape, s);
  u.uT.value = time;
  u.uDark.value = dark;
  u.uHero.value = heroA;
  u.uOpacity.value = op * lerp(1, intro.k, heroA);
  u.uScatter.value = (1 - intro.k) * heroA;
  let sx = mobile ? 0 : curve(C.gx, s), sy = mobile ? curve(C.gx, s) * .55 : 0;
  if (heroA > 0) { const [ax, ay] = anchorOf(heroFig); sx = lerp(sx, ax, heroA); sy = lerp(sy, ay, heroA); }
  gl.holder.position.set(sx, sy, curve(C.gz, s));
  gl.holder.scale.setScalar(mobile ? lerp(1, .64, heroA) : 1);
  const spin = curve(C.spin, s);
  gl.holder.rotation.y = lerp(curve(C.rotY, s) + spin * (s * .55 + time * .07), time * .1, heroA) + mx * .25;
  gl.holder.rotation.x = lerp(spin * .25 * Math.sin(s * .6), 0, heroA) + my * .18;
  gl.renderer.render(gl.scene, gl.cam);
}

const intro = { k: 0 };
const heroFig = document.querySelector('.hero__product');
function anchorOf(el) {
  const r = el.getBoundingClientRect(), halfH = Math.tan(THREE.MathUtils.degToRad(17.5)) * 16, halfW = halfH * innerWidth / innerHeight;
  return [((r.left + r.width / 2) / innerWidth * 2 - 1) * halfW, -((r.top + r.height / 2) / innerHeight * 2 - 1) * halfH];
}
/* ============ UI ============ */
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
  addEventListener('pointermove', e => { xTo(e.clientX); yTo(e.clientY); }, { passive: true });
  document.addEventListener('pointerover', e => {
    const c = e.target.closest('[data-cursor]'), l = e.target.closest('a,button,input');
    cur.classList.toggle('big', !!c); cur.classList.toggle('link', !c && !!l);
    txt.textContent = c ? c.dataset.cursor : '';
  });
  // magnetic buttons
  $$('.magnetic').forEach(b => {
    const bx = gsap.quickTo(b, 'x', { duration: .6, ease: 'elastic.out(1,.4)' }), by = gsap.quickTo(b, 'y', { duration: .6, ease: 'elastic.out(1,.4)' });
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); bx((e.clientX - r.left - r.width / 2) * .3); by((e.clientY - r.top - r.height / 2) * .35); });
    b.addEventListener('pointerleave', () => { bx(0); by(0); });
  });
}

let lastW = innerWidth;
addEventListener('resize', () => {
  if (innerWidth === lastW && mobile) return;
  lastW = innerWidth; mobile = innerWidth < 760;
  resizeGL(); ScrollTrigger.refresh();
});
boot();
