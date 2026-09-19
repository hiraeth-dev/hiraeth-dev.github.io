(function() {
  var html = document.documentElement;
  var btn = document.getElementById('theme-btn');
  var menu = document.getElementById('theme-menu');
  if (!btn || !menu) return;
  var current = html.getAttribute('data-theme') || 'magma';
  var VALID = ['magma', 'abyss', 'bordeaux', 'cyberpunk', 'dusky', 'forest', 'lagoon', 'walnut'];
  if (VALID.indexOf(current) < 0) {
    current = 'magma';
    html.setAttribute('data-theme', current);
    try { localStorage.setItem('theme', current); } catch (e) {}
  }

  function setActive() {
    var opts = menu.querySelectorAll('[data-theme-opt]');
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.toggle('active', opts[i].getAttribute('data-theme-opt') === current);
    }
    btn.setAttribute('aria-label', 'Theme: ' + current);
    btn.setAttribute('title', 'Theme: ' + current);
  }

  function close() {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  function positionMenu() {
    var nav = document.querySelector('nav.top');
    if (!nav || !btn.parentElement) return;
    var navBottom = nav.getBoundingClientRect().bottom;
    var parentTop = btn.parentElement.getBoundingClientRect().top;
    menu.style.top = Math.round(navBottom - parentTop - 1) + 'px';
  }

  setActive();

  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    // Close any other open dropdown menu (e.g. font-menu)
    document.querySelectorAll('.theme-menu.open').forEach(function(m) {
      if (m !== menu) {
        m.classList.remove('open');
        var b = m.parentElement ? m.parentElement.querySelector('.theme-btn') : null;
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    });

    positionMenu();
    var open = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  menu.addEventListener('click', function(e) {
    var t = e.target.getAttribute && e.target.getAttribute('data-theme-opt');
    if (!t) return;
    current = t;
    html.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch(err) {}
    setActive();
    close();
    document.dispatchEvent(new Event('themechange'));
  });

  document.addEventListener('click', function(e) {
    if (!menu.contains(e.target)) close();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') close();
  });

  window.addEventListener('resize', function() {
    if (menu.classList.contains('open')) positionMenu();
  });

  document.addEventListener('fontchange', function() {
    if (menu.classList.contains('open')) positionMenu();
  });
})();
