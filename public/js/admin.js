document.addEventListener('click', function (e) {
  var b = e.target.closest ? e.target.closest('[data-confirm]') : null;
  if (b && !window.confirm(b.getAttribute('data-confirm'))) e.preventDefault();
});
