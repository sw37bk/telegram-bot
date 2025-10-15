const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const port = process.env.PORT || 3000;

const bot = new TelegramBot(token, { polling: false });
const app = express();

app.use(express.json());

// CORS для работы с Vercel
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Хранилище: token -> {userId, username, phone, expires}
const linkTokens = new Map();
// Хранилище: telegramId -> {username, phone, userId}
const telegramUsers = new Map();

// Генерация уникального токена
function generateLinkToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Webhook для Telegram
app.post(`/webhook/${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// API для связывания пользователя (вызывается с сайта)
app.post('/api/link-user', (req, res) => {
  const { userId, username, phone } = req.body;
  
  // Генерируем уникальный токен
  const token = generateLinkToken();
  const expires = Date.now() + 10 * 60 * 1000; // 10 минут
  
  linkTokens.set(token, { userId, username, phone, expires });
  
  res.json({ 
    success: true, 
    token,
    botUrl: `https://t.me/${process.env.BOT_USERNAME}?start=${token}`,
    message: `Перейдите по ссылке или напишите боту команду: /start ${token}`
  });
});

// API для отправки уведомлений пользователю
app.post('/api/notify-user', (req, res) => {
  const { userId, message } = req.body;
  
  // Ищем telegramId по userId
  let telegramId = null;
  for (const [tgId, userData] of telegramUsers.entries()) {
    if (userData.userId === userId) {
      telegramId = tgId;
      break;
    }
  }
  
  if (!telegramId) {
    return res.status(404).json({ error: 'User not linked to Telegram' });
  }

  bot.sendMessage(telegramId, message)
    .then(() => res.json({ success: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// API для проверки статуса связывания
app.get('/api/link-status/:userId', (req, res) => {
  const { userId } = req.params;
  
  // Ищем связанного пользователя
  for (const [tgId, userData] of telegramUsers.entries()) {
    if (userData.userId === parseInt(userId)) {
      return res.json({ 
        linked: true, 
        telegramId: tgId,
        username: userData.username,
        phone: userData.phone
      });
    }
  }
  
  res.json({ linked: false });
});

// Обработка команды /start с токеном
bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const telegramUsername = msg.from.username;
  const firstName = msg.from.first_name;
  const token = match[1];
  
  if (token) {
    // Проверяем токен
    const linkData = linkTokens.get(token);
    
    if (!linkData) {
      // Отправляем webhook об ошибке
      fetch('https://rental-crm-frontend-po2rt7ktx-sw37bks-projects.vercel.app/api/telegram-link-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'invalid_token' })
      }).catch(console.error);
      return bot.sendMessage(chatId, '❌ Неверный или устаревший токен связывания');
    }
    
    if (linkData.expires < Date.now()) {
      linkTokens.delete(token);
      // Отправляем webhook об ошибке
      fetch('https://rental-crm-frontend-po2rt7ktx-sw37bks-projects.vercel.app/api/telegram-link-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'token_expired' })
      }).catch(console.error);
      return bot.sendMessage(chatId, '❌ Токен связывания истек. Получите новый на сайте');
    }
    
    // Связываем аккаунты
    telegramUsers.set(chatId.toString(), {
      userId: linkData.userId,
      username: linkData.username,
      phone: linkData.phone,
      telegramUsername: telegramUsername,
      firstName: firstName
    });
    
    // Удаляем использованный токен
    linkTokens.delete(token);
    
    // Отправляем webhook на сайт об успешном связывании
    fetch('https://rental-crm-frontend-po2rt7ktx-sw37bks-projects.vercel.app/api/telegram-link-callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        userId: linkData.userId,
        telegramId: chatId.toString(),
        username: linkData.username,
        phone: linkData.phone,
        telegramUsername: telegramUsername,
        firstName: firstName
      })
    }).catch(console.error);
    
    bot.sendMessage(chatId, `✅ Аккаунт успешно привязан к Рентология!
    
🔗 Связь установлена:
${telegramUsername ? `Telegram: @${telegramUsername}` : `Имя: ${firstName}`}
Сайт: ID ${linkData.userId}

Теперь вы будете получать уведомления о:
• Новых бронированиях
• Отменах бронирований
• Новых сообщениях в чатах`);
    
    console.log(`User linked: ${linkData.userId} -> ${chatId}`);
  } else {
    // Проверяем, не привязан ли уже
    const userData = telegramUsers.get(chatId.toString());
    if (userData) {
      return bot.sendMessage(chatId, `✅ Ваш аккаунт уже привязан (ID: ${userData.userId})`);
    }
    
    bot.sendMessage(chatId, `🏠 Добро пожаловать в Рентология!

❌ Для связывания аккаунта:
1. Зайдите в настройки на сайте
2. Нажмите "Связать Telegram"
3. Перейдите по полученной ссылке или используйте токен`);
  }
});

// Обработка команды /status
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const userData = telegramUsers.get(chatId.toString());
  
  if (userData) {
    bot.sendMessage(chatId, `✅ Аккаунт привязан
    
🔗 Информация о связи:
Сайт: ID ${userData.userId}
${userData.username ? `Никнейм: ${userData.username}` : ''}
${userData.phone ? `Телефон: ${userData.phone}` : ''}
Telegram: ${userData.telegramUsername ? `@${userData.telegramUsername}` : userData.firstName}`);
  } else {
    bot.sendMessage(chatId, `❌ Аккаунт не привязан
    
Для связывания:
1. Зайдите в настройки на сайте
2. Введите ваш Telegram данные
3. Нажмите "Связать аккаунт"
4. Напишите /start`);
  }
});

// Очистка истекших токенов
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of linkTokens.entries()) {
    if (data.expires < now) {
      linkTokens.delete(token);
    }
  }
}, 60000); // каждую минуту

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    linkedUsers: telegramUsers.size,
    pendingTokens: linkTokens.size
  });
});

app.listen(port, () => {
  console.log(`Bot server running on port ${port}`);
});
