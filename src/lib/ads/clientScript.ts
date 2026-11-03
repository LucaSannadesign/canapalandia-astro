/**
 * Script client dello slot pubblicitario, inserito inline SOLO quando un annuncio viene servito.
 * È una stringa (non codice bundlato) così i test eseguono esattamente ciò che arriva al browser.
 *
 * Regola di visibilità: almeno il 50% del box nel viewport per 1 secondo CONTINUO con la scheda
 * in primo piano. Il conteggio si azzera se il box esce dal viewport, se la scheda passa in
 * background o se la pagina viene nascosta (pagehide). Un solo timer attivo alla volta; al
 * massimo un beacon per caricamento di pagina, con il token di visualizzazione firmato dal server.
 */

export const AD_SLOT_VIEW_DELAY_MS = 1000;

export const AD_SLOT_SCRIPT = `(function () {
  var script = document.currentScript;
  var slot = script && script.closest("[data-ad-slot]");
  if (!slot || !window.IntersectionObserver || !navigator.sendBeacon) return;
  var placement = slot.getAttribute("data-ad-placement");
  var token = slot.getAttribute("data-ad-token");
  if (!placement || !token) return;
  var DELAY = ${AD_SLOT_VIEW_DELAY_MS};
  var timer = null;
  var inView = false;
  var done = false;
  function pageVisible() { return document.visibilityState === "visible"; }
  function disarm() { if (timer !== null) { clearTimeout(timer); timer = null; } }
  function arm() {
    if (done || timer !== null || !inView || !pageVisible()) return;
    timer = setTimeout(function () {
      timer = null;
      if (done || !inView || !pageVisible()) return;
      done = true;
      cleanup();
      navigator.sendBeacon("/api/ads/event/", JSON.stringify({ type: "impression", placement: placement, token: token }));
    }, DELAY);
  }
  function update() { if (inView && pageVisible()) { arm(); } else { disarm(); } }
  var io = new IntersectionObserver(function (entries) {
    var last = entries[entries.length - 1];
    inView = !!last && last.isIntersecting && last.intersectionRatio >= 0.5;
    update();
  }, { threshold: [0, 0.5, 1] });
  function onPageHide() { inView = false; disarm(); }
  function cleanup() {
    io.disconnect();
    document.removeEventListener("visibilitychange", update);
    window.removeEventListener("pagehide", onPageHide);
  }
  document.addEventListener("visibilitychange", update);
  window.addEventListener("pagehide", onPageHide);
  io.observe(slot);
})();`;
