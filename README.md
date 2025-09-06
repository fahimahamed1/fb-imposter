# fb-imposter

A Telegram bot for reporting Facebook impersonation. Users interactively submit their details and ID files via Telegram, and the bot automatically fills and submits the Facebook impersonation report form using Playwright.

---

## Features

- **Telegram Bot**: Collects user data and ID files interactively.
- **Automated Browser**: Uses Playwright to fill and submit the Facebook impersonation report form.
- **File Upload**: Supports multiple ID file uploads.
- **Headless/Non-headless**: Toggle browser visibility with the `HEADLESS` environment variable.
- **Automatic Cleanup**: Temporary user data is deleted after processing.

---

## Project Structure

```
agent.js
bot.js
data.js
imposter.js
package.json
temp/
```

- **bot.js**: Main Telegram bot logic. Handles user interaction, collects data, saves files, and triggers the impersonation script.
- **imposter.js**: Automates the Facebook impersonation report form using Playwright.
- **agent.js**: Provides random user-agent strings for browser automation.
- **data.js**: Example data file structure (used for testing or as a template).
- **temp/**: Temporary folder for user uploads and data during processing.
- **.env**: Environment variables (Telegram bot token, headless mode).
- **package.json**: Project dependencies.

---

## Setup

1. **Clone the repository**

   ```sh
   git clone <your-repo-url>
   cd fb-imposter
   ```

2. **Install dependencies**

   ```sh
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file with:

   ```
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token
   HEADLESS=true
   ```

   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from [BotFather](https://core.telegram.org/bots#botfather).
   - `HEADLESS`: Set to `false` to see the browser UI, or `true` to run headless.

4. **Run the bot**

   ```sh
   node bot.js
   ```

---

## Usage

1. **Start the bot**: Open Telegram, find your bot, and send `/start`.
2. **Begin a report**: Send `/takedata` and follow the prompts to enter your details and upload ID files.
3. **Submit**: After uploading at least one ID file, send `/done`.
4. **Result**: The bot will process your report, submit the form, and send you a screenshot of the submission.

---

## Customization

- **User-Agent Pool**: Edit the `agents` array in `agent.js` to add/remove user-agent strings.
- **Form Data Structure**: See `data.js` for the expected data fields.
- **Facebook Form URL**: The URL is hardcoded in `imposter.js` and can be changed if Facebook updates the form.

---

## Dependencies

See `package.json`:

- `node-telegram-bot-api`
- `playwright`
- `dotenv`
- `node-fetch`
- `child_process`

---

## Security & Privacy

- Uploaded files and user data are stored temporarily in the `temp` directory and deleted after processing.
- Do **not** share your Telegram bot token or sensitive data.

---

## License

MIT License (add your own license if needed).

---

## Authors

- Fahim Ahamed

---

## Notes

- This project is for educational purposes. Use responsibly and comply with Facebook's terms of service.
- If you encounter issues with Playwright or browser automation, ensure all dependencies are installed and up to date.

---

## File Reference

- `bot.js`: Main bot logic.
- `imposter.js`: Browser automation for Facebook form.
- `agent.js`: User-agent randomizer.
- `data.js`: Example data structure.
- `package.json`: Dependencies.
- `.env`: Environment variables.
- `temp`: Temporary user data (auto-cleaned).

---

For questions or support, open an issue or contact the author.

