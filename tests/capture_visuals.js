const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const SITE_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(SITE_ROOT, "tests", "screenshots");

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function startServer(port = 8899) {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURI(req.url.split("?")[0]);
    if (reqPath === "/") reqPath = "/index.html";
    const filePath = path.join(SITE_ROOT, reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const port = 8899;
  const server = await startServer(port);
  console.log(`Server started at http://127.0.0.1:${port}`);

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];

  try {
    for (const vp of viewports) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
      });
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle" });

      // Layout and text check
      const h1Text = await page.locator("h1").innerText();
      console.log(`[${vp.name}] H1 Text: ${h1Text.replace(/\s+/g, " ")}`);

      // Verify all images loaded with naturalWidth > 0
      const imgHandles = await page.locator("img").all();
      for (const img of imgHandles) {
        await img.scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
        const src = await img.getAttribute("src");
        const alt = await img.getAttribute("alt");
        const nw = await img.evaluate((el) => el.naturalWidth);
        const nh = await img.evaluate((el) => el.naturalHeight);
        const complete = await img.evaluate((el) => el.complete);
        if (!complete || nw <= 0 || nh <= 0) {
          throw new Error(`Broken image detected: src="${src}", alt="${alt}", naturalWidth=${nw}, naturalHeight=${nh}`);
        }
        console.log(`[${vp.name}] Image OK (${nw}x${nh}): ${src}`);
      }
      await page.evaluate(() => window.scrollTo(0, 0));

      const file = path.join(OUT_DIR, `${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`Saved screenshot: ${file}`);

      // If desktop, test interactive switching in #showcase
      if (vp.name === "desktop") {
        const stages = ["stage0", "stage2", "stage4", "stage5", "anatomy", "overview"];
        for (const stage of stages) {
          const btn = page.locator(`.thumb-btn[data-stage="${stage}"]`);
          await btn.click();
          await page.waitForTimeout(100);

          const title = await page.locator("#stage-story-title").innerText();
          const img = await page.locator("#showcase-hero-img").getAttribute("src");
          console.log(`Interactive test - clicked ${stage}: Title="${title}", Image="${img}"`);

          if (stage === "stage2" || stage === "stage5") {
            const stageFile = path.join(OUT_DIR, `desktop_interaction_${stage}.png`);
            await page.screenshot({ path: stageFile, fullPage: false });
            console.log(`Saved interaction screenshot: ${stageFile}`);
          }
        }
      }

      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
    console.log("Playwright visual capture and interaction tests completed successfully.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
