/* Chisomo Mbewe · e-portfolio interactions (shared by index and project pages).
   The WebGL particle background lives in bg.js. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- nav + menu ---------- */
  const nav = $('.nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 20);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const menuBtn = $('.menu-btn'), menu = $('#mobile-menu');
  const setMenu = (open) => {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
  };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

  const links = new Map($$('.nav-links a').map((a) => [a.getAttribute('href').split('#')[1], a]));
  const secObs = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    links.forEach((a) => a.classList.remove('active'));
    links.get(en.target.id)?.classList.add('active');
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const el = document.getElementById(id); if (el) secObs.observe(el); });

  /* ---------- reveal fallback ---------- */
  if (document.documentElement.classList.contains('no-sda') && !reduce) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
  }

  /* ---------- tilt + glare, magnetic buttons ---------- */
  if (fine && !reduce) {
    $$('.tilt').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', `${(0.5 - py) * 7}deg`);
        el.style.setProperty('--ry', `${(px - 0.5) * 9}deg`);
        el.style.setProperty('--gx', `${px * 100}%`);
        el.style.setProperty('--gy', `${py * 100}%`);
        el.classList.add('tilting');
      });
      el.addEventListener('pointerleave', () => { el.classList.remove('tilting'); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.18}px ${(e.clientY - r.top - r.height / 2) * 0.3}px`;
      });
      el.addEventListener('pointerleave', () => { el.style.translate = ''; });
    });
  }

  /* ---------- archive filters ---------- */
  const filterBtns = $$('.filters button'), cards = $$('.grid .card');
  filterBtns.forEach((btn) => btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    const apply = () => {
      filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      cards.forEach((c) => { c.hidden = !(f === 'all' || c.dataset.cat.split(' ').includes(f)); });
    };
    if (document.startViewTransition && !reduce) document.startViewTransition(apply); else apply();
  }));

  /* ---------- lightbox with prev / next ---------- */
  const lb = $('.lightbox');
  if (lb) {
    const lbImg = $('img', lb), lbCap = $('.lb-cap', lb);
    const figs = $$('.zoomable').filter((f) => $('img', f));
    let idx = 0;
    const show = (i) => {
      idx = (i + figs.length) % figs.length;
      const img = $('img', figs[idx]);
      lbImg.src = img.currentSrc || img.src; lbImg.alt = img.alt;
      lbCap.textContent = $('figcaption', figs[idx])?.textContent || img.alt;
    };
    figs.forEach((fig, i) => {
      fig.tabIndex = 0; fig.setAttribute('role', 'button');
      fig.setAttribute('aria-label', `Enlarge image: ${$('img', fig).alt || 'image'}`);
      const open = () => { show(i); lb.showModal(); };
      fig.addEventListener('click', open);
      fig.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    $('.lb-prev', lb).addEventListener('click', () => show(idx - 1));
    $('.lb-next', lb).addEventListener('click', () => show(idx + 1));
    lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') show(idx - 1); if (e.key === 'ArrowRight') show(idx + 1); });
    lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
    if (figs.length < 2) $$('.lb-nav', lb).forEach((b) => { b.hidden = true; });
  }

  /* ---------- copy email ---------- */
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = 'Copied ✓'; b.classList.add('done');
      setTimeout(() => { b.textContent = 'Copy email'; b.classList.remove('done'); }, 2000);
    } catch { location.href = `mailto:${b.dataset.copy}`; }
  }));

  /* ============================================================
     CAPABILITY MAP: force-directed graph of skills <-> projects
     ============================================================ */
  const mc = $('.map-canvas');
  if (!mc) return;
  const data = JSON.parse($('#map-data').textContent);
  const frame = mc.parentElement, tip = $('.map-tip', frame), ctx = mc.getContext('2d');
  const COL = { hw: '#6fe6ff', ai: '#b07bff', sw: '#7c9bff', power: '#ff6ec7', cad: '#9df5c9' };
  const nodes = data.nodes.map((n) => ({ ...n, x: 0, y: 0, vx: 0, vy: 0, deg: 0, fixed: false }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = data.links.map((l) => ({ s: byId.get(l.s), t: byId.get(l.t) }));
  const nbr = new Map(nodes.map((n) => [n, new Set()]));
  edges.forEach(({ s, t }) => { s.deg++; t.deg++; nbr.get(s).add(t); nbr.get(t).add(s); });
  let W = 0, H = 0, DPR = 1, alpha = 1, hover = null, sel = null, dragN = null, moved = false, running = false;

  const font = (px) => `500 ${px}px Inter, ui-sans-serif, system-ui, sans-serif`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function size() {
    DPR = Math.min(2, devicePixelRatio || 1);
    W = frame.clientWidth; H = W < 700 ? 760 : 640;
    mc.width = W * DPR; mc.height = H * DPR; mc.style.height = `${H}px`;
    nodes.forEach((n) => {
      if (n.type === 's') {
        ctx.font = font(W < 700 ? 10 : 12);
        n.w = ctx.measureText(n.label).width + 18; n.h = W < 700 ? 20 : 24;
      } else { n.r = n.featured ? 9 : 6; ctx.font = font(W < 700 ? 10 : 11.5); n.lw = n.featured ? ctx.measureText(n.label).width : 0; }
    });
  }
  function seed() {
    const skills = nodes.filter((n) => n.type === 's'), projs = nodes.filter((n) => n.type === 'p');
    skills.forEach((n, i) => { const a = (i / skills.length) * Math.PI * 2; n.x = W / 2 + Math.cos(a) * W * 0.18; n.y = H / 2 + Math.sin(a) * H * 0.2; });
    projs.forEach((n, i) => { const a = (i / projs.length) * Math.PI * 2 + 0.3; n.x = W / 2 + Math.cos(a) * W * 0.38; n.y = H / 2 + Math.sin(a) * H * 0.4; });
  }
  function tick() {
    const small = W < 700, rest = small ? 74 : 128, rep = small ? 2800 : 7600;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d2 = Math.max(dx * dx + dy * dy, 25), d = Math.sqrt(d2), f = (rep / d2) * alpha;
        dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const { s, t } of edges) {
      const dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy) || 0.01, f = (d - rest) * 0.01 * alpha;
      s.vx += (dx / d) * f; s.vy += (dy / d) * f; t.vx -= (dx / d) * f; t.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * 0.0012 * alpha; n.vy += (H / 2 - n.y) * 0.0026 * alpha;
      if (n.fixed) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.8; n.vy *= 0.8; n.x += n.vx; n.y += n.vy;
    }
    // hard collision so pills and dots never overlap (box test, position-based)
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i], aw = a.type === 's' ? a.w / 2 + 4 : 11 + (a.lw || 0) * 0.55, ah = a.type === 's' ? a.h / 2 + 3 : 11;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j], bw = b.type === 's' ? b.w / 2 + 4 : 11 + (b.lw || 0) * 0.55, bh = b.type === 's' ? b.h / 2 + 3 : 11;
        const ox = aw + bw - Math.abs(b.x - a.x), oy = ah + bh - Math.abs(b.y - a.y);
        if (ox > 0 && oy > 0) {
          if (ox < oy * 2.2) { const s = (b.x >= a.x ? 1 : -1) * ox / 2; if (!a.fixed) a.x -= s; if (!b.fixed) b.x += s; }
          else { const s = (b.y >= a.y ? 1 : -1) * oy / 2; if (!a.fixed) a.y -= s; if (!b.fixed) b.y += s; }
        }
      }
    }
    for (const n of nodes) {
      const px = n.type === 's' ? n.w / 2 + 6 : 16;
      n.x = Math.max(px, Math.min(W - px, n.x)); n.y = Math.max(20, Math.min(H - 40, n.y));
    }
    alpha = Math.max(0.0015, alpha * 0.985);
  }
  const focus = () => sel || hover;
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const f = focus(), hot = f ? nbr.get(f) : null;
    for (const { s, t } of edges) {
      const on = f && (s === f || t === f);
      ctx.strokeStyle = on ? COL[t.cat] || '#9fb6ff' : f ? 'rgba(140,170,255,0.05)' : 'rgba(140,170,255,0.16)';
      ctx.lineWidth = on ? 1.6 : 1;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    }
    for (const n of nodes) {
      const dim = f && n !== f && !hot.has(n);
      ctx.globalAlpha = dim ? 0.18 : 1;
      if (n.type === 'p') {
        ctx.fillStyle = COL[n.cat];
        ctx.shadowColor = COL[n.cat]; ctx.shadowBlur = n === f ? 18 : 8;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + (n === f ? 3 : 0), 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (n.featured || n === f || (hot && hot.has(n))) {
          ctx.font = font(W < 700 ? 10 : 11.5); ctx.fillStyle = '#e9eeff';
          const right = n.x > W / 2;
          ctx.textAlign = right ? 'right' : 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(n.label, n.x + (right ? -(n.r + 7) : n.r + 7), n.y);
        }
      } else {
        const x = n.x - n.w / 2, y = n.y - n.h / 2, act = n === f || (hot && hot.has(n));
        ctx.fillStyle = act ? 'rgba(40,52,110,0.95)' : 'rgba(10,14,30,0.9)';
        ctx.strokeStyle = act ? 'rgba(200,215,255,0.9)' : 'rgba(150,175,255,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(x, y, n.w, n.h, n.h / 2); ctx.fill(); ctx.stroke();
        ctx.font = font(W < 700 ? 10 : 12); ctx.fillStyle = act ? '#ffffff' : '#c3cff0';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(n.label, n.x, n.y + 0.5);
      }
    }
    ctx.globalAlpha = 1;
  }
  function loop() {
    tick(); draw();
    if (alpha > 0.002 || dragN) requestAnimationFrame(loop); else running = false;
  }
  const kick = (a = 0.3) => { alpha = Math.max(alpha, a); if (!running) { running = true; requestAnimationFrame(loop); } };
  function hit(x, y) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.type === 's' ? Math.abs(x - n.x) < n.w / 2 && Math.abs(y - n.y) < n.h / 2 : Math.hypot(x - n.x, y - n.y) < n.r + 6) return n;
    }
    return null;
  }
  function showTip(n) {
    if (!n) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.innerHTML = n.type === 'p'
      ? `<b>${esc(n.label)}</b><span>${esc(n.year)}</span><p>${esc(n.sum)}</p><em>${fine ? 'Click' : 'Tap again'} to open the case study →</em>`
      : `<b>${esc(n.label)}</b><p>Used in ${n.deg} project${n.deg > 1 ? 's' : ''}</p>`;
    const tx = Math.min(W - tip.offsetWidth - 8, Math.max(8, n.x + 16));
    const ty = Math.min(H - tip.offsetHeight - 8, Math.max(8, n.y + 14));
    tip.style.translate = `${tx}px ${ty}px`;
  }
  const local = (e) => { const r = mc.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  mc.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (dragN) { dragN.x = x; dragN.y = y; moved = true; kick(0.12); showTip(null); return; }
    const n = hit(x, y);
    if (n !== hover) { hover = n; mc.style.cursor = n ? 'pointer' : 'grab'; if (!sel) showTip(n); draw(); }
  });
  mc.addEventListener('pointerdown', (e) => {
    const [x, y] = local(e), n = hit(x, y);
    moved = false;
    if (n) { dragN = n; n.fixed = true; mc.setPointerCapture(e.pointerId); }
  });
  mc.addEventListener('pointerup', (e) => {
    const [x, y] = local(e), n = hit(x, y);
    if (dragN) { dragN.fixed = false; dragN = null; }
    if (!moved) {
      if (n && n.type === 'p' && (fine || sel === n)) { location.href = `projects/${n.id}.html`; return; }
      sel = n && sel !== n ? n : null;
      showTip(sel); draw();
    }
  });
  mc.addEventListener('pointerleave', () => { hover = null; if (!sel) showTip(null); draw(); });

  size(); seed();
  addEventListener('resize', () => { const oldW = W; size(); if (Math.abs(oldW - W) > 40) { seed(); alpha = 1; for (let i = 0; i < 220; i++) tick(); kick(0.3); } else draw(); });
  // pre-settle the layout, then let it breathe into place when it scrolls into view
  for (let i = 0; i < (reduce ? 500 : 220); i++) tick();
  draw();
  if (!reduce) {
    const vis = new IntersectionObserver(([en]) => { if (en.isIntersecting) { vis.disconnect(); kick(0.5); } }, { threshold: 0.25 });
    vis.observe(mc);
  }
})();
