// const Parse = require('parse/node');
// Parse.initialize("PWQQmvXHWwZLhyHpSkXstoA2IgY8iH0Bp2Aw4goy", "Egw1Ud0UenOGl7ckfhIYKUIHsQvVd63ZRnL2njWt");
// Parse.serverURL = 'https://parseapi.back4app.com';

const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs').promises;

// Загрузка переменных окружения
require('dotenv').config();
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Проверка токена
if (!TOKEN) {
  console.error("Токен бота не найден! Создайте файл .env с TELEGRAM_BOT_TOKEN=ваш_токен");
  process.exit(1);
}

// Создание бота
const bot = new TelegramBot(TOKEN, { polling: true });

// Состояния пользователя
const INPUT_PLAYERS = "input_players";
const CHOOSE_LEVEL = "choose_level";
const CHOOSE_THEME = "choose_theme";

// Хранилище данных пользователей
const userData = new Map();

// Константы для сообщений
const MESSAGES = {
  WELCOME: "Привет! Добро пожаловать в бота для планирования тренировок по волейболу.\n\nНажмите кнопку 'Старт' чтобы начать.",
  INPUT_PLAYERS: "Введите количество игроков (от 4 до 12):",
  INVALID_PLAYERS: "❌ Ошибка! Введите число от 4 до 12:",
  PLAYERS_SUCCESS: (count) => `✅ Отлично! Количество игроков: ${count}\nТеперь выберите уровень:`,
  CHOOSE_LEVEL: "Выберите уровень:",
  CHOOSE_THEME: (level, players) => `Выбран уровень: ${level}\nИгроков: ${players}\nВыберите тему тренировки:`,
  TRAINING_READY: (level, players, theme) =>
    `✅ Отлично! План тренировки готов:\n\n• Уровень: ${level}\n• Количество игроков: ${players}\n• Тема тренировки: ${theme}\n\nХорошей тренировки! 🏐`,
  FILE_NOT_FOUND: (level) => `❌ Файлы с картинками для уровня ${level} не найдены. Обратитесь к администратору.`,
  ERROR_SENDING_IMAGES: (error) => `❌ Произошла ошибка при отправке картинок: ${error.message}`
};

// Функция для создания клавиатуры
function createKeyboard(buttons, resize = true) {
  return {
    keyboard: buttons.map(row => Array.isArray(row) ? row : [row]),
    resize_keyboard: resize
  };
}

// Клавиатуры
const KEYBOARDS = {
  START: createKeyboard(['Старт']),
  BACK: createKeyboard(['Назад']),
  LEVELS: createKeyboard([
    ["0 уровень", "1 уровень", "2 уровень"],
    ["Назад"]
  ]),
  THEMES_0: createKeyboard([
    ["Броски из-за головы, Броски снизу", "Броски из-за головы, Броски от лба"],
    ["Назад"]
  ]),
  THEMES_1: createKeyboard([
    ["Подача, передача снизу", "Подача, передача сверху"],
    ["Назад"]
  ]),
  THEMES_2: createKeyboard([
    ["Подача, передача снизу", "Подача, передача сверху"],
    ["Атака, передача снизу", "Атака, передача сверху"],
    ["Назад"]
  ]),
  NEW_TRAINING: createKeyboard(['Новая тренировка'])
};

// Валидные темы для каждого уровня
const VALID_THEMES = {
  0: ["Броски из-за головы, Броски снизу", "Броски из-за головы, Броски от лба"],
  1: ["Подача, передача снизу", "Подача, передача сверху"],
  2: ["Подача, передача снизу", "Подача, передача сверху", "Атака, передача снизу", "Атака, передача сверху"]
};

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  goBackToStart(chatId);
});

// Обработка всех сообщений
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const user = userData.get(chatId);

  try {
    // Обработка кнопки "Старт"
    if (text === 'Старт' && !user) {
      return handleStartButton(chatId);
    }

    // Обработка кнопки "Новая тренировка"
    if (text === 'Новая тренировка') {
      return goBackToStart(chatId);
    }

    if (!user) return;

    // Обработка кнопки "Назад"
    if (text === 'Назад') {
      return handleBackButton(chatId, user);
    }

    // Обработка ввода количества игроков
    if (user.menu_state === INPUT_PLAYERS) {
      return handlePlayersInput(chatId, user, text);
    }

    // Обработка выбора уровня
    if (user.menu_state === CHOOSE_LEVEL) {
      return handleLevelSelection(chatId, user, text);
    }

    // Обработка выбора темы
    if (user.menu_state === CHOOSE_THEME) {
      return handleThemeSelection(chatId, user, text);
    }
  } catch (error) {
    console.error('Ошибка обработки сообщения:', error);
    bot.sendMessage(chatId, '❌ Произошла ошибка при обработке запроса. Попробуйте снова.');
  }
});

// Обработка кнопки "Старт"
function handleStartButton(chatId) {
  userData.set(chatId, {
    menu_state: INPUT_PLAYERS
  });

  bot.sendMessage(chatId, MESSAGES.INPUT_PLAYERS, {
    reply_markup: KEYBOARDS.BACK
  });
}

// Обработка кнопки "Назад"
function handleBackButton(chatId, user) {
  switch (user.menu_state) {
    case INPUT_PLAYERS:
      goBackToStart(chatId);
      break;
    case CHOOSE_LEVEL:
      user.menu_state = INPUT_PLAYERS;
      userData.set(chatId, user);
      bot.sendMessage(chatId, MESSAGES.INPUT_PLAYERS, {
        reply_markup: KEYBOARDS.BACK
      });
      break;
    case CHOOSE_THEME:
      user.menu_state = CHOOSE_LEVEL;
      userData.set(chatId, user);
      bot.sendMessage(chatId, MESSAGES.CHOOSE_LEVEL, {
        reply_markup: KEYBOARDS.LEVELS
      });
      break;
  }
}

// Обработка ввода количества игроков
function handlePlayersInput(chatId, user, text) {
  try {
    const playersCount = parseInt(text);

    if (playersCount >= 4 && playersCount <= 12) {
      user.players_count = playersCount;
      user.menu_state = CHOOSE_LEVEL;
      userData.set(chatId, user);

      bot.sendMessage(chatId, MESSAGES.PLAYERS_SUCCESS(playersCount), {
        reply_markup: KEYBOARDS.LEVELS
      });
    } else {
      bot.sendMessage(chatId, MESSAGES.INVALID_PLAYERS, {
        reply_markup: KEYBOARDS.BACK
      });
    }
  } catch (error) {
    bot.sendMessage(chatId, MESSAGES.INVALID_PLAYERS, {
      reply_markup: KEYBOARDS.BACK
    });
  }
}

// Обработка выбора уровня
function handleLevelSelection(chatId, user, text) {
  let level;
  let keyboard;

  switch (text) {
    case "0 уровень":
      level = 0;
      keyboard = KEYBOARDS.THEMES_0;
      break;
    case "1 уровень":
      level = 1;
      keyboard = KEYBOARDS.THEMES_1;
      break;
    case "2 уровень":
      level = 2;
      keyboard = KEYBOARDS.THEMES_2;
      break;
    default:
      return bot.sendMessage(chatId, "Пожалуйста, выберите уровень из предложенных вариантов", {
        reply_markup: KEYBOARDS.LEVELS
      });
  }

  user.selected_level = level;
  user.menu_state = CHOOSE_THEME;
  userData.set(chatId, user);

  bot.sendMessage(chatId, MESSAGES.CHOOSE_THEME(text, user.players_count), {
    reply_markup: keyboard
  });
}

// Обработка выбора темы
function handleThemeSelection(chatId, user, text) {
  const selectedLevel = user.selected_level || 0;
  const playersCount = user.players_count || 'не указано';

  if (VALID_THEMES[selectedLevel].includes(text)) {
    bot.sendMessage(chatId, MESSAGES.TRAINING_READY(selectedLevel, playersCount, text), {
      reply_markup: KEYBOARDS.NEW_TRAINING
    });

    // Отправляем картинки и структуру тренировки
    sendLevelImages(chatId, selectedLevel, playersCount)
      .then(() => {
        // Отправляем структуру тренировки
        if (selectedLevel === 0) {
          return sendTrainingStructureLevel0(chatId, text);
        } else {
          return sendTrainingStructureLevel12(chatId, text);
        }
      })
      .then(() => {
        // Очищаем данные пользователя после успешной отправки
        userData.delete(chatId);
      })
      .catch(error => {
        console.error('Ошибка при отправке тренировки:', error);
        bot.sendMessage(chatId, '❌ Произошла ошибка при формировании тренировки. Попробуйте снова.');
      });
  } else {
    // Получаем соответствующую клавиатуру для уровня
    const keyboard = selectedLevel === 0 ? KEYBOARDS.THEMES_0 :
                    selectedLevel === 1 ? KEYBOARDS.THEMES_1 : KEYBOARDS.THEMES_2;

    bot.sendMessage(chatId, "Пожалуйста, выберите тему из предложенных вариантов", {
      reply_markup: keyboard
    });
  }
}

// Функция для отправки картинок
function sendLevelImages(chatId, level, playersCount) {
  return new Promise(async (resolve, reject) => {
    try {
      if (level === 0) {
        const alwaysFile = "position/0/always.png";
        try {
          await fs.access(alwaysFile);
          await bot.sendPhoto(chatId, alwaysFile, {
            caption: "Уровень 0: Базовая схема тренировки"
          });
          resolve();
        } catch (error) {
          await bot.sendMessage(chatId, MESSAGES.FILE_NOT_FOUND(level));
          resolve(); // Продолжаем выполнение даже если файл не найден
        }
      } else {
        const pFile = `position/${level}/p${playersCount}.png`;
        const tFile = `position/${level}/t${playersCount}.png`;

        try {
          await fs.access(pFile);
          await fs.access(tFile);

          await bot.sendPhoto(chatId, pFile, {
            caption: `Уровень ${level}: Схема расстановки для ${playersCount} игроков`
          });

          await bot.sendPhoto(chatId, tFile, {
            caption: `Уровень ${level}: План тренировки для ${playersCount} игроков`
          });
          resolve();
        } catch (error) {
          await bot.sendMessage(chatId, MESSAGES.FILE_NOT_FOUND(level));
          resolve(); // Продолжаем выполнение даже если файл не найден
        }
      }
    } catch (error) {
      await bot.sendMessage(chatId, MESSAGES.ERROR_SENDING_IMAGES(error));
      resolve(); // Продолжаем выполнение даже при ошибке
    }
  });
}

// Функция для отправки структуры тренировки для уровня 0
function sendTrainingStructureLevel0(chatId, theme) {
  return new Promise((resolve, reject) => {
    try {
      // Разделяем тему на две части
      const themes = theme.split(", ");
      const theme1 = themes[0] || "";
      const theme2 = themes[1] || "";

      const structureMessage =
          "🏐 *Структура тренировки (Уровень 0):*\n\n" +
          "🔹 *Блок 1: Начало*\n" +
          "• Сбор спортсменов/Объявления плана тренировки\n" +
          "  - ВР: 1 минута\n" +
          "  - Текст: Тут будет описания пункта\n" +
          "• Подвижная игра\n" +
          "  - ВР: 5 минут\n" +
          "  - Текст: Тут будет подружатся задания для подвижной игры\n" +
          "• Вода\n" +
          "  - ВР: 1 минута\n\n" +

          `🔹 *Блок 2: ${theme1}*\n` +
          "• Техника с игровым заданием\n" +
          "  - ВР: 10 минут\n" +
          "  - Текст: Тут будет подгружаться технические задания для 1 темы\n" +
          "• Подвижная игра\n" +
          "  - ВР: 5 минут\n" +
          "  - Текст: Тут будет подружатся задания для подвижной игры\n" +
          "• Вода\n" +
          "  - ВР: 1 минута\n\n" +

          `🔹 *Блок 3: ${theme2}*\n` +
          "• Техника с игровым заданием\n" +
          "  - ВР: 10 минут\n" +
          "  - Текст: Тут будет подгружаться технические задания для 2 темы\n" +
          "• Подвижная игра\n" +
          "  - ВР: 5 минут\n" +
          "  - Текст: Тут будет подружатся задания для подвижной игры\n" +
          "• Вода\n" +
          "  - ВР: 1 минута\n\n" +

          "🔹 *Блок 4: Обе темы*\n" +
          "• Техника с игровым заданием\n" +
          "  - ВР: 10 минут\n" +
          "  - Текст: Тут будет подгружаться технические задания для 2 темы\n" +
          "• Подвижная игра\n" +
          "  - ВР: 5 минут\n" +
          "  - Текст: Тут будет подружатся задания для подвижной игры\n" +
          "• Подведение итогов\n" +
          "  - ВР: 5 минут\n\n";

      bot.sendMessage(chatId, structureMessage, { parse_mode: 'Markdown' })
        .then(() => resolve())
        .catch(error => reject(error));
    } catch (error) {
      reject(error);
    }
  });
}

// Функция для отправки структуры тренировки для уровней 1 и 2
function sendTrainingStructureLevel12(chatId, theme) {
  return new Promise((resolve, reject) => {
    try {
      // Разделяем тему на две части
      const themes = theme.split(", ");
      const theme1 = themes[0] || "";
      const theme2 = themes[1] || "";

      const structureMessage =
          "🏐 *Структура тренировки:*\n\n" +
          "🔹 *Блок 1: Начало*\n" +
          "• Сбор спортсменов/Объявления плана тренировки\n" +
          "  - ВР: 1 минута\n" +
          "  - Текст: Тут будет описания пункта\n" +
          "• Разминка\n" +
          "  - ВР: 5 минут\n" +
          "  - Текст: Тут будет подружатся задания для разминки\n" +
          "• Вода\n" +
          "  - ВР: 1 минута\n\n" +

          `🔹 *Блок 2: ${theme1}*\n` +
          "• Техника с игровым заданием\n" +
          "  - ВР: 8 минут\n" +
          "  - Текст: Тут будет подгружаться технические задания для 1 темы\n" +
          "• Игра на тему 1\n" +
          "  - ВР: 8 минут\n" +
          "  - Текст: Тут будет подгружаться игра для 1 темы\n" +
          "• Вода\n" +
          "  - ВР: 1 минута\n\n" +

          `🔹 *Блок 3: ${theme2}*\n` +
          "• Техника с игровым заданием\n" +
          "  - ВР: 8 минут\n" +
          "  - Текст: Тут будет подгружаться технические задания для 2 темы\n" +
          "• Игра на тему 2\n" +
          "  - ВР: 8 минут\n" +
          "  - Текст: Тут будет подгружаться игра для 2 темы\n" +
          "• Вода\n" +
          "  - ВР: 1 минута\n\n" +

          "🔹 *Блок 4: Свободная игра/Итоги*\n" +
          "• Игра\n" +
          "  - ВР: 15 минут\n" +
          "  - Текст: Тут будет подгружаться варианты свободной игры\n" +
          "• Подведение итогов\n" +
          "  - ВР: 5 минут\n\n";

      bot.sendMessage(chatId, structureMessage, { parse_mode: 'Markdown' })
        .then(() => resolve())
        .catch(error => reject(error));
    } catch (error) {
      reject(error);
    }
  });
}

// Возврат к началу
function goBackToStart(chatId) {
  userData.delete(chatId);
  bot.sendMessage(chatId, MESSAGES.WELCOME, {
    reply_markup: KEYBOARDS.START
  });
}

console.log("Бот запущен...");