const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("https://premlalpritish-wq.github.io/scaleup-ai-website/", { waitUntil: "networkidle" });

  const h1 = await page.locator("h1").innerText();
  console.log("Live H1:", h1);

  const teamHeading = await page.locator("#team h3").innerText();
  console.log("Live Team Heading:", teamHeading);

  const persons = await page.locator(".person").all();
  console.log(`Live Team Cards: ${persons.length}`);

  for (const p of persons) {
    const name = await p.locator(".person-name").innerText();
    const role = await p.locator(".person-role").innerText();
    const degrees = await p.locator(".person-degrees").innerText();
    console.log(`- ${name} [${role}]: ${degrees}`);
  }

  // Ensure no "roboticist" appears anywhere on the page
  const bodyText = await page.locator("body").innerText();
  if (/roboticist|robotics/i.test(bodyText)) {
    throw new Error('Found forbidden "roboticist" or "robotics" on page!');
  }

  console.log("Team credentials and anti-roboticist checks passed!");
  await browser.close();
})();
