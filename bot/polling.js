// Локальный вариант бота (polling) — для проверки без хостинга.
// Запуск: BOT_TOKEN=... GAME_URL=... node bot/polling.js
// Остановка: Ctrl+C в терминале.

const TOKEN = process.env.BOT_TOKEN;
const GAME_URL = process.env.GAME_URL || 'https://wizardx-develop.github.io/cat-evolution/';
const TG = 'https://api.telegram.org/bot' + TOKEN;

if (!TOKEN) { console.error('Нужен BOT_TOKEN'); process.exit(1); }

let offset = 0;
async function poll() {
  try {
    const r = await fetch(TG + '/getUpdates?offset=' + offset + '&timeout=25');
    const data = await r.json();
    for (const u of (data.result || [])) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (msg && typeof msg.text === 'string' && msg.text.startsWith('/start')) {
        await fetch(TG + '/sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: msg.chat.id,
            text: '🐱 Привет! Играй в «Кото-Эволюцию».',
            reply_markup: { inline_keyboard: [[{ text: '🎮 Играть', web_app: { url: GAME_URL } }]] }
          })
        });
      }
    }
  } catch (e) {
    console.error('poll error:', e.message);
  }
  poll();
}
console.log('Bot polling started. Ctrl+C to stop.');
poll();
