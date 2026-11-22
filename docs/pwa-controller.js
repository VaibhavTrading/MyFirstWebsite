/**
 * SMART VLE TOOL - PWA & Offline Engine Controller (Background Caching Only)
 * Unregisters stale Service Workers so direct URLs and GitHub Pages routes always load fresh HTML.
 */

(function () {
  function cleanupStaleServiceWorkers() {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (reg) {
            reg.unregister().catch(function () {});
          });
        }).catch(function () {});
      });
    }
  }

  cleanupStaleServiceWorkers();

  window.PWAController = {
    openOfflineModal: function() {}
  };
})();
