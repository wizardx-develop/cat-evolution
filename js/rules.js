'use strict';

/**
 * Чистые правила игры: экономика, мерж, офлайн-доход.
 * Ни DOM, ни рендера, ни звука — только state и числа.
 * Поэтому модуль гоняется тестами в Node без браузера.
 */
(function () {
  const C = CG.CONFIG;

  function globalMult(state, now) {
    now = now || Date.now();
    let m = (1 + state.bestTier * 0.1) * (1 + state.treat * 0.05);
    if (state.buffUntil > now) m *= 2;
    return m;
  }

  function idleRate(state, now) {
    let sum = 0;
    for (let i = 0; i < CG.GENERATORS.length; i++) {
      sum += CG.GENERATORS[i].rate * state.gens[i];
    }
    return sum * globalMult(state, now);
  }

  function clickValue(state, now) {
    return (1 + state.lap) * globalMult(state, now);
  }

  function genCost(state, i) {
    return Math.floor(CG.GENERATORS[i].base * Math.pow(C.GEN_GROWTH, state.gens[i]));
  }

  function lapCost(state) {
    return Math.floor(C.LAP.BASE * Math.pow(C.LAP.GROWTH, state.lap));
  }

  function treatCost(state) {
    return Math.floor(C.TREAT.BASE * Math.pow(C.TREAT.GROWTH, state.treat));
  }

  function catCost(state) {
    return Math.floor(C.CAT.BASE * Math.pow(C.CAT.GROWTH, state.bought));
  }

  /** Награда за появление нового вида (tier). */
  function mergeReward(tier) {
    return Math.floor(C.MERGE.BASE * Math.pow(C.MERGE.GROWTH, tier - 1));
  }

  function freeCell(state) {
    for (let i = 0; i < C.CELLS; i++) {
      if (state.board[i] === 0) return i;
    }
    return -1;
  }

  /**
   * Перемещение кота from → to. Мутирует state и возвращает событие для FX:
   * none | move | swap | merge | sacrifice
   */
  function applyMove(state, from, to) {
    if (from === to || from < 0 || to < 0 || from >= C.CELLS || to >= C.CELLS) {
      return { type: 'none' };
    }
    const a = state.board[from];
    const b = state.board[to];
    if (!a) return { type: 'none' };

    if (!b) {
      state.board[to] = a;
      state.board[from] = 0;
      return { type: 'move' };
    }

    if (a === b) {
      if (a >= C.MAX_TIER) {
        // Два Кото-короля — жертва ради крупной награды, ячейка освобождается.
        const reward = mergeReward(a) * 10;
        state.board[from] = 0;
        state.coins += reward;
        state.totalEarned += reward;
        return { type: 'sacrifice', reward };
      }
      const tier = a + 1;
      const reward = mergeReward(tier);
      state.board[to] = tier;
      state.board[from] = 0;
      state.coins += reward;
      state.totalEarned += reward;
      const newBest = tier > state.bestTier;
      if (newBest) state.bestTier = tier;
      return { type: 'merge', tier, reward, newBest };
    }

    state.board[to] = a;
    state.board[from] = b;
    return { type: 'swap' };
  }

  /** Доход за время, проведённое вне игры (с потолком OFFLINE_CAP_MS). */
  function offlineGain(state, since, now) {
    now = now || Date.now();
    const gap = Math.max(0, now - since);
    if (gap < C.OFFLINE_MIN_MS) return { amount: 0, gap: gap };
    const rate = idleRate(state, now);
    if (rate <= 0) return { amount: 0, gap: gap };
    return { amount: rate * Math.min(gap, C.OFFLINE_CAP_MS) / 1000, gap: gap };
  }

  CG.Rules = {
    globalMult: globalMult,
    idleRate: idleRate,
    clickValue: clickValue,
    genCost: genCost,
    lapCost: lapCost,
    treatCost: treatCost,
    catCost: catCost,
    mergeReward: mergeReward,
    freeCell: freeCell,
    applyMove: applyMove,
    offlineGain: offlineGain
  };
})();
