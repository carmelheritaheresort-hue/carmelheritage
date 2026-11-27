/* Digital Brochure page: full-screen viewer with zoom (buttons, keyboard, double-tap, mouse wheel
   with Ctrl, two-finger pinch), drag to move, swipe or arrows for the next brochure, download, and
   sharing through the device's share sheet (or copying the link where that is not available).
   Without JavaScript, each brochure link simply opens the original image. */
(function () {
  'use strict';
  var root = document.querySelector('[data-brochures]');
  var dlg = document.querySelector('[data-bro-lightbox]');
  if (!root || !dlg || typeof dlg.showModal !== 'function') return;
  var list = JSON.parse(root.getAttribute('data-brochures') || '[]');
  var site = root.getAttribute('data-site') || '';
  var stage = dlg.querySelector('[data-lb-stage]');
  var img = dlg.querySelector('[data-lb-img]');
  var titleEl = dlg.querySelector('[data-lb-title]');
  var levelEl = dlg.querySelector('[data-lb-level]');
  var countEl = dlg.querySelector('[data-lb-count]');
  var dl = dlg.querySelector('[data-lb-download]');
  var toast = document.querySelector('[data-bro-toast]');
  var LEVELS = [1, 1.5, 2, 3, 4];
  var MAX = 4;
  var current = 0, zoom = 1, opener = null;

  function pageUrl(i) { return location.origin + location.pathname + '#' + list[i].slug; }

  // ---- Share --------------------------------------------------------------
  var canShare = !!navigator.share;
  var canCopy = !!(navigator.clipboard && window.isSecureContext);
  function say(text) {
    if (!toast) return;
    toast.textContent = text; toast.hidden = false;
    clearTimeout(say.t); say.t = setTimeout(function () { toast.hidden = true; }, 2600);
  }
  function share(i) {
    var b = list[i], url = pageUrl(i);
    var data = { title: b.title + ' | ' + site, text: b.title + ' at ' + site + '. See the brochure:', url: url };
    if (canShare) {
      navigator.share(data).catch(function (e) { if (e && e.name !== 'AbortError') copy(url); });
    } else copy(url);
    if (window.cavTrack) window.cavTrack('Brochure Share', { props: { brochure: b.slug } });
  }
  function copy(url) {
    if (!canCopy) { window.prompt('Copy this link to share the brochure:', url); return; }
    navigator.clipboard.writeText(url).then(function () { say('Link copied. Paste it into WhatsApp or a message to share.'); },
      function () { window.prompt('Copy this link to share the brochure:', url); });
  }
  // Share buttons are shown only when sharing or copying can work.
  if (canShare || canCopy || window.prompt) {
    document.querySelectorAll('[data-bro-share], [data-lb-share]').forEach(function (b) { b.hidden = false; });
  }
  document.querySelectorAll('[data-bro-share]').forEach(function (b) {
    b.addEventListener('click', function () { share(+b.getAttribute('data-bro-share')); });
  });
  dlg.querySelector('[data-lb-share]').addEventListener('click', function () { share(current); });

  // ---- Zoom ---------------------------------------------------------------
  // "Fit" (zoom 1) shows the whole brochure; higher levels enlarge it from that size.
  function fitScale() {
    var w = img.naturalWidth || list[current].w, h = img.naturalHeight || list[current].h;
    var sw = stage.clientWidth - 16, sh = stage.clientHeight - 16;
    return Math.min(sw / w, sh / h, 1.5);
  }
  function setZoom(z, cx, cy) {
    z = Math.max(1, Math.min(MAX, z));
    var before = img.getBoundingClientRect();
    // The point under the finger or cursor, as a share of the image, stays in place.
    var px = cx == null ? 0.5 : (cx - before.left) / before.width;
    var py = cy == null ? 0.5 : (cy - before.top) / before.height;
    var sRect = stage.getBoundingClientRect();
    var ox = cx == null ? sRect.width / 2 : cx - sRect.left;
    var oy = cy == null ? sRect.height / 2 : cy - sRect.top;
    zoom = z;
    var w = (img.naturalWidth || list[current].w) * fitScale() * z;
    img.style.width = Math.round(w) + 'px';
    stage.classList.toggle('is-zoomed', z > 1.01);
    var after = img.getBoundingClientRect();
    var imgLeft = after.left - sRect.left + stage.scrollLeft, imgTop = after.top - sRect.top + stage.scrollTop;
    stage.scrollLeft = imgLeft + px * after.width - ox;
    stage.scrollTop = imgTop + py * after.height - oy;
    levelEl.textContent = z > 1.01 ? Math.round(z * 100) + '%' : 'Fit';
  }
  function step(dir) {
    var next = dir > 0 ? LEVELS.find(function (l) { return l > zoom + 0.01; }) : LEVELS.slice().reverse().find(function (l) { return l < zoom - 0.01; });
    setZoom(next == null ? (dir > 0 ? MAX : 1) : next);
  }
  dlg.querySelectorAll('[data-lb-zoom]').forEach(function (b) {
    b.addEventListener('click', function () { step(+b.getAttribute('data-lb-zoom')); });
  });
  dlg.querySelector('[data-lb-fit]').addEventListener('click', function () { setZoom(1); });
  stage.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) return; // a plain wheel scrolls the zoomed brochure
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY);
  }, { passive: false });
  img.addEventListener('dblclick', function (e) { setZoom(zoom > 1.01 ? 1 : 2.5, e.clientX, e.clientY); });

  // ---- Drag, pinch and swipe ----------------------------------------------
  var pts = {}, drag = null, pinch = null, lastTap = 0;
  function count() { return Object.keys(pts).length; }
  stage.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    stage.setPointerCapture(e.pointerId);
    if (count() === 2) {
      var p = Object.values(pts);
      pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), z: zoom };
      drag = null;
    } else {
      drag = { x: e.clientX, y: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop, moved: false, t: Date.now() };
    }
  });
  stage.addEventListener('pointermove', function (e) {
    if (!pts[e.pointerId]) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch && count() === 2) {
      var p = Object.values(pts);
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      setZoom(pinch.z * d / pinch.d, (p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
    } else if (drag) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (zoom > 1.01) { stage.scrollLeft = drag.sl - dx; stage.scrollTop = drag.st - dy; }
    }
  });
  function end(e) {
    if (!pts[e.pointerId]) return;
    delete pts[e.pointerId];
    if (pinch) { if (count() < 2) pinch = null; drag = null; return; }
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    // Swipe sideways to change brochure when the brochure fits the screen.
    if (zoom <= 1.01 && drag.moved && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - drag.t < 800) show(current + (dx < 0 ? 1 : -1));
    // Double-tap to zoom on touch screens.
    if (!drag.moved && e.pointerType === 'touch') {
      var now = Date.now();
      if (now - lastTap < 320) { setZoom(zoom > 1.01 ? 1 : 2.5, e.clientX, e.clientY); lastTap = 0; } else lastTap = now;
    }
    drag = null;
  }
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  // ---- Open, change, close ------------------------------------------------
  function show(i) {
    current = (i + list.length) % list.length;
    var b = list[current];
    stage.classList.add('is-loading');
    img.style.width = '';
    img.onload = function () { stage.classList.remove('is-loading'); setZoom(1); };
    img.src = b.src; img.alt = b.alt;
    if (img.complete && img.naturalWidth) { stage.classList.remove('is-loading'); setZoom(1); }
    titleEl.textContent = b.title;
    dl.href = b.src; dl.setAttribute('download', b.file);
    countEl.textContent = (current + 1) + ' of ' + list.length;
    if (history.replaceState) history.replaceState(null, '', '#' + b.slug);
  }
  function open(i, from) {
    opener = from || null;
    document.documentElement.classList.add('lb-open');
    dlg.showModal();
    show(i);
    dlg.querySelector('[data-lb-close]').focus();
    if (window.cavTrack) window.cavTrack('Brochure View', { props: { brochure: list[i].slug } });
  }
  document.querySelectorAll('[data-bro-open]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // new-tab clicks keep working
      e.preventDefault();
      open(+a.getAttribute('data-bro-open'), a);
    });
  });
  dlg.querySelectorAll('[data-lb-step]').forEach(function (b) {
    b.addEventListener('click', function () { show(current + (+b.getAttribute('data-lb-step'))); });
  });
  dlg.querySelector('[data-lb-close]').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () {
    document.documentElement.classList.remove('lb-open');
    pts = {}; drag = pinch = null;
    if (opener) opener.focus({ preventScroll: true });
  });
  dlg.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('a, button') && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === 'ArrowRight' && zoom <= 1.01) { show(current + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' && zoom <= 1.01) { show(current - 1); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { step(1); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { step(-1); e.preventDefault(); }
    else if (e.key === '0') { setZoom(1); e.preventDefault(); }
  });
  window.addEventListener('resize', function () { if (dlg.open) setZoom(zoom); });
})();
