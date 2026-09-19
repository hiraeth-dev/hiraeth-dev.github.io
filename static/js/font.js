(function() {
  var html = document.documentElement;
  var btn = document.getElementById('font-btn');
  var menu = document.getElementById('font-menu');
  if (!btn || !menu) return;
  var current = html.getAttribute('data-font') || 'maple';
  var VALID = ['maple', 'iosevka', 'flaviotte', 'baskerville'];
  var LABELS = { maple: 'Maple Mono', iosevka: 'Iosevka', flaviotte: 'Flaviotte', baskerville: 'Baskerville' };
  if (VALID.indexOf(current) < 0) {
    current = 'maple';
    html.setAttribute('data-font', current);
    try { localStorage.setItem('font', current); } catch (e) {}
  }

  function setActive() {
    var opts = menu.querySelectorAll('[data-font-opt]');
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.toggle('active', opts[i].getAttribute('data-font-opt') === current);
    }
    btn.setAttribute('aria-label', 'Font: ' + LABELS[current]);
    btn.setAttribute('title', 'Font: ' + LABELS[current]);
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
    // Close any other open dropdown menu (e.g. theme-menu)
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
    var f = e.target.getAttribute && e.target.getAttribute('data-font-opt');
    if (!f) return;
    current = f;
    html.setAttribute('data-font', f);
    try { localStorage.setItem('font', f); } catch(err) {}
    setActive();
    close();
    document.dispatchEvent(new Event('fontchange'));
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
