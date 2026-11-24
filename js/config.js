'use strict';
window.CG = window.CG || {};

/** Константы баланса и контент игры. Только данные — без DOM и логики. */
CG.CONFIG = {
  SAVE_KEY: 'cat-evolution-save-v1',
  COLS: 6,
  ROWS: 4,
  CELLS: 24,
  MAX_TIER: 10,

  AUTO_SAVE_MS: 5000,
  BUFF_MS: 5 * 60 * 1000,
  OFFLINE_MIN_MS: 60 * 1000,
  OFFLINE_CAP_MS: 8 * 60 * 60 * 1000,

  CRIT_CHANCE: 0.06,
  CRIT_MULT: 7,
  AD_SECONDS: 5,

  GEN_GROWTH: 1.15,
  LAP: { BASE: 50, GROWTH: 1.6 },
  TREAT: { BASE: 800, GROWTH: 3.2 },
  CAT: { BASE: 20, GROWTH: 1.08 },
  MERGE: { BASE: 15, GROWTH: 4 },

  // ID блока rewarded-видео в AdsGram (adsgram.ai). Пусто → демо-режим.
  ADSGRAM_BLOCK_ID: ''
};

/** Ступени эволюции: от лапки до Кото-короля. */
CG.TIERS = [
  { icon: '🐾', name: 'Лапка' },
  { icon: '🐱', name: 'Котёнок' },
  { icon: '🐈', name: 'Уличный кот' },
  { icon: '😼', name: 'Мурзик' },
  { icon: '🐈‍⬛', name: 'Теневой кот' },
  { icon: '🐆', name: 'Леопард' },
  { icon: '🦁', name: 'Лев' },
  { icon: '🐯', name: 'Тигр' },
  { icon: '🐅', name: 'Императорский тигр' },
  { icon: '👑', name: 'Кото-король' }
];

/** Генераторы пассивного дохода: цена растёт на GEN_GROWTH за уровень. */
CG.GENERATORS = [
  { id: 'bowl', icon: '🥣', name: 'Миска с кормом', base: 25, rate: 0.2 },
  { id: 'scratch', icon: '🪵', name: 'Когтеточка', base: 220, rate: 1.4 },
  { id: 'tower', icon: '🗼', name: 'Когте-башня', base: 2400, rate: 9 },
  { id: 'fountain', icon: '⛲', name: 'Фонтанчик', base: 26000, rate: 52 },
  { id: 'nanny', icon: '🤖', name: 'Няня-робот', base: 310000, rate: 300 },
  { id: 'salon', icon: '✂️', name: 'Кото-салон', base: 4e6, rate: 1700 },
  { id: 'lab', icon: '🔬', name: 'Кото-лаборатория', base: 6.5e7, rate: 9500 },
  { id: 'bank', icon: '🏦', name: 'Кото-банк', base: 1.1e9, rate: 54000 },
  { id: 'ship', icon: '🚀', name: 'Кото-корабль', base: 1.9e10, rate: 310000 },
  { id: 'planet', icon: '🪐', name: 'Кото-планета', base: 3.4e11, rate: 1.8e6 }
];

/** Форматирование чисел: 999, 1.2K, 3.4M … 1.5e+35. */
CG.fmt = function fmt(n) {
  if (!isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 1000) {
    if (Number.isInteger(n)) return sign + n;
    return sign + (n < 10 ? n.toFixed(1) : String(Math.floor(n)));
  }
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  const abs = n;
  let u = 0;
  while (n >= 1000 && u < units.length - 1) {
    n /= 1000;
    u++;
  }
  if (n >= 1000) return sign + abs.toExponential(2);
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  let s = n.toFixed(digits);
  if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return sign + s + units[u];
};

/** Человеческое время: 4:05, 1:02:03. */
CG.fmtTime = function fmtTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
};
