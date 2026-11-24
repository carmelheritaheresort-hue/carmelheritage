/* Homepage hero slideshow: crossfade with a slow zoom ("Ken Burns"). A new photo appears every
   "seconds per photo" (fade included). All photos are fetched up front so the fast pace stays even;
   a photo is shown only once it has fully loaded. Visitors who ask their device for reduced motion
   get a still photo. */
(function () {
  'use strict';
  var fig = document.querySelector('[data-slideshow]');
  if (!fig) return;
  var slides = Array.prototype.slice.call(fig.querySelectorAll('.hs-slide'));
  if (slides.length < 2) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var step = Math.max(0.1, parseFloat(fig.getAttribute('data-hold')) || 0.3);
  var fade = Math.min(Math.max(0.05, parseFloat(fig.getAttribute('data-fade')) || 0.15), step / 2);
  var scope = fig.closest('.hero') || fig;

  // Timing goes to CSS through custom properties (CSSOM, allowed by the site's security policy).
  scope.style.setProperty('--fade', fade + 's');
  scope.style.setProperty('--kb', (step + fade) + 's');

  var current = 0, timer = null, playing = false, waiting = false;

  function ready(img) { return img.complete && img.naturalWidth > 0; }
  function loadAll() {
    slides.forEach(function (img) { if (!img.getAttribute('src')) img.src = img.getAttribute('data-src'); });
  }

  function show(next) {
    var prev = slides[current];
    var img = slides[next];
    // Restart the zoom on the incoming photo so every slide moves the same way in time.
    img.classList.remove('is-on');
    void img.offsetWidth;
    img.classList.add('is-on');
    prev.classList.add('is-leaving');
    prev.classList.remove('is-on');
    setTimeout(function () { prev.classList.remove('is-leaving'); }, fade * 1000 + 50);
    current = next;
    schedule();
  }

  function advance() {
    if (!playing) return;
    var next = (current + 1) % slides.length;
    var img = slides[next];
    if (ready(img)) { waiting = false; show(next); return; }
    // Not loaded yet: wait for it rather than show a half-drawn photo.
    if (waiting) return;
    waiting = true;
    var done = function () {
      img.removeEventListener('load', done); img.removeEventListener('error', skip);
      waiting = false; if (playing) show(next);
    };
    var skip = function () {
      img.removeEventListener('load', done); img.removeEventListener('error', skip);
      waiting = false; slides.splice(next, 1); if (current > next) current--; if (playing && slides.length > 1) advance();
    };
    img.addEventListener('load', done); img.addEventListener('error', skip);
  }

  function schedule() {
    clearTimeout(timer);
    if (playing) timer = setTimeout(advance, step * 1000);
  }

  function setPlaying(on) {
    playing = on;
    fig.classList.toggle('is-paused', !on);
    if (on) schedule(); else clearTimeout(timer);
  }

  // Stop while the tab is hidden, so the timing is in step again when the visitor comes back.
  document.addEventListener('visibilitychange', function () { setPlaying(!document.hidden); });

  var first = slides[0];
  var start = function () { loadAll(); setPlaying(!document.hidden); };
  if (ready(first)) start(); else { first.addEventListener('load', start, { once: true }); first.addEventListener('error', start, { once: true }); }
})();
