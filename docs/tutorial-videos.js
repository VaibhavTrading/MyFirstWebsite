/**
 * SMART VLE TOOL – Tutorial Video Player Controller
 * Reads configuration from window.SMARTVLE_TUTORIAL_VIDEOS (public/videos-config.js).
 * Handles click-to-play overlay, single active playback, lazy metadata loading,
 * missing-video "Tutorial video coming soon" fallback, and playback error UI.
 */
(function () {
  function initTutorialVideos() {
    var grid = document.getElementById('tutorial-videos-grid');
    if (!grid) return;

    var videosConfig = Array.isArray(window.SMARTVLE_TUTORIAL_VIDEOS)
      ? window.SMARTVLE_TUTORIAL_VIDEOS
      : [];

    var configMap = {};
    videosConfig.forEach(function (item) {
      if (item && item.id) {
        configMap[item.id] = item;
      }
    });

    var cards = grid.querySelectorAll('.tutorial-video-card[data-video-id]');
    var allVideos = [];

    cards.forEach(function (card) {
      var videoId = card.getAttribute('data-video-id');
      var cfg = configMap[videoId] || {};
      var frame = card.querySelector('.tutorial-video-frame');
      var video = card.querySelector('video.tutorial-video-player');
      var source = video ? video.querySelector('source') : null;
      var overlay = card.querySelector('.tutorial-play-overlay');
      var playBtn = card.querySelector('.tutorial-play-btn');
      var fallback = card.querySelector('.tutorial-video-fallback');
      var fallbackTitle = card.querySelector('.tutorial-fallback-title');
      var fallbackMsg = card.querySelector('.tutorial-fallback-msg');
      var retryBtn = card.querySelector('.tutorial-retry-btn');
      var overlayLabel = card.querySelector('.tutorial-overlay-label');
      var titleEl = card.querySelector('.tutorial-card-title');
      var descEl = card.querySelector('.tutorial-card-desc');
      var ctaEl = card.querySelector('.tutorial-card-link');

      if (!video || !frame) return;
      allVideos.push(video);

      // Sync text and media paths from centralized videos-config.js
      if (cfg.title && titleEl) titleEl.textContent = cfg.title;
      if (cfg.description && descEl) descEl.textContent = cfg.description;
      if (cfg.placeholderTitle && overlayLabel) overlayLabel.textContent = cfg.placeholderTitle;
      if (cfg.toolUrl && ctaEl) ctaEl.setAttribute('href', cfg.toolUrl);
      if (cfg.toolLabel && ctaEl) ctaEl.textContent = cfg.toolLabel;

      var videoSrc = typeof cfg.src === 'string' ? cfg.src.trim() : (source ? (source.getAttribute('src') || '').trim() : '');
      var posterSrc = typeof cfg.poster === 'string' ? cfg.poster.trim() : (video.getAttribute('poster') || '').trim();

      if (posterSrc) {
        video.setAttribute('poster', posterSrc);
      }

      function hideUnavailableCard() {
        if (video) {
          video.pause();
        }
        card.style.display = 'none';
        var section = document.getElementById('tutorial-videos');
        if (section) {
          var visibleCards = Array.prototype.filter.call(cards, function (c) {
            return c.style.display !== 'none';
          });
          if (visibleCards.length === 0) {
            section.style.display = 'none';
          }
        }
      }

      function showPlayer() {
        card.style.display = '';
        if (fallback) fallback.hidden = true;
        if (video) video.style.display = 'block';
        if (overlay && video.paused) overlay.style.display = 'flex';
      }

      if (!videoSrc) {
        hideUnavailableCard();
        return;
      }

      if (source) {
        var currentSrc = source.getAttribute('src') || '';
        if (currentSrc !== videoSrc) {
          source.setAttribute('src', videoSrc);
          video.load();
        }
      } else {
        video.setAttribute('src', videoSrc);
      }

      // Click overlay or play button to start playing inside the card
      function handleStartPlay(e) {
        if (e) e.preventDefault();
        if (overlay) overlay.style.display = 'none';
        var playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(function () {
            if (video.error) {
              handleVideoError();
            } else if (overlay) {
              overlay.style.display = 'flex';
            }
          });
        }
      }

      if (overlay) {
        overlay.addEventListener('click', handleStartPlay);
        overlay.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStartPlay(e);
          }
        });
      }
      if (playBtn) {
        playBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          handleStartPlay(e);
        });
      }

      // Pause other videos when one starts playing
      video.addEventListener('play', function () {
        if (overlay) overlay.style.display = 'none';
        allVideos.forEach(function (other) {
          if (other !== video && !other.paused) {
            other.pause();
          }
        });
      });

      // Show overlay again only if user returns to start/ends playback
      video.addEventListener('ended', function () {
        if (overlay) overlay.style.display = 'flex';
      });

      function handleVideoError() {
        hideUnavailableCard();
      }

      if (source) {
        source.addEventListener('error', handleVideoError);
      }
      video.addEventListener('error', function () {
        if (videoSrc) {
          handleVideoError();
        }
      });

      if (retryBtn) {
        retryBtn.addEventListener('click', function () {
          showPlayer();
          video.load();
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTutorialVideos);
  } else {
    initTutorialVideos();
  }
})();
