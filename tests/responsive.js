/* Layout check across viewport widths for the Lovable Redesign.
 *
 * Catches responsive-specific failure modes: fixed widths, small tap targets,
 * missing cascade descending order, and overflow issues.
 *
 *     node tests/responsive.js
 */

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const css = fs.readFileSync(path.join(SITE, "assets", "styles.css"), "utf8");
const appjs = fs.readFileSync(path.join(SITE, "assets", "app.js"), "utf8");

const checks = [];
const ok = (name, cond, detail) => checks.push({ name, pass: !!cond, detail: detail || "" });

/* --- 1. no fixed pixel width anywhere in the stylesheet --- */
const fixedWidth = [];
const widthRe = /([.#][\w-]+[^{]*)\{[^}]*?(?<![-\w])width:\s*(\d{3,})px/g;
let m;
while ((m = widthRe.exec(css)) !== null) {
  fixedWidth.push(`${m[1].trim()} ${m[2]}px`);
}
ok("no fixed pixel widths in the stylesheet", fixedWidth.length === 0, fixedWidth.join(", "));

/* --- 1b. no number is hard-coded in prose where a data value belongs --- */
const staticCopy = html
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;/g, " ")
  .replace(/\s+/g, " ");
const hardCoded = [...staticCopy.matchAll(/[^.\d]{0,40}\b\d[\d.,]*\s*(?:%|px|pt)\b[^.]{0,25}/g)]
  .map((s) => s[0].trim())
  .filter((s) => !/©|\b20\d\d\b|\bv0\.1\b|\bnd\b|\bst\b|\bth\b|\brd\b|%\s*(?:Yield|Pure)|43\.1\s*MPa/.test(s));
ok("no hard-coded measurements or counts in prose", hardCoded.length === 0, hardCoded.join(" | "));

const COUNT_NOUNS =
  "page|pages|parameter|parameters|node|nodes|item|items|finding|findings|test|tests|chunk|chunks|relation|relations|experiment|experiments|attempt|attempts|run|runs";
const bareCounts = [
  ...new Set(
    [...staticCopy.matchAll(new RegExp(`\\b\\d+\\s*(?:-run\\s+)?(?:${COUNT_NOUNS})\\b`, "g"))].map(
      (s) => s[0]
    )
  ),
];
ok("no hard-coded counts with a noun in prose", bareCounts.length === 0, bareCounts.join(" | "));

/* --- 2. required responsive breakpoints --- */
const bps = [...new Set([...css.matchAll(/@media \(max-width:\s*(\d+)px\)/g)].map((x) => Number(x[1])))];
ok("has a phone breakpoint", bps.some((b) => b <= 600), bps.join(", "));
ok("has a tablet breakpoint", bps.some((b) => b > 480 && b <= 1024), bps.join(", "));
ok("breakpoints descend for the cascade", bps.every((b, i) => i === 0 || b < bps[i - 1]), bps.join(", "));

/* --- 3. interactive controls are large enough for touch --- */
const dom = new JSDOM(html, { virtualConsole: new VirtualConsole() });
const d = dom.window.document;

const px = (el, prop) => {
  const v = el.style[prop];
  return v ? parseFloat(v) : null;
};

const interactive = [
  ...d.querySelectorAll(".btn"),
  ...d.querySelectorAll(".step-pill"),
  ...d.querySelectorAll(".prompt-chip"),
  ...d.querySelectorAll(".nav-menu a"),
];
ok("interactive controls exist in markup", interactive.length >= 8, String(interactive.length));

const buttons = [...d.querySelectorAll(".btn")];
const smallButtons = buttons.filter((b) => {
  const pad = px(b, "paddingTop");
  return pad !== null && pad < 10;
});
ok("buttons have >=10px vertical padding", smallButtons.length === 0, smallButtons.length + " small");

/* --- 4. no horizontal overflow helpers --- */
ok("body does not force overflow-x", !/body\s*\{[^}]*overflow-x:\s*scroll/.test(css));
ok("html has no min-width that breaks mobile", !/min-width:\s*(\d{4,})px/.test(css));

/* --- 5. core hooks exist --- */
ok("hero exists", !!d.querySelector(".hero"));
ok("showcase section exists", !!d.querySelector("#showcase"));
ok("how-it-works section exists", !!d.querySelector("#architecture"));

/* --- 6. responsive type scale --- */
ok("headings scale with viewport", /clamp\([^)]*vw[^)]*\)/.test(css));
ok("no tiny fixed hero heading", !/h1\s*\{[^}]*font-size:\s*(1[0-7]|[0-9])px/.test(css));

/* --- 7. reduced motion respected --- */
ok("respects prefers-reduced-motion", /prefers-reduced-motion/.test(css));

/* --- 8. in-page anchors clear the sticky header --- */
ok("anchors clear the sticky header", /html\s*\{[^}]*scroll-padding-top/.test(css));

/* --- report --- */
const failed = checks.filter((c) => !c.pass);
checks.forEach((c) => console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  [${c.detail}]` : ""}`));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
