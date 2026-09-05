const puppeteer = require('puppeteer');

(async () => {
    // 1. Launch browser
    const browser = await puppeteer.launch({ headless: false });
    console.log("Browser launched.");

    try {
        const timestamp = Math.floor(Date.now() / 1000);
        // The exact URL structure the Admin panel generates for "Giriş Yap" in full screen!
        const liveUrl1 = `https://ial-mobil.web.app/qr?type=institution_gate&action=entry&sessionId=test_session_${Math.random().toString(36).substring(7)}&timestamp=${timestamp}`;
        const liveUrl2 = `https://ial-mobil.web.app/qr?type=institution_gate&action=entry&sessionId=test_session_${Math.random().toString(36).substring(7)}&timestamp=${timestamp}`;

        // We use an Incognito context so we start fresh!
        const context = await browser.createBrowserContext();

        // SCENARIO: FIRST SCAN
        console.log("--- FIRST SCAN (TC 7170) ---");
        const page1 = await context.newPage();
        await page1.goto(liveUrl1, { waitUntil: 'networkidle2' });
        
        // Wait for input field
        await page1.waitForSelector('input[type="tel"]');
        
        // Type 7170 VERY FAST!
        await page1.type('input[type="tel"]', '7170', {delay: 10});
        
        // Wait for result message
        await new Promise(r => setTimeout(r, 2000));
        
        const result1 = await page1.evaluate(() => document.body.innerText);
        if (result1.includes("Güvenlik İhlali")) {
            console.log("FAILED First Scan (Should be allowed):", result1);
        } else if (result1.includes("Yoklamanız başarıyla alındı") || result1.includes("Kurum girişi yapıldı") || result1.includes("Hoş geldiniz")) {
            console.log("SUCCESS First Scan!");
        } else {
            console.log("Result First Scan:", result1);
        }

        // SCENARIO: SECOND SCAN (SAME PHONE/CONTEXT, NEW URL)
        console.log("--- SECOND SCAN (TC 9532) ---");
        const page2 = await context.newPage(); // New tab in the SAME context (same browser/device)
        await page2.goto(liveUrl2, { waitUntil: 'networkidle2' });
        
        // Wait for input field
        await page2.waitForSelector('input[type="tel"]');
        
        // Type 9532 VERY FAST!
        await page2.type('input[type="tel"]', '9532', {delay: 10});
        
        // Wait for result message
        await new Promise(r => setTimeout(r, 2000));
        
        const result2 = await page2.evaluate(() => document.body.innerText);
        if (result2.includes("Güvenlik İhlali")) {
            console.log("SUCCESS Second Scan (Blocked correctly!):", result2.substring(0, 200));
        } else if (result2.includes("Yoklamanız başarıyla alındı") || result2.includes("Kurum girişi yapıldı") || result2.includes("Hoş geldiniz")) {
            console.log("FAILED Second Scan (BYPASSED TRAP ENGINE!)");
        } else {
            console.log("Result Second Scan:", result2);
        }
        
    } catch (e) {
        console.error("Error:", e);
    }
    
    await browser.close();
})();
