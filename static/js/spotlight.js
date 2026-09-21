(() => {
  'use strict';

  // Cursor spotlight for glossy boxes (see .spot in style.css).
  // Tracks the pointer per card and exposes it as --mx/--my; the ::before
  // overlay renders a static sheen plus a cursor-following accent glow.
  // Skipped entirely under prefers-reduced-motion.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SEL = '.novel-card,.stack-card,.stat-card,.chapter-card,.grid-item,.terminal,.playlist,.code-block,.dict-result,nav.top,.section-heading,.section-badge,.page-header h2,.chapter-body,.back-link a,.page-nav a';

  function attach(el) {
    el.classList.add('spot');
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  }

  document.querySelectorAll(SEL).forEach(attach);
})();
