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

  // Cards fade in gently as they scroll into view. Skipped when the visitor prefers reduced motion.
  var reveal = document.querySelectorAll('.reveal');
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reveal.length && 'IntersectionObserver' in window && !calm) {
    var fired = false;
    var showAll = function () { reveal.forEach(function (el) { el.classList.add('is-in'); }); };
    var io = new IntersectionObserver(function (entries) {
      fired = true;
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -5% 0px' });
    // Cards already on screen are shown straight away; only those further down fade in.
    reveal.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in');
      else io.observe(el);
    });
    document.documentElement.classList.add('reveal-on');
    // Safety net: if the browser never reports scrolling, show everything rather than leave gaps.
    setTimeout(function () { if (!fired) showAll(); }, 1500);
    window.addEventListener('beforeprint', showAll);
  }

  // Opening a package link (#package-12) expands its treatment schedule.
  function openTarget() {
    var el = location.hash && document.getElementById(location.hash.slice(1));
    var d = el && el.querySelector('details');
    if (d) d.open = true;
    if (el) el.classList.add('is-in');
  }
  window.addEventListener('hashchange', openTarget);
  openTarget();

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
