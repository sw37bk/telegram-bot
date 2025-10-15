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

// API для отправки уведомлений по email
app.post('/api/notify-by-email', (req, res) => {
  const { email, message } = req.body;
  
  const telegramId = users.get(email);
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
  const userList = Array.from(users.entries()).map(([email, telegramId]) => ({
    email,
    telegramId,
    linked: true
  }));
  res.json(userList);
});

// API для проверки привязки пользователя
app.get('/api/user/:email', (req, res) => {
  const { email } = req.params;
  const telegramId = users.get(email);
  
  if (telegramId) {
    res.json({ email, telegramId, linked: true });
  } else {
    res.json({ email, linked: false });
  }
});

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🤖 Добро пожаловать в RentalCRM Bot!

Для связывания аккаунта отправьте команду:
/link ваш@email.com

Например: /link user@example.com
  `;
  
  bot.sendMessage(chatId, welcomeMessage);
});

// Обработка команды /link
bot.onText(/\/link (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const email = match[1];
  
  if (!email.includes('@')) {
    bot.sendMessage(chatId, '❌ Неверный формат email');
    return;
  }
  
  users.set(email, chatId.toString());
  
  bot.sendMessage(chatId, `✅ Аккаунт ${email} успешно привязан!
Теперь вы будете получать уведомления о:
• Новых бронированиях
• Отменах бронирований  
• Новых сообщениях в чатах`);

  console.log(`User linked: ${email} -> ${chatId}`);
});

// Обработка команды /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📋 Доступные команды:

/start - Начать работу с ботом
/link email - Привязать аккаунт
/help - Показать эту справку
/status - Проверить статус привязки
  `;
  
  bot.sendMessage(chatId, helpMessage);
});

// Обработка команды /status
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  
  // Ищем email по chat ID
  let userEmail = null;
  for (const [email, id] of users.entries()) {
    if (id === chatId.toString()) {
      userEmail = email;
      break;
    }
  }
  
  if (userEmail) {
    bot.sendMessage(chatId, `✅ Аккаунт привязан: ${userEmail}`);
  } else {
    bot.sendMessage(chatId, `❌ Аккаунт не привязан. Используйте /link ваш@email.com`);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', users: users.size });
});

app.listen(port, () => {
  console.log(`Bot server running on port ${port}`);
});