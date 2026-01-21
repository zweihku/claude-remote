import TelegramBot from 'node-telegram-bot-api';

const bot = new TelegramBot('8551472457:AAEyDjTwOkei-0-KkcBikqhNawLUWeGIW3g', { polling: true });

console.log('Test bot started...');

bot.on('message', (msg) => {
  console.log('Received:', msg.chat.id, msg.text);
  bot.sendMessage(msg.chat.id, 'Got: ' + msg.text);
});

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

setTimeout(() => {
  console.log('Timeout - stopping');
  bot.stopPolling();
  process.exit(0);
}, 20000);
