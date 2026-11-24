'use strict';

/**
 * Платформенная адаптация: Яндекс Игры, Telegram Mini Apps и локальный демо-режим.
 * Все внешние вызовы защищены — без SDK игра работает автономно.
 */
CG.Platform = (function () {
  const C = CG.CONFIG;
  let ysdk = null;
  let player = null;
  let mode = 'mock';
  let gameReady = false;
  let readySignaled = false;
  let adBusy = false;
  let gameplayOn = false;
  let cloudSave = null;

  /* ---------- Telegram Mini Apps ---------- */
  function initTelegram() {
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (!tg) return;
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor('#0b0d1a');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#0b0d1a');
      if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
      if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
      if (tg.onEvent) {
        tg.onEvent('viewportChanged', function () {
          try { tg.expand(); } catch (e) {}
        });
        tg.onEvent('themeChanged', function () {
          try {
            if (tg.setHeaderColor) tg.setHeaderColor('#0b0d1a');
            if (tg.setBackgroundColor) tg.setBackgroundColor('#0b0d1a');
          } catch (e) {}
        });
      }
    } catch (e) {}
  }

  /* ---------- Инициализация SDK ---------- */
  function startSdk(cb) {
    window.YaGames.init()
      .then(function (sdk) {
        ysdk = sdk;
        mode = 'yandex';
        bindSdkEvents();
        loadPlayer().then(function () {
          maybeSignalReady();
          cb(mode);
        });
      })
      .catch(function () {
        mode = 'mock';
        cb(mode);
      });
  }

  function bindSdkEvents() {
    try {
      if (ysdk.on) {
        ysdk.on('game_api_pause', function () {
          document.dispatchEvent(new CustomEvent('cg:pause'));
        });
        ysdk.on('game_api_resume', function () {
          document.dispatchEvent(new CustomEvent('cg:resume'));
        });
      }
    } catch (e) {}
  }

  function loadPlayer() {
    if (!ysdk || !ysdk.getPlayer) return Promise.resolve();
    return ysdk
      .getPlayer({ scopes: false })
      .then(function (p) {
        player = p;
        return player.getData(['save']);
      })
      .then(function (data) {
        if (data && data.save) cloudSave = data.save;
      })
      .catch(function () {});
  }

  function maybeSignalReady() {
    if (readySignaled || !ysdk || !gameReady) return;
    readySignaled = true;
    try {
      if (ysdk.features && ysdk.features.LoadingAPI) ysdk.features.LoadingAPI.ready();
    } catch (e) {}
  }

  /* ---------- Демо-реклама (локальный запуск без SDK) ---------- */
  const MockAd = {
    show: function (seconds, cb) {
      let root = document.getElementById('mockAd');
      if (!root) {
        root = document.createElement('div');
        root.id = 'mockAd';
        root.className = 'overlay hidden';
        document.body.appendChild(root);
      }
      root.innerHTML =
        '<div class="modal">' +
        '<div class="ad-screen">' +
        '<div class="ad-screen__label">ДЕМО-РЕКЛАМА</div>' +
        '<div class="ad-screen__emoji">🎬</div>' +
        '<div class="ad-caption">Локальный режим. Настоящее rewarded-видео включится на Яндекс Играх.</div>' +
        '</div>' +
        '<div class="ad-progress"><div class="ad-progress__bar"></div></div>' +
        '<div class="ad-caption">Награда через <strong data-count>' + seconds + '</strong> c</div>' +
        '</div>';
      root.classList.remove('hidden');
      if (cb.onOpen) cb.onOpen();

      const bar = root.querySelector('.ad-progress__bar');
      const counter = root.querySelector('[data-count]');
      bar.style.transitionDuration = seconds + 's';
      requestAnimationFrame(function () {
        bar.style.width = '100%';
      });

      let left = seconds;
      const iv = setInterval(function () {
        left -= 1;
        if (left > 0) {
          counter.textContent = left;
          return;
        }
        clearInterval(iv);
        root.classList.add('hidden');
        if (cb.onRewarded) cb.onRewarded();
        if (cb.onClose) cb.onClose(true);
      }, 1000);
    }
  };

  function init(onReady) {
    initTelegram();
    const finish = function () {
      maybeSignalReady();
      onReady(mode);
    };

    if (window.YaGames && typeof window.YaGames.init === 'function') {
      startSdk(finish);
      return;
    }

    // sdk.js грузится async — ждём его максимум 3 секунды, потом демо-режим.
    let tries = 0;
    const iv = setInterval(function () {
      tries += 1;
      if (window.YaGames && typeof window.YaGames.init === 'function') {
        clearInterval(iv);
        startSdk(finish);
      } else if (window.__sdkFailed || tries >= 60) {
        clearInterval(iv);
        finish();
      }
    }, 50);
  }

  function showRewarded(handlers) {
    if (adBusy) {
      if (handlers.onError) handlers.onError({ message: 'ad-busy' });
      return;
    }

    if (mode === 'yandex' && ysdk) {
      adBusy = true;
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: function () {
            if (handlers.onOpen) handlers.onOpen();
          },
          onRewarded: function () {
            if (handlers.onRewarded) handlers.onRewarded();
          },
          onClose: function (wasShown) {
            adBusy = false;
            if (handlers.onClose) handlers.onClose(wasShown);
          },
          onError: function (err) {
            adBusy = false;
            if (handlers.onError) handlers.onError(err);
          }
        }
      });
      return;
    }

    adBusy = true;
    MockAd.show(C.AD_SECONDS, {
      onOpen: handlers.onOpen,
      onRewarded: handlers.onRewarded,
      onClose: function () {
        adBusy = false;
        if (handlers.onClose) handlers.onClose(true);
      }
    });
  }

  function saveCloud(state) {
    if (mode !== 'yandex' || !player) return;
    try {
      player.setData({ save: state }, false).catch(function () {});
    } catch (e) {}
  }

  function fetchCloudSave(cb) {
    if (mode !== 'yandex' || !player) {
      cb(null);
      return;
    }
    if (cloudSave) {
      cb(cloudSave);
      return;
    }
    player
      .getData(['save'])
      .then(function (data) {
        cb(data && data.save ? data.save : null);
      })
      .catch(function () {
        cb(null);
      });
  }

  function notifyGameReady() {
    gameReady = true;
    maybeSignalReady();
  }

  /** Начало игровой сессии для метрик GameplayAPI. */
  function gameplayStart() {
    if (gameplayOn || mode !== 'yandex' || !ysdk) return;
    try {
      if (ysdk.features && ysdk.features.GameplayAPI) {
        ysdk.features.GameplayAPI.start();
        gameplayOn = true;
      }
    } catch (e) {}
  }

  function gameplayStop() {
    if (!gameplayOn) return;
    gameplayOn = false;
    try {
      if (ysdk && ysdk.features && ysdk.features.GameplayAPI) ysdk.features.GameplayAPI.stop();
    } catch (e) {}
  }

  return {
    init: init,
    showRewarded: showRewarded,
    saveCloud: saveCloud,
    fetchCloudSave: fetchCloudSave,
    notifyGameReady: notifyGameReady,
    gameplayStart: gameplayStart,
    gameplayStop: gameplayStop,
    mode: function () {
      return mode;
    }
  };
})();
