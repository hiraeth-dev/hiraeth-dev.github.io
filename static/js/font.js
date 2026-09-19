(function() {
  var html = document.documentElement;
  var btn = document.getElementById('font-btn');
  if (!btn) return;
  var VALID = ['maple', 'iosevka'];
  var LABELS = { maple: 'Maple Mono', iosevka: 'Iosevka' };
  var current = html.getAttribute('data-font') || 'maple';
  if (VALID.indexOf(current) < 0) {
    current = 'maple';
    html.setAttribute('data-font', current);
    try { localStorage.setItem('font', current); } catch (e) {}
  }

  function describe() {
    btn.setAttribute('aria-label', 'Font: ' + LABELS[current] + ' (click to switch)');
    btn.setAttribute('title', 'Font: ' + LABELS[current] + ' (click to switch)');
  }

  describe();

  btn.addEventListener('click', function() {
    current = current === 'maple' ? 'iosevka' : 'maple';
    html.setAttribute('data-font', current);
    try { localStorage.setItem('font', current); } catch (err) {}
    describe();
    document.dispatchEvent(new Event('fontchange'));
  });
})();
