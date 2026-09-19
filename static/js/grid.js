(() => {
  'use strict';

  // hiraeth serves this as static/js/grid.js behind a #grid-canvas element
  // (the extension uses #bg-canvas) — accept either.
  const c = document.getElementById('grid-canvas') || document.getElementById('bg-canvas');
  if (!c) return;

  const ctx = c.getContext('2d');
  let mx = -9999, my = -9999, lmx = -9999, lmy = -9999;
  let pts = [];
  const SPACING = 55;
  const RADIUS = 120;
  const STRENGTH = 0.4;
  const DAMP = 0.88;
  const SPRING = 0.04;

  // hiraeth defines both --canvas-* and --grid-* vars (same values);
  // prefer --canvas-* to match the extension, fall back to --grid-*.
  function getColors() {
    const cs = getComputedStyle(document.documentElement);
    const pick = (a, b, fb) => cs.getPropertyValue(a).trim() || cs.getPropertyValue(b).trim() || fb;
    return {
      fade: pick('--canvas-fade', '--grid-fade', '#003049'),
      line: pick('--canvas-line', '--grid-line', 'rgba(193, 18, 31, 0.08)'),
      dot: pick('--canvas-dot', '--grid-dot', 'rgba(193, 18, 31, 0.28)'),
    };
  }
  function parseRgba(str) {
    const m = str.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([\d.]+))?/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 0.20 };
    if (str.startsWith('#')) {
      const r = parseInt(str.slice(1, 3), 16), g = parseInt(str.slice(3, 5), 16), b = parseInt(str.slice(5, 7), 16);
      return { r, g, b, a: 0.20 };
    }
    return { r: 150, g: 170, b: 220, a: 0.20 };
  }
  let clr = getColors();
  let dotRgba = parseRgba(clr.dot);
  let live = false;
  // hiraeth's theme switcher dispatches this; re-read vars when it fires.
  document.addEventListener('themechange', () => {
    clr = getColors();
    dotRgba = parseRgba(clr.dot);
  });

  function resize() {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    build();
  }

  function build() {
    pts = [];
    const cols = Math.ceil(c.width / SPACING) + 2;
    const rows = Math.ceil(c.height / SPACING) + 2;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        pts.push({
          ox: col * SPACING,
          oy: r * SPACING,
          x: col * SPACING,
          y: r * SPACING,
          vx: 0, vy: 0,
          phase: Math.random() * Math.PI * 2,
          flick: 0.003 + Math.random() * 0.007,
        });
      }
    }
  }

  function hexAlpha(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function draw(now = performance.now()) {
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, clr.fade);
    grad.addColorStop(0.12, hexAlpha(clr.fade, 0));
    grad.addColorStop(0.88, hexAlpha(clr.fade, 0));
    grad.addColorStop(1, clr.fade);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cols = Math.ceil(w / SPACING) + 2;
    const rows_n = Math.ceil(h / SPACING) + 2;

    ctx.strokeStyle = clr.line;
    ctx.lineWidth = 1;
    for (let col = 0; col < cols; col++) {
      ctx.beginPath();
      for (let r = 0; r < rows_n; r++) {
        const idx = r * cols + col;
        if (idx >= pts.length) break;
        const p = pts[idx];
        if (r === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    for (let r = 0; r < rows_n; r++) {
      ctx.beginPath();
      for (let col = 0; col < cols; col++) {
        const idx = r * cols + col;
        if (idx >= pts.length) break;
        const p = pts[idx];
        if (col === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // original grid preserved — only hover bloom is premium
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = p.x - mx, dy = p.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let t = 0;
      if (dist < RADIUS) t = 1 - dist / RADIUS;
      const glow = t * t * 1.12;
      // blink only affects the hover glow, not the base grid
      const blink = 0.88 + 0.12 * Math.sin(now * p.flick + p.phase);
      if (glow > 0.02) {
        const outer = 1.5 + 6 + glow * 12;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, outer);
        const ga = (0.14 + glow * 0.32) * blink;
        grad.addColorStop(0, `rgba(${dotRgba.r},${dotRgba.g},${dotRgba.b},${ga})`);
        grad.addColorStop(0.24, `rgba(${dotRgba.r},${dotRgba.g},${dotRgba.b},${ga * 0.38})`);
        grad.addColorStop(0.6, `rgba(${dotRgba.r},${dotRgba.g},${dotRgba.b},${glow * 0.10 * blink})`);
        grad.addColorStop(1, `rgba(${dotRgba.r},${dotRgba.g},${dotRgba.b},0)`);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, outer, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        // brightened core on hover
        ctx.fillStyle = `rgba(${dotRgba.r},${dotRgba.g},${dotRgba.b},${dotRgba.a + glow * 0.5 * blink})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5 + glow * 2.0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // original grid dot — untouched
        ctx.fillStyle = clr.dot;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function pushAt(cx, cy) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = p.ox - cx;
      const dy = p.oy - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < RADIUS && dist > 1) {
        const force = (1 - dist / RADIUS) * STRENGTH;
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * force;
        p.vy += Math.sin(angle) * force;
      }
    }
  }

  function tick() {
    const now = performance.now();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = p.ox - mx;
      const dy = p.oy - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < RADIUS && dist > 1) {
        const force = (1 - dist / RADIUS) * 0.12;
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * force;
        p.vy += Math.sin(angle) * force;
      }
      const ax = p.ox + Math.sin(now * 0.001 + p.ox * 0.02) * 7;
      const ay = p.oy + Math.cos(now * 0.0012 + p.oy * 0.02) * 7;
      p.vx += (ax - p.x) * SPRING;
      p.vy += (ay - p.y) * SPRING;
      p.vx *= DAMP;
      p.vy *= DAMP;
      p.x += p.vx;
      p.y += p.vy;
    }

    draw(now);
    if (!live) {
      live = true;
      // First live frame drawn — fade out the static CSS underlay.
      document.documentElement.classList.add('grid-live');
    }
    requestAnimationFrame(tick);
  }

  document.addEventListener('mousemove', (e) => {
    const nx = e.clientX, ny = e.clientY;
    const step = 8;
    const dx = nx - lmx;
    const dy = ny - lmy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > step) {
      const steps = Math.ceil(d / step);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        pushAt(lmx + dx * t, lmy + dy * t);
      }
    } else {
      pushAt(nx, ny);
    }
    lmx = mx = nx;
    lmy = my = ny;
  });

  window.addEventListener('resize', resize);
  resize();
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    draw();
    document.documentElement.classList.add('grid-live');
    return;
  }
  tick();
})();
