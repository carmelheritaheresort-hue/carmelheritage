(function () {
  'use strict';
  var C = window.BookingCalc;
  var form = document.querySelector('[data-book-form]');
  if (!C || !form) return;

  var rooms = JSON.parse(form.getAttribute('data-rooms') || '{}');
  var pricing = JSON.parse(form.getAttribute('data-pricing') || '{}');
  var provider = form.getAttribute('data-provider');
  var today = form.getAttribute('data-today');
  var summaryErr = form.querySelector('.form-errors');
  var statusEl = form.querySelector('[data-avail-status]');
  var payBtn = form.querySelector('[data-pay]');
  var el = form.elements;
  var avail = null;       // { cottage, standard_room } for the chosen dates
  var availKey = '';
  var busy = false;
  var UNIT_FIELD = { cottage: 'cottage_units', standard_room: 'standard_units' };

  function $(sel, root) { return (root || form).querySelector(sel); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // ---- Errors ---------------------------------------------------------------
  function clearErrors() {
    form.querySelectorAll('[data-err-for]').forEach(function (p) { p.hidden = true; p.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    summaryErr.hidden = true; summaryErr.textContent = '';
  }
  function showErrors(errors, message) {
    clearErrors();
    var list = document.createElement('ul'), first = null;
    Object.keys(errors || {}).forEach(function (name) {
      var input = el[name];
      var p = $('[data-err-for="' + name + '"]');
      if (p) { p.textContent = errors[name]; p.hidden = false; }
      if (input && input.setAttribute) { input.setAttribute('aria-invalid', 'true'); if (!first) first = input; }
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + (input && input.id ? input.id : 'book-form');
      a.textContent = errors[name];
      a.addEventListener('click', function (ev) { ev.preventDefault(); if (input && input.focus) input.focus(); });
      li.appendChild(a); list.appendChild(li);
    });
    var h = document.createElement('p');
    h.textContent = message || 'Please check the following:';
    summaryErr.appendChild(h);
    if (list.children.length) summaryErr.appendChild(list);
    summaryErr.hidden = false;
    summaryErr.focus();
  }

  // ---- Availability ---------------------------------------------------------
  function datesValid() {
    var ci = el.check_in.value, co = el.check_out.value;
    return C.isDate(ci) && C.isDate(co) && co > ci && ci >= today && C.days(ci, co) <= C.MAX_NIGHTS;
  }

  function setAvailText(kind, text, none) {
    var p = $('[data-avail-for="' + kind + '"]');
    if (p) { p.textContent = text; p.classList.toggle('none', !!none); }
  }

  function applyAvailability() {
    Object.keys(rooms).forEach(function (kind) {
      var input = el[UNIT_FIELD[kind]];
      var card = $('[data-room="' + kind + '"]');
      var max = avail ? Math.min(avail[kind] || 0, rooms[kind].total) : rooms[kind].total;
      input.max = max;
      if (+input.value > max) input.value = max;
      if (avail) {
        setAvailText(kind, max ? plural(max, 'available', 'available') + ' for your dates' : 'Fully booked for these dates', !max);
        card.classList.toggle('sold-out', !max);
      } else {
        setAvailText(kind, rooms[kind].total + ' in total', false);
        card.classList.remove('sold-out');
      }
      syncStepper(kind);
    });
    update();
  }

  var timer = null;
  function checkAvailability() {
    clearTimeout(timer);
    if (!datesValid()) {
      avail = null; availKey = '';
      statusEl.textContent = el.check_in.value && el.check_out.value && el.check_out.value <= el.check_in.value
        ? 'Check-out must be after check-in.' : 'Choose your dates to see which rooms are free.';
      applyAvailability();
      return;
    }
    var key = el.check_in.value + '_' + el.check_out.value;
    if (key === availKey) return;
    timer = setTimeout(function () {
      statusEl.textContent = 'Checking availability...';
      fetch('/api/availability?check_in=' + encodeURIComponent(el.check_in.value) + '&check_out=' + encodeURIComponent(el.check_out.value), { headers: { 'X-Requested-With': 'fetch' } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j.ok) throw new Error(j.error || 'failed');
          avail = j.availability; availKey = key;
          var n = C.days(el.check_in.value, el.check_out.value);
          var anyFree = Object.keys(rooms).some(function (k) { return avail[k] > 0; });
          statusEl.textContent = anyFree
            ? 'Showing rooms free for ' + plural(n, 'night', 'nights') + '. Choose how many you need below.'
            : 'Sorry, all rooms are booked for these dates. Try other dates or contact the Centre.';
          applyAvailability();
          preselect();
        })
        .catch(function () {
          avail = null; availKey = '';
          statusEl.textContent = 'We could not check availability just now. Please try again, or contact the Centre.';
          applyAvailability();
        });
    }, 250);
  }

  // Pre-pick one room of the type the guest came from (e.g. /book?room=cottage).
  var preselected = false;
  function preselect() {
    if (preselected) return;
    preselected = true;
    var card = $('[data-room][data-preselect]');
    if (!card) return;
    var input = el[UNIT_FIELD[card.getAttribute('data-room')]];
    if (+input.value === 0 && +input.max > 0) { input.value = 1; syncStepper(card.getAttribute('data-room')); update(); }
  }

  // ---- Stepper --------------------------------------------------------------
  function syncStepper(kind) {
    var card = $('[data-room="' + kind + '"]'), input = el[UNIT_FIELD[kind]];
    var v = +input.value || 0;
    card.querySelector('[data-step="-1"]').disabled = v <= 0;
    card.querySelector('[data-step="1"]').disabled = v >= +input.max;
    card.classList.toggle('picked', v > 0);
  }
  form.querySelectorAll('[data-room]').forEach(function (card) {
    var kind = card.getAttribute('data-room'), input = el[UNIT_FIELD[kind]];
    card.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = Math.max(0, Math.min(+input.max, (+input.value || 0) + (+b.getAttribute('data-step'))));
        input.value = v; syncStepper(kind); update();
      });
    });
    input.addEventListener('input', function () { syncStepper(kind); update(); });
  });

  // ---- Summary --------------------------------------------------------------
  function selection() {
    return {
      check_in: el.check_in.value, check_out: el.check_out.value,
      cottage_units: el.cottage_units ? +el.cottage_units.value || 0 : 0,
      standard_units: el.standard_units ? +el.standard_units.value || 0 : 0
    };
  }

  function update() {
    var sel = selection();
    var hasRooms = sel.cottage_units + sel.standard_units > 0;
    var ok = datesValid() && hasRooms;
    $('[data-summary-empty]').hidden = ok;
    $('[data-summary-body]').hidden = !ok;
    if (!ok) { payBtn.textContent = 'Continue to payment'; return; }
    var q = C.quote(sel, rooms, pricing);
    $('[data-sum-dates]').textContent = fmt(sel.check_in) + ' to ' + fmt(sel.check_out) + ' \u00B7 ' + plural(q.nights, 'night', 'nights');
    var tb = $('[data-sum-lines]');
    tb.textContent = '';
    q.lines.forEach(function (l) {
      var tr = document.createElement('tr'), th = document.createElement('th'), td = document.createElement('td');
      th.scope = 'row';
      th.textContent = (l.kind === 'cottage' ? plural(l.units, 'cottage', 'cottages') : plural(l.units, 'standard room', 'standard rooms')) +
        ' \u00D7 ' + plural(l.nights, 'night', 'nights') + ' @ ' + C.rupees(l.rate * 100);
      td.textContent = C.rupees(l.amount);
      tr.appendChild(th); tr.appendChild(td); tb.appendChild(tr);
    });
    $('[data-sum-subtotal]').textContent = C.rupees(q.subtotal);
    $('[data-sum-gst-label]').textContent = 'GST (' + q.gstPercent + '%)';
    $('[data-sum-gst]').textContent = C.rupees(q.gst);
    $('[data-sum-total]').textContent = C.rupees(q.total);
    var advance = q.payNow < q.total;
    $('[data-sum-paynow-label]').textContent = advance ? 'Advance to pay now (' + pricing.advancePercent + '%)' : 'Pay now';
    $('[data-sum-paynow]').textContent = C.rupees(q.payNow);
    var bal = $('[data-sum-balance]');
    bal.hidden = !advance;
    bal.textContent = advance ? 'Balance of ' + C.rupees(q.balance) + ' is paid at the Centre.' : '';
    payBtn.textContent = 'Pay ' + C.rupees(q.payNow) + ' securely';
  }

  function fmt(s) {
    return new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  // ---- Dates ----------------------------------------------------------------
  el.check_in.addEventListener('change', function () {
    if (C.isDate(el.check_in.value)) {
      el.check_out.min = C.addDays(el.check_in.value, 1);
      if (!el.check_out.value || el.check_out.value <= el.check_in.value) el.check_out.value = C.addDays(el.check_in.value, 1);
    }
    checkAvailability();
  });
  el.check_out.addEventListener('change', checkAvailability);

  // ---- Submit and payment ---------------------------------------------------
  function collect() {
    var o = {};
    new FormData(form).forEach(function (v, k) { o[k] = typeof v === 'string' ? v : ''; });
    o.accept = el.accept.checked;
    return o;
  }
  function setBusy(on, label) {
    busy = on;
    payBtn.disabled = on;
    payBtn.setAttribute('aria-busy', on ? 'true' : 'false');
    if (label) payBtn.textContent = label;
  }
  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (busy) return;
    var raw = collect();
    var v = C.validate(raw, { today: today, rooms: rooms, availability: avail || undefined });
    if (!v.ok) { showErrors(v.errors); return; }
    clearErrors();
    setBusy(true, 'Holding your rooms...');
    if (window.cavTrack) window.cavTrack('Booking Start');

    post('/api/bookings', raw).then(function (j) {
      if (!j.ok) {
        setBusy(false); update();
        if (j.availability) { avail = j.availability; applyAvailability(); }
        showErrors(j.errors || {}, j.error || (j.availability ? 'Some rooms were just booked by someone else. Please review your choice.' : 'Please check the following:'));
        return;
      }
      if (j.provider === 'dev') return simulate(j);
      openRazorpay(j);
    }).catch(function () {
      setBusy(false); update();
      showErrors({}, 'We could not reach the booking system. Nothing has been charged. Please try again or call the Centre.');
    });
  });

  function simulate(j) {
    var ok = window.confirm('TEST MODE\n\nNo payment gateway is connected. Simulate a successful payment of ' + C.rupees(j.amount) + '?\n\nNo money is taken.');
    if (!ok) { abandon(j); return; }
    setBusy(true, 'Confirming payment...');
    post('/api/bookings/' + encodeURIComponent(j.ref) + '/simulate', { token: j.token }).then(done(j));
  }

  function openRazorpay(j) {
    if (!window.Razorpay) {
      abandon(j);
      showErrors({}, 'The payment window could not load. Check your connection or ad blocker and try again. Nothing has been charged.');
      return;
    }
    var opts = j.checkout;
    opts.handler = function (resp) {
      setBusy(true, 'Confirming payment...');
      post('/api/bookings/' + encodeURIComponent(j.ref) + '/verify', {
        token: j.token,
        razorpay_order_id: resp.razorpay_order_id,
        razorpay_payment_id: resp.razorpay_payment_id,
        razorpay_signature: resp.razorpay_signature
      }).then(done(j)).catch(function () {
        // The webhook still records the payment; send the guest to their booking page.
        window.location.href = '/book/confirmation/' + encodeURIComponent(j.ref) + '?t=' + encodeURIComponent(j.token);
      });
    };
    opts.modal = { ondismiss: function () { abandon(j); showErrors({}, 'Payment was not completed. Your rooms have been released and nothing was charged. You can try again.'); }, confirm_close: true };
    var rz = new window.Razorpay(opts);
    rz.on('payment.failed', function () { /* Razorpay shows the reason and lets the guest retry in the same window. */ });
    setBusy(true, 'Complete payment in the window...');
    rz.open();
  }

  function done(j) {
    return function (r) {
      if (r && r.ok && r.redirect) { window.location.href = r.redirect; return; }
      setBusy(false); update();
      showErrors({}, (r && r.error) || 'We could not confirm the payment. If money was taken, contact the Centre with reference ' + j.ref + '.');
    };
  }

  function abandon(j) {
    setBusy(false); update();
    post('/api/bookings/' + encodeURIComponent(j.ref) + '/abandon', { token: j.token }).then(function () { availKey = ''; checkAvailability(); }).catch(function () {});
  }

  // ---- Start ----------------------------------------------------------------
  if (C.isDate(el.check_in.value)) el.check_out.min = C.addDays(el.check_in.value, 1);
  applyAvailability();
  checkAvailability();
  if (!datesValid()) preselectWithoutDates();
  function preselectWithoutDates() {
    var card = $('[data-room][data-preselect]');
    if (!card) return;
    preselected = true;
    var kind = card.getAttribute('data-room');
    el[UNIT_FIELD[kind]].value = 1; syncStepper(kind); update();
  }
})();
