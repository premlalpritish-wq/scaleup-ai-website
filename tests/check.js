/* Headless render + claims check for the ScaleUp AI website.
 *
 * Loads index.html and assets/app.js in jsdom, then asserts that the page
 * renders the new product narrative, that the Godot prototype showcase is
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

const traced = appjs.replace(
  /const \$ = \(sel, root = document\) => root\.querySelector\(sel\);/,
  `const $ = (sel, root = document) => {
     const r = root.querySelector(sel);
     if (r === null) { (globalThis.__NULLS = globalThis.__NULLS || []).push(sel); }
     return r;
   };`
);

try {
  window.eval(traced);
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
  ok("hero: headline present", /Vibecoding for the physical world/i.test(txt("h1")), txt("h1"));
  ok("hero: supporting copy present", /Describe what you want to make/i.test(txt(".hero-sub")), txt(".hero-sub").slice(0, 60));
  const primaryCta = [...d.querySelectorAll(".hero-cta .btn")].find((b) => /Explore the prototype/i.test(b.textContent));
  const secondaryCta = [...d.querySelectorAll(".hero-cta .btn")].find((b) => /How it works/i.test(b.textContent));
  ok("hero: primary CTA present", !!primaryCta);
  ok("hero: secondary CTA present", !!secondaryCta);
  ok("hero: primary CTA points to simulator", !!primaryCta && primaryCta.getAttribute("href") === "simulator/", primaryCta ? primaryCta.getAttribute("href") : "");
  ok("hero: secondary CTA resolves", !!secondaryCta && d.getElementById((secondaryCta.getAttribute("href") || "").slice(1)) !== null, secondaryCta ? secondaryCta.getAttribute("href") : "");
  ok("hero: simulator screenshot caption present", /genuine screenshot/i.test(txt(".hv-caption")), txt(".hv-caption").slice(0, 60));

  /* ---------------------------------------------------- narrative sections */
  ok("narrative: workflow section present", !!d.getElementById("workflow"));
  ok("narrative: system section present", !!d.getElementById("system"));
  ok("narrative: prototype section present", !!d.getElementById("prototype"));
  ok("narrative: example section present", !!d.getElementById("example"));
  ok("narrative: prototype shows screenshots", d.querySelectorAll("#prototype img").length >= 3, String(d.querySelectorAll("#prototype img").length));
  ok("narrative: prototype mentions evidence replay", /evidence replay/i.test(txt("#prototype")));
  ok("narrative: insulin example mentions dissolved oxygen", /dissolved[- ]oxygen/i.test(txt("#example")));
  ok("narrative: insulin example mentions strain", /strain/i.test(txt("#example")) && /compatibil|transfer/i.test(txt("#example")));

  /* ---------------------------------------------------- nav */
  const navLinks = [...d.querySelectorAll(".nav-links a[href^='#']")];
  ok("nav: links present", navLinks.length >= 5, String(navLinks.length));
  ok("nav: every link resolves", navLinks.length > 0 && navLinks.every((a) => d.getElementById(a.getAttribute("href").slice(1))));
  ok("nav: at most one active marker", n('.nav-links a[aria-current="true"]') <= 1);
  ok("nav: labelled", !!d.querySelector(".nav[aria-label]"));

  /* ---------------------------------------------------- accessibility */
  ok("a11y: lang set", d.documentElement.getAttribute("lang") === "en");
  ok("a11y: viewport meta", !!d.querySelector('meta[name="viewport"]'));
  ok("a11y: sections have ids", n("section[id]") >= 4, String(n("section[id]")));
  ok("a11y: team has three people", n(".person") === 3, String(n(".person")));
  ok("a11y: names and roles present", /Pritish Premlal/.test(body) && /Samarpit Nag/.test(body) && /Sahil Pawar/.test(body) && /CEO/.test(body) && /CTO/.test(body) && /CPO/.test(body));
  ok("a11y: no credential claims", !/\bPhD\b|\bMSc\b|\bB\.?Tech\b|\bformerly\b/i.test(body));

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

  /* ---------------------------------------------------- responsive hooks */
  ok("responsive: nav links present", n(".nav-links a") >= 5, String(n(".nav-links a")));
  ok("responsive: single h1", n("h1") === 1);

  /* ---------------------------------------------------- report */
  const nulls = [...new Set(window.__NULLS || [])];
  if (nulls.length) console.log(`\nNULL SELECTORS: ${nulls.join(", ")}`);

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

  process.exit(failed.length || errors.length || nulls.length ? 1 : 0);
}, 400);