const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;
const port = process.env.PORT || 3000;

const bot = new TelegramBot(token, { polling: false });
const app = express();

app.use(express.json());

// Хранилище пользователей (в продакшене использовать БД)
const users = new Map();

// Webhook для Telegram
app.post(`/webhook/${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// API для отправки уведомлений по username/имени
app.post('/api/notify-by-username', (req, res) => {
  const { username, message } = req.body;
  
  const telegramId = users.get(username);
  if (!telegramId) {
    return res.status(404).json({ error: 'User not found or not linked' });
  }

  bot.sendMessage(telegramId, message)
    .then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// API для отправки уведомлений пользователю
app.post('/api/notify-user', (req, res) => {
  const { telegramId, message } = req.body;
  
  bot.sendMessage(telegramId, message)
    .then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// API для получения списка пользователей
app.get('/api/users', (req, res) => {
  const userList = Array.from(users.entries()).map(([username, telegramId]) => ({
    username,
    telegramId,
    linked: true
  }));
  res.json(userList);
});

// API для проверки привязки пользователя
app.get('/api/user/:username', (req, res) => {
  const { username } = req.params;
  const telegramId = users.get(username);
  
  if (telegramId) {
    res.json({ username, telegramId, linked: true });
  } else {
    res.json({ username, linked: false });
  }
});

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username;
  const firstName = msg.from.first_name;
  
  // Автоматически привязываем пользователя по username или имени
  const userKey = username ? `@${username}` : firstName;
  users.set(userKey, chatId.toString());
  
  const welcomeMessage = `
🏠 Добро пожаловать в Рентология!

✅ Ваш аккаунт автоматически привязан!
${username ? `Никнейм: @${username}` : `Имя: ${firstName}`}

Вы будете получать уведомления о:
• Новых бронированиях
• Отменах бронирований
• Новых сообщениях в чатах

Используйте /help для просмотра команд.
  `;
  
  bot.sendMessage(chatId, welcomeMessage);
  console.log(`User auto-linked: ${userKey} -> ${chatId}`);
});

// Обработка команды /link для ручной привязки
bot.onText(/\/link (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userKey = match[1];
  
  users.set(userKey, chatId.toString());
  
  bot.sendMessage(chatId, `✅ Аккаунт ${userKey} успешно привязан!
Теперь вы будете получать уведомления о:
• Новых бронированиях
• Отменах бронирований  
• Новых сообщениях в чатах`);

  console.log(`User manually linked: ${userKey} -> ${chatId}`);
});

// Обработка команды /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📋 Доступные команды:

/start - Начать работу и привязать аккаунт
/link username - Ручная привязка аккаунта
/help - Показать эту справку
/status - Проверить статус привязки
  `;
  
  bot.sendMessage(chatId, helpMessage);
});

// Обработка команды /status
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  
  // Ищем username по chat ID
  let userKey = null;
  for (const [key, id] of users.entries()) {
    if (id === chatId.toString()) {
      userKey = key;
      break;
    }
  }
  
  if (userKey) {
    bot.sendMessage(chatId, `✅ Аккаунт привязан: ${userKey}`);
  } else {
    bot.sendMessage(chatId, `❌ Аккаунт не привязан. Используйте /start для автоматической привязки`);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', users: users.size });
});

app.listen(port, () => {
  console.log(`Bot server running on port ${port}`);
});
