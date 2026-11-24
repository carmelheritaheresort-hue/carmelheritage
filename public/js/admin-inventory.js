/* Admin inventory calendar: clicking dates fills the form (first click = first night, second = last
   night), and only the fields for the chosen action are shown. */
(function () {
  'use strict';
  var form = document.querySelector('[data-inv-form]');
  if (!form) return;
  var from = form.elements.from, to = form.elements.to;
  var next = 'from';

  document.querySelectorAll('[data-inv-date]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = b.getAttribute('data-inv-date');
      if (next === 'from' || (from.value && d < from.value)) { from.value = d; to.value = d; next = 'to'; }
      else { to.value = d; next = 'from'; }
      document.querySelectorAll('[data-inv-date]').forEach(function (x) {
        var v = x.getAttribute('data-inv-date');
        x.classList.toggle('picked', !!from.value && v >= from.value && v <= (to.value || from.value));
      });
      form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  });
  from.addEventListener('change', function () { if (!to.value || to.value < from.value) to.value = from.value; });

  function showFields() {
    var a = (form.querySelector('input[name="action"]:checked') || {}).value || 'block';
    form.querySelectorAll('[data-show-for]').forEach(function (el) {
      el.hidden = el.getAttribute('data-show-for').split(' ').indexOf(a) < 0;
    });
  }
  form.querySelectorAll('input[name="action"]').forEach(function (r) { r.addEventListener('change', showFields); });
  showFields();

  form.addEventListener('submit', function (ev) {
    var a = (form.querySelector('input[name="action"]:checked') || {}).value;
    var kind = form.elements.kind;
    var what = { block: 'Block', open: 'Open', rate: 'Set the special price for', reset: 'Set back to the normal price' }[a] || 'Change';
    var msg = what + ' ' + kind.options[kind.selectedIndex].text.replace(/ \(.*\)$/, '').toLowerCase() + ' from ' + from.value + ' to ' + to.value + '?';
    if (!window.confirm(msg)) ev.preventDefault();
  });
})();
