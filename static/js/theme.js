(function() {
  var html = document.documentElement;
  var btn = document.getElementById('theme-btn');
  if (!btn) return;
  var VALID = ['amber', 'mallow', 'slick', 'safelight', 'tungsten'];
  var current = html.getAttribute('data-theme') || 'tungsten';
  if (VALID.indexOf(current) < 0) {
    current = 'tungsten';
    html.setAttribute('data-theme', current);
    try { localStorage.setItem('theme', current); } catch (e) {}
  }

  function describe() {
    btn.setAttribute('aria-label', 'Theme: ' + current + ' (click to switch)');
    btn.setAttribute('title', 'Theme: ' + current + ' (click to switch)');
  }

  describe();

  btn.addEventListener('click', function() {
    var idx = VALID.indexOf(current);
    current = VALID[(idx + 1) % VALID.length];
    html.setAttribute('data-theme', current);
    try { localStorage.setItem('theme', current); } catch (err) {}
    describe();
    document.dispatchEvent(new Event('themechange'));
  });
})();
