'use strict';

/**
 * Тесты чистых правил игры. Запуск: node test/rules.test.js
 * Браузер не нужен — rules.js не зависит от DOM.
 */
global.window = global;
require('../js/config.js');
require('../js/rules.js');

const assert = require('assert');
const C = CG.CONFIG;
const R = CG.Rules;

function makeState(overrides) {
  const board = new Array(C.CELLS).fill(0);
  board[0] = 1;
  return Object.assign(
    {
      coins: 30,
      totalEarned: 0,
      board: board,
      gens: CG.GENERATORS.map(function () { return 0; }),
      lap: 0,
      treat: 0,
      bought: 0,
      bestTier: 1,
      buffUntil: 0,
      lastSave: Date.now()
    },
    overrides || {}
  );
}

/* --- Форматирование --- */
assert.strictEqual(CG.fmt(0), '0');
assert.strictEqual(CG.fmt(999), '999');
assert.strictEqual(CG.fmt(1500), '1.5K');
assert.strictEqual(CG.fmt(2500000), '2.5M');
assert.strictEqual(CG.fmt(1.5e35), '150Dc');
assert.strictEqual(CG.fmt(1e37), '1.00e+37');
assert.strictEqual(CG.fmtTime(65000), '1:05');
assert.strictEqual(CG.fmtTime(3723000), '1:02:03');

/* --- Экономика --- */
const s = makeState();
assert.strictEqual(R.clickValue(s), 1.1, 'базовый клик × множитель стартового вида');
assert.strictEqual(R.idleRate(s), 0, 'без генераторов дохода нет');
assert.strictEqual(R.genCost(s, 0), 25);
assert.strictEqual(R.catCost(s), 20);
assert.strictEqual(R.lapCost(s), 50);
assert.strictEqual(R.mergeReward(2), 60);

s.gens[0] = 2;
const expectedRate = 0.2 * 2 * 1.1; // bestTier 1 → множитель 1.1
assert.ok(Math.abs(R.idleRate(s) - expectedRate) < 1e-9, 'доход учитывает множитель вида');

s.treat = 2; // +10%
assert.ok(R.idleRate(s) > expectedRate, 'лакомство увеличивает доход');

s.buffUntil = Date.now() + 60000;
assert.ok(Math.abs(R.idleRate(s) - expectedRate * 1.1 * 2) < 1e-9, 'буст ×2 удваивает доход');
s.buffUntil = 0;

s.lap = 3;
assert.ok(Math.abs(R.clickValue(s) - 4 * 1.1 * 1.1) < 1e-9, 'клик учитывает лапы, вид и лакомство');

/* --- Мерж --- */
const m = makeState();
m.board[0] = 1;
m.board[1] = 1;

let ev = R.applyMove(m, 0, 1);
assert.strictEqual(ev.type, 'merge');
assert.strictEqual(ev.tier, 2);
assert.strictEqual(ev.reward, 60);
assert.strictEqual(ev.newBest, true);
assert.strictEqual(m.board[0], 0);
assert.strictEqual(m.board[1], 2);
assert.strictEqual(m.bestTier, 2);
assert.strictEqual(m.coins, 30 + 60);

ev = R.applyMove(m, 0, 1);
assert.strictEqual(ev.type, 'none', 'пустая ячейка не даёт события');

/* --- Обмен местами --- */
const sw = makeState();
sw.board[0] = 1;
sw.board[1] = 3;
ev = R.applyMove(sw, 0, 1);
assert.strictEqual(ev.type, 'swap');
assert.strictEqual(sw.board[0], 3);
assert.strictEqual(sw.board[1], 1);

/* --- Жертва двумя Кото-королями --- */
const sc = makeState({ coins: 0 });
sc.board[0] = C.MAX_TIER;
sc.board[1] = C.MAX_TIER;
ev = R.applyMove(sc, 0, 1);
assert.strictEqual(ev.type, 'sacrifice');
assert.strictEqual(ev.reward, R.mergeReward(C.MAX_TIER) * 10);
assert.strictEqual(sc.board[0], 0);
assert.strictEqual(sc.board[1], C.MAX_TIER);

/* --- Полное поле --- */
const full = makeState();
full.board = full.board.map(function (_t, i) { return (i % 2) + 1; });
assert.strictEqual(R.freeCell(full), -1);

/* --- Офлайн-доход --- */
const off = makeState();
off.gens[0] = 10; // 2/сек до множителя → 2.2/сек
const now = Date.now();
let g = R.offlineGain(off, now - 59000, now);
assert.strictEqual(g.amount, 0, 'меньше минуты офлайна не считается');
g = R.offlineGain(off, now - 60000, now);
assert.ok(Math.abs(g.amount - 132) < 1e-6, 'ровно минута офлайна считается');
g = R.offlineGain(off, now - 10 * 60000, now);
assert.ok(Math.abs(g.amount - 2.2 * 600) < 1e-6, '10 минут × 2.2/сек');
g = R.offlineGain(off, now - 100 * 3600 * 1000, now);
assert.ok(Math.abs(g.amount - 2.2 * 8 * 3600) < 1e-6, 'потолок офлайна — 8 часов');

const idle = makeState();
assert.strictEqual(R.offlineGain(idle, Date.now() - 3600000).amount, 0, 'без генераторов офлайн-дохода нет');

console.log('OK: 28 проверок правил игры пройдено');
