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
  { key: "impostorEmail", question: "📧 Enter the impostor's email or /empty (leave blank):", validate: validateEmailOrEmpty },
  { key: "impostorProfileUrl", question: "🔗 Enter the impostor's profile URL:", validate: validateUrl },
  { key: "message", question: "📝 Enter the message for Facebook (no limit):" },
  { key: "idFiles", question: "📂 Upload your ID image file(s). Send /done when finished." }
];

// --- In-Memory State ---
const userStates = {};

// --- /start ---
bot.onText(/\/start/, msg => {
  const firstName = msg.from.first_name || "User";
  const text = `
👋 *Welcome, ${firstName}!*

This bot helps you prepare and submit impersonation reports to Facebook in a guided step-by-step process, type /takedata.

For detailed instructions, type /help.
  `;
  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

// --- /help ---
bot.onText(/\/help/, msg => {
  const helpText = `
📚 *Help Information:*

This bot helps you report impersonation cases on Facebook.

🔹 *How to Use:*
1. Type /takedata to begin a new impersonation report.
2. You will be asked to provide information such as:
   - Victim's name
   - Victim's email
   - Impostor's name
   - Impostor's email
   - Impostor's profile URL
   - A custom message to submit on Facebook
3. Upload your ID image(s) when prompted (at least one required).
4. Type /done after you finish uploading.
5. The bot will process the information and show the results with screenshots.

❌ If you decide to cancel at any time, type /cancel.

⏳ You have *10 minutes per step*; if you stay inactive too long, the session will expire.

For more information, type /start.
  `;
  bot.sendMessage(msg.chat.id, helpText, { parse_mode: "Markdown" });
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
  if (msg.text && ["/start", "/takedata", "/cancel", "/help"].includes(msg.text)) return;

  resetIdleTimeout(chatId);

  // --- File uploads (ID images) ---
  if (field.key === "idFiles") {
    if (msg.document) {
      const ext = path.extname(msg.document.file_name || "").toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
        return bot.sendMessage(chatId, "❌ Only image files are allowed. Upload a valid image.");
      }

      try {
        const fileId = msg.document.file_id;
        const saveDir = path.join(__dirname, "temp", String(chatId), "uploads");
        fs.mkdirSync(saveDir, { recursive: true });

        const downloadedPath = await bot.downloadFile(fileId, saveDir);
        const savePath = path.join(saveDir, `${Date.now()}_${randomString(6)}${ext}`);
        fs.renameSync(downloadedPath, savePath);

        state.idFiles.push(savePath);
        state.responses.idFiles = state.idFiles;

        bot.sendMessage(chatId, `✅ Image saved: ${path.basename(savePath)}\nUpload more or type /done`);
      } catch (err) {
        bot.sendMessage(chatId, `❌ File upload failed: ${err.message}`);
      }
      return;
    }

    if (msg.text === "/done") {
      if (!state.idFiles.length) return bot.sendMessage(chatId, "⚠️ Upload at least one ID image.");
      return saveDataAndRun(chatId);
    }

    return bot.sendMessage(chatId, "⚠️ Please upload a valid image or type /done.");
  }

  // --- Text responses ---
  if (msg.text) {
    if (field.validate && !field.validate(msg.text)) {
      return bot.sendMessage(chatId, `❌ Invalid input. Try again:\n${field.question}`);
    }
    state.responses[field.key] = msg.text.trim() === "/empty" ? "" : msg.text.trim();
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
        `📧 Impostor Email: ${state.responses.impostorEmail || "(empty)"}`,
        `🔗 Profile: ${state.responses.impostorProfileUrl}`,
        `📝 Message: ${state.responses.message}`,
        state.idFiles.length ? `📂 Files:\n- ${state.idFiles.map(f => path.basename(f)).join("\n- ")}` : null,
        `🎉 SUCCESS: ${successMsg}`
      ].filter(Boolean).join("\n");

      await bot.editMessageText(`✅ Finished!\n\n${summary}`, { chat_id: chatId, message_id: progressMsgId });

      // Send BEFORE_SUBMIT screenshot
      const beforeMatch = output.match(/📸 BEFORE_SUBMIT_SCREENSHOT: (.+)/);
      if (beforeMatch && fs.existsSync(beforeMatch[1].trim())) {
        await bot.sendPhoto(chatId, beforeMatch[1].trim(), { caption: "📸 Screenshot BEFORE submission" });
      }

      // Send AFTER_SUBMIT screenshot
      const afterMatch = output.match(/📸 AFTER_SUBMIT_SCREENSHOT: (.+)/);
      if (afterMatch && fs.existsSync(afterMatch[1].trim())) {
        await bot.sendPhoto(chatId, afterMatch[1].trim(), { caption: "📸 Screenshot AFTER submission" });
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
function validateEmailOrEmpty(email) {
  return email.trim() === "/empty" || validateEmail(email);
}
function validateUrl(url) {
  return /^https?:\/\/[^\s]+$/.test(url.trim());
}
function randomString(len) {
  return Math.random().toString(36).substring(2, 2 + len);
}
