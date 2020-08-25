require('dotenv').config();
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');
const Markup = require('telegraf/markup');
const Extra = require('telegraf/extra');

const Game = require('./models/Game');

const app = new Telegraf(process.env.TELEGRAM_API_KEY);

const uk_keyboard_chars = ['а', 'б', 'в', 'г', 'ґ', 'д', 'е', 'є', 'ж', 'з', 'и', 'і', 'ї', 'й', 'к', 'л', 'м', 'н', 'о', 'п', 'р', 'с', 'т', 'у', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ь', 'ю', 'я'];
const re_keyboard_chars = ['а', 'б', 'в', 'г', 'д', 'е', 'ё', 'ж', 'з', 'и', 'й', 'к', 'л', 'м', 'н', 'о', 'п', 'р', 'с', 'т', 'у', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ъ', 'ы', 'ь', 'э', 'ю', 'я'];
const en_keyboard_chars = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];

const devideArray = (arr, number = 5, emptyEl = Markup.callbackButton(' ', ' ')) => {
  // console.log(arr);
  const resultArray = [];
  do {
    if (arr.length < number) { // Заповнюю всі ячейки, щоб утворилась рівна матриця(квадратна.прямокутна)(для краси клавіатури)
      const diff = number - arr.length;
      arr = [...arr, ...new Array(diff).fill(emptyEl)];
    }
    resultArray.push(arr.splice(0, number));
  } while (arr.length);
  return resultArray;
};

const createWordButtons = (word = '', showInviteButton, chars = []) => {
  const wordButtons = devideArray(word.split('').map(el => {
    return Markup.callbackButton(chars.includes(el) ? el : '*' , ' ');
  }));
  wordButtons.push([Markup.callbackButton('🔝Відгадай слово🔝', ' ')]);

  const charKeyboard = devideArray(uk_keyboard_chars.map(el => Markup.callbackButton(el, el)));
  wordButtons.push(...charKeyboard);

  if (showInviteButton) {
    wordButtons.push([Markup.callbackButton('Прийняти гру', 'join')]);
  }

  return Markup.inlineKeyboard(wordButtons);
}

app.use(async (ctx, next) => {
  const { inlineMessageId, from } = ctx;
  if (!inlineMessageId) {
    return next();
  }
  const game = await Game.findOne({ gameId: inlineMessageId, 'secondPlayer.id': from.id });
  ctx.state.currentGame = game || null;
  next();
});

app.on('text', (ctx) => {
  ctx.reply('Вгадай слово',
    Extra.markdown().markup(
      Markup.inlineKeyboard([[Markup.switchToChatButton('Грати з другом', '')]])
    )
  );
});

app.on('chosen_inline_result', async (ctx) => {
  const  { from, inline_message_id, query } = ctx.update.chosen_inline_result;
  await new Game({
    gameId: inline_message_id,
    wordToGuess: query,
    firstPlayer: from
  }).save();
});

app.inlineQuery(async (wordToGuess, ctx) => {
  await ctx.answerInlineQuery([
    {
      type: 'article',
      id: '1',
      title: 'Почати Гру',
      input_message_content: {
        message_text: 'Почати Гру'
      },
      reply_markup: createWordButtons(wordToGuess, true)
    }
  ]);
});

app.action('join', async (ctx) => {
  const gameId = ctx.inlineMessageId;
  const neededGame = await Game.findOne({ gameId });
  if (!neededGame) {
    return ctx.answerCbQuery('Даної гри не існує, будь ласка, створіть нову гру!');
  }
  if (ctx.from.id === neededGame.firstPlayer.id) {
    return ctx.answerCbQuery('Ви не можете прийняти свою ж гру!');
  }
  neededGame.secondPlayer = ctx.from;
  await neededGame.save();
  ctx.answerCbQuery('Ви прийняли гру!');
  ctx.editMessageText(`Гру прийнято!`, {
    reply_markup: createWordButtons(neededGame.wordToGuess)
  });
});

app.action(uk_keyboard_chars, async (ctx, next) => {
  const { currentGame } = ctx.state;
  if (!currentGame) {
    return next();
  }
  if (currentGame.usedChars.includes(ctx.match)) {
    return ctx.answerCbQuery(`Ви вже обирали дану букву!(${ctx.match})`);
  }
  currentGame.usedChars.push(ctx.match);
  if (!currentGame.wordToGuess.includes(ctx.match)) {
    currentGame.attempts -= 1;
    ctx.answerCbQuery(`Буква не вгадана, залишилось спроб: ${currentGame.attempts}!`);
    if (currentGame.attempts <= 0) {
      await Game.deleteOne({ gameId: currentGame.gameId });
      return ctx.editMessageText(`Ви програли! слово: "${currentGame.wordToGuess}"`);
    }
  } else {
    const won = currentGame.wordToGuess.split('').every(el => currentGame.usedChars.includes(el));
    if (won) {
      await Game.deleteOne({ gameId: currentGame.gameId });
      ctx.answerCbQuery(`Ви виграли!`);
      return ctx.editMessageText(`Ви виграли! слово: "${currentGame.wordToGuess}"`);
    } else {
      ctx.answerCbQuery(`Буква вгадана, залишилось спроб: ${currentGame.attempts}!`);
      ctx.editMessageText(`Буква вгадана: ${ctx.match}`, {
        reply_markup: createWordButtons(currentGame.wordToGuess, null, currentGame.usedChars)
      });
    }
  }
  await currentGame.save();
});

app.action(async (match, ctx) => {
  ctx.answerCbQuery('Не доступно!');
});

async function main() {
  const { MONGOLAB_URI, TELEGRAM_API_KEY, BOT_URL, PORT } = process.env;
  try {
    await mongoose.connect(MONGOLAB_URI, { useNewUrlParser: true });
    if (process.env.NODE_ENV === 'production') {
      console.log(`${BOT_URL}bot${TELEGRAM_API_KEY}`, PORT);
      app.telegram.setWebhook(`${BOT_URL}bot${TELEGRAM_API_KEY}`);
      app.startWebhook(`bot${TELEGRAM_API_KEY}`, null, PORT);
    } else {
      await app.launch();
    }
    console.log('CONNECTED TO DB AND LAUNCHED');
  } catch (error) {
    console.log(error);
  }
}

main();