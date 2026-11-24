'use strict';

/** Игровой слой: состояние, ввод, экономика-действия, HUD, цикл кадра. */
(function () {
  const C = CG.CONFIG;
  const R = CG.Rules;
  const TIERS = CG.TIERS;
  const GENS = CG.GENERATORS;
  const fmt = CG.fmt;
  const $ = function (id) {
    return document.getElementById(id);
  };
  const canvas = $('game');

  /* ---------- Состояние ---------- */

  function defaultState() {
    const board = new Array(C.CELLS).fill(0);
    board[0] = 1; // стартовый котёнок, чтобы механика была понятна сразу
    return {
      v: 1,
      coins: 30,
      totalEarned: 0,
      board: board,
      gens: GENS.map(function () {
        return 0;
      }),
      lap: 0,
      treat: 0,
      bought: 0,
      bestTier: 1,
      buffUntil: 0,
      lastSave: Date.now()
    };
  }

  /** Приводит любой сохранённый объект к валидному состоянию. */
  function normalize(s, fallback) {
    const out = Object.assign(fallback, s);
    out.board =
      Array.isArray(s.board) && s.board.length === C.CELLS
        ? s.board.map(function (t) {
            return Number.isInteger(t) && t >= 0 && t <= C.MAX_TIER ? t : 0;
          })
        : fallback.board;
    out.gens = GENS.map(function (_g, i) {
      return Math.max(0, Math.floor(Number(s.gens && s.gens[i]) || 0));
    });
    ['coins', 'totalEarned', 'lap', 'treat', 'bought', 'buffUntil', 'lastSave'].forEach(
      function (k) {
        if (!isFinite(out[k])) out[k] = fallback[k];
      }
    );
    out.coins = Math.max(0, out.coins);
    out.lap = Math.max(0, Math.floor(out.lap));
    out.treat = Math.max(0, Math.floor(out.treat));
    out.bought = Math.max(0, Math.floor(out.bought));
    const boardMax = out.board.reduce(function (m, t) {
      return Math.max(m, t);
    }, 0);
    out.bestTier = Math.min(
      C.MAX_TIER,
      Math.max(0, Math.floor(Number(out.bestTier) || 0), boardMax)
    );
    return out;
  }

  function loadState() {
    const fallback = defaultState();
    try {
      const raw = localStorage.getItem(C.SAVE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      return normalize(parsed, fallback);
    } catch (e) {
      return fallback;
    }
  }

  const hadLocalSave = (function () {
    try {
      return !!localStorage.getItem(C.SAVE_KEY);
    } catch (e) {
      return false;
    }
  })();

  const state = loadState();

  /* ---------- Экран и эффекты ---------- */

  let selected = null;
  let drag = null;
  let adBusy = false;
  let clickerPulse = 0;
  const flash = new Array(C.CELLS).fill(0);
  const floats = [];
  const particles = [];
  const shopRefs = [];

  function toast(msg, kind) {
    const box = $('toasts');
    while (box.children.length >= 4) box.removeChild(box.firstChild);
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(function () {
        el.remove();
      }, 320);
    }, 2600);
  }

  function addFloat(x, y, text, color, size) {
    floats.push({ x: x, y: y, text: text, color: color, size: size || 16, life: 0, max: 0.9 });
  }

  function addFloatAtCell(i, text, color) {
    const c = CG.Render.cellCenter(i);
    addFloat(c.x, c.y, text, color);
  }

  function burstAt(i, count) {
    const c = CG.Render.cellCenter(i);
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      particles.push({
        x: c.x,
        y: c.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 40,
        life: 0,
        max: 0.5 + Math.random() * 0.35,
        r: 2 + Math.random() * 3,
        color: Math.random() < 0.3 ? '#7bed9f' : '#ffd76e'
      });
    }
  }

  function flashAt(i, value) {
    flash[i] = value;
  }

  function updateFx(dt) {
    clickerPulse = Math.max(0, clickerPulse - dt * 7);
    for (let i = 0; i < C.CELLS; i++) {
      if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - dt * 3.5);
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].life += dt;
      floats[i].y -= 46 * dt;
      if (floats[i].life >= floats[i].max) floats.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      if (p.life >= p.max) particles.splice(i, 1);
    }
  }

  /* ---------- Действия ---------- */

  function tapClicker(p) {
    const crit = Math.random() < C.CRIT_CHANCE;
    const value = R.clickValue(state) * (crit ? C.CRIT_MULT : 1);
    state.coins += value;
    state.totalEarned += value;
    CG.SFX.play(crit ? 'crit' : 'click');
    CG.Platform.gameplayStart();
    clickerPulse = 1;

    const c = CG.Render.clickerCenter();
    const x = c.x + (p.x - c.x) * 0.45;
    const y = c.y + (p.y - c.y) * 0.45;
    addFloat(x, y, (crit ? 'КРИТ +' : '+') + fmt(value), crit ? '#7bed9f' : '#ffd76e', crit ? 18 : 16);
  }

  function buyCat() {
    const idx = R.freeCell(state);
    if (idx < 0) {
      CG.SFX.play('error');
      toast('🔒 Поле забито — объединяй одинаковых котов');
      return;
    }
    const cost = R.catCost(state);
    if (state.coins < cost) {
      CG.SFX.play('error');
      return;
    }
    state.coins -= cost;
    state.bought += 1;
    state.board[idx] = 1;
    CG.SFX.play('buy');
    flashAt(idx, 1);
    burstAt(idx, 6);
  }

  function buyGen(i) {
    const cost = R.genCost(state, i);
    if (state.coins < cost) {
      CG.SFX.play('error');
      return;
    }
    state.coins -= cost;
    state.gens[i] += 1;
    CG.SFX.play('buy');
  }

  function buyLap() {
    const cost = R.lapCost(state);
    if (state.coins < cost) {
      CG.SFX.play('error');
      return;
    }
    state.coins -= cost;
    state.lap += 1;
    CG.SFX.play('buy');
  }

  function buyTreat() {
    const cost = R.treatCost(state);
    if (state.coins < cost) {
      CG.SFX.play('error');
      return;
    }
    state.coins -= cost;
    state.treat += 1;
    CG.SFX.play('buy');
  }

  function handleMoveEvent(ev, from, to) {
    switch (ev.type) {
      case 'merge':
        flashAt(to, 1);
        burstAt(to, 14);
        addFloatAtCell(to, '+' + fmt(ev.reward), '#ffd76e');
        CG.SFX.play('merge');
        if (ev.newBest) {
          buildCollection();
          CG.SFX.play('tier');
          toast('✨ Новый вид: ' + TIERS[ev.tier - 1].name + '! +10% ко всему доходу', 'gold');
        }
        break;
      case 'sacrifice':
        flashAt(to, 1);
        burstAt(to, 22);
        addFloatAtCell(to, '+' + fmt(ev.reward), '#7bed9f');
        CG.SFX.play('tier');
        toast('👑 Жертва Кото-королю: +' + fmt(ev.reward), 'gold');
        break;
      case 'swap':
        CG.SFX.play('click');
        break;
      case 'move':
        CG.SFX.play('click');
        break;
      default:
        break;
    }
    CG.Platform.gameplayStart();
  }

  function resolveMove(from, to) {
    const ev = R.applyMove(state, from, to);
    handleMoveEvent(ev, from, to);
    return ev;
  }

  function tapCell(i) {
    if (selected === null) {
      selected = i;
      return;
    }
    if (selected === i) {
      selected = null;
      return;
    }
    resolveMove(selected, i);
    selected = null;
  }

  /* ---------- Сохранение ---------- */

  function saveNow() {
    state.lastSave = Date.now();
    try {
      localStorage.setItem(C.SAVE_KEY, JSON.stringify(state));
    } catch (e) {}
    CG.Platform.saveCloud(state);
  }

  function applyCloud(data) {
    try {
      const fresh = normalize(data, defaultState());
      Object.keys(fresh).forEach(function (k) {
        state[k] = fresh[k];
      });
      selected = null;
      buildCollection();
      buildShop();
      updateHud();
      toast('☁️ Прогресс загружен из облака', 'gold');
    } catch (e) {}
  }

  /* ---------- HUD и магазин ---------- */

  function buildCollection() {
    const box = $('collection');
    box.innerHTML = '';
    TIERS.forEach(function (t, i) {
      const tier = i + 1;
      const on = tier <= state.bestTier;
      const el = document.createElement('div');
      el.className = 'coll' + (on ? '' : ' coll--off');
      el.title = on ? t.name : 'Не открыт';
      el.innerHTML = (on ? t.icon : '❔') + '<i>' + tier + '</i>';
      box.appendChild(el);
    });
  }

  function buildShop() {
    shopRefs.length = 0;
    const genList = $('genList');
    genList.innerHTML = '';
    GENS.forEach(function (g, i) {
      const li = document.createElement('li');
      li.className = 'shop-item';
      li.innerHTML =
        '<span class="shop-item__icon">' +
        g.icon +
        '</span><span class="shop-item__body">' +
        '<span class="shop-item__name">' +
        g.name +
        ' <em class="lvl"></em></span>' +
        '<span class="shop-item__desc desc"></span></span>' +
        '<button type="button" class="shop-item__buy"></button>';
      const btn = li.querySelector('.shop-item__buy');
      btn.addEventListener('click', function () {
        buyGen(i);
      });
      genList.appendChild(li);
      shopRefs.push({
        btn: btn,
        lvl: li.querySelector('.lvl'),
        desc: li.querySelector('.desc'),
        cost: function () {
          return R.genCost(state, i);
        },
        level: function () {
          return state.gens[i];
        },
        effect: function () {
          const mult = R.globalMult(state);
          const lvl = state.gens[i];
          const income = GENS[i].rate * mult;
          return (lvl > 0 ? fmt(income * lvl) : '+' + fmt(income)) + '/сек';
        }
      });
    });

    const ups = [
      {
        icon: '🐾',
        name: 'Сильные лапы',
        cost: function () {
          return R.lapCost(state);
        },
        level: function () {
          return state.lap;
        },
        effect: function () {
          return 'сила клика: ' + fmt(1 + state.lap) + ' × множитель';
        },
        act: buyLap
      },
      {
        icon: '🐟',
        name: 'Лакомство',
        cost: function () {
          return R.treatCost(state);
        },
        level: function () {
          return state.treat;
        },
        effect: function () {
          return '+' + state.treat * 5 + '% ко всему доходу';
        },
        act: buyTreat
      }
    ];

    const upList = $('upList');
    upList.innerHTML = '';
    ups.forEach(function (u) {
      const li = document.createElement('li');
      li.className = 'shop-item shop-item--up';
      li.innerHTML =
        '<span class="shop-item__icon">' +
        u.icon +
        '</span><span class="shop-item__body">' +
        '<span class="shop-item__name">' +
        u.name +
        ' <em class="lvl"></em></span>' +
        '<span class="shop-item__desc desc"></span></span>' +
        '<button type="button" class="shop-item__buy"></button>';
      const btn = li.querySelector('.shop-item__buy');
      btn.addEventListener('click', u.act);
      upList.appendChild(li);
      shopRefs.push({
        btn: btn,
        lvl: li.querySelector('.lvl'),
        desc: li.querySelector('.desc'),
        cost: u.cost,
        level: u.level,
        effect: u.effect
      });
    });
  }

  function updateShop() {
    shopRefs.forEach(function (r) {
      const cost = r.cost();
      r.btn.textContent = fmt(cost);
      r.btn.disabled = state.coins < cost;
      const lvl = r.level();
      r.lvl.textContent = lvl > 0 ? 'ур. ' + lvl : '—';
      r.desc.textContent = r.effect();
    });
  }

  function updateHud() {
    const now = Date.now();
    $('coins').textContent = fmt(state.coins);
    $('income').textContent = fmt(R.idleRate(state)) + '/сек';
    $('clickPower').textContent = fmt(R.clickValue(state));

    const left = state.buffUntil - now;
    $('buffBadge').classList.toggle('hidden', left <= 0);
    if (left > 0) $('buffTime').textContent = CG.fmtTime(left);

    const cost = R.catCost(state);
    const full = R.freeCell(state) < 0;
    $('buyCatCost').textContent = fmt(cost);
    $('buyCat').disabled = full || state.coins < cost;
    $('boardHint').textContent = full
      ? '🔒 Поле забито — объединяй одинаковых котов!'
      : 'Перетащи кота на такого же — получи новый вид и монеты';

    $('adBuff').disabled = adBusy;
    $('adGift').disabled = adBusy;

    updateShop();
  }

  /* ---------- Реклама ---------- */

  function watchAd(handlers) {
    if (adBusy) return;
    adBusy = true;
    updateHud();
    CG.Platform.showRewarded({
      onOpen: function () {
        CG.SFX.play('adOpen');
        if (handlers.onOpen) handlers.onOpen();
      },
      onRewarded: function () {
        if (handlers.onRewarded) handlers.onRewarded();
      },
      onClose: function () {
        adBusy = false;
        updateHud();
      },
      onError: function () {
        adBusy = false;
        updateHud();
        toast('Реклама пока недоступна, попробуйте позже');
      }
    });
  }

  function wireAds() {
    $('adBuff').addEventListener('click', function () {
      watchAd({
        onRewarded: function () {
          state.buffUntil = Math.max(state.buffUntil, Date.now()) + C.BUFF_MS;
          CG.SFX.play('reward');
          toast('⚡ Доход ×2 на 5 минут!', 'gold');
          updateHud();
        }
      });
    });

    $('adGift').addEventListener('click', function () {
      watchAd({
        onRewarded: function () {
          const reward = Math.max(500, Math.floor(R.idleRate(state) * 300));
          state.coins += reward;
          state.totalEarned += reward;
          CG.SFX.play('reward');
          toast('🎁 Подарок: +' + fmt(reward) + ' монет', 'gold');
          updateHud();
        }
      });
    });
  }

  /* ---------- Ввод на canvas ---------- */

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hoverInfo() {
    if (!drag || !drag.moved) return null;
    const h = CG.Render.hit(drag.x, drag.y);
    if (!h || h.type !== 'cell' || h.index === drag.from) return null;
    const a = state.board[drag.from];
    const b = state.board[h.index];
    return {
      cell: h.index,
      kind: b === 0 ? 'move' : b === a ? 'merge' : 'swap'
    };
  }

  function wireCanvas() {
    canvas.addEventListener('pointerdown', function (e) {
      CG.SFX.unlock();
      if (drag) return;
      const p = pointerPos(e);
      const h = CG.Render.hit(p.x, p.y);
      if (!h) return;
      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (err) {}
      }

      if (h.type === 'clicker') {
        tapClicker(p);
        return;
      }

      const i = h.index;
      if (state.board[i] === 0) {
        if (selected !== null) {
          resolveMove(selected, i);
          selected = null;
        }
        return;
      }
      drag = { from: i, sx: p.x, sy: p.y, x: p.x, y: p.y, moved: false, id: e.pointerId };
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      const p = pointerPos(e);
      if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) {
        drag.moved = true;
      }
      drag.x = p.x;
      drag.y = p.y;
    });

    canvas.addEventListener('pointerup', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      const p = pointerPos(e);

      if (d.moved) {
        selected = null;
        const h = CG.Render.hit(p.x, p.y);
        if (h && h.type === 'cell' && h.index !== d.from) {
          resolveMove(d.from, h.index);
        }
      } else {
        tapCell(d.from);
      }
    });

    canvas.addEventListener('pointercancel', function () {
      drag = null;
    });
  }

  /* ---------- Кадр ---------- */

  let lastFrame = performance.now();
  let hudAcc = 0;
  let firstFrame = true;

  function buildScene(now) {
    return {
      time: now,
      bestTier: state.bestTier,
      board: state.board,
      selected: selected,
      drag: drag && drag.moved ? { x: drag.x, y: drag.y, from: drag.from } : null,
      hover: hoverInfo(),
      clickerPulse: clickerPulse,
      flash: flash,
      floats: floats,
      particles: particles
    };
  }

  function frame(now) {
    const dt = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;

    if (!document.hidden) {
      const rate = R.idleRate(state);
      if (rate > 0) {
        state.coins += rate * dt;
        state.totalEarned += rate * dt;
      }
      updateFx(dt);
      hudAcc += dt;
      if (hudAcc >= 0.1) {
        hudAcc = 0;
        updateHud();
      }
    }

    CG.Render.draw(buildScene(now));

    if (firstFrame) {
      firstFrame = false;
      CG.Platform.notifyGameReady();
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Модальные окна ---------- */

  function showOfflineModal(amount, gap) {
    $('offlineAmount').textContent = '+' + fmt(amount);
    const mins = Math.floor(gap / 60000);
    $('offlineSub').textContent =
      mins >= 60 ? Math.floor(mins / 60) + ' ч ' + (mins % 60) + ' мин' : mins + ' мин';
    $('offlineModal').classList.remove('hidden');
  }

  function resetProgress() {
    const fresh = defaultState();
    Object.keys(fresh).forEach(function (k) {
      state[k] = fresh[k];
    });
    selected = null;
    drag = null;
    buildCollection();
    buildShop();
    updateHud();
    saveNow();
    $('resetModal').classList.add('hidden');
    toast('Прогресс сброшен — начинаем заново');
  }

  function wireButtons() {
    $('buyCat').addEventListener('click', buyCat);
    $('muteBtn').addEventListener('click', function () {
      const muted = CG.SFX.toggle();
      $('muteBtn').textContent = muted ? '🔇' : '🔊';
      if (!muted) CG.SFX.play('click');
    });
    $('resetBtn').addEventListener('click', function () {
      $('resetModal').classList.remove('hidden');
    });
    $('resetCancel').addEventListener('click', function () {
      $('resetModal').classList.add('hidden');
    });
    $('resetOk').addEventListener('click', resetProgress);
    $('offlineOk').addEventListener('click', function () {
      $('offlineModal').classList.add('hidden');
      CG.SFX.play('reward');
    });
  }

  function wireLifecycle() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        saveNow();
        CG.Platform.gameplayStop();
      } else {
        const gain = R.offlineGain(state, state.lastSave);
        if (gain.amount > 0) {
          state.coins += gain.amount;
          state.totalEarned += gain.amount;
          toast('💤 Пока вас не было: +' + fmt(gain.amount) + ' монет', 'gold');
        }
        saveNow();
        lastFrame = performance.now();
      }
    });
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('pointerdown', function () {
      CG.SFX.unlock();
    }, { once: true });
    document.addEventListener('cg:pause', function () {
      CG.SFX.unlock(); // AudioContext может быть приостановлен платформой
    });
    document.addEventListener('cg:resume', function () {
      lastFrame = performance.now();
    });
  }

  /* ---------- Старт ---------- */

  function init() {
    buildCollection();
    buildShop();
    CG.Render.init(canvas);
    wireCanvas();
    wireButtons();
    wireAds();
    updateHud();
    $('muteBtn').textContent = CG.SFX.isMuted() ? '🔇' : '🔊';
    $('platformBadge').textContent = 'Подключение платформы…';

    // Офлайн-доход прошлой сессии
    const offline = R.offlineGain(state, state.lastSave);
    if (offline.amount > 0) {
      state.coins += offline.amount;
      state.totalEarned += offline.amount;
    }

    CG.Platform.init(function (source) {
      $('platformBadge').textContent =
        source === 'yandex'
          ? '✅ Яндекс Игры: SDK подключён, rewarded-реклама активна'
          : source === 'adsgram'
            ? '✅ Telegram: AdsGram rewarded-реклама активна'
            : 'Демо-режим: локальный запуск. На Яндекс Играх включится SDK и настоящая реклама';
    });

    // Облачный прогресс — только если локального сохранения нет
    if (!hadLocalSave) {
      CG.Platform.fetchCloudSave(function (data) {
        if (data && !hadLocalSave) applyCloud(data);
      });
    }

    if (offline.amount > 0) showOfflineModal(offline.amount, offline.gap);

    requestAnimationFrame(frame);
    setInterval(function () {
      if (!document.hidden) saveNow();
    }, C.AUTO_SAVE_MS);
  }

  init();
})();
