// Vercel serverless function: отвечает на /start в Telegram-боте
// и присылает ссылку на мини-приложение в виде inline-кнопки.
//
// Переменные окружения (задаются в панели Vercel, НЕ в коде):
//   BOT_TOKEN  — токен бота из @BotFather
//   GAME_URL   — ссылка на мини-приложение (по умолчанию GitHub Pages)

const TOKEN = process.env.BOT_TOKEN || '';
const GAME_URL = process.env.GAME_URL || 'https://wizardx-develop.github.io/cat-evolution/';
const TG = 'https://api.telegram.org/bot' + TOKEN;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).send('ok');
    return;
  }

  const update = req.body || {};
  const msg = update.message;
  if (msg && typeof msg.text === 'string' && msg.text.startsWith('/start')) {
    try {
      await fetch(TG + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: msg.chat.id,
          text: '🐱 Привет! Играй в «Кото-Эволюцию» — мержи котов, зарабатывай монеты и смотри рекламу за награды.',
          reply_markup: {
            inline_keyboard: [[
              { text: '🎮 Играть', web_app: { url: GAME_URL } }
            ]]
          }
        })
      });
    } catch (e) {
      // Не падаем — Telegram повторит вебхук при ошибке
    }
  }

  res.status(200).json({ ok: true });
};
