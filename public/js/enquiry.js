(function () {
  'use strict';
  var V = window.EnquiryValidation;
  if (!V) return;

  document.querySelectorAll('[data-enquiry-form]').forEach(init);

  function addDay(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function init(form) {
    var root = form.closest('[data-enquiry]');
    var success = root.querySelector('[data-success]');
    var summary = form.querySelector('.form-errors');
    var mode = form.getAttribute('data-mode');
    var today = form.getAttribute('data-today');
    var opened = Date.now();
    var last = null;

    var ci = form.elements.check_in, co = form.elements.check_out, pref = form.elements.accommodation_pref, units = form.elements.units;
    if (ci && co) {
      ci.addEventListener('change', function () { if (ci.value) { co.min = addDay(ci.value); if (co.value && co.value <= ci.value) co.value = ''; } });
    }
    function maxUnits() {
      return { cottage: +form.dataset.maxCottage, standard: +form.dataset.maxStandard, either: +form.dataset.maxEither };
    }
    function syncUnits() { if (pref && units) { var m = maxUnits()[pref.value]; if (m) units.max = m; } }
    if (pref) { pref.addEventListener('change', syncUnits); syncUnits(); }

    function clearErrors() {
      form.querySelectorAll('[data-err-for]').forEach(function (p) { p.hidden = true; p.textContent = ''; });
      form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
      summary.hidden = true; summary.textContent = '';
    }

    function showErrors(errors) {
      var list = document.createElement('ul');
      var first = null;
      Object.keys(errors).forEach(function (name) {
        var input = form.elements[name];
        var p = form.querySelector('[data-err-for="' + name + '"]');
        if (p) { p.textContent = errors[name]; p.hidden = false; }
        if (input) { input.setAttribute('aria-invalid', 'true'); if (!first) first = input; }
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + (input ? input.id : '');
        a.textContent = errors[name];
        a.addEventListener('click', function (ev) { ev.preventDefault(); if (input) input.focus(); });
        li.appendChild(a); list.appendChild(li);
      });
      var h = document.createElement('p');
      h.textContent = 'Please check the form:';
      summary.appendChild(h); summary.appendChild(list);
      summary.hidden = false;
      summary.focus();
    }

    function collect() {
      var fd = new FormData(form), o = {};
      fd.forEach(function (v, k) { o[k] = typeof v === 'string' ? v : ''; });
      return o;
    }

    function sendCopy(payload) {
      // Saved copy for staff. WhatsApp does not depend on this succeeding.
      try {
        fetch('/api/enquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      clearErrors();
      var raw = collect();
      var res = V.validate(raw, { today: today, maxUnits: maxUnits() });
      if (!res.ok) { showErrors(res.errors); return; }

      var data = res.clean;
      var text = V.buildMessage(data, form.getAttribute('data-site'));
      var url = 'https://wa.me/' + form.getAttribute('data-wa') + '?text=' + encodeURIComponent(text);
      last = { data: data, text: text, url: url };

      // Open WhatsApp synchronously so the browser treats it as a user action.
      var win = null;
      // (Not using the "noopener" feature: it makes window.open return null, which hides popup blocking.)
      try { win = window.open(url, '_blank'); if (win) win.opener = null; } catch (e) { win = null; }

      var payload = Object.assign({}, data, { website: raw.website || '', elapsed: Date.now() - opened });
      sendCopy(payload);
      if (window.cavTrack) { window.cavTrack('Enquiry Submit'); window.cavTrack('WhatsApp Click'); }

      showSuccess(!win);
    });

    function showSuccess(blocked) {
      success.querySelector('[data-copy-text]').value = last.text;
      success.querySelector('[data-wa-again]').href = last.url;
      success.querySelector('[data-success-blocked]').hidden = !blocked;
      success.querySelector('[data-success-opened]').hidden = blocked;
      var mail = success.querySelector('[data-mail]');
      if (mail) mail.href = 'mailto:' + form.getAttribute('data-email') + '?subject=' + encodeURIComponent('Enquiry') + '&body=' + encodeURIComponent(last.text);
      success.querySelector('[data-copy-status]').textContent = '';
      form.hidden = true;
      success.hidden = false;
      success.focus();
      success.scrollIntoView({ block: 'start' });
    }

    success.querySelector('[data-copy]').addEventListener('click', function () {
      var ta = success.querySelector('[data-copy-text]');
      var status = success.querySelector('[data-copy-status]');
      function done(ok) { status.textContent = ok ? 'Message copied.' : 'Could not copy automatically. Select the text and copy it.'; if (!ok) { ta.focus(); ta.select(); } }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () { done(false); });
      } else {
        ta.focus(); ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        done(ok);
      }
    });

    success.querySelector('[data-wa-again]').addEventListener('click', function () {
      if (window.cavTrack) window.cavTrack('WhatsApp Click');
    });

    success.querySelector('[data-edit]').addEventListener('click', function () {
      success.hidden = true;
      form.hidden = false;
      var first = form.querySelector('input:not([type=hidden]):not([tabindex="-1"])');
      if (first) first.focus();
    });
  }
})();
