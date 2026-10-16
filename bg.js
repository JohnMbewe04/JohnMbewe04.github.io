/* WebGL cosmos behind the whole site.
   Layers (back to front): drifting nebula, twinkling starfield with distant spiral
   galaxies, occasional shooting stars, and the main particle field that morphs
   between shapes as sections scroll into view.

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
  const N = small ? 6500 : 13000;
  let rnd = mulberry32(20260916);

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 0, 8);

  /* ================================================================ nebula */
  const nebulaTex = (() => {
    const S = 256, data = new Uint8Array(S * S * 4);
    const lat = (o) => { const g = new Float32Array(o * o); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; };
    const octs = [4, 8, 16, 32, 64].map((o) => ({ o, g: lat(o) }));
    const smooth = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0, amp = 0.55, tot = 0;
      for (const { o, g } of octs) {
        const fx = (x / S) * o, fy = (y / S) * o, ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = smooth(fx - ix), ty = smooth(fy - iy);
        const a = g[(iy % o) * o + (ix % o)], b = g[(iy % o) * o + ((ix + 1) % o)];
        const c = g[((iy + 1) % o) * o + (ix % o)], d = g[((iy + 1) % o) * o + ((ix + 1) % o)];
        v += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * amp; tot += amp; amp *= 0.5;
      }
      const i = (y * S + x) * 4, n = Math.round((v / tot) * 255);
      data[i] = n; data[i + 1] = n; data[i + 2] = n; data[i + 3] = 255;
    }
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  })();
  const nebulaU = { uTex: { value: nebulaTex }, uTime: { value: 0 }, uScroll: { value: 0 }, uAspect: { value: 1 }, uPointer: { value: new THREE.Vector2() } };
  const nebula = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: nebulaU, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform float uTime, uScroll, uAspect; uniform vec2 uPointer; varying vec2 vUv;
      void main() {
        vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5) + uPointer * 0.02;
        vec2 q = p * 0.75 + vec2(uTime * 0.004, uScroll * 0.10 + uTime * 0.002);
        float n1 = texture2D(uTex, q).r;
        float n2 = texture2D(uTex, p * 1.6 - vec2(uTime * 0.006, uScroll * 0.16) + n1 * 0.35 + 0.37).r;
        float n = n1 * 0.62 + n2 * 0.38;
        vec3 deep = vec3(0.10, 0.12, 0.42), vio = vec3(0.42, 0.20, 0.70), pink = vec3(0.85, 0.25, 0.60), cyan = vec3(0.15, 0.55, 0.85);
        vec3 col = mix(deep, vio, smoothstep(0.35, 0.75, n2));
        col = mix(col, pink, smoothstep(0.62, 0.9, n1) * 0.55);
        col = mix(col, cyan, smoothstep(0.7, 0.95, n2) * 0.35);
        float a = smoothstep(0.42, 0.92, n) * 0.30;
        float vign = smoothstep(1.25, 0.2, length(p * vec2(0.8, 1.2)));
        gl_FragColor = vec4(col, a * vign);
      }`,
  }));
  nebula.renderOrder = 0;
  nebula.frustumCulled = false;
  scene.add(nebula);

  /* ================================================================ stars + distant galaxies */
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uPR; attribute float aSize; attribute float aPhase; attribute vec3 aColor; attribute float aAtt;
      varying vec3 vColor; varying float vTw;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float att = mix(1.0, 30.0 / -mv.z, aAtt);
        gl_PointSize = aSize * uPR * att;
        vTw = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 2.2) + aPhase * 40.0);
        vColor = aColor;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor; varying float vTw;
      void main() {
        vec2 uv = gl_PointCoord - 0.5; float r = length(uv);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r); core = pow(core, 2.4);
        float cross = max(0.0, 1.0 - abs(uv.x) * 14.0) * max(0.0, 1.0 - abs(uv.y) * 2.2) + max(0.0, 1.0 - abs(uv.y) * 14.0) * max(0.0, 1.0 - abs(uv.x) * 2.2);
        gl_FragColor = vec4(vColor, (core + cross * 0.25) * vTw);
      }`,
  });
  function cloud(count, fill) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), s = new Float32Array(count), ph = new Float32Array(count), c = new Float32Array(count * 3), at = new Float32Array(count);
    for (let i = 0; i < count; i++) fill(i, p, s, ph, c, at);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aAtt', new THREE.BufferAttribute(at, 1));
    const pts = new THREE.Points(g, starMat);
    pts.frustumCulled = false; pts.renderOrder = 1;
    return pts;
  }
  const tints = [[1, 1, 1], [0.75, 0.85, 1], [0.8, 0.72, 1], [1, 0.8, 0.92], [0.7, 0.95, 1]];
  const stars = cloud(small ? 2200 : 4200, (i, p, s, ph, c, at) => {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = 30 + rnd() * 40, k = Math.sqrt(1 - u * u);
    p.set([Math.cos(th) * k * r, u * r * 0.75, Math.sin(th) * k * r], i * 3);
    const big = rnd();
    s[i] = big > 0.985 ? 5 + rnd() * 3 : big > 0.9 ? 2.6 + rnd() * 1.5 : 1.2 + rnd() * 1.3;
    ph[i] = rnd(); at[i] = 0;
    const t = tints[Math.floor(rnd() * tints.length)], b = 0.55 + rnd() * 0.45;
    c.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
  });
  function spiral(count, R, arms, tilt) {
    return cloud(count, (i, p, s, ph, c, at) => {
      const r = Math.pow(rnd(), 0.9) * R, arm = (i % arms) * (Math.PI * 2 / arms);
      const ang = arm + (r / R) * 5.5 + (rnd() - 0.5) * 0.6;
      const x = Math.cos(ang) * r + (rnd() - 0.5) * R * 0.08, z = Math.sin(ang) * r + (rnd() - 0.5) * R * 0.08;
      const y = (rnd() - 0.5) * R * 0.05 * (1 - r / R);
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      p.set([x, y * ct - z * st, y * st + z * ct], i * 3);
      s[i] = 1 + rnd() * 1.8; ph[i] = rnd(); at[i] = 1;
      const coreMix = 1 - Math.min(1, r / (R * 0.35));
      const arm2 = rnd() < 0.5 ? [0.55, 0.65, 1] : [0.85, 0.55, 1];
      c.set([arm2[0] + (1 - arm2[0]) * coreMix, arm2[1] + (0.85 - arm2[1]) * coreMix, arm2[2] - 0.15 * coreMix].map((v) => v * (0.35 + 0.4 * rnd())), i * 3);
    });
  }
  const sky = new THREE.Group();
  sky.add(stars);
  const g1 = spiral(small ? 1600 : 3200, 7, 2, 1.05); g1.position.set(-17, 8, -40); sky.add(g1);
  const g2 = spiral(small ? 700 : 1400, 4, 3, 0.6); g2.position.set(22, -11, -52); g2.rotation.z = 0.8; sky.add(g2);
  const g3 = spiral(small ? 900 : 1800, 5.5, 2, 0.9); g3.position.set(45, 6, -20); g3.rotation.z = -0.5; sky.add(g3);
  scene.add(sky);

  /* ================================================================ shooting stars */
  const meteorMat = () => new THREE.ShaderMaterial({
    uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uA; varying vec2 vUv;
      void main() {
        float tail = pow(vUv.x, 3.0), w = 1.0 - abs(vUv.y - 0.5) * 2.0;
        vec3 col = mix(vec3(0.55, 0.45, 1.0), vec3(1.0, 0.95, 1.0), vUv.x);
        gl_FragColor = vec4(col, tail * w * w * uA);
      }`,
  });
  const meteors = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), meteorMat());
    m.visible = false; m.renderOrder = 3; m.frustumCulled = false;
    scene.add(m);
    return { m, t: 0, dur: 1, from: new THREE.Vector3(), dir: new THREE.Vector3(), next: 3 + rnd() * 5 };
  });

  /* ================================================================ morphing particle field */
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
  function galaxy() {
    const a = new Float32Array(N * 3), c = Math.cos(1.12), s = Math.sin(1.12);
    for (let i = 0; i < N; i++) {
      const r = Math.pow(rnd(), 0.75) * 2.9, ang = (i % 3) * (Math.PI * 2 / 3) + r * 1.9 + (rnd() - 0.5) * (0.5 - r * 0.08);
      const x = Math.cos(ang) * r + (rnd() - 0.5) * 0.18, z = Math.sin(ang) * r + (rnd() - 0.5) * 0.18, y = (rnd() - 0.5) * 0.28 * (1 - r / 3);
      a.set([x, y * c - z * s, y * s + z * c], i * 3);
    }
    return a;
  }
  const shapes = { sphere: sphere(), helix: helix(), wave: wave(), circuit: circuit(), torus: torus(), galaxy: galaxy() };
  const SPIN = { sphere: 1, helix: 1, torus: 1, galaxy: 0.5, wave: 0, circuit: 0 };

  rnd = mulberry32(99);
  const pos = new Float32Array(N * 3), tone = new Float32Array(N), seed = new Float32Array(N), kk = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = 6 + rnd() * 6, th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph) - 4], i * 3);
    const c = rnd();
    tone[i] = c < 0.58 ? rnd() * 0.3 : c < 0.82 ? 0.45 + rnd() * 0.17 : 0.74 + rnd() * 0.14;
    seed[i] = rnd(); kk[i] = 0.025 + rnd() * 0.06;
  }
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aTone', new THREE.BufferAttribute(tone, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
  const uniforms = {
    uTime: { value: 0 }, uSize: { value: small ? 38 : 34 }, uPR: { value: renderer.getPixelRatio() },
    uOpacity: { value: 0 }, uMouse: { value: new THREE.Vector2(9, 9) }, uMouseOn: { value: 0 }, uAspect: { value: 1 },
  };
  const field = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uSize, uPR, uMouseOn, uAspect; uniform vec2 uMouse;
      attribute float aTone; attribute float aSeed;
      varying float vTone; varying float vFade; varying float vHot;
      void main() {
        vec3 p = position;
        p.x += 0.035 * sin(uTime * 0.9 + aSeed * 31.0 + p.y * 2.3);
        p.y += 0.035 * cos(uTime * 0.8 + aSeed * 17.0 + p.z * 2.1);
        p.z += 0.035 * sin(uTime * 0.7 + aSeed * 11.0 + p.x * 2.7);
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
        gl_PointSize = uSize * (0.55 + aSeed * 0.9) * (1.0 + 1.6 * hot) * uPR / -mv.z;
        vTone = aTone; vHot = hot;
        vFade = clamp(1.3 - (-mv.z - 6.0) * 0.2, 0.25, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity, uTime; varying float vTone; varying float vFade; varying float vHot;
      vec3 pal(float t) {
        vec3 a = vec3(0.28, 0.45, 1.0), b = vec3(0.56, 0.42, 1.0), c = vec3(1.0, 0.43, 0.78), d = vec3(0.45, 0.9, 1.0);
        t = fract(t);
        if (t < 0.33) return mix(a, b, t / 0.33);
        if (t < 0.66) return mix(b, c, (t - 0.33) / 0.33);
        return mix(c, d, (t - 0.66) / 0.34);
      }
      void main() {
        vec2 uv = gl_PointCoord - 0.5; float r = length(uv);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r); a *= a;
        vec3 col = pal(vTone + 0.04 * sin(uTime * 0.25)) + vHot * 0.35;
        gl_FragColor = vec4(col, a * uOpacity * vFade * 1.15);
      }`,
  }));
  field.renderOrder = 2;
  const group = new THREE.Group();
  group.add(field);
  scene.add(group);

  /* ================================================================ layout */
  let visH = 1, visW = 1, dirty = true;
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    visH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    visW = visH * camera.aspect;
    uniforms.uAspect.value = camera.aspect; nebulaU.uAspect.value = camera.aspect;
    uniforms.uPR.value = starMat.uniforms.uPR.value = renderer.getPixelRatio();
    dirty = true;
  }
  const sections = [...document.querySelectorAll('[data-shape]')];
  let active = null, target = shapes.sphere, spin = 1;
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
    if (sec !== active) {
      active = sec;
      const name = sec.dataset.shape;
      target = shapes[name] || shapes.sphere;
      spin = SPIN[name] ?? 1;
      settled = false;
    }
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
    goal.o = (+sec.dataset.o || 1) * (innerWidth < 760 && !goal.anchored ? 0.38 : 1);
  }

  /* ================================================================ input */
  const pointer = { x: 9, y: 9, on: 0, last: 0, px: 0, py: 0 };
  let drag = null, velX = 0, velY = 0, rotX = 0, rotY = 0, settled = false;
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    pointer.last = performance.now();
    if (drag) {
      velY = (e.clientX - drag.x) * 0.006; velX = (e.clientY - drag.y) * 0.004;
      drag.x = e.clientX; drag.y = e.clientY;
    }
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('a, button, input, .map-frame, dialog, .card, .slide-media')) return;
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
      uniforms.uTime.value = starMat.uniforms.uTime.value = nebulaU.uTime.value = t;
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
      if (spin) rotY += dt * 0.11 * spin + velY;
      else { rotY += velY; rotY += (Math.round(rotY / (Math.PI * 2)) * Math.PI * 2 - rotY) * 0.04; }
      rotX = Math.max(-0.7, Math.min(0.7, rotX + velX)) * 0.985;
      group.rotation.set(rotX, rotY, 0);
      const live = now - pointer.last < 2500 ? 1 : 0;
      pointer.on += (live - pointer.on) * 0.06;
      uniforms.uMouse.value.set(pointer.x, pointer.y);
      uniforms.uMouseOn.value = pointer.on;

      // cosmos: slow drift, scroll travel and pointer parallax
      const tx = pointer.last ? pointer.x : 0, ty = pointer.last ? pointer.y : 0;
      pointer.px += (tx - pointer.px) * 0.03; pointer.py += (ty - pointer.py) * 0.03;
      sky.rotation.y = t * 0.006 + scrollP * 0.9 + pointer.px * 0.05;
      sky.rotation.x = scrollP * 0.25 - pointer.py * 0.04;
      g1.rotation.y = t * 0.03; g2.rotation.y = -t * 0.04; g3.rotation.y = t * 0.035;
      nebulaU.uScroll.value = scrollP * 3;
      nebulaU.uPointer.value.set(pointer.px, pointer.py);

      // shooting stars
      for (const s of meteors) {
        if (!s.m.visible) {
          s.next -= dt;
          if (s.next <= 0) {
            const z = -14, h = 2 * Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - z), w = h * camera.aspect;
            s.from.set((rnd() - 0.2) * w * 0.7, h * (0.15 + rnd() * 0.35), z);
            const ang = Math.PI + 0.35 + rnd() * 0.5;
            s.dir.set(Math.cos(ang), Math.sin(ang), 0);
            s.len = 2.5 + rnd() * 3; s.speed = 14 + rnd() * 10; s.t = 0; s.dur = 0.9 + rnd() * 0.6;
            s.m.visible = true;
            s.m.rotation.z = Math.atan2(s.dir.y, s.dir.x);
            s.m.scale.set(s.len, 0.035, 1);
          }
        } else {
          s.t += dt;
          const p = s.t / s.dur;
          s.m.position.copy(s.from).addScaledVector(s.dir, s.t * s.speed - s.len / 2);
          s.m.material.uniforms.uA.value = Math.sin(Math.min(1, p) * Math.PI) * 0.9;
          if (p >= 1) { s.m.visible = false; s.next = 4 + rnd() * 7; }
        }
      }
    } else {
      sky.rotation.y = scrollP * 0.9;
    }

    const ease = reduce ? 1 : 0.06;
    group.position.x += (goal.x - group.position.x) * (goal.anchored ? 0.25 : ease);
    group.position.y += (goal.y - group.position.y) * (goal.anchored ? 0.3 : ease);
    group.scale.setScalar(group.scale.x + (goal.s - group.scale.x) * (reduce ? 1 : 0.08));
    uniforms.uOpacity.value += (goal.o - uniforms.uOpacity.value) * (reduce ? 1 : 0.05);

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
