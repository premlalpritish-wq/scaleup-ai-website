const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("https://premlalpritish-wq.github.io/scaleup-ai-website/", { waitUntil: "networkidle" });

  const h1 = await page.locator("h1").innerText();
  console.log("Live H1:", h1);

  const sub = await page.locator(".hero-sub").innerText();
  console.log("Live Subtitle:", sub);

  const promptVal = await page.locator("#prompt-input").inputValue();
  console.log("Live Prompt Input:", promptVal.slice(0, 50));

  const imgs = await page.locator("img").all();
  for (const img of imgs) {
    const src = await img.getAttribute("src");
    const nw = await img.evaluate((el) => el.naturalWidth);
    const nh = await img.evaluate((el) => el.naturalHeight);
    const complete = await img.evaluate((el) => el.complete);
    console.log("Live Image:", src, `${nw}x${nh}`, "complete:", complete);
    if (!complete || nw <= 0) {
      throw new Error("Broken live image: " + src);
    }
  }

  // Click 2D flow diagram to verify SVG
  const anatomyPill = page.locator('.step-pill[data-stage="anatomy"]');
  await anatomyPill.click();

  const heroImg = page.locator("#showcase-hero-img");
  await heroImg.evaluate((img) => {
    if (img.complete && img.naturalWidth > 0) return true;
    return new Promise((resolve, reject) => {
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error("Image failed to load: " + img.src));
      setTimeout(
        () =>
          reject(
            new Error(
              "Timeout waiting for image load: " +
                img.src +
                " complete=" +
                img.complete +
                " nw=" +
                img.naturalWidth
            )
          ),
        8000
      );
    });
  });

  const nwSvg = await heroImg.evaluate((el) => el.naturalWidth);
  const nhSvg = await heroImg.evaluate((el) => el.naturalHeight);
  const srcSvg = await heroImg.getAttribute("src");
  console.log("Live 2D Flow Diagram SVG:", srcSvg, `${nwSvg}x${nhSvg}`);
  if (nwSvg <= 0) {
    throw new Error("Broken SVG diagram on live site");
  }

  console.log("All live assertions verified successfully on GitHub Pages!");
  await browser.close();
})();
