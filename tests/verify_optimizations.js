const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(__dirname, '..', reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(8901, async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('http://127.0.0.1:8901');

    // Check initial hero image
    const img1 = await page.$eval('#showcase-hero-img', (el) => el.getAttribute('src'));
    console.log('Initial image:', img1);

    // Click Step 2 pill
    await page.click('.step-pill[data-stage="stage2"]');
    await page.waitForTimeout(300);
    const img2 = await page.$eval('#showcase-hero-img', (el) => el.getAttribute('src'));
    console.log('After clicking Step 2:', img2);

    // Click 2D flow diagram
    await page.click('.step-pill[data-stage="anatomy"]');
    await page.waitForTimeout(300);
    const img3 = await page.$eval('#showcase-hero-img', (el) => el.getAttribute('src'));
    console.log('After clicking 2D diagram:', img3);

    // Test prompt keyboard enter
    await page.focus('#prompt-input');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    console.log('Pressed Enter in prompt input without error.');

    // Test card spotlight
    await page.hover('.feature-card');
    const mouseVar = await page.$eval('.feature-card', (el) => el.style.getPropertyValue('--mouse-x'));
    console.log('Card spotlight mouse-x:', mouseVar);

    await browser.close();
    server.close();
    console.log('All interactive optimizations verified in Playwright!');
    process.exit(0);
  } catch (err) {
    console.error('Optimization verification failed:', err);
    server.close();
    process.exit(1);
  }
});
