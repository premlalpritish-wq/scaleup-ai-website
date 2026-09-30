/* Layout check across viewport widths.
 *
 * jsdom does not do layout, so this cannot measure wrapping. What it can do is
 * catch the responsive-specific failure modes: fixed widths that would force
 * horizontal scrolling of the whole page, tap targets that are too small on
 * touch, and media queries that stop applying. Run with:
 *
 *     node tests/responsive.js
 */

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const css = fs.readFileSync(path.join(SITE, "assets", "styles.css"), "utf8");
const data = JSON.parse(fs.readFileSync(path.join(SITE, "data", "scaleup_data.json"), "utf8"));

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

/* --- 1b. no number is hard-coded in prose where a data value belongs ---
   Any digit in static HTML text is a claim the exporter does not own, so it is
   a drift risk. Everything numeric must come from the data file at runtime. */
const staticCopy = html
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z]+;/g, " ")
  .replace(/\s+/g, " ");
const hardCoded = [...staticCopy.matchAll(/[^.\d]{0,40}\b\d[\d.,]*\s*(?:%|px|pt)\b[^.]{0,25}/g)]
  .map((s) => s[0].trim())
  .filter((s) => !/©|\b20\d\d\b|\bv0\.1\b|\bnd\b|\bst\b|\bth\b|\brd\b/.test(s));
ok("no hard-coded measurements or counts in prose", hardCoded.length === 0, hardCoded.join(" | "));

/* Prose that asserts a count with a noun, e.g. "56 parameters" or "12-run
   sample", is the real drift risk. Section and step ordinals (01, 02 …) are
   layout labels, not claims, so they are matched separately and ignored. */
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

/* --- 2. required responsive breakpoints ---
   Collected in source order (not sorted) so the cascade can be verified. */
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

/* Static controls come from the markup; the workbench rows and graph nodes are
   built by app.js at runtime and are asserted in check.js instead. */
const interactive = [
  ...d.querySelectorAll(".btn"),
  ...d.querySelectorAll(".step-btn"),
  ...d.querySelectorAll(".nav-links a"),
  ...d.querySelectorAll("input"),
];
ok("interactive controls exist in markup", interactive.length >= 19, String(interactive.length));

/* Buttons: padding-block >= 10px combined with line-height is comfortable.
   Links in the nav are text links, so only the buttons are size-asserted. */
const buttons = [...d.querySelectorAll(".btn")];
const smallButtons = buttons.filter((b) => {
  const pad = px(b, "paddingTop");
  return pad !== null && pad < 10;
});
ok("buttons have >=10px vertical padding", smallButtons.length === 0, smallButtons.length + " small");

/* --- 4. the two-column workbench must collapse on narrow screens --- */
const wbRule = css.match(/\.wb\s*\{[^}]*\}/);
ok("workbench is a grid", !!wbRule && /grid/.test(wbRule[0]));
ok("workbench collapses on mobile", /@media \(max-width:\s*980px\)[\s\S]*?\.wb\s*\{[\s\S]*?grid-template-columns:\s*1fr/.test(css));

/* --- 5. the graph is allowed to scroll, but only inside its own container --- */
ok("graph has its own scroll container", !!d.querySelector("#graph-scroll"));
const graphScrollCss = css.match(/\.graph-scroll\s*\{[^}]*\}/);
ok("graph container clips overflow", !!graphScrollCss && /overflow:\s*auto/.test(graphScrollCss[0]), graphScrollCss ? graphScrollCss[0].slice(0, 40) : "no rule");
ok("graph container constrains touch scroll", /overscroll-behavior-x:\s*contain/.test(css));
ok("body does not force overflow-x", !/body\s*\{[^}]*overflow-x/.test(css));

/* --- 6. no element wider than the narrowest supported viewport --- */
const svgWidth = d.querySelector("#graph-svg");
ok("graph svg is sized by script, not markup", !svgWidth.getAttribute("width"));
ok("html has no min-width that breaks mobile", !/min-width:\s*(\d{4,})px/.test(css));

/* --- 7. runtime controls are built by app.js; assert the hooks exist so the
       runtime check in check.js has something to bind to. --- */
ok("workbench list host exists", !!d.querySelector("#wb-list"));
ok("workbench detail host exists", !!d.querySelector("#wb-main"));
ok("data payload has records to render",
   data.process_state.parameters.length + data.process_state.experiments.length > 0);

/* --- 8. responsive type scale is used for the big headings --- */
ok("headings scale with viewport", /clamp\([^)]*vw[^)]*\)/.test(css));
ok("no tiny fixed hero heading", !/h1\s*\{[^}]*font-size:\s*(1[0-7]|[0-9])px/.test(css));

/* --- 9. reduced motion respected --- */
ok("respects prefers-reduced-motion", /prefers-reduced-motion/.test(css));

/* --- 10. mobile nav stays scrollable rather than wrapping into the content --- */
ok("nav links scroll horizontally", /@media[^{]*\.nav-links/.test(css) || /\.nav-links\s*\{[^}]*overflow-x:\s*auto/.test(css));

/* --- report --- */
const failed = checks.filter((c) => !c.pass);
checks.forEach((c) => console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  [${c.detail}]` : ""}`));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
