// imposter.js
require('dotenv').config(); // load .env
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { getRandomAgent } = require('./agent');

(async () => {
  try {
    // --- Load user-specific data ---
    const dataPath = path.join(process.cwd(), 'data.js');
    delete require.cache[require.resolve(dataPath)];
    const data = require(dataPath);

    // --- Headless mode toggle ---
    const HEADLESS = process.env.HEADLESS?.toLowerCase() !== 'false';
    console.log("🌐 Playwright headless mode:", HEADLESS);

    // --- Launch browser ---
    const browser = await chromium.launch({
      headless: HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized'
      ],
      slowMo: HEADLESS ? 0 : 50
    });

    const page = await browser.newPage({
      userAgent: getRandomAgent(true),
      viewport: HEADLESS ? { width: 1280, height: 720 } : null
    });

    console.log("🌐 Opening Facebook impersonation report form...");
    await page.goto(
      'https://www.facebook.com/help/contact/295309487309948?locale=en_US',
      { waitUntil: 'domcontentloaded' }
    );
    await page.waitForLoadState("networkidle");

    // --- Utility functions ---
    const clickRadioByLabel = async (text) => {
      const label = await page.$(`label:has-text("${text}")`);
      if (label) {
        await label.click({ force: true });
        console.log(`✅ Selected option: ${text}`);
        await page.waitForTimeout(500);
      }
    };

    const fillInput = async (name, value, desc) => {
      const input = await page.$(`input[name="${name}"]`);
      if (input) {
        await input.fill(value);
        console.log(`✍️ Filled ${desc}: ${value}`);
        await page.waitForTimeout(300);
      }
    };

    const fillTextarea = async (name, value) => {
      const textarea = await page.$(`textarea[name="${name}"]`);
      if (textarea) {
        await textarea.fill(value);
        console.log(`✍️ Filled textarea: ${name}`);
      }
    };

    const uploadFiles = async (selector, files) => {
      if (!Array.isArray(files)) files = [files];
      const input = await page.$(selector);
      if (input) {
        const fullPaths = files.map(f => path.resolve(f));
        await input.setInputFiles(fullPaths);
        console.log(`📁 Uploaded file(s): ${fullPaths.join(', ')}`);
        await page.waitForTimeout(5000);
      } else {
        console.warn(`❌ File input selector not found: ${selector}`);
      }
    };

    // --- Fill the form ---
    await clickRadioByLabel("Someone created an account pretending to be me or a friend");
    await clickRadioByLabel("No");
    await clickRadioByLabel("Yes, I am the person being impersonated");

    await fillInput("victims_name", data.victimName, "victim full name");
    await fillInput("your_email", data.victimEmail, "contact email");
    await fillInput("fullname", data.impostorName, "impostor full name");
    await fillInput("impostor_email", data.impostorEmail, "impostor email");

    if (data.idFiles && data.idFiles.length) {
      await uploadFiles('input[type="file"]', data.idFiles);
    }

    await fillInput("profileurl", data.impostorProfileUrl, "impostor profile link");
    await fillTextarea("Field219635071504253", data.message);

    // --- Submit form ---
    console.log("📤 Submitting form...");
    const submitButton = await page.$('button:has-text("Send"), button[type="submit"], input[type="submit"]');
    if (!submitButton) throw new Error("❌ Submit button not found");

    await submitButton.click({ force: true });
    await page.waitForTimeout(5000);

    const successMsg = await page.$('text=Form submitted successfully');
    const errorMsg = await page.$('text=error') || await page.$('text=try again') || await page.$('text=unable to');

    let resultMessage = '';
    if (successMsg) resultMessage = "🎉 SUCCESS: Form submitted successfully.";
    else if (errorMsg) resultMessage = "❌ FAILURE: Error submitting the form.";
    else resultMessage = "⚠️ UNKNOWN: Could not confirm success or failure.";

    console.log(resultMessage);

    // --- Take screenshot ---
    const screenshotPath = path.join(process.cwd(), `fb-report-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 SCREENSHOT_PATH: ${screenshotPath}`);

    console.log("👋 Closing browser...");
    await browser.close();

  } catch (err) {
    console.error("❌ Script failed", err);
    process.exit(1);
  }
})();
