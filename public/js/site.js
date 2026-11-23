(function () {
  'use strict';

  // Aggregate-only analytics events. No names, numbers, dates or messages are ever passed.
  window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
  window.cavTrack = function (name) { try { window.plausible(name); } catch (e) { /* analytics is optional */ } };

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-track]') : null;
    if (el) window.cavTrack(el.getAttribute('data-track'));
  });

  var header = document.querySelector('[data-header]');
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');

  // Header turns solid after scrolling past the top of the page.
  function onScroll() { if (header) header.classList.toggle('is-solid', window.scrollY > 40); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (!toggle || !nav || !header) return;

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    nav.classList.toggle('open', open);
    header.classList.toggle('menu-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      var rect = header.querySelector('.header-inner').getBoundingClientRect();
      nav.style.setProperty('--nav-top', Math.round(rect.bottom) + 'px');
    }
  }
  toggle.addEventListener('click', function () { setOpen(toggle.getAttribute('aria-expanded') !== 'true'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); }
  });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  window.addEventListener('resize', function () { if (window.innerWidth > 1180 && nav.classList.contains('open')) setOpen(false); });
})();
