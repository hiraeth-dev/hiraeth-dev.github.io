(function() {
  var doc = document;
  // Gate the dimmed pre-reveal state on this script actually running.
  // (Previously `html.js` was set in <head>, so first paint showed every
  // section at 15% opacity until these files arrived — a dark flash.)
  doc.documentElement.classList.add('anim-on');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* scroll progress bar */
  var bar = doc.getElementById('scroll-bar');
  function updateBar() {
    var st = window.pageYOffset || doc.documentElement.scrollTop || 0;
    var sh = doc.documentElement.scrollHeight - doc.documentElement.clientHeight;
    if (bar) bar.style.width = (sh > 0 ? (st / sh) * 100 : 0) + '%';
  }
  if (bar) {
    window.addEventListener('scroll', updateBar, { passive: true });
    window.addEventListener('resize', updateBar);
    updateBar();
  }

  /* reveal on scroll */
  var els = doc.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    for (var i = 0; i < els.length; i++) els[i].classList.add('in');
    return;
  }

  for (var j = 0; j < els.length; j++) {
    var el = els[j];
    var parent = el.parentElement;
    if (parent) {
      var idx = Array.prototype.indexOf.call(parent.children, el);
      el.style.setProperty('--delay', (idx * 60) + 'ms');
    }
  }

  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.01, rootMargin: '0px 0px 60px 0px' });

  for (var k = 0; k < els.length; k++) {
    var r = els[k].getBoundingClientRect();
    if (r.top < window.innerHeight + 60) {
      els[k].classList.add('in');
    } else {
      io.observe(els[k]);
    }
  }

  /* stat counters */
  var counts = doc.querySelectorAll('.stat-count');
  function animateCount(targetEl) {
    var target = parseInt(targetEl.getAttribute('data-count'), 10) || 0;
    var dur = 900;
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      targetEl.textContent = Math.round(eased * target);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  for (var c = 0; c < counts.length; c++) {
    (function(el) {
      var io2 = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            animateCount(el);
            io2.unobserve(el);
          }
        });
      }, { threshold: 0.5 });
      io2.observe(el);
    })(counts[c]);
  }
})();
