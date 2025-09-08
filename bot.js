require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// --- Config ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("❌ Missing TELEGRAM_BOT_TOKEN in .env");

const bot = new TelegramBot(TOKEN, { polling: true });
const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// --- Fields to Collect ---
const fields = [
  { key: "victimName", question: "👤 Enter the victim's full name:" },
  { key: "victimEmail", question: "📧 Enter the victim's contact email:", validate: validateEmail },
  { key: "impostorName", question: "🕵️ Enter the impostor's full name:" },
  { key: "impostorEmail", question: "📧 Enter the impostor's email:", validate: validateEmail },
  { key: "impostorProfileUrl", question: "🔗 Enter the impostor's profile URL:", validate: validateUrl },
  { key: "message", question: "📝 Enter the message for Facebook (max 500 chars):", validate: validateMessage },
  { key: "idFiles", question: "📂 Upload your ID file(s). Send /done when finished." }
];

// --- In-Memory State ---
const userStates = {};

// --- /start ---
bot.onText(/\/start/, msg => {
  const text = `
👋 *Welcome to the Facebook Impersonation Reporter Bot!*

This bot helps you prepare and submit impersonation reports in a guided step-by-step process.

⚙️ *Available Commands:*
- /takedata → Start a new impersonation report
- /cancel → Cancel the current report
- /start → Show this help menu

📝 *How it works:*
1. Start with /takedata
2. Answer each question (victim, impostor, etc.)
3. Upload ID documents (at least one required)
4. Type /done after uploading files
5. The bot will run the report script and show you results with a screenshot.

⏳ *Notes:*
- You have *10 minutes per step*. If you wait too long, the session will expire.
- At any time, type /cancel to abort the process.
- Your data is stored *temporarily* and automatically removed after the process.

🚀 When ready, type */takedata* to begin.
  `;
  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

// --- /takedata ---
bot.onText(/\/takedata/, msg => {
  const chatId = msg.chat.id;
  if (userStates[chatId]) return bot.sendMessage(chatId, "⚠️ You already have a report in progress.");

  userStates[chatId] = { step: 0, responses: {}, idFiles: [], timeout: null };
  bot.sendMessage(chatId, "🤖 Starting interactive impersonation report...");
  askField(chatId);
});

// --- /cancel ---
bot.onText(/\/cancel/, msg => cancelSession(msg.chat.id, "❌ Report cancelled."));

// --- Handle user input ---
bot.on("message", async msg => {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  if (!state) return;

  const field = fields[state.step];
  if (!field) return;
  if (msg.text && ["/start", "/takedata", "/cancel"].includes(msg.text)) return;

  resetIdleTimeout(chatId);

  // --- File uploads (ID files) ---
  if (field.key === "idFiles") {
    if (msg.document) {
      try {
        const fileId = msg.document.file_id;
        const ext = path.extname(msg.document.file_name || ".dat");
        const saveDir = path.join(__dirname, "temp", String(chatId), "uploads");
        fs.mkdirSync(saveDir, { recursive: true });

        const downloadedPath = await bot.downloadFile(fileId, saveDir);
        const savePath = path.join(saveDir, `${Date.now()}_${randomString(6)}${ext}`);
        fs.renameSync(downloadedPath, savePath);

        state.idFiles.push(savePath);
        state.responses.idFiles = state.idFiles;

        bot.sendMessage(chatId, `✅ File saved: ${path.basename(savePath)}\nUpload more or type /done`);
      } catch (err) {
        bot.sendMessage(chatId, `❌ File upload failed: ${err.message}`);
      }
      return;
    }

    if (msg.text === "/done") {
      if (!state.idFiles.length) return bot.sendMessage(chatId, "⚠️ Upload at least one ID file.");
      return saveDataAndRun(chatId);
    }

    return bot.sendMessage(chatId, "⚠️ Please upload a valid file or type /done.");
  }

  // --- Text responses ---
  if (msg.text) {
    if (field.validate && !field.validate(msg.text)) {
      return bot.sendMessage(chatId, `❌ Invalid input. Try again:\n${field.question}`);
    }
    state.responses[field.key] = msg.text.trim();
    state.step++;
    askField(chatId);
  }
});

// --- Ask the next question ---
function askField(chatId) {
  const state = userStates[chatId];
  if (!state) return;

  if (state.step >= fields.length) return;
  bot.sendMessage(chatId, fields[state.step].question);
  resetIdleTimeout(chatId);
}

// --- Reset timeout ---
function resetIdleTimeout(chatId) {
  const state = userStates[chatId];
  if (!state) return;
  if (state.timeout) clearTimeout(state.timeout);

  state.timeout = setTimeout(() => {
    cancelSession(chatId, "⏰ Session timed out. Start again with /takedata.");
  }, IDLE_TIMEOUT);
}

// --- Cancel session ---
function cancelSession(chatId, message) {
  const state = userStates[chatId];
  if (state?.timeout) clearTimeout(state.timeout);
  delete userStates[chatId];
  bot.sendMessage(chatId, message);
}

// --- Save data & run imposter.js ---
function saveDataAndRun(chatId) {
  const state = userStates[chatId];
  if (!state) return;

  const userFolder = path.join(__dirname, "temp", String(chatId));
  fs.mkdirSync(userFolder, { recursive: true });

  const dataPath = path.join(userFolder, "data.js");
  fs.writeFileSync(dataPath, `module.exports = ${JSON.stringify(state.responses, null, 2)};\n`);

  bot.sendMessage(chatId, "🚀 Running script...").then(sentMsg => {
    const progressMsgId = sentMsg.message_id;
    let percent = 0;

    // Progress bar
    const interval = setInterval(async () => {
      percent = Math.min(percent + 4, 100);
      try {
        await bot.editMessageText(
          `⏳ Processing...\n${generateBar(percent)} ${percent}%`,
          { chat_id: chatId, message_id: progressMsgId }
        );
      } catch {}
      if (percent === 100) clearInterval(interval);
    }, 1000);

    // Run imposter.js
    const scriptPath = path.join(__dirname, "imposter.js");
    const child = spawn("node", [scriptPath], { cwd: userFolder, env: process.env });

    let output = "";
    child.stdout.on("data", d => (output += d.toString()));
    child.stderr.on("data", d => console.error("stderr:", d.toString()));

    child.on("close", async code => {
      clearInterval(interval);

      if (code !== 0) {
        return bot.editMessageText("❌ Script failed.", { chat_id: chatId, message_id: progressMsgId });
      }

      const successMatch = output.match(/🎉 SUCCESS: (.+)/);
      const successMsg = successMatch ? successMatch[1].trim() : "Unknown";

      const summary = [
        `👤 Victim: ${state.responses.victimName}`,
        `📧 Victim Email: ${state.responses.victimEmail}`,
        `🕵️ Impostor: ${state.responses.impostorName}`,
        `📧 Impostor Email: ${state.responses.impostorEmail}`,
        `🔗 Profile: ${state.responses.impostorProfileUrl}`,
        `📝 Message: ${state.responses.message}`,
        state.idFiles.length ? `📂 Files:\n- ${state.idFiles.map(f => path.basename(f)).join("\n- ")}` : null,
        `🎉 SUCCESS: ${successMsg}`
      ].filter(Boolean).join("\n");

      await bot.editMessageText(`✅ Finished!\n\n${summary}`, { chat_id: chatId, message_id: progressMsgId });

      // Screenshot if exists
      const screenshotMatch = output.match(/📸 SCREENSHOT_PATH: (.+)/);
      if (screenshotMatch && fs.existsSync(screenshotMatch[1].trim())) {
        await bot.sendPhoto(chatId, screenshotMatch[1].trim(), { caption: "📸 Screenshot" });
      }

      // Cleanup
      try { fs.rmSync(userFolder, { recursive: true, force: true }); } catch {}
      delete userStates[chatId];
    });
  });
}

// --- Helpers ---
function generateBar(percent) {
  const total = 20;
  const filled = Math.floor((percent / 100) * total);
  return "█".repeat(filled) + "░".repeat(total - filled);
}
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
function validateUrl(url) {
  return /^https?:\/\/[^\s]+$/.test(url.trim());
}
function validateMessage(msg) {
  return msg.trim().length > 0 && msg.trim().length <= 500;
}
function randomString(len) {
  return Math.random().toString(36).substring(2, 2 + len);
}