/* Shared enquiry validation and WhatsApp message builder (browser and server). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EnquiryValidation = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var PREFS = ['cottage', 'standard', 'either'];
  var PREF_LABEL = { cottage: 'Cottage', standard: 'Standard room', either: 'Either (cottage or standard room)' };

  function clean(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max || 2000);
  }
  function isDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function int(v) { return /^\d+$/.test(String(v).trim()) ? parseInt(v, 10) : NaN; }

  // opts: { today: 'YYYY-MM-DD', maxUnits: { cottage, standard, either } }
  function validate(raw, opts) {
    opts = opts || {};
    var today = opts.today;
    var type = raw.type === 'treatment' ? 'treatment' : 'stay';
    var errors = {};
    var d = {
      type: type,
      name: clean(raw.name, 100),
      phone: clean(raw.phone, 30).replace(/[\s\-().]/g, ''),
      email: clean(raw.email, 254),
      message: clean(raw.message, 1000)
    };

    if (d.name.length < 2) errors.name = 'Enter your full name.';
    if (!/^\+[1-9]\d{7,14}$/.test(d.phone)) errors.phone = 'Enter your WhatsApp or mobile number with country code, for example +91 followed by the number.';
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) errors.email = 'Enter a valid email address or leave it empty.';

    if (type === 'stay') {
      d.check_in = clean(raw.check_in, 10);
      d.check_out = clean(raw.check_out, 10);
      d.accommodation_pref = clean(raw.accommodation_pref, 10);
      d.adults = int(raw.adults);
      d.children = raw.children === '' || raw.children == null ? 0 : int(raw.children);
      d.units = int(raw.units);

      if (!isDate(d.check_in)) errors.check_in = 'Choose a check-in date.';
      else if (today && d.check_in < today) errors.check_in = 'Check-in cannot be in the past.';
      if (!isDate(d.check_out)) errors.check_out = 'Choose a check-out date.';
      else if (isDate(d.check_in) && d.check_out <= d.check_in) errors.check_out = 'Check-out must be after check-in.';
      if (!(d.adults >= 1 && d.adults <= 30)) errors.adults = 'Enter at least 1 adult (up to 30).';
      if (!(d.children >= 0 && d.children <= 30)) errors.children = 'Enter 0 to 30 children.';
      if (PREFS.indexOf(d.accommodation_pref) === -1) errors.accommodation_pref = 'Choose cottage, standard room or either.';
      var max = (opts.maxUnits && opts.maxUnits[d.accommodation_pref]) || 15;
      if (!(d.units >= 1 && d.units <= max)) errors.units = 'Enter between 1 and ' + max + ' units.';
    } else {
      d.treatment = clean(raw.treatment, 150);
      d.check_in = clean(raw.check_in, 10);
      if (d.check_in) {
        if (!isDate(d.check_in)) errors.check_in = 'Enter a valid date or leave it empty.';
        else if (today && d.check_in < today) errors.check_in = 'The preferred date cannot be in the past.';
      }
    }
    return { ok: Object.keys(errors).length === 0, errors: errors, clean: d };
  }

  function fmtDate(s) {
    if (!isDate(s)) return s || '';
    return new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function buildMessage(d, siteName) {
    var brand = siteName || 'Carmel Heritage';
    var lines;
    if (d.type === 'treatment') {
      lines = [
        'Hello ' + brand + ', I\u2019d like to enquire about a treatment.', '',
        'Name: ' + d.name,
        'Phone: ' + d.phone,
        'Treatment of interest: ' + (d.treatment || 'Not specified'),
        'Preferred start date: ' + (d.check_in ? fmtDate(d.check_in) : 'Not specified'),
        'Message: ' + (d.message || '-'), '',
        'Please let me know whether this is suitable and available, and confirm the applicable rate.'
      ];
    } else {
      lines = [
        'Hello ' + brand + ', I\u2019d like to enquire about a stay.', '',
        'Name: ' + d.name,
        'Phone: ' + d.phone,
        'Check-in: ' + fmtDate(d.check_in),
        'Check-out: ' + fmtDate(d.check_out),
        'Adults: ' + d.adults,
        'Children: ' + d.children,
        'Accommodation preference: ' + (PREF_LABEL[d.accommodation_pref] || d.accommodation_pref),
        'Units requested: ' + d.units,
        'Message: ' + (d.message || '-'), '',
        'Please let me know whether this is available and confirm the applicable rate.'
      ];
    }
    return lines.join('\n');
  }

  return { validate: validate, buildMessage: buildMessage, PREF_LABEL: PREF_LABEL };
});
