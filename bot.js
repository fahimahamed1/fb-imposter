require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("Telegram bot token missing in .env");

const bot = new TelegramBot(TOKEN, { polling: true });

const fields = [
  { key: "victimName", question: "Enter your full name (victim):" },
  { key: "victimEmail", question: "Enter your contact email:" },
  { key: "impostorName", question: "Enter impostor full name:" },
  { key: "impostorEmail", question: "Enter impostor email:" },
  { key: "impostorProfileUrl", question: "Enter impostor profile URL:" },
  { key: "message", question: "Enter message for Facebook:" },
  { key: "idFiles", question: "Please upload your ID file(s). Send /done when finished." }
];

const userStates = {};

// --- /start ---
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `👋 Welcome! Use /takedata to start submitting a Facebook impersonation report.`);
});

// --- /takedata ---
bot.onText(/\/takedata/, msg => {
  const chatId = msg.chat.id;
  if (userStates[chatId]) return bot.sendMessage(chatId, "⚠️ You already have a report in progress.");
  userStates[chatId] = { step: 0, responses: {}, idFiles: [] };
  bot.sendMessage(chatId, "🤖 Starting interactive impersonation report...");
  askField(chatId);
});

// --- Handle messages ---
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  if (!state) return;

  const currentField = fields[state.step];
  if (!currentField) return;
  if (msg.text && ['/start', '/takedata'].includes(msg.text)) return;

  // --- ID files ---
  if (currentField.key === 'idFiles') {
    if (msg.document) {
      const fileId = msg.document.file_id;
      const ext = path.extname(msg.document.file_name);
      const saveDir = path.join(__dirname, 'temp', String(chatId), 'uploads');
      fs.mkdirSync(saveDir, { recursive: true });

      try {
        const downloadedPath = await bot.downloadFile(fileId, saveDir);
        const savePath = path.join(saveDir, `${Date.now()}${ext}`);
        fs.renameSync(downloadedPath, savePath);

        state.idFiles.push(savePath);
        state.responses.idFiles = state.idFiles;
        bot.sendMessage(chatId, `✅ File uploaded: ${path.basename(savePath)}\nUpload more or type /done.`);
      } catch (err) {
        return bot.sendMessage(chatId, `❌ Failed to download file: ${err.message}`);
      }
      return;
    } else if (msg.text === '/done') {
      if (!state.idFiles.length) return bot.sendMessage(chatId, "❌ Upload at least one ID file before finishing.");
      saveDataAndRun(chatId);
      return;
    } else {
      return bot.sendMessage(chatId, "❌ Upload a valid file or type /done.");
    }
  }

  // --- Text fields ---
  if (msg.text) {
    state.responses[currentField.key] = msg.text.trim();
    state.step++;
    askField(chatId);
  }
});

// --- Ask next field ---
function askField(chatId) {
  const state = userStates[chatId];
  if (!state) return;
  if (state.step >= fields.length) return;
  const field = fields[state.step];
  bot.sendMessage(chatId, field.question);
}

// --- Save data and run imposter.js ---
function saveDataAndRun(chatId) {
  const state = userStates[chatId];
  if (!state) return;

  const userFolder = path.join(__dirname, 'temp', String(chatId));
  fs.mkdirSync(userFolder, { recursive: true });

  const dataPath = path.join(userFolder, 'data.js');
  const fileContent = `module.exports = ${JSON.stringify(state.responses, null, 2)};\n`;
  fs.writeFileSync(dataPath, fileContent);

  bot.sendMessage(chatId, "✅ Data saved! Running impersonation script...");

  const scriptPath = path.join(__dirname, 'imposter.js');

  exec(`node "${scriptPath}"`, {
    cwd: userFolder,
    env: { ...process.env } // pass all env vars including HEADLESS
  }, async (error, stdout, stderr) => {
    if (error) return bot.sendMessage(chatId, `❌ Script failed: ${error.message}`);
    if (stderr) console.log(`⚠️ Script stderr:`, stderr);

    bot.sendMessage(chatId, `✅ Script finished. Output:\n${stdout}`);

    // --- Send screenshot ---
    const match = stdout.match(/📸 SCREENSHOT_PATH: (.+)/);
    if (match && match[1]) {
      const screenshotPath = match[1].trim();
      if (fs.existsSync(screenshotPath)) {
        await bot.sendPhoto(chatId, screenshotPath, { caption: "📸 Screenshot of the submitted form" });
      }
    }

    // --- Clean up ---
    try {
      fs.rmSync(userFolder, { recursive: true, force: true });
      console.log(`🗑️ Cleaned up temp data for user ${chatId}`);
    } catch (err) {
      console.error(`❌ Failed to clean temp data for user ${chatId}:`, err);
    }

    delete userStates[chatId];
  });
}
