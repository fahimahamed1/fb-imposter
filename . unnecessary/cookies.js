const { chromium } = require('playwright');

(async () => {
    // Launch browser with minimal args
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Create context and page
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);  // Reduced timeout

    const targetUrl = 'https://www.facebook.com/help/contact/295309487309948?locale=en_US';
    console.log(`Navigating to: ${targetUrl}`);

    // Navigate to URL
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // Take screenshot before interaction
    await page.screenshot({ path: 'screenshot_before_accept.png' });
    console.log('Screenshot saved as screenshot_before_accept.png');

    // Try to find and click the accept button
    try {
        // Facebook-specific selector with force click
        const acceptButton = await page.locator('button[data-testid="cookie-policy-manage-accept-button"]');
        await acceptButton.click({ force: true, timeout: 5000 });
        console.log('✅ Successfully clicked "Allow All" button');
    } catch (error) {
        // Fallback to text-based search
        try {
            const acceptButton = await page.locator('text="Allow all cookies"').first();
            await acceptButton.click({ force: true, timeout: 5000 });
            console.log('✅ Successfully clicked text-based button');
        } catch (e) {
            console.log(`⚠️ Could not click button: ${e.message}`);
        }
    }

    // Wait briefly for banner to disappear
    await page.waitForTimeout(1000);

    // Take screenshot after interaction
    await page.screenshot({ path: 'screenshot_after_accept.png' });
    console.log('Screenshot saved as screenshot_after_accept.png');

    // Close browser
    console.log('Closing browser...');
    await browser.close();
})();
