const puppeteer = require('puppeteer');
const { setTimeout } = require('timers/promises');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  const page = await browser.newPage();
  await page.setDefaultTimeout(60000);
  
  const targetURL = 'https://www.facebook.com/help/contact/295309487309948?locale=en_US';
  console.log(`Navigating to: ${targetURL}`);
  
  // Enable request interception to handle cookies properly
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    req.continue();
  });

  await page.goto(targetURL, { 
    waitUntil: 'networkidle2',
    timeout: 60000 
  });

  // Extended wait for Facebook's delayed cookie banner
  await setTimeout(3000);

  // Facebook-specific cookie banner selectors
  const facebookBannerSelectors = [
    '[data-testid="cookie-policy-manage-dialog"]',
    '[data-testid="cookie-policy-banner"]',
    '[role="dialog"][aria-label*="cookie"]',
    'div[data-visualcompletion="ignore-dynamic"]',
    'div[aria-modal="true"]',
    'div[data-testid="cookie-policy-manage-dialog"]'
  ];

  // Extended button texts including Facebook-specific terms
  const acceptButtonTexts = [
    'allow all cookies',
    'accept cookies',
    'accept all',
    'agree',
    'accept',
    'i agree',
    'allow cookies',
    'yes, i agree',
    'confirm',
    'continue',
    'okay',
    'got it',
    'allow essential and optional cookies',
    'allow all'
  ];

  // Enhanced frame handling with recursive iframe checking
  async function processFrame(frame) {
    // Check main frame first
    if (await handleCookieBanner(frame)) return true;
    
    // Recursively check all nested frames
    for (const childFrame of frame.childFrames()) {
      if (await processFrame(childFrame)) return true;
    }
    return false;
  }

  async function handleCookieBanner(frame) {
    // Try Facebook-specific selectors first
    for (const selector of facebookBannerSelectors) {
      try {
        const banner = await frame.waitForSelector(selector, { 
          timeout: 2000,
          visible: true 
        });
        
        if (banner) {
          console.log(`Found Facebook-style banner in frame: ${frame.url()}`);
          return await findAndClickButton(frame, banner);
        }
      } catch (e) {
        // Selector not found, continue to next
      }
    }

    // Fallback to generic selectors
    const genericSelectors = [
      'div[role="dialog"]',
      'div[class*="cookie"]',
      'div[class*="consent"]',
      'div[id*="cookie"]',
      'div[class*="banner"]',
      'div[aria-modal="true"]'
    ];

    for (const selector of genericSelectors) {
      try {
        const banner = await frame.$(selector);
        if (banner) {
          console.log(`Found generic banner in frame: ${frame.url()}`);
          return await findAndClickButton(frame, banner);
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    return false;
  }

  async function findAndClickButton(frame, banner) {
    // Take screenshot before interaction
    await page.screenshot({ path: 'screenshot_before_accept.png' });
    console.log('Screenshot saved as screenshot_before_accept.png');

    // Look for buttons using multiple strategies
    const strategies = [
      // Text-based search
      async () => {
        const buttons = await banner.$$('button, [role="button"]');
        for (const button of buttons) {
          const text = await frame.evaluate(el => 
            (el.textContent || el.getAttribute('aria-label') || '').trim().toLowerCase(), 
            button
          );
          
          if (acceptButtonTexts.some(acceptText => text.includes(acceptText))) {
            console.log(`Clicking button with text: "${text}"`);
            await safeClick(frame, button);
            return true;
          }
        }
        return false;
      },
      // Facebook-specific data-testid search
      async () => {
        const acceptButton = await banner.$('button[data-testid="cookie-policy-manage-accept-button"]');
        if (acceptButton) {
          console.log('Clicking Facebook accept button');
          await safeClick(frame, acceptButton);
          return true;
        }
        return false;
      }
    ];

    // Try each strategy in order
    for (const strategy of strategies) {
      if (await strategy()) {
        // Wait for banner to disappear
        try {
          await frame.waitForFunction(
            el => !document.body.contains(el),
            { timeout: 10000 },
            banner
          );
          console.log('✅ Cookie banner disappeared after click');
        } catch (e) {
          console.warn('⚠️ Banner did not disappear after click');
        }
        
        await page.screenshot({ path: 'screenshot_after_accept.png' });
        console.log('Screenshot saved as screenshot_after_accept.png');
        return true;
      }
    }
    
    console.warn('No accept button found in banner');
    return false;
  }

  async function safeClick(frame, element) {
    try {
      await element.click({ delay: 200 });
    } catch (err) {
      console.warn('Standard click failed, trying alternatives');
      try {
        await frame.evaluate(el => {
          el.click();
          el.dispatchEvent(new Event('mousedown', { bubbles: true }));
          el.dispatchEvent(new Event('mouseup', { bubbles: true }));
          el.dispatchEvent(new Event('click', { bubbles: true }));
        }, element);
      } catch (e) {
        console.error('All click methods failed');
      }
    }
  }

  // Process all frames recursively
  const accepted = await processFrame(page.mainFrame());

  if (!accepted) {
    console.log('No cookie consent banner detected or no accept button clicked');
    await page.screenshot({ path: 'screenshot_no_banner.png' });
    console.log('Screenshot saved as screenshot_no_banner.png');
  }

  console.log('Closing browser...');
  await browser.close();
})();