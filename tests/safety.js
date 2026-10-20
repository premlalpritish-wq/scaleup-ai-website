/* Safety check: prove the static page carries no inline handlers or
 * unexpected scripts, and that the legitimate prototype screenshots are the
 * only images.
 *
 *     node tests/safety.js
 */
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(SITE, "assets", "app.js"), "utf8");

const checks = [];
const ok = (name, cond, detail) => checks.push({ name, pass: !!cond, detail: detail || "" });

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));

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
window.eval(traced);

setTimeout(() => {
  const d = window.document;

  const imgs = [...d.querySelectorAll("img")];
  ok("images are legitimate screenshots",
     imgs.every((i) => (i.getAttribute("src") || "").startsWith("assets/images/")),
     String(imgs.length));
  ok("no inline event handler attributes",
     ![...d.querySelectorAll("*")].some((n) => [...n.attributes].some((a) => /^on/i.test(a.name))));
  ok("no injected script tags", d.querySelectorAll("script").length <= 1, String(d.querySelectorAll("script").length));
  ok("no runtime errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  const failed = checks.filter((c) => !c.pass);
  checks.forEach((c) => console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  [${c.detail}]` : ""}`));
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}, 200);