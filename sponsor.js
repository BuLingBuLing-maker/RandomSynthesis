/* ============================================================
 *  随机大合成 · 赞助弹窗
 *  结算页点「🖤 感谢支持我一下嘛」弹出收款码。
 *  静态弹窗，无网络请求。
 *  收款码图片放在 assets/sponsor-qr.png，替换成你的即可。
 * ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function open() {
    var m = $('sponsorModal');
    if (!m) return;
    m.classList.add('show');
    m.setAttribute('aria-hidden', 'false');
  }
  function close() {
    var m = $('sponsorModal');
    if (!m) return;
    m.classList.remove('show');
    m.setAttribute('aria-hidden', 'true');
  }
  function bind() {
    var btn = $('sponsorBtn');
    if (btn) btn.addEventListener('click', open);
    var x = $('sponsorClose');
    if (x) x.addEventListener('click', close);
    var ok = $('sponsorOk');
    if (ok) ok.addEventListener('click', close);
    var m = $('sponsorModal');
    if (m) m.addEventListener('click', function (e) { if (e.target === m) close(); });
    var restart = $('restartBtn');
    if (restart) restart.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.DanaiwaSponsor = { open: open, close: close };
})();
