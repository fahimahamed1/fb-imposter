require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// config
const URL = 'https://www.facebook.com/help/contact/295309487309948?locale=en_US';
const DATA_PATH = path.join(process.cwd(), 'data.js');
const HEADLESS = process.env.HEADLESS?.toLowerCase() !== 'false';
const COOKIES_PATH = path.join(process.cwd(), 'cookies.json');

// utility functions
const clickRadioByLabel = async (page, text) => {
  const label = await page.$(`label:has-text("${text}")`);
  if (label) {
    await label.click({ force: true });
    console.log(`✅ Selected option: ${text}`);
    await page.waitForTimeout(500); // small wait
  }
};

const fillInput = async (page, name, value, desc) => {
  const input = await page.$(`input[name="${name}"]`);
  if (input) {
    await input.fill(value);
    console.log(`✍️ Filled ${desc}: ${value}`);
    await page.waitForTimeout(300); // small wait
  }
};

const fillTextarea = async (page, name, value) => {
  const textarea = await page.$(`textarea[name="${name}"]`);
  if (textarea) {
    await textarea.fill(value);
    console.log(`✍️ Filled textarea: ${name}`);
  }
};

const uploadFiles = async (page, selector, files) => {
  if (!Array.isArray(files)) files = [files];
  const input = await page.$(selector);
  if (input) {
    const fullPaths = files.map(f => path.resolve(f));
    await input.setInputFiles(fullPaths);
    console.log(`📁 Uploaded file(s): ${fullPaths.join(', ')}`);
    await page.waitForTimeout(5000); // wait for upload
  } else {
    console.warn(`❌ File input not found: ${selector}`);
  }
};

// cookie management
const loadCookies = async (context) => {
  if (fs.existsSync(COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await context.addCookies(cookies);
      console.log('🌐 Loaded cookies');
    } catch (e) {
      console.warn('⚠️ Failed to load cookies:', e.message);
    }
  }
};

const saveCookies = async (context) => {
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  console.log('🌐 Cookies saved');
};

// main automation
(async () => {
  try {
    delete require.cache[require.resolve(DATA_PATH)];
    const data = require(DATA_PATH);

    console.log("🌐 Headless mode:", HEADLESS);

    const browser = await chromium.launch({ headless: HEADLESS });
    const context = await browser.newContext();
    
    // load previous cookies
    await loadCookies(context);

    const page = await context.newPage();
    console.log("🌐 Opening FB impersonation form...");
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState("networkidle");

    // accept cookies if needed
    let cookieAccepted = false;
    const button1 = page.locator('button[data-testid="cookie-policy-manage-accept-button"]');
    if (await button1.count() > 0) {
      await button1.first().click({ force: true, timeout: 5000 });
      cookieAccepted = true;
    }
    if (!cookieAccepted) {
      const button2 = page.locator('text=Allow all cookies');
      if (await button2.count() > 0) {
        await button2.first().click({ force: true, timeout: 5000 });
        cookieAccepted = true;
      }
    }
    if (cookieAccepted) {
      console.log('✅ Cookies accepted');
      await saveCookies(context);
    } else {
      console.log('🌐 Cookies skipped');
    }
    await page.waitForTimeout(1000);

    // fill the form
    await clickRadioByLabel(page, "Someone created an account pretending to be me or a friend");
    await clickRadioByLabel(page, "No");
    await clickRadioByLabel(page, "Yes, I am the person being impersonated");

    await fillInput(page, "victims_name", data.victimName, "victim name");
    await fillInput(page, "your_email", data.victimEmail, "contact email");
    await fillInput(page, "fullname", data.impostorName, "impostor name");
    await fillInput(page, "impostor_email", data.impostorEmail, "impostor email");

    if (data.idFiles?.length) {
      await uploadFiles(page, 'input[type="file"]', data.idFiles);
    }

    await fillInput(page, "profileurl", data.impostorProfileUrl, "impostor link");
    await fillTextarea(page, "Field219635071504253", data.message);

    // Screenshots + submission
    console.log("📤 Preparing to submit form...");

    const beforeSubmitPath = path.join(process.cwd(), `fb-report-before-${Date.now()}.png`);
    await page.screenshot({ path: beforeSubmitPath, fullPage: true });
    console.log(`📸 BEFORE_SUBMIT_SCREENSHOT: ${beforeSubmitPath}`);

    const submitButton = await page.$('button:has-text("Send"), button[type="submit"], input[type="submit"]');
    if (!submitButton) throw new Error("❌ Submit button not found");

    console.log("📤 Submitting form...");
    await submitButton.click({ force: true });

    let resultMessage = '';
    try {
      const start = Date.now();
      while (Date.now() - start < 15000) {
        await page.waitForTimeout(500);

        const successMsg = await page.$('text=Form submitted successfully');
        const errorMsg = await page.$('text=error, text=try again, text=unable');
        const currentURL = page.url();

        if (currentURL.startsWith('https://m.facebook.com/help/?submitted') && currentURL.includes('confirmation_id')) {
          resultMessage = "🎉 SUCCESS: Form submitted successfully (URL detected).";
          break;
        } else if (successMsg) {
          resultMessage = "🎉 SUCCESS: Form submitted successfully (message detected).";
          break;
        } else if (errorMsg) {
          resultMessage = "❌ FAILURE: Error submitting the form.";
          break;
        }
      }
      if (!resultMessage) resultMessage = "⚠️ UNKNOWN: Could not confirm success or failure.";
    } catch {
      resultMessage = "❌ FAILURE: Exception during submission detection.";
    }

    console.log(resultMessage);

    const afterSubmitPath = path.join(process.cwd(), `fb-report-after-${Date.now()}.png`);
    await page.screenshot({ path: afterSubmitPath, fullPage: true });
    console.log(`📸 AFTER_SUBMIT_SCREENSHOT: ${afterSubmitPath}`);

    console.log("👋 Closing browser...");
    await browser.close();

  } catch (err) {
    console.error("❌ Script failed", err);
    process.exit(1);
  }
})();
