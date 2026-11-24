/* Shared booking validation and price calculation (browser and server).
   All money is handled in paise (integer) to avoid rounding drift.

   Room rules (set per room type in Admin > Accommodation):
     rate        price per room per night, which covers `baseAdults` adults
     maxGuests   most guests in one room, children included
     extraAdult  per night, for each adult beyond `baseAdults` in a room
     extraChild  per night, for each child aged 7 to 12 (no extra bed)
   Children under 7 stay free. Every room needs at least one adult. */
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
  function room(rooms, k) {
    var r = rooms[k] || {};
    return { rate: r.rate || 0, maxGuests: r.maxGuests || 0, baseAdults: r.baseAdults || 0, extraAdult: r.extraAdult || 0, extraChild: r.extraChild || 0 };
  }

  // Shares guests across the chosen rooms in the way that keeps the price lowest, with at least one
  // adult in each room. Returns the counts that are charged extra, or { error } if they do not fit.
  function allocate(sel, rooms) {
    var c = sel.cottage_units || 0, s = sel.standard_units || 0, n = c + s;
    var A = sel.adults || 0, M = sel.children_mid || 0, Y = sel.children_young || 0;
    var C = room(rooms, 'cottage'), S = room(rooms, 'standard_room');
    var cap = c * C.maxGuests + s * S.maxGuests;
    if (n < 1) return { error: 'rooms' };
    if (A < n) return { error: 'adults_per_room', rooms: n };
    if (A + M + Y > cap) return { error: 'capacity', capacity: cap };

    // Standard rooms first (no extra charges there), keeping one adult for each cottage.
    var stdSlots = s * S.maxGuests;
    var aStd = Math.min(A - c, stdSlots);
    var aCot = A - aStd;
    var free = stdSlots - aStd;
    var mStd = Math.min(M, free); free -= mStd;
    var yStd = Math.min(Y, free);
    var mCot = M - mStd, yCot = Y - yStd;
    // Adults beyond the number a room's rate covers, and children aged 7 to 12, may be charged
    // (at that room type's rates; standard rooms have none).
    return {
      cottage: { adults: aCot, mid: mCot, young: yCot, extraAdults: Math.max(0, aCot - c * C.baseAdults), extraChildren: mCot },
      standard: { adults: aStd, mid: mStd, young: yStd, extraAdults: Math.max(0, aStd - s * S.baseAdults), extraChildren: mStd },
      capacity: cap
    };
  }

  // Room lines for one room type: nights at the same price are grouped into one line.
  // special: { 'YYYY-MM-DD': rate } prices set for particular nights in Admin > Inventory.
  function roomLines(kind, units, baseRate, sel, special) {
    if (!units) return [];
    var byRate = {}, order = [];
    for (var d = sel.check_in; d < sel.check_out; d = addDays(d, 1)) {
      var r = special && special[d] > 0 ? special[d] : baseRate;
      if (!byRate[r]) { byRate[r] = 0; order.push(r); }
      byRate[r]++;
    }
    return order.map(function (r) { return { kind: kind, units: units, rate: r, nights: byRate[r], amount: units * r * byRate[r] * 100 }; });
  }

  // rooms: { cottage: {...}, standard_room: {...} }   pricing: { gstPercent, payMode, advancePercent }
  // nightRates (optional): { cottage: { date: rate }, standard_room: { date: rate } } date-specific room prices.
  function quote(sel, rooms, pricing, nightRates) {
    var nights = days(sel.check_in, sel.check_out);
    var c = sel.cottage_units || 0, s = sel.standard_units || 0;
    var C = room(rooms, 'cottage'), S = room(rooms, 'standard_room');
    var nr = nightRates || {};
    var lines = roomLines('cottage', c, C.rate, sel, nr.cottage).concat(roomLines('standard_room', s, S.rate, sel, nr.standard_room));
    var al = allocate(sel, rooms);
    var extraAdults = 0, extraChildren = 0, extraAdultRate = 0, extraChildRate = 0;
    if (!al.error) {
      // Charge each room type at its own rate.
      [['cottage', C], ['standard', S]].forEach(function (p) {
        var g = al[p[0]], r = p[1];
        if (g.extraAdults && r.extraAdult) { lines.push({ kind: 'extra_adult', units: g.extraAdults, rate: r.extraAdult, nights: nights, amount: g.extraAdults * r.extraAdult * nights * 100 }); extraAdults += g.extraAdults; extraAdultRate = r.extraAdult; }
        if (g.extraChildren && r.extraChild) { lines.push({ kind: 'extra_child', units: g.extraChildren, rate: r.extraChild, nights: nights, amount: g.extraChildren * r.extraChild * nights * 100 }); extraChildren += g.extraChildren; extraChildRate = r.extraChild; }
      });
    }
    var roomTotal = lines.filter(function (l) { return l.kind === 'cottage' || l.kind === 'standard_room'; }).reduce(function (t, l) { return t + l.amount; }, 0);
    var subtotal = lines.reduce(function (t, l) { return t + l.amount; }, 0);
    var gstPct = Number(pricing.gstPercent) || 0;
    var gst = Math.round(subtotal * gstPct / 100);
    var total = subtotal + gst;
    var payNow = total;
    if (pricing.payMode === 'advance') {
      var pct = Math.min(100, Math.max(1, Number(pricing.advancePercent) || 100));
      payNow = Math.min(total, Math.ceil(total * pct / 100 / 100) * 100); // round up to a whole rupee
    }
    return {
      nights: nights, lines: lines, roomTotal: roomTotal, extras: subtotal - roomTotal, subtotal: subtotal,
      extraAdults: extraAdults, extraChildren: extraChildren, extraAdultRate: extraAdultRate, extraChildRate: extraChildRate,
      gstPercent: gstPct, gst: gst, total: total, payNow: payNow, balance: total - payNow
    };
  }

  // opts: { today, rooms, availability?: { cottage, standard_room }, step?: 'all' | 'rooms' }
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
      children_mid: int(raw.children_mid),
      children_young: int(raw.children_young),
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
    var roomsOk = !errors.cottage_units && !errors.standard_units;
    if (roomsOk && d.cottage_units + d.standard_units < 1) { errors.cottage_units = 'Choose at least one cottage or standard room.'; roomsOk = false; }

    if (!(d.adults >= 1 && d.adults <= 60)) errors.adults = 'Enter at least 1 adult.';
    if (!(d.children_mid >= 0 && d.children_mid <= 60)) errors.children_mid = 'Enter 0 or more children.';
    if (!(d.children_young >= 0 && d.children_young <= 60)) errors.children_young = 'Enter 0 or more children.';
    if (roomsOk && !errors.adults && !errors.children_mid && !errors.children_young) {
      var al = allocate(d, rooms);
      if (al.error === 'adults_per_room') errors.adults = 'Each room needs at least one adult. You chose ' + al.rooms + ' rooms; add adults or choose fewer rooms.';
      else if (al.error === 'capacity') errors.adults = 'The rooms you chose take up to ' + al.capacity + ' guests in total, children included. Add a room or reduce the number of guests.';
    }
    d.children = (d.children_mid || 0) + (d.children_young || 0);

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

  return { quote: quote, validate: validate, allocate: allocate, rupees: rupees, isDate: isDate, days: days, addDays: addDays, MAX_NIGHTS: MAX_NIGHTS };
});
