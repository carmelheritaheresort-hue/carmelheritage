/* Homepage hero slideshow: crossfade with a slow zoom ("Ken Burns"), a progress line in step with
   each photo, and a pause button. A photo is shown only once it has fully loaded, so the timing
   stays even. Visitors who ask their device for reduced motion get a still photo. */
(function () {
  'use strict';
  var fig = document.querySelector('[data-slideshow]');
  if (!fig) return;
  var slides = Array.prototype.slice.call(fig.querySelectorAll('.hs-slide'));
  var bar = document.querySelector('[data-slideshow-toggle] .hs-progress');
  var scope = fig.closest('.hero') || fig; // timing variables reach both the photos and the button
  var btn = document.querySelector('[data-slideshow-toggle]');
  if (slides.length < 2) return;

  var hold = Math.max(0.3, parseFloat(fig.getAttribute('data-hold')) || 3);
  var fade = Math.max(0.1, parseFloat(fig.getAttribute('data-fade')) || 0.5);
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Timing goes to CSS through custom properties (CSSOM, allowed by the site's security policy).
  scope.style.setProperty('--fade', fade + 's');
  scope.style.setProperty('--hold', hold + 's');
  scope.style.setProperty('--kb', (hold + fade * 2) + 's');

  var current = 0, timer = null, playing = false, waiting = false;

  function load(i) {
    var img = slides[i];
    if (!img || img.getAttribute('src')) return;
    img.src = img.getAttribute('data-src');
  }
  function ready(img) { return img.complete && img.naturalWidth > 0; }
  function preload(from) { load((from + 1) % slides.length); load((from + 2) % slides.length); }

  function restartBar() {
    if (!bar) return;
    bar.classList.remove('run');
    void bar.offsetWidth; // restart the CSS animation
    if (playing) bar.classList.add('run');
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
    preload(next);
    restartBar();
    schedule();
  }

  function advance() {
    if (!playing) return;
    var next = (current + 1) % slides.length;
    var img = slides[next];
    load(next);
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
    if (playing) timer = setTimeout(advance, (hold + fade) * 1000);
  }

  function setPlaying(on) {
    playing = on;
    fig.classList.toggle('is-paused', !on);
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'false' : 'true');
      btn.querySelector('.hs-label').textContent = on ? 'Pause slideshow' : 'Play slideshow';
      btn.classList.toggle('is-paused', !on);
    }
    if (on) { preload(current); restartBar(); schedule(); } else { clearTimeout(timer); if (bar) bar.classList.remove('run'); }
  }

  var userPaused = calm;
  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', function () { userPaused = playing; setPlaying(!playing); });
  }
  // Stop while the tab is hidden, so the timing is in step again when the visitor comes back.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) setPlaying(false); else if (!userPaused) setPlaying(true);
  });

  fig.classList.add('hs-ready');
  var first = slides[0];
  var start = function () { if (!userPaused) setPlaying(true); else setPlaying(false); };
  if (ready(first)) start(); else { first.addEventListener('load', start, { once: true }); first.addEventListener('error', start, { once: true }); }
})();
