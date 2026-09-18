(function() {
  var html = document.documentElement;
  var btn = document.getElementById('theme-btn');
  var menu = document.getElementById('theme-menu');
  if (!btn || !menu) return;
  var current = html.getAttribute('data-theme') || 'miasma';
  var VALID = ['miasma', 'solitude', 'gruvbox'];
  if (VALID.indexOf(current) < 0) {
    current = 'miasma';
    html.setAttribute('data-theme', current);
    try { localStorage.setItem('theme', current); } catch (e) {}
  }

  function setActive() {
    var opts = menu.querySelectorAll('[data-theme-opt]');
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.toggle('active', opts[i].getAttribute('data-theme-opt') === current);
    }
    btn.textContent = current;
  }

  function close() {
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  setActive();

  btn.addEventListener('click', function(e) {
    e.stopPropagation();
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
})();
