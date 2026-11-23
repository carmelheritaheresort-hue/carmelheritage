/* Shared booking validation and price calculation (browser and server).
   All money is handled in paise (integer) to avoid rounding drift. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BookingCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MAX_NIGHTS = 30;
  var MAX_DAYS_AHEAD = 540;

  function clean(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max || 2000);
  }
  function isDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function int(v) {
    if (v === '' || v == null) return 0;
    return /^\d+$/.test(String(v).trim()) ? parseInt(v, 10) : NaN;
  }
  function days(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function addDays(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

  // rooms: { cottage: { rate, maxAdults, maxChildren, total }, standard_room: {...} }
  // pricing: { gstPercent, payMode: 'full'|'advance', advancePercent }
  function quote(sel, rooms, pricing) {
    var nights = days(sel.check_in, sel.check_out);
    var c = sel.cottage_units || 0, s = sel.standard_units || 0;
    var cRate = rooms.cottage ? rooms.cottage.rate : 0, sRate = rooms.standard_room ? rooms.standard_room.rate : 0;
    var lines = [];
    if (c) lines.push({ kind: 'cottage', units: c, rate: cRate, nights: nights, amount: c * cRate * nights * 100 });
    if (s) lines.push({ kind: 'standard_room', units: s, rate: sRate, nights: nights, amount: s * sRate * nights * 100 });
    var subtotal = lines.reduce(function (t, l) { return t + l.amount; }, 0);
    var gstPct = Number(pricing.gstPercent) || 0;
    var gst = Math.round(subtotal * gstPct / 100);
    var total = subtotal + gst;
    var payNow = total;
    if (pricing.payMode === 'advance') {
      var pct = Math.min(100, Math.max(1, Number(pricing.advancePercent) || 100));
      payNow = Math.min(total, Math.ceil(total * pct / 100 / 100) * 100); // round up to a whole rupee
    }
    return { nights: nights, lines: lines, subtotal: subtotal, gstPercent: gstPct, gst: gst, total: total, payNow: payNow, balance: total - payNow };
  }

  // opts: { today, rooms, availability?: { cottage, standard_room } }
  function validate(raw, opts) {
    opts = opts || {};
    var rooms = opts.rooms || {};
    var errors = {};
    var d = {
      check_in: clean(raw.check_in, 10),
      check_out: clean(raw.check_out, 10),
      cottage_units: int(raw.cottage_units),
      standard_units: int(raw.standard_units),
      adults: int(raw.adults),
      children: int(raw.children),
      name: clean(raw.name, 100),
      phone: clean(raw.phone, 30).replace(/[\s\-().]/g, ''),
      email: clean(raw.email, 254),
      message: clean(raw.message, 1000),
      accept: raw.accept === true || raw.accept === '1' || raw.accept === 'on'
    };
    var step = opts.step || 'all';

    if (!isDate(d.check_in)) errors.check_in = 'Choose a check-in date.';
    else if (opts.today && d.check_in < opts.today) errors.check_in = 'Check-in cannot be in the past.';
    else if (opts.today && days(opts.today, d.check_in) > MAX_DAYS_AHEAD) errors.check_in = 'Online booking is open up to ' + MAX_DAYS_AHEAD + ' days ahead. Please contact the Centre for later dates.';
    if (!isDate(d.check_out)) errors.check_out = 'Choose a check-out date.';
    else if (isDate(d.check_in) && d.check_out <= d.check_in) errors.check_out = 'Check-out must be after check-in.';
    else if (isDate(d.check_in) && days(d.check_in, d.check_out) > MAX_NIGHTS) errors.check_out = 'Online booking is for up to ' + MAX_NIGHTS + ' nights. Please contact the Centre for longer stays.';

    var c = rooms.cottage || { total: 0 }, s = rooms.standard_room || { total: 0 };
    var av = opts.availability || {};
    var cMax = av.cottage != null ? Math.min(av.cottage, c.total) : c.total;
    var sMax = av.standard_room != null ? Math.min(av.standard_room, s.total) : s.total;
    if (!(d.cottage_units >= 0 && d.cottage_units <= cMax)) errors.cottage_units = cMax ? 'Choose 0 to ' + cMax + ' cottages.' : 'No cottages are available for these dates.';
    if (!(d.standard_units >= 0 && d.standard_units <= sMax)) errors.standard_units = sMax ? 'Choose 0 to ' + sMax + ' standard rooms.' : 'No standard rooms are available for these dates.';
    if (!errors.cottage_units && !errors.standard_units && d.cottage_units + d.standard_units < 1) errors.cottage_units = 'Choose at least one cottage or standard room.';

    var capA = d.cottage_units * (c.maxAdults || 0) + d.standard_units * (s.maxAdults || 0);
    var capC = d.cottage_units * (c.maxChildren || 0) + d.standard_units * (s.maxChildren || 0);
    if (!(d.adults >= 1 && d.adults <= 60)) errors.adults = 'Enter at least 1 adult.';
    else if (!errors.cottage_units && !errors.standard_units && capA && d.adults > capA) errors.adults = 'The rooms you chose take up to ' + capA + ' adults. Add another room or reduce the number of adults.';
    if (!(d.children >= 0 && d.children <= 60)) errors.children = 'Enter 0 or more children.';
    else if (!errors.cottage_units && !errors.standard_units && d.children > capC) errors.children = capC ? 'The rooms you chose take up to ' + capC + ' children. Add another room or reduce the number of children.' : 'Children cannot be added to the rooms you chose.';

    if (step === 'all') {
      if (d.name.length < 2) errors.name = 'Enter your full name.';
      if (!/^\+[1-9]\d{7,14}$/.test(d.phone)) errors.phone = 'Enter your mobile number with country code, for example +91 followed by the number.';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) errors.email = 'Enter a valid email address. Your booking details are sent here.';
      if (!d.accept) errors.accept = 'Please confirm you have read the Booking and Cancellation Policy.';
    }
    return { ok: Object.keys(errors).length === 0, errors: errors, clean: d };
  }

  function rupees(paise) {
    var r = paise / 100;
    return '\u20B9' + r.toLocaleString('en-IN', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  return { quote: quote, validate: validate, rupees: rupees, isDate: isDate, days: days, addDays: addDays, MAX_NIGHTS: MAX_NIGHTS };
});
