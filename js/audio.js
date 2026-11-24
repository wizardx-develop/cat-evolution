'use strict';

/**
 * Звуковые эффекты через Web Audio API — ни одного mp3-файла.
 * Короткие синтезированные тоны: клик, крит, мерж, покупка, ошибка, фанфары.
 */
CG.SFX = (function () {
  const MUTE_KEY = 'cat-evolution-muted';
  let ctx = null;
  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch (e) {
    muted = false;
  }

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return ctx;
  }

  function tone(freq, dur, type, vol, delay, endFreq) {
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const sounds = {
    click: function () { tone(560, 0.07, 'triangle', 0.08, 0, 780); },
    crit: function () {
      tone(700, 0.08, 'triangle', 0.1, 0, 1000);
      tone(1050, 0.13, 'triangle', 0.09, 0.06, 1450);
    },
    merge: function () {
      tone(420, 0.16, 'triangle', 0.1, 0, 840);
      tone(630, 0.2, 'sine', 0.08, 0.05, 1260);
    },
    buy: function () { tone(520, 0.09, 'square', 0.045, 0, 390); },
    error: function () { tone(150, 0.14, 'sawtooth', 0.07, 0, 90); },
    tier: function () {
      tone(523, 0.1, 'triangle', 0.1, 0);
      tone(659, 0.1, 'triangle', 0.1, 0.09);
      tone(784, 0.18, 'triangle', 0.1, 0.18);
    },
    reward: function () {
      tone(660, 0.09, 'sine', 0.1, 0);
      tone(880, 0.09, 'sine', 0.1, 0.09);
      tone(1180, 0.18, 'sine', 0.1, 0.18);
    },
    adOpen: function () { tone(300, 0.1, 'sine', 0.06, 0, 430); }
  };

  return {
    play: function (name) {
      if (muted) return;
      const fn = sounds[name];
      if (!fn) return;
      try {
        fn();
      } catch (e) {
        /* звук не критичен для игры */
      }
    },
    /** Разблокировка AudioContext первым жестом пользователя. */
    unlock: function () {
      ensure();
    },
    toggle: function () {
      muted = !muted;
      try {
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch (e) {}
      if (!muted) ensure();
      return muted;
    },
    isMuted: function () {
      return muted;
    }
  };
})();
