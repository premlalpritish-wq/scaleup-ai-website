const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("https://premlalpritish-wq.github.io/scaleup-ai-website/", { waitUntil: "networkidle" });

  const title = await page.title();
  console.log("Live Title:", title);

  const brand = await page.locator(".brand-name").innerText();
  console.log("Live Brand:", brand);

  const teamHeading = await page.locator("#team h3").innerText();
  console.log("Live Team Heading:", teamHeading);

  const footer = await page.locator("footer").innerText();
  console.log("Live Footer:", footer);

  const bodyText = await page.locator("body").innerText();

  if (/ScaleUp AI/i.test(bodyText)) {
    throw new Error('Found forbidden "ScaleUp AI" string in rendered body text!');
  }
  console.log("Zero occurrences of 'ScaleUp AI' confirmed.");

  if (/roboticist|robotics/i.test(bodyText)) {
    throw new Error('Found forbidden "roboticist" or "robotics" string on page!');
  }
  console.log("Zero occurrences of 'roboticist' confirmed.");

  const persons = await page.locator(".person").all();
  console.log(`Live Team Cards: ${persons.length}`);
  for (const p of persons) {
    const name = await p.locator(".person-name").innerText();
    const role = await p.locator(".person-role").innerText();
    const degrees = await p.locator(".person-degrees").innerText();
    console.log(`- ${name} [${role}]: ${degrees}`);
  }

  console.log("All live assertions verified 100% successfully on GitHub Pages!");
  await browser.close();
})();
