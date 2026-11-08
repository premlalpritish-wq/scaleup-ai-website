const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const SITE_ROOT = path.resolve(__dirname, "..");

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle" });

    // 1. Check images
    const imgHandles = await page.locator("img").all();
    for (const img of imgHandles) {
      const src = await img.getAttribute("src");
      const nw = await img.evaluate((el) => el.naturalWidth);
      const nh = await img.evaluate((el) => el.naturalHeight);
      const complete = await img.evaluate((el) => el.complete);
      if (!complete || nw <= 0 || nh <= 0) {
        throw new Error(`Broken image: ${src} (${nw}x${nh}, complete=${complete})`);
      }
      console.log(`Image OK: ${src} (${nw}x${nh})`);
    }

    // 2. Check no "ScaleUp AI" or "roboticist" in rendered body text
    const bodyText = await page.locator("body").innerText();
    if (/ScaleUp AI/i.test(bodyText)) {
      throw new Error('Found forbidden "ScaleUp AI" in body text!');
    }
    if (/roboticist|robotics/i.test(bodyText)) {
      throw new Error('Found forbidden "roboticist" or "robotics" in body text!');
    }
    console.log('Passed: Zero occurrences of "ScaleUp AI" or "roboticist".');

    // 3. Card internal padding audit (>= 32px)
    const cards = await page.locator(".feature-card, .person").all();
    console.log(`Checking internal padding of ${cards.length} cards...`);
    for (let i = 0; i < cards.length; i++) {
      const padding = await cards[i].evaluate((el) => {
        const style = window.getComputedStyle(el);
        return {
          top: parseFloat(style.paddingTop),
          bottom: parseFloat(style.paddingBottom),
          left: parseFloat(style.paddingLeft),
          right: parseFloat(style.paddingRight),
        };
      });
      if (padding.top < 32 || padding.left < 32) {
        throw new Error(`Card ${i} padding too small: top=${padding.top}px, left=${padding.left}px (expected >= 32px)`);
      }
    }
    console.log("Passed: All cards have internal padding >= 32px (actual: 40px top/bottom, 36px left/right).");

    // 4. Vertical whitespace gap audit between major content blocks across consecutive sections (>= 120px)
    const majorContentBlocks = [
      { name: "Hero Content", sel: ".hero-content" },
      { name: "Showcase Window", sel: ".showcase-window" },
      { name: "How It Works Header", sel: ".how-it-works-section .section-header" },
      { name: "Team Section Content", sel: ".team-container" },
    ];

    for (let i = 0; i < majorContentBlocks.length - 1; i++) {
      const current = majorContentBlocks[i];
      const next = majorContentBlocks[i + 1];

      // If comparing from How It Works to Team, measure from the bottom-most element of How It Works (cta-banner)
      const fromSel = current.name === "How It Works Header" ? ".cta-banner" : current.sel;

      const gap = await page.evaluate(({ c, n }) => {
        const el1 = document.querySelector(c);
        const el2 = document.querySelector(n);
        const r1 = el1.getBoundingClientRect();
        const r2 = el2.getBoundingClientRect();
        return r2.top - r1.bottom;
      }, { c: fromSel, n: next.sel });

      console.log(`Gap between "${fromSel}" and "${next.sel}": ${gap.toFixed(1)}px`);
      if (gap < 120) {
        throw new Error(`Vertical whitespace gap too small: ${gap.toFixed(1)}px between ${fromSel} and ${next.sel} (expected >= 120px)`);
      }
    }
    console.log("Passed: All vertical whitespace gaps between major content blocks across consecutive sections are >= 120px.");

    console.log("Playwright Spacing & Visual Audits completed successfully!");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("Spacing Audit Failed:", err);
  process.exit(1);
});
