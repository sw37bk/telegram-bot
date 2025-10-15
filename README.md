# RentalCRM Telegram Bot

## Деплой на Railway

1. **Создайте бота в Telegram:**
   - Найдите @BotFather в Telegram
   - Отправьте `/newbot`
   - Следуйте инструкциям
   - Сохраните токен бота

2. **Узнайте свой Chat ID:**
   - Напишите боту @userinfobot
   - Отправьте `/start`
   - Скопируйте ваш ID

3. **Деплой на Railway:**
   - Зайдите на railway.app
   - Подключите GitHub аккаунт
   - Создайте новый проект из этого репозитория
   - Добавьте переменные окружения:
     - `BOT_TOKEN` - токен вашего бота
     - `ADMIN_CHAT_ID` - ваш Chat ID

4. **Настройте webhook:**
   - После деплоя получите URL проекта
   - Отправьте GET запрос:
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=<YOUR_RAILWAY_URL>/webhook/<BOT_TOKEN>
   ```

## API Endpoints

- `POST /api/notify-admin` - Уведомление админу
- `POST /api/notify-user` - Уведомление пользователю  
- `POST /api/register-user` - Регистрация пользователя
- `GET /health` - Проверка статуса

## Команды бота

- `/start` - Начать работу
- `/link email` - Привязать аккаунт
- `/help` - Справка
- `/status` - Статус привязки