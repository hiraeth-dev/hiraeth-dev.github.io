(function() {
  var html = document.documentElement;
  var btn = document.getElementById('font-btn');
  if (!btn) return;
  var VALID = ['maple', 'iosevka', 'space'];
  var LABELS = { maple: 'Maple Mono', iosevka: 'Iosevka', space: 'Space Mono' };
  var current = html.getAttribute('data-font') || 'iosevka';
  if (VALID.indexOf(current) < 0) {
    current = 'iosevka';
    html.setAttribute('data-font', current);
    try { localStorage.setItem('font', current); } catch (e) {}
  }

  function describe() {
    btn.setAttribute('aria-label', 'Font: ' + LABELS[current] + ' (click to switch)');
    btn.setAttribute('title', 'Font: ' + LABELS[current] + ' (click to switch)');
  }

  describe();

  btn.addEventListener('click', function() {
    var idx = VALID.indexOf(current);
    current = VALID[(idx + 1) % VALID.length];
    html.setAttribute('data-font', current);
    try { localStorage.setItem('font', current); } catch (err) {}
    describe();
    document.dispatchEvent(new Event('fontchange'));
  });
})();
