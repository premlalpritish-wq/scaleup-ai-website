/* Headless render + claims check for the ScaleUp AI website (Lovable Redesign).
 *
 * Loads index.html and assets/app.js in jsdom, then asserts that the page
 * renders the new Lovable product narrative, that the prompt-first showcase is
 * present, that navigation and CTAs resolve, and that no forbidden claim
 * appears unnegated anywhere in the document.
 *
 * Run from this folder:
 *     npm install jsdom
 *     node tests/check.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(SITE, "assets", "app.js"), "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(`jsdomError: ${e.message}`));
vc.on("error", (...a) => errors.push(`console.error: ${a.join(" ")}`));

const dom = new JSDOM(html, {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  url: "http://localhost/index.html",
  virtualConsole: vc,
});
const { window } = dom;

window.Element.prototype.scrollIntoView = function () {};

try {
  window.eval(appjs);
} catch (e) {
  errors.push(`eval threw: ${e.stack || e.message}`);
}

setTimeout(() => {
  const d = window.document;
  const txt = (sel) =>
    (d.querySelector(sel)?.textContent || "").replace(/\s+/g, " ").trim();
  const n = (sel) => d.querySelectorAll(sel).length;

  const checks = [];
  const ok = (name, cond, detail) =>
    checks.push({ name, pass: !!cond, detail: detail || "" });

  const body = d.body.textContent.replace(/\s+/g, " ");

  /* ---------------------------------------------------- hero */
  ok("hero: single h1", n("h1") === 1, String(n("h1")));
  ok("hero: headline present", /Vibecode physical products, grounded in science/i.test(txt("h1")), txt("h1"));
  ok("hero: supporting copy present", /Describe what you want to make in plain English/i.test(txt(".hero-sub")), txt(".hero-sub").slice(0, 60));
  
  const primaryCta = [...d.querySelectorAll(".hero-cta .btn, .nav-actions .btn")].find((b) => /Open Simulator|Launch Simulator/i.test(b.textContent));
  const secondaryCta = [...d.querySelectorAll(".hero-cta .btn")].find((b) => /View 3D Demo|Simulate in 3D/i.test(b.textContent));
  ok("hero: primary CTA present", !!primaryCta);
  ok("hero: secondary CTA present", !!secondaryCta);
  ok("hero: primary CTA points to simulator", !!primaryCta && primaryCta.getAttribute("href") === "simulator/", primaryCta ? primaryCta.getAttribute("href") : "");
  ok("hero: secondary CTA resolves", !!secondaryCta && d.getElementById((secondaryCta.getAttribute("href") || "").slice(1)) !== null, secondaryCta ? secondaryCta.getAttribute("href") : "");
  ok("hero: simulator screenshot caption present", /genuine screenshot/i.test(txt(".hv-caption")), txt(".hv-caption").slice(0, 60));

  /* ---------------------------------------------------- prompt centerpiece */
  ok("prompt: input box exists", !!d.getElementById("prompt-input"));
  ok("prompt: preset chips present", d.querySelectorAll(".prompt-chip").length >= 3, String(d.querySelectorAll(".prompt-chip").length));

  /* ---------------------------------------------------- showcase window */
  ok("showcase: section present", !!d.getElementById("showcase"));
  ok("showcase: step pills present", d.querySelectorAll(".step-pill").length >= 6, String(d.querySelectorAll(".step-pill").length));
  ok("showcase: hero image present", !!d.getElementById("showcase-hero-img"));
  ok("showcase: metrics bar present", d.querySelectorAll(".metric-pill").length >= 4, String(d.querySelectorAll(".metric-pill").length));

  /* ---------------------------------------------------- narrative / how it works */
  ok("narrative: architecture section present", !!d.getElementById("architecture"));
  ok("narrative: 3 cards present", d.querySelectorAll(".feature-card").length === 3, String(d.querySelectorAll(".feature-card").length));
  ok("narrative: CTA banner present", !!d.querySelector(".cta-banner"));

  /* ---------------------------------------------------- nav */
  const navLinks = [...d.querySelectorAll(".nav-menu a[href^='#']")];
  ok("nav: links present", navLinks.length >= 2, String(navLinks.length));
  ok("nav: every link resolves", navLinks.length > 0 && navLinks.every((a) => d.getElementById(a.getAttribute("href").slice(1))));

  /* ---------------------------------------------------- accessibility */
  ok("a11y: lang set", d.documentElement.getAttribute("lang") === "en");
  ok("a11y: viewport meta", !!d.querySelector('meta[name="viewport"]'));
  ok("a11y: sections have ids", n("section[id]") >= 3, String(n("section[id]")));
  ok("a11y: team has three people", n(".person") === 3, String(n(".person")));
  ok("a11y: names and roles present", /Pritish Premlal/.test(body) && /Samarpit Nag/.test(body) && /Sahil Pawar/.test(body) && /CEO/.test(body) && /CTO/.test(body) && /CPO/.test(body));
  const teamText = (d.querySelector("#team")?.textContent || "").replace(/\s+/g, " ");
  ok("a11y: no credential claims", !/\bPhD\b|\bMSc\b|\bB\.?Tech\b|\bformerly\b/i.test(teamText));

  /* ---------------------------------------------------- footer */
  ok("footer: intact", n("footer") === 1 && /ScaleUp AI/.test(txt("footer")) && /Pre-release/.test(txt("footer")), txt("footer"));
  ok("footer: no metric or count", !/\d/.test(txt("footer")), txt("footer"));

  /* ---------------------------------------------------- claims sweep */
  const negation = /no|not|never|nothing|without|cannot|zero|imply/i;
  const forbidden = [
    [/\bcustomers?\b/i, "customers"],
    [/\bpartnership/i, "partnership"],
    [/\bfunding\b|\braised\b|\bseed round/i, "funding"],
    [/\binvestors?\b/i, "investors"],
    [/\btestimonial/i, "testimonial"],
    [/\benterprise\b/i, "enterprise"],
    [/\bROI\b/i, "ROI"],
    [/\b\d+(\.\d+)?%\s*accurate/i, "accuracy percentage"],
    [/\btraction\b/i, "traction"],
    [/\bdeployed (?:at|to|in)\b/i, "deployment"],
    [/\bindustrial validation\b/i, "industrial validation"],
    [/\bproduction[- ]ready\b/i, "production readiness"],
  ];
  forbidden.forEach(([re, label]) => {
    const scan = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    const hits = [];
    let m;
    while ((m = scan.exec(body)) !== null) {
      const win = body.slice(Math.max(0, m.index - 140), m.index + 140);
      if (!negation.test(win)) hits.push(win);
      if (m.index === scan.lastIndex) scan.lastIndex++;
    }
    ok(`claims: no unnegated "${label}"`, hits.length === 0, hits.length ? hits[0].slice(0, 80) : "");
  });

  const failed = checks.filter((c) => !c.pass);
  checks.forEach((c) =>
    console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  [${c.detail}]` : ""}`)
  );
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);

  if (errors.length) {
    console.log("\nRUNTIME ERRORS:");
    errors.forEach((e) => console.log("  " + e));
  } else {
    console.log("No runtime errors.");
  }

  process.exit(failed.length || errors.length ? 1 : 0);
}, 400);
