(function() {
  var html = document.documentElement;
  var btn = document.getElementById('font-btn');
  var menu = document.getElementById('font-menu');
  if (!btn || !menu) return;
  var current = html.getAttribute('data-font') || 'maple';
  var VALID = ['maple', 'iosevka'];
  var LABELS = { maple: 'Maple Mono', iosevka: 'Iosevka' };
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

  setActive();

  btn.addEventListener('click', function(e) {
    e.stopPropagation();
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
})();
