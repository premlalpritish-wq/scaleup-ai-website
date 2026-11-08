/* ==========================================================================
   Playwright Test: Live WebAssembly Godot Simulation & Showcase Embedding
   ========================================================================== */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8812;

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".pck": "application/octet-stream",
  ".ico": "image/x-icon"
};

function createServer() {
  return http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

async function run() {
  const server = createServer();
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Test HTTP server listening on http://localhost:${PORT}`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"]
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const fatalErrors = [];
  page.on("pageerror", (err) => {
    fatalErrors.push(`PageError: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const txt = msg.text();
      // Ignore non-fatal favicon or optional analytics errors
      if (!txt.includes("favicon") && !txt.includes("404")) {
        console.log(`[Browser Error Console]: ${txt}`);
      }
    }
  });

  try {
    console.log("\n--- Test 1: Directly load simulator/live/index.html ---");
    await page.goto(`http://localhost:${PORT}/simulator/live/index.html?preset=saccharina`, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    const canvas = page.locator("#canvas");
    await canvas.waitFor({ state: "attached", timeout: 10000 });
    console.log("PASS: <canvas id=\"canvas\"> is attached to DOM.");

    // Wait for the Godot engine loader to proceed
    await page.waitForTimeout(4000);

    const canvasBox = await canvas.boundingBox();
    console.log(`Canvas bounding box: ${canvasBox?.width}x${canvasBox?.height}`);
    if (!canvasBox || canvasBox.width === 0 || canvasBox.height === 0) {
      throw new Error("Canvas has 0 width or height!");
    }
    console.log("PASS: Canvas initialized with active dimensions.");

    console.log("\n--- Test 2: Hero Simulate in 3D Button & Live Modal ---");
    await page.goto(`http://localhost:${PORT}/index.html`, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    const simBtn = page.locator("#btn-simulate-3d");
    await simBtn.waitFor({ state: "visible" });
    await simBtn.click();

    const modal = page.locator("#sim-modal");
    await modal.waitFor({ state: "visible", timeout: 5000 });
    console.log("PASS: Live 3D modal opened upon clicking 'Simulate in 3D'.");

    const modalIframe = page.locator("#modal-live-iframe");
    const iframeSrc = await modalIframe.getAttribute("src");
    console.log(`Modal iframe src: ${iframeSrc}`);
    if (!iframeSrc || !iframeSrc.includes("simulator/live/index.html")) {
      throw new Error(`Invalid iframe src: ${iframeSrc}`);
    }
    console.log("PASS: Modal iframe correctly pointed to simulator/live/index.html.");

    const closeBtn = page.locator("#btn-close-modal");
    await closeBtn.click();
    await modal.waitFor({ state: "hidden", timeout: 5000 });
    console.log("PASS: Modal successfully closed with '✕ Back to Overview'.");

    console.log("\n--- Test 3: Showcase Embed Live 3D Workbench Toggle ---");
    const launchLiveBtn = page.locator("#btn-launch-live");
    await launchLiveBtn.click();

    const embedContainer = page.locator("#live-embed-container");
    await embedContainer.waitFor({ state: "visible", timeout: 5000 });
    const showcaseIframe = page.locator("#showcase-live-iframe");
    const showcaseSrc = await showcaseIframe.getAttribute("src");
    console.log(`Showcase embedded iframe src: ${showcaseSrc}`);
    if (!showcaseSrc || !showcaseSrc.includes("simulator/live/index.html")) {
      throw new Error(`Invalid showcase iframe src: ${showcaseSrc}`);
    }
    console.log("PASS: Showcase frame toggled live 3D Godot workbench seamlessly.");

    if (fatalErrors.length > 0) {
      throw new Error(`Encountered fatal page errors:\n${fatalErrors.join("\n")}`);
    }

    console.log("\nALL LIVE WASM & INTERACTIVE PLAYWRIGHT TESTS PASSED!\n");
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
