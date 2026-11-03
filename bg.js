/* WebGL "aether" behind the whole site (light Aqua Nebula theme).
   Layers (back to front): a slow flowing aether wash with resonance ripples that
   pulse out whenever a new chapter takes over, rising diamond motes, the main ink
   particle field that morphs between shapes as sections scroll into view, and a
   short trail of motes that follows the pointer.

   Each <section data-shape data-x data-y data-o data-s> picks a shape, offset
   (fraction of half the viewport), opacity and scale. If the section contains an
   element with [data-anchor], the shape is centred on and sized to that element
   (optional data-k multiplies the size). */
import * as THREE from 'three';

const canvas = document.querySelector('.bg-canvas');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
} catch {
  renderer = null;
}
if (!renderer || !renderer.getContext()) document.documentElement.classList.add('no-webgl');
else start();

function start() {
  const small = Math.min(innerWidth, innerHeight) < 600;
  const N = small ? 5200 : 10000;
  let rnd = mulberry32(20261103);

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 0, 8);

  /* ================================================================ aether wash + ripples */
  const aetherU = {
    uTime: { value: 0 }, uScroll: { value: 0 }, uAspect: { value: 1 }, uPointer: { value: new THREE.Vector2() },
    uRip: { value: [new THREE.Vector3(0, 0, -99), new THREE.Vector3(0, 0, -99), new THREE.Vector3(0, 0, -99)] },
    uRift: { value: new THREE.Vector4(0, 0, 0, 0.3) },
  };
  const aether = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: aetherU, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uScroll, uAspect; uniform vec2 uPointer; uniform vec3 uRip[3]; uniform vec4 uRift; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
      void main() {
        vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
        vec2 q = p * 1.4 + vec2(uTime * 0.012, -uScroll * 0.6);
        vec2 w = vec2(fbm(q + uPointer * 0.05), fbm(q + 4.3 - uTime * 0.01));
        float f = fbm(q * 1.2 + w * 1.6);
        // flowing ribbons of light: thin bright bands where the warped field crosses fixed levels
        float band = smoothstep(0.03, 0.0, abs(fract(f * 3.2 + uTime * 0.01) - 0.5) - 0.44);
        vec3 teal = vec3(0.184, 0.627, 0.776), surf = vec3(0.345, 0.788, 0.953), mist = vec3(0.741, 0.898, 1.0), steel = vec3(0.110, 0.306, 0.459);
        vec3 col = mix(mist, surf, smoothstep(0.35, 0.75, f));
        col = mix(col, teal, smoothstep(0.62, 0.85, w.x) * 0.6);
        float a = smoothstep(0.38, 0.8, f) * 0.22 + band * 0.07;
        // resonance ripples: expanding rings from where the last chapter woke up
        float rip = 0.0;
        for (int i = 0; i < 3; i++) {
          vec3 r = uRip[i]; float age = uTime - r.z;
          if (age < 0.0 || age > 3.2) continue;
          float d = length(p - r.xy), rad = age * 0.55, life = 1.0 - age / 3.2;
          rip += (exp(-pow((d - rad) * 26.0, 2.0)) + 0.5 * exp(-pow((d - rad * 0.72) * 34.0, 2.0))) * life * life;
        }
        col = mix(col, steel, clamp(rip, 0.0, 1.0) * 0.55);
        a += rip * 0.32;
        // nebula rift: a cross-shaped tear of light behind the current emblem
        vec2 d = (p - uRift.xy) / uRift.w;
        float fl = 0.6 + 0.8 * fbm(d * 2.2 + vec2(uTime * 0.05, 0.0));
        float arm = exp(-abs(d.y) * 9.0 / fl) * exp(-abs(d.x) * 0.9);
        float spine = exp(-abs(d.x) * 22.0 / fl) * exp(-abs(d.y) * 1.6);
        float core = exp(-length(d) * 4.5);
        float rift = (arm * 0.6 + spine * 0.75 + core) * uRift.z;
        col = mix(col, mix(teal, vec3(1.0), clamp(core * 1.4, 0.0, 1.0)), clamp(rift, 0.0, 1.0) * 0.7);
        a += rift * 0.22;
        float vign = smoothstep(1.3, 0.25, length(p * vec2(0.75, 1.1)));
        gl_FragColor = vec4(col, a * (0.55 + 0.45 * vign));
      }`,
  }));
  aether.renderOrder = 0;
  aether.frustumCulled = false;
  scene.add(aether);
  let ripI = 0;
  function ripple(sx, sy) {
    aetherU.uRip.value[ripI].set((sx - 0.5) * camera.aspect, 0.5 - sy, aetherU.uTime.value);
    ripI = (ripI + 1) % 3;
  }

  /* ================================================================ rising diamond motes */
  const moteMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uH: { value: 10 } },
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uPR, uH; attribute float aSize; attribute float aPhase; attribute float aSpeed;
      varying float vA; varying float vTw;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * aSpeed + uH * 0.5, uH) - uH * 0.5;
        p.x += sin(uTime * 0.4 + aPhase * 12.0) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPR * (10.0 / -mv.z);
        vA = smoothstep(uH * 0.5, uH * 0.3, abs(p.y));
        vTw = 0.5 + 0.5 * sin(uTime * (0.8 + aPhase * 1.6) + aPhase * 30.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vTw;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = abs(uv.x) + abs(uv.y);              // diamond
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float glint = max(0.0, 1.0 - abs(uv.x) * 18.0) * max(0.0, 1.0 - abs(uv.y) * 2.0);
        vec3 col = mix(vec3(0.184, 0.627, 0.776), vec3(1.0), core * 0.55);
        gl_FragColor = vec4(col, (core * 0.75 + glint * 0.4) * vA * (0.35 + 0.65 * vTw) * 0.8);
      }`,
  });
  const MOTES = small ? 70 : 140;
  const mg = new THREE.BufferGeometry();
  {
    const p = new Float32Array(MOTES * 3), s = new Float32Array(MOTES), ph = new Float32Array(MOTES), sp = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      p.set([(rnd() - 0.5) * 16, (rnd() - 0.5) * 10, -2 - rnd() * 6], i * 3);
      s[i] = 4 + rnd() * 9; ph[i] = rnd(); sp[i] = 0.08 + rnd() * 0.22;
    }
    mg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    mg.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
    mg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    mg.setAttribute('aSpeed', new THREE.BufferAttribute(sp, 1));
  }
  const motes = new THREE.Points(mg, moteMat);
  motes.frustumCulled = false; motes.renderOrder = 1;
  scene.add(motes);

  /* ================================================================ morphing ink particle field */
  function sphere() {
    const a = new Float32Array(N * 3), shell = Math.floor(N * 0.8), ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < shell; i++) {
      const y = 1 - (i / (shell - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i, k = 1.6 * (1 + (rnd() - 0.5) * 0.04);
      a.set([Math.cos(th) * r * k, y * k, Math.sin(th) * r * k], i * 3);
    }
    for (let i = shell; i < N; i++) {
      const b = i % 3, tilt = 0.6 + b * 0.95, off = b * 2.1, t = rnd() * Math.PI * 2;
      const x = Math.cos(t);
      let z = Math.sin(t), y = Math.sin(t * 2 + off) * 0.28 + (rnd() - 0.5) * 0.12;
      const yy = y * Math.cos(tilt) - z * Math.sin(tilt); z = y * Math.sin(tilt) + z * Math.cos(tilt); y = yy;
      const m = Math.hypot(x, y, z) / 1.64;
      a.set([x / m, y / m, z / m], i * 3);
    }
    return a;
  }
  // concentric rings, tick marks, four lens petals and a central diamond, all in one plane
  function seal() {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const c = rnd(); let x, y;
      if (c < 0.30) { const t = rnd() * Math.PI * 2, r = (rnd() < 0.6 ? 2.05 : 1.62) + (rnd() - 0.5) * 0.02; x = Math.cos(t) * r; y = Math.sin(t) * r; }
      else if (c < 0.44) { const k = Math.floor(rnd() * 72), t = k / 72 * Math.PI * 2, r = 2.12 + rnd() * (k % 6 === 0 ? 0.32 : 0.14); x = Math.cos(t) * r; y = Math.sin(t) * r; }
      else if (c < 0.74) {
        const k = Math.floor(rnd() * 4), base = k * Math.PI / 2 + Math.PI / 4, u = rnd() * 2 - 1, side = rnd() < 0.5 ? 1 : -1;
        const r = 0.95 + (u + 1) * 0.5 * 0.7, w = Math.sin((u + 1) * 0.5 * Math.PI) * 0.26 * side;
        x = Math.cos(base) * r - Math.sin(base) * w; y = Math.sin(base) * r + Math.cos(base) * w;
      } else if (c < 0.9) { const t = rnd() * 4, e = Math.floor(t), f = t - e, P = [[0, 0.82], [0.5, 0], [0, -0.82], [-0.5, 0], [0, 0.82]]; x = P[e][0] + (P[e + 1][0] - P[e][0]) * f; y = P[e][1] + (P[e + 1][1] - P[e][1]) * f; }
      else { const t = rnd() * Math.PI * 2, r = 1.18 + (rnd() - 0.5) * 0.02; x = Math.cos(t) * r; y = Math.sin(t) * r; }
      a.set([x, y, (rnd() - 0.5) * 0.06], i * 3);
    }
    return a;
  }
  // eight-pointed star crest with a halo
  function crest() {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      let x, y;
      if (rnd() < 0.72) {
        const k = Math.floor(rnd() * 8), long = k % 2 === 0, base = k * Math.PI / 4, L = long ? 2.3 : 1.35, W = long ? 0.3 : 0.22;
        const t = rnd(), side = rnd() < 0.5 ? 1 : -1, r = t * L, w = (1 - t) * W * side * (rnd() < 0.8 ? 1 : rnd());
        x = Math.cos(base) * r - Math.sin(base) * w; y = Math.sin(base) * r + Math.cos(base) * w;
      } else { const t = rnd() * Math.PI * 2, r = 1.7 + (rnd() - 0.5) * 0.05; x = Math.cos(t) * r; y = Math.sin(t) * r; }
      a.set([x, y, (rnd() - 0.5) * 0.1], i * 3);
    }
    return a;
  }
  function helix() {
    const a = new Float32Array(N * 3), rungs = Math.floor(N * 0.16), turns = 3.2, c = Math.cos(0.38), s2 = Math.sin(0.38);
    for (let i = 0; i < N; i++) {
      let x, y, z;
      if (i < N - rungs) {
        const s = i % 2, t = rnd(), ang = t * Math.PI * 2 * turns + s * Math.PI, r = 0.85 + (rnd() - 0.5) * 0.12;
        x = Math.cos(ang) * r; z = Math.sin(ang) * r; y = (t - 0.5) * 4.4 + (rnd() - 0.5) * 0.05;
      } else {
        const step = Math.floor(rnd() * 26), t = (step + 0.5) / 26, ang = t * Math.PI * 2 * turns, u = rnd() * 2 - 1;
        x = Math.cos(ang) * 0.85 * u; z = Math.sin(ang) * 0.85 * u; y = (t - 0.5) * 4.4;
      }
      a.set([x * c - y * s2, x * s2 + y * c, z], i * 3);
    }
    return a;
  }
  function wave() {
    const a = new Float32Array(N * 3), cols = Math.round(Math.sqrt(N * 1.7)), rows = Math.ceil(N / cols);
    const c = Math.cos(-1.05), s = Math.sin(-1.05);
    for (let i = 0; i < N; i++) {
      const x = ((i % cols) / (cols - 1) - 0.5) * 9, z = (Math.floor(i / cols) / (rows - 1) - 0.5) * 5.4;
      const y = 0.3 * Math.sin(x * 1.3) + 0.22 * Math.cos(z * 1.7 + x * 0.6) + 0.08 * Math.sin((x + z) * 3.2);
      a.set([x + (rnd() - 0.5) * 0.02, y * c - z * s, y * s + z * c], i * 3);
    }
    return a;
  }
  function circuit() {
    const a = new Float32Array(N * 3), pts = [], W = 8.4, H = 4.8, cell = 0.16;
    for (const [cx, cy, w, h] of [[-2.4, 0.6, 1.1, 0.8], [1.6, -0.5, 1.3, 1.0], [0.1, 1.3, 0.7, 0.5]]) {
      for (let t = 0; t < 1; t += 0.004) {
        const p = t * 2 * (w + h);
        let x, y;
        if (p < w) { x = cx - w / 2 + p; y = cy - h / 2; }
        else if (p < w + h) { x = cx + w / 2; y = cy - h / 2 + (p - w); }
        else if (p < 2 * w + h) { x = cx + w / 2 - (p - w - h); y = cy + h / 2; }
        else { x = cx - w / 2; y = cy + h / 2 - (p - 2 * w - h); }
        pts.push([x, y]);
      }
    }
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (pts.length < N) {
      let x = Math.floor(rnd() * (W / cell)) * cell - W / 2, y = Math.floor(rnd() * (H / cell)) * cell - H / 2, d = (Math.floor(rnd() * 4) * 2) % 8;
      const len = 6 + Math.floor(rnd() * 22);
      for (let s = 0; s < len && pts.length < N; s++) {
        if (rnd() < 0.18) d = (d + (rnd() < 0.5 ? 1 : 7)) % 8;
        const nx = x + dirs[d][0] * cell, ny = y + dirs[d][1] * cell;
        if (Math.abs(nx) > W / 2 || Math.abs(ny) > H / 2) break;
        for (let k = 0; k < 6 && pts.length < N; k++) pts.push([x + ((nx - x) * k) / 6, y + ((ny - y) * k) / 6]);
        x = nx; y = ny;
      }
      pts.push([x, y], [x + 0.02, y], [x, y + 0.02]);
    }
    const rx = -0.42, ry = 0.28;
    for (let i = 0; i < N; i++) {
      const [x, y] = pts[i], z = (rnd() - 0.5) * 0.04;
      const y1 = y * Math.cos(rx) - z * Math.sin(rx), z1 = y * Math.sin(rx) + z * Math.cos(rx);
      a.set([x * Math.cos(ry) + z1 * Math.sin(ry), y1, -x * Math.sin(ry) + z1 * Math.cos(ry)], i * 3);
    }
    return a;
  }
  function torus() {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = rnd() * Math.PI * 2, r = Math.cos(3 * t) + 2.2, u = rnd() * Math.PI * 2, v = 0.34 * Math.sqrt(rnd());
      a.set([(r * Math.cos(2 * t) + Math.cos(u) * v) * 0.55, (r * Math.sin(2 * t) + Math.sin(u) * v) * 0.55, (-Math.sin(3 * t) + Math.sin(u + 1) * v) * 0.55], i * 3);
    }
    return a;
  }
  // resonance gem: framed orb with swept wings, a crown spark and a pendant (same outline as the page SVG, 1 unit = 110 svg px / 1.6)
  function gem() {
    const a = new Float32Array(N * 3), u = 1.6 / 110, cub = (p0, p1, p2, p3, t) => { const m = 1 - t; return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3; };
    const wings = [
      [57, -16, 78, -30, 96, -50, 104, -80], [104, -80, 94, -62, 82, -54, 70, -50], [70, -50, 86, -42, 95, -30, 99, -12], [99, -12, 88, -19, 76, -20, 64, -12],
      [60, 8, 77, 12, 90, 24, 95, 42], [95, 42, 83, 32, 72, 28, 60, 25],
    ];
    const poly = (P, t) => { const n = P.length - 1, f = t * n, e = Math.min(n - 1, Math.floor(f)), g = f - e; return [P[e][0] + (P[e + 1][0] - P[e][0]) * g, P[e][1] + (P[e + 1][1] - P[e][1]) * g]; };
    const crown = [[0, -60], [9, -80], [0, -118], [-9, -80], [0, -60]], pend = [[0, 60], [9, 77], [0, 102], [-9, 77], [0, 60]];
    for (let i = 0; i < N; i++) {
      const c = rnd(); let x, y;
      if (c < 0.26) { const t = rnd() * Math.PI * 2, r = (rnd() < 0.55 ? 61 : 55) + (rnd() - 0.5) * 1.5; x = Math.cos(t) * r; y = Math.sin(t) * r; }
      else if (c < 0.36) { const t = rnd() * Math.PI * 2, r = 86 + (rnd() - 0.5) * 3; x = Math.cos(t) * r; y = Math.sin(t) * r; }
      else if (c < 0.7) { const w = wings[Math.floor(rnd() * wings.length)], t = rnd(); x = cub(w[0], w[2], w[4], w[6], t); y = cub(w[1], w[3], w[5], w[7], t); if (rnd() < 0.5) x = -x; }
      else if (c < 0.8) { [x, y] = poly(crown, rnd()); }
      else if (c < 0.86) { [x, y] = poly(pend, rnd()); }
      else if (c < 0.9) { const k = rnd() * 2 - 1, h = rnd() < 0.5; x = h ? k * 17 : 0; y = -84 + (h ? 0 : k * 17); }
      else { const t = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 50; x = Math.cos(t) * r; y = Math.sin(t) * r; }
      a.set([x * u, -y * u, (rnd() - 0.5) * 0.06], i * 3);
    }
    return a;
  }
  // echo: a symmetric soundwave strung on a line, with star nodes along it
  function echo() {
    const a = new Float32Array(N * 3), bars = 120, amp = [];
    for (let b = 0; b < bars; b++) { const x = (b / (bars - 1) - 0.5) * 7; amp.push(Math.exp(-((x / 1.5) ** 2)) * 1.25 * (0.3 + 0.7 * rnd()) + 0.04); }
    const star = (cx, s) => { const t = rnd(), arm = Math.floor(rnd() * 4), r = t * s, w = (1 - t) * s * 0.2 * (rnd() * 2 - 1);
      return arm % 2 ? [cx + w, arm === 1 ? r : -r] : [cx + (arm === 0 ? r : -r), w]; };
    for (let i = 0; i < N; i++) {
      const c = rnd(); let x, y;
      if (c < 0.72) { const b = Math.floor(rnd() * bars); x = (b / (bars - 1) - 0.5) * 7; y = (rnd() * 2 - 1) * amp[b]; }
      else if (c < 0.84) { x = (rnd() - 0.5) * 8.4; y = (rnd() - 0.5) * 0.02; }
      else { const k = Math.floor(rnd() * 5), cx = [-2.4, -1.2, 0, 1.2, 2.4][k]; [x, y] = star(cx, [0.28, 0.4, 0.62, 0.4, 0.28][k]); }
      a.set([x, y, (rnd() - 0.5) * 0.08], i * 3);
    }
    return a;
  }
  const shapes = { sphere: sphere(), seal: seal(), crest: crest(), helix: helix(), wave: wave(), circuit: circuit(), torus: torus(), gem: gem(), echo: echo() };
  // spin: 1 = turn around Y, 'z' = slow turn in the picture plane (flat sigils), 0 = settle facing the viewer
  const SPIN = { sphere: 1, helix: 1, torus: 1, seal: 'z', crest: 'z', wave: 0, circuit: 0, gem: 0, echo: 0 };

  rnd = mulberry32(99);
  const pos = new Float32Array(N * 3), tone = new Float32Array(N), seed = new Float32Array(N), kk = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = 6 + rnd() * 6, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph) - 4], i * 3);
    tone[i] = rnd(); seed[i] = rnd(); kk[i] = 0.025 + rnd() * 0.06;
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aTone', new THREE.BufferAttribute(tone, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
  const uniforms = {
    uTime: { value: 0 }, uSize: { value: small ? 34 : 30 }, uPR: { value: renderer.getPixelRatio() },
    uOpacity: { value: 0 }, uMouse: { value: new THREE.Vector2(9, 9) }, uMouseOn: { value: 0 }, uAspect: { value: 1 }, uPulse: { value: 0 },
  };
  const field = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uSize, uPR, uMouseOn, uAspect, uPulse; uniform vec2 uMouse;
      attribute float aTone; attribute float aSeed;
      varying float vTone; varying float vFade; varying float vHot;
      void main() {
        vec3 p = position * (1.0 + uPulse * 0.06 * sin(aSeed * 6.28 + uTime * 3.0));
        p.x += 0.03 * sin(uTime * 0.9 + aSeed * 31.0 + p.y * 2.3);
        p.y += 0.03 * cos(uTime * 0.8 + aSeed * 17.0 + p.z * 2.1);
        p.z += 0.03 * sin(uTime * 0.7 + aSeed * 11.0 + p.x * 2.7);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec4 clip = projectionMatrix * mv;
        vec2 ndc = clip.xy / clip.w;
        vec2 d = ndc - uMouse; d.x *= uAspect;
        float dist = length(d), hot = uMouseOn * exp(-dist * dist * 22.0);
        vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);
        dir.x /= uAspect;
        ndc += dir * hot * 0.11;
        clip.xy = ndc * clip.w;
        gl_Position = clip;
        gl_PointSize = uSize * (0.5 + aSeed * 0.8) * (1.0 + 1.2 * hot) * uPR / -mv.z;
        vTone = aTone; vHot = hot;
        vFade = clamp(1.3 - (-mv.z - 6.0) * 0.2, 0.3, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity; varying float vTone; varying float vFade; varying float vHot;
      void main() {
        vec2 uv = gl_PointCoord - 0.5; float r = length(uv);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.12, r);
        // ink palette: mostly Atlantic Steel and Tidepool Teal, a few Midnight and Summer Surf flecks
        vec3 abyss = vec3(0.024, 0.094, 0.149), steel = vec3(0.110, 0.306, 0.459), teal = vec3(0.184, 0.627, 0.776), surf = vec3(0.345, 0.788, 0.953);
        vec3 col = vTone < 0.15 ? abyss : vTone < 0.55 ? steel : vTone < 0.88 ? teal : surf;
        col = mix(col, surf, vHot * 0.6);
        gl_FragColor = vec4(col, a * uOpacity * vFade * 0.5);
      }`,
  }));
  field.renderOrder = 2;
  const group = new THREE.Group();
  group.add(field);
  scene.add(group);

  /* ================================================================ pointer trail */
  const TRAIL = 48;
  const tg = new THREE.BufferGeometry();
  const tPos = new Float32Array(TRAIL * 3).fill(99), tLife = new Float32Array(TRAIL), tSize = new Float32Array(TRAIL);
  const tPosAttr = new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage);
  const tLifeAttr = new THREE.BufferAttribute(tLife, 1).setUsage(THREE.DynamicDrawUsage);
  tg.setAttribute('position', tPosAttr); tg.setAttribute('aLife', tLifeAttr); tg.setAttribute('aSize', new THREE.BufferAttribute(tSize, 1));
  for (let i = 0; i < TRAIL; i++) tSize[i] = 6 + rnd() * 10;
  const trailMat = new THREE.ShaderMaterial({
    uniforms: { uPR: { value: renderer.getPixelRatio() } }, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: /* glsl */`
      uniform float uPR; attribute float aLife; attribute float aSize; varying float vL;
      void main() { vL = aLife; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPR * (0.4 + aLife * 0.6); }`,
    fragmentShader: /* glsl */`
      varying float vL;
      void main() { vec2 uv = gl_PointCoord - 0.5; float d = abs(uv.x) + abs(uv.y); if (d > 0.5 || vL <= 0.0) discard;
        gl_FragColor = vec4(mix(vec3(0.184, 0.627, 0.776), vec3(0.345, 0.788, 0.953), 1.0 - vL), smoothstep(0.5, 0.1, d) * vL * 0.75); }`,
  });
  const trail = new THREE.Points(tg, trailMat);
  trail.frustumCulled = false; trail.renderOrder = 3;
  scene.add(trail);
  const tVel = new Float32Array(TRAIL * 2);
  let tNext = 0, tAcc = 0;

  /* ================================================================ layout */
  let visH = 1, visW = 1, dirty = true;
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    visH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    visW = visH * camera.aspect;
    uniforms.uAspect.value = camera.aspect; aetherU.uAspect.value = camera.aspect;
    uniforms.uPR.value = moteMat.uniforms.uPR.value = trailMat.uniforms.uPR.value = renderer.getPixelRatio();
    moteMat.uniforms.uH.value = 2 * Math.tan((camera.fov * Math.PI) / 360) * 13;
    dirty = true;
  }
  const sections = [...document.querySelectorAll('[data-shape]')];
  let active = null, target = shapes.seal, spin = 'z', first = true;
  const goal = { x: 0, y: 0, s: 1, o: 0.9, anchored: false };
  function pickSection() {
    const mid = innerHeight * 0.5;
    let best = null, bestD = Infinity;
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  function updateGoal() {
    const sec = pickSection();
    if (!sec) return;
    const anchor = sec.querySelector('[data-anchor]');
    const ar = anchor && anchor.offsetParent !== null ? anchor.getBoundingClientRect() : null;
    if (ar && ar.width > 0) {
      goal.x = ((ar.left + ar.width / 2) / innerWidth * 2 - 1) * visW / 2;
      goal.y = -((ar.top + ar.height / 2) / innerHeight * 2 - 1) * visH / 2;
      goal.s = (Math.min(ar.width, ar.height) / innerHeight) * visH / 3.2 * (+anchor.dataset.k || 1);
      goal.anchored = true;
    } else {
      const narrow = innerWidth < 760;
      goal.x = (narrow ? 0 : +sec.dataset.x || 0) * visW / 2;
      goal.y = (+sec.dataset.y || 0) * visH / 2;
      goal.s = (+sec.dataset.s || 1) * Math.min(1, Math.max(0.42, visW / 7.6));
      goal.anchored = false;
    }
    goal.o = (+sec.dataset.o || 1) * (innerWidth < 760 && !goal.anchored ? 0.3 : 1);
    if (sec !== active) {
      active = sec;
      const name = sec.dataset.shape;
      target = shapes[name] || shapes.sphere;
      spin = SPIN[name] ?? 1;
      settled = false;
      if (!first && !reduce) {
        // ripple from where the new shape will settle
        ripple((goal.x / visW) + 0.5, 0.5 - goal.y / visH);
        uniforms.uPulse.value = 1;
      }
      first = false;
    }
  }

  /* ================================================================ input */
  const pointer = { x: 9, y: 9, on: 0, last: 0, px: 0, py: 0, moved: 0 };
  let drag = null, velX = 0, velY = 0, rotX = 0, rotY = 0, rotZ = 0, settled = false;
  addEventListener('pointermove', (e) => {
    const nx = (e.clientX / innerWidth) * 2 - 1, ny = -(e.clientY / innerHeight) * 2 + 1;
    if (e.pointerType === 'mouse') pointer.moved += Math.hypot(nx - pointer.x, ny - pointer.y);
    pointer.x = nx; pointer.y = ny;
    pointer.last = performance.now();
    if (drag) {
      velY = (e.clientX - drag.x) * 0.006; velX = (e.clientY - drag.y) * 0.004;
      drag.x = e.clientX; drag.y = e.clientY;
    }
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('a, button, input, .map-frame, dialog, .card, .slide-media, .echo-deck')) return;
    if (!e.target.closest('[data-anchor], .hero, .contact')) return;
    drag = { x: e.clientX, y: e.clientY };
    document.documentElement.classList.add('dragging');
  });
  const endDrag = () => { drag = null; document.documentElement.classList.remove('dragging'); };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
  document.addEventListener('pointerleave', () => { pointer.last = 0; });
  addEventListener('resize', resize);
  addEventListener('scroll', () => { dirty = true; }, { passive: true });
  // other scripts can ask for a ripple at a screen point (0..1)
  addEventListener('resonate', (e) => { if (!reduce) ripple(e.detail.x, e.detail.y); });

  /* ================================================================ loop */
  resize();
  updateGoal();
  if (reduce) { pos.set(target); posAttr.needsUpdate = true; }
  let last = performance.now(), t = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (dirty) { updateGoal(); dirty = false; }
    const scrollP = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);

    if (!reduce) {
      t += dt;
      uniforms.uTime.value = moteMat.uniforms.uTime.value = aetherU.uTime.value = t;
      uniforms.uPulse.value *= 0.96;
      if (!settled) {
        let moved = 0;
        for (let i = 0, j = 0; i < N; i++, j += 3) {
          const k = kk[i];
          const dx = target[j] - pos[j], dy = target[j + 1] - pos[j + 1], dz = target[j + 2] - pos[j + 2];
          pos[j] += dx * k; pos[j + 1] += dy * k; pos[j + 2] += dz * k;
          moved += Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        }
        posAttr.needsUpdate = true;
        if (moved / N < 0.0006) settled = true;
      }
      velX *= 0.94; velY *= 0.94;
      if (spin === 'z') {
        rotY += velY; rotY += (Math.round(rotY / (Math.PI * 2)) * Math.PI * 2 - rotY) * 0.03;
        rotZ += dt * 0.06;
      } else if (spin) { rotY += dt * 0.11 * spin + velY; rotZ *= 0.97; }
      else { rotY += velY; rotY += (Math.round(rotY / (Math.PI * 2)) * Math.PI * 2 - rotY) * 0.04; rotZ *= 0.97; }
      rotX = Math.max(-0.7, Math.min(0.7, rotX + velX)) * 0.985;
      group.rotation.set(rotX, rotY, rotZ);
      const live = now - pointer.last < 2500 ? 1 : 0;
      pointer.on += (live - pointer.on) * 0.06;
      uniforms.uMouse.value.set(pointer.x, pointer.y);
      uniforms.uMouseOn.value = pointer.on;

      const tx = pointer.last ? pointer.x : 0, ty = pointer.last ? pointer.y : 0;
      pointer.px += (tx - pointer.px) * 0.03; pointer.py += (ty - pointer.py) * 0.03;
      motes.position.y = -scrollP * 2.5; motes.position.x = pointer.px * 0.3;
      aetherU.uScroll.value = scrollP * 3;
      aetherU.uPointer.value.set(pointer.px, pointer.py);

      // pointer trail: spawn motes along the path the mouse travels (mouse only)
      tAcc += pointer.moved; pointer.moved = 0;
      while (tAcc > 0.018) {
        tAcc -= 0.018;
        const i = tNext; tNext = (tNext + 1) % TRAIL;
        tPos.set([pointer.x * visW / 2 + (rnd() - 0.5) * 0.06, pointer.y * visH / 2 + (rnd() - 0.5) * 0.06, 0], i * 3);
        tLife[i] = 1; tVel[i * 2] = (rnd() - 0.5) * 0.25; tVel[i * 2 + 1] = 0.15 + rnd() * 0.35;
      }
      for (let i = 0; i < TRAIL; i++) {
        if (tLife[i] <= 0) continue;
        tLife[i] = Math.max(0, tLife[i] - dt * 1.4);
        tPos[i * 3] += tVel[i * 2] * dt; tPos[i * 3 + 1] += tVel[i * 2 + 1] * dt;
      }
      tPosAttr.needsUpdate = tLifeAttr.needsUpdate = true;
    }

    const ease = reduce ? 1 : 0.06;
    group.position.x += (goal.x - group.position.x) * (goal.anchored ? 0.25 : ease);
    group.position.y += (goal.y - group.position.y) * (goal.anchored ? 0.3 : ease);
    group.scale.setScalar(group.scale.x + (goal.s - group.scale.x) * (reduce ? 1 : 0.08));
    uniforms.uOpacity.value += (goal.o - uniforms.uOpacity.value) * (reduce ? 1 : 0.05);
    const rf = aetherU.uRift.value, rs = (goal.anchored ? 0.5 : 0.15) * (innerWidth < 760 ? 0.5 : 1) * Math.min(1, uniforms.uOpacity.value * 1.4);
    rf.set(group.position.x / visH, group.position.y / visH, rf.z + (rs - rf.z) * 0.05, group.scale.x / visH * 0.9);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  document.documentElement.classList.add('webgl');
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
