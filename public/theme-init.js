(function () {
  var t = 'dark';
  try { t = localStorage.getItem('dash-theme') || 'dark'; } catch (e) {}
  document.documentElement.classList.add(t + '-theme');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#FAF9F5' : '#0B0B0D');
})();
