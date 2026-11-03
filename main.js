/* Chisomo Mbewe · e-portfolio interactions (shared by index and project pages).
   The WebGL aether and particle background lives in bg.js. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;

  /* ---------- intro veil: click to skip, then get out of the way ---------- */
  const veil = $('.veil');
  if (veil) {
    const drop = () => { veil.style.display = 'none'; };
    veil.addEventListener('click', drop);
    veil.addEventListener('animationend', (e) => { if (e.target === veil) drop(); });
    setTimeout(drop, 3200);
  }

  /* ---------- nav + menu ---------- */
  const nav = $('.nav');
  const menuBtn = $('.menu-btn'), menu = $('#mobile-menu');
  const setMenu = (open) => {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
  };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

  /* ---------- chapters: rail, header chapter label, progress ---------- */
  const chapters = $$('.chapter');
  const railLinks = new Map($$('.rail a').map((a) => [a.dataset.ch, a]));
  const navLinks = new Map($$('.nav-links a').map((a) => [a.getAttribute('href').split('#')[1], a]));
  const ncNum = $('.nc-num'), ncTitle = $('.nc-title');
  const railLine = $('.rail-line');
  let current = null;
  function onScroll() {
    nav.classList.toggle('scrolled', scrollY > 20);
    const max = Math.max(1, root.scrollHeight - innerHeight);
    root.style.setProperty('--p', (scrollY / max).toFixed(4));
    if (!chapters.length) return;
    const mid = innerHeight * 0.45;
    let idx = 0;
    chapters.forEach((c, i) => { if (c.getBoundingClientRect().top <= mid) idx = i; });
    if (railLine) railLine.style.setProperty('--p', (idx / (chapters.length - 1)).toFixed(3));
    const ch = chapters[idx];
    if (ch === current) return;
    current = ch;
    const id = ch.dataset.ch;
    chapters.forEach((c, i) => {
      const a = railLinks.get(c.dataset.ch);
      if (a) { a.classList.toggle('on', i === idx); a.classList.toggle('past', i < idx); a.toggleAttribute('aria-current', i === idx); }
    });
    navLinks.forEach((a, k) => a.classList.toggle('active', k === id || (id === 'skills' && k === 'work') || (id === 'journey' && k === 'origin')));
    const rl = railLinks.get(id);
    if (ncNum && rl) {
      ncTitle.style.opacity = 0;
      setTimeout(() => {
        ncNum.textContent = $('.r-num', rl).textContent;
        ncTitle.textContent = $('.r-label', rl).textContent;
        ncTitle.style.opacity = 1;
      }, reduce ? 0 : 180);
    }
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- reveal fallback ---------- */
  if (root.classList.contains('no-sda') && !reduce) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal, .grid .card').forEach((el) => io.observe(el));
  }

  /* ---------- tilt + glare, magnetic buttons ---------- */
  if (fine && !reduce) {
    // the prologue amulet leans toward the pointer
    const am = $('.amulet');
    if (am) addEventListener('pointermove', (e) => {
      const r = am.getBoundingClientRect();
      if (r.bottom < 0) return;
      am.style.setProperty('--tx', `${((e.clientX - r.left - r.width / 2) / innerWidth * 50).toFixed(1)}deg`);
      am.style.setProperty('--ty', `${(-(e.clientY - r.top - r.height / 2) / innerHeight * 36).toFixed(1)}deg`);
    }, { passive: true });
    $$('.tilt').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', `${(0.5 - py) * 6}deg`);
        el.style.setProperty('--ry', `${(px - 0.5) * 8}deg`);
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
      cards.forEach((c) => { c.hidden = !(f === 'all' || c.dataset.cat.split(' ').includes(f)); c.classList.add('in'); });
    };
    if (document.startViewTransition && !reduce) document.startViewTransition(apply); else apply();
  }));

  /* ---------- echoes: photo decks that cross-fade while in view ---------- */
  $$('[data-deck]').forEach((deck) => {
    const shots = $$('.echo-shot', deck), dots = $$('.echo-dots button', deck);
    let i = 0, timer = null, hover = false;
    const show = (n) => {
      shots[i].classList.remove('on'); dots[i]?.removeAttribute('aria-current');
      i = (n + shots.length) % shots.length;
      shots[i].classList.add('on'); dots[i]?.setAttribute('aria-current', 'true');
    };
    dots.forEach((d, n) => d.addEventListener('click', (e) => { e.stopPropagation(); show(n); }));
    if (reduce || shots.length < 2) return;
    deck.addEventListener('pointerenter', () => { hover = true; });
    deck.addEventListener('pointerleave', () => { hover = false; });
    new IntersectionObserver(([en]) => {
      clearInterval(timer);
      if (en.isIntersecting) timer = setInterval(() => { if (!hover && !document.hidden) show(i + 1); }, 4200);
    }, { threshold: 0.35 }).observe(deck);
  });

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
      if (!fig.classList.contains('echo-shot')) { fig.tabIndex = 0; fig.setAttribute('role', 'button'); }
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
     INTERFACE SOUNDS: original chimes synthesised with Web Audio
     (no audio files). Toggle in the header, remembered per browser.
     ============================================================ */
  const sfxBtn = $('.sfx-btn');
  let sfxOn = true, actx = null;
  try { sfxOn = localStorage.getItem('sfx') !== 'off'; } catch {}
  const paintSfx = () => sfxBtn?.setAttribute('aria-pressed', String(sfxOn));
  paintSfx();
  const audio = () => {
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; actx = new AC(); }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  };
  // a soft bell: a few sine partials with fast attack and a gentle tail
  function bell(freqs, { gain = 0.05, decay = 0.6, delay = 0 } = {}) {
    if (!sfxOn || reduce) return;
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime + delay, out = ac.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(gain, t + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    out.connect(ac.destination);
    freqs.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.value = 1 / (i + 1.4);
      o.connect(g).connect(out); o.start(t); o.stop(t + decay + 0.05);
    });
  }
  const sfx = {
    hover: () => bell([1567.98, 3135.96], { gain: 0.012, decay: 0.18 }),
    select: () => { bell([1046.5, 2093, 3140], { gain: 0.045, decay: 0.5 }); bell([1568, 3136], { gain: 0.03, decay: 0.6, delay: 0.07 }); },
    open: () => { bell([784, 1568], { gain: 0.04, decay: 0.7 }); bell([1175, 2350], { gain: 0.035, decay: 0.7, delay: 0.08 }); bell([1568, 3136], { gain: 0.03, decay: 0.9, delay: 0.16 }); },
  };
  sfxBtn?.addEventListener('click', () => {
    sfxOn = !sfxOn; paintSfx();
    try { localStorage.setItem('sfx', sfxOn ? 'on' : 'off'); } catch {}
    if (sfxOn) sfx.select();
  });
  const interactive = 'a, button, [role="button"], .zoomable';
  document.addEventListener('click', (e) => {
    const el = e.target.closest(interactive);
    if (!el || el === sfxBtn) return;
    if (el.closest('.zoomable') || el.matches('.btn-fill, .rail a')) sfx.open(); else sfx.select();
  });
  if (fine) {
    let lastHover = null;
    document.addEventListener('pointerover', (e) => {
      const el = e.target.closest('.btn, .nav-links a, .rail a, .filters button, .lm-skills button, .lm-projects a, .card a, .echo-dots button');
      if (el && el !== lastHover) sfx.hover();
      lastHover = el;
    });
  }

  /* ============================================================
     SKILLS MAP: skills on the left, projects on the right.
     Wires are drawn only for the skill or project in focus.
     ============================================================ */
  const lmap = $('[data-lmap]');
  if (!lmap) return;
  const wires = $('.lm-wires', lmap);
  const skillBtns = $$('.lm-skills button', lmap);
  const projLinks = new Map($$('.lm-projects a', lmap).map((a) => [a.dataset.slug, a]));
  const toProj = new Map(skillBtns.map((b) => [b, b.dataset.to.split(' ')]));
  const toSkill = new Map([...projLinks.keys()].map((s) => [s, skillBtns.filter((b) => toProj.get(b).includes(s))]));
  const NS = 'http://www.w3.org/2000/svg';
  let pinned = null;

  function wire(from, to, i) {
    const box = wires.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    const x1 = a.right - box.left, y1 = a.top + a.height / 2 - box.top, x2 = b.left - box.left, y2 = b.top + b.height / 2 - box.top;
    const mx = (x1 + x2) / 2, p = document.createElementNS(NS, 'path');
    p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    p.style.animationDelay = `${i * 40}ms`;
    wires.appendChild(p);
  }
  function focus(el) {
    wires.replaceChildren();
    lmap.classList.toggle('lm-active', !!el);
    $$('.on', lmap).forEach((x) => x.classList.remove('on'));
    if (!el) return;
    el.classList.add('on');
    const drawn = getComputedStyle(wires).display !== 'none';
    if (el.tagName === 'BUTTON') {
      toProj.get(el).forEach((s, i) => { const a = projLinks.get(s); if (!a) return; a.classList.add('on'); if (drawn) wire(el, a, i); });
    } else {
      toSkill.get(el.dataset.slug).forEach((b, i) => { b.classList.add('on'); if (drawn) wire(b, el, i); });
    }
  }
  const release = () => focus(pinned);
  skillBtns.forEach((b) => {
    b.addEventListener('pointerenter', () => fine && focus(b));
    b.addEventListener('focus', () => focus(b));
    b.addEventListener('click', () => { pinned = pinned === b ? null : b; b.setAttribute('aria-pressed', String(pinned === b)); skillBtns.forEach((x) => x !== b && x.setAttribute('aria-pressed', 'false')); focus(pinned); });
  });
  projLinks.forEach((a) => {
    a.addEventListener('pointerenter', () => fine && focus(a));
    a.addEventListener('focus', () => focus(a));
  });
  lmap.addEventListener('pointerleave', release);
  lmap.addEventListener('focusout', (e) => { if (!lmap.contains(e.relatedTarget)) release(); });
  addEventListener('resize', () => focus(pinned));
})();
