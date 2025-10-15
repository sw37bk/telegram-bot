const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
require('dotenv').config();

const token = process.env.BOT_TOKEN;
const port = process.env.PORT || 3000;

const bot = new TelegramBot(token, { polling: false });
const app = express();

app.use(express.json());

// Хранилище: username/phone -> telegramId
const userLinks = new Map();
// Хранилище: telegramId -> {username, phone, userId}
const telegramUsers = new Map();

// Webhook для Telegram
app.post(`/webhook/${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// API для связывания пользователя (вызывается с сайта)
app.post('/api/link-user', (req, res) => {
  const { userId, username, phone } = req.body;
  
  // Сохраняем запрос на связывание
  const linkKey = username || phone;
  userLinks.set(linkKey, { userId, username, phone, linked: false });
  
  res.json({ success: true, message: 'Теперь напишите боту /start в Telegram' });
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

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const telegramUsername = msg.from.username;
  const firstName = msg.from.first_name;
  
  // Ищем запрос на связывание по username или имени
  let linkData = null;
  const searchKeys = [
    telegramUsername ? `@${telegramUsername}` : null,
    telegramUsername,
    firstName
  ].filter(Boolean);
  
  for (const key of searchKeys) {
    if (userLinks.has(key)) {
      linkData = userLinks.get(key);
      break;
    }
  }
  
  if (linkData) {
    // Связываем аккаунты
    telegramUsers.set(chatId.toString(), {
      userId: linkData.userId,
      username: linkData.username,
      phone: linkData.phone,
      telegramUsername: telegramUsername,
      firstName: firstName
    });
    
    // Помечаем как связанный
    linkData.linked = true;
    
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
    bot.sendMessage(chatId, `🏠 Добро пожаловать в Рентология!

❌ Аккаунт не найден для связывания.

Для связывания аккаунта:
1. Зайдите в настройки на сайте
2. Введите ваш Telegram никнейм: ${telegramUsername ? `@${telegramUsername}` : 'укажите никнейм'}
3. Нажмите "Связать аккаунт"
4. Вернитесь сюда и напишите /start снова`);
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    linkedUsers: telegramUsers.size,
    pendingLinks: userLinks.size
  });
});

app.listen(port, () => {
  console.log(`Bot server running on port ${port}`);
});
