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
const appjs = fs.readFileSync(path.join(SITE, "assets", "app.js"), "utf8");
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

/* --- 11. the active-section indicator must be able to reach the nav edge ---
   On a phone the nav is a horizontal scroller, so the marker is drawn as an
   absolutely positioned rule rather than a border: a border would add width to
   the item and, on the last one, widen the scrollable area. */
const activeRule = css.match(/\.nav-links a\[aria-current="true"\][^{]*\{[^}]*\}/);
ok("nav has an active-section style", !!activeRule, activeRule ? activeRule[0].slice(0, 46) : "no rule");
ok("active nav marker does not add width", !!activeRule && !/border|outline/.test(activeRule[0]));
ok("active nav marker uses the accent colour", !!activeRule && /var\(--known\)/.test(activeRule[0]));

/* --- 12. in-page anchors must clear the sticky header ---
   scroll-padding-top on the scroll container is the correct mechanism. It must
   not also be applied as scroll-margin-top on the sections: the two offsets add,
   which lands every anchor at twice the intended clearance. */
ok("anchors clear the sticky header", /html\s*\{[^}]*scroll-padding-top/.test(css));
const secRule = css.match(/^section\s*\{[^}]*\}/m);
ok("anchor offset is not applied twice", !secRule || !/scroll-margin-top/.test(secRule[0]),
   secRule ? secRule[0].slice(0, 60) : "no section rule");

/* --- 13. the workbench record row shows the parameter name only ---
   The value was a second column in the row. It has been removed from the row
   entirely — not hidden — so no track, gap or width cap is left behind to
   reserve space for it, at any viewport. These assertions fail if the value
   column is reintroduced either as markup or as leftover CSS. */

/* Extract a media block by brace matching: a regex cannot safely span the nested
   braces of a whole @media rule. */
const mediaBlock = (bp) => {
  const at = css.indexOf(`@media (max-width: ${bp}px)`);
  if (at < 0) return "";
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  return "";
};
const phone = mediaBlock(560);

/* Comment-stripped copies, so explanatory prose in a rule cannot satisfy or
   break a pattern that is about declarations. */
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
const phoneBare = phone.replace(/\/\*[\s\S]*?\*\//g, "");

const phoneName = phoneBare.match(/\.wb-item \.nm\s*\{[^}]*\}/);
const baseItem = bare.match(/^\.wb-item\s*\{[^}]*\}/m);
const baseName = bare.match(/^\.wb-item \.nm\s*\{[^}]*\}/m);

ok("workbench: no value-column rule survives anywhere in the stylesheet",
   !/\.wb-item\s+\.vl\s*[,{]/.test(bare) && !/\.vl\b/.test(bare),
   /\.vl[^;{]*/.exec(bare)?.[0]?.slice(0, 40) || "none");
ok("workbench: no value element is emitted by the renderer",
   !/["']vl["']/.test(appjs), /el\([^)]*["']vl["']/.exec(appjs)?.[0] || "none");
ok("workbench: the row has no leftover column template",
   !!baseItem && !/grid-template-columns/.test(baseItem[0]),
   baseItem ? "no grid-template-columns" : "no rule");
ok("workbench: the row is not a multi-track grid",
   !!baseItem && !/display:\s*grid/.test(baseItem[0]) && !/display:\s*flex/.test(baseItem[0]),
   baseItem ? (baseItem[0].match(/display:[^;]*/) || [""])[0] : "no rule");
ok("workbench: the name still spans the row",
   !!baseName && /display:\s*block/.test(baseName[0]),
   baseName ? (baseName[0].match(/display:[^;]*/) || [""])[0] : "no rule");
ok("workbench: the name is still ellipsised on wide screens",
   !!baseName && /white-space:\s*nowrap/.test(baseName[0]) &&
   /text-overflow:\s*ellipsis/.test(baseName[0]) && /overflow:\s*hidden/.test(baseName[0]));

/* --- 14. no horizontal overflow out of the record row ---
   The name wraps on a phone and must break a long unbroken token rather than
   push the row wider than its container, which would scroll the page. */
ok("phones: field name wraps rather than truncating",
   !!phoneName && /white-space:\s*normal/.test(phoneName[0]) && /text-overflow:\s*clip/.test(phoneName[0]),
   phoneName ? phoneName[0].replace(/\s+/g, " ").slice(0, 60) : "no rule");
ok("phones: long field names wrap instead of overflowing",
   !!phoneName && /overflow-wrap:\s*(anywhere|break-word)/.test(phoneName[0]));
ok("phones: record row introduces no fixed width",
   ![baseItem, baseName, phoneName].some((m) => m && /(?<![-\w])width:\s*\d+px/.test(m[0])));
ok("phones: record row introduces no pixel width cap",
   ![baseItem, baseName, phoneName].some((m) => m && /max-width:\s*\d+px/.test(m[0])));
ok("phones: the phone override targets the name, not a column layout",
   !/\.wb-item\s*\{/.test(phoneBare) || !/grid-template-columns/.test(phoneBare),
   phoneBare.includes("grid-template-columns") ? "still a column override" : "name-only override");

/* --- 16. long unbroken evidence tokens must be wrappable ---
   Source lines carry DOIs and provenance keys, which are single unbreakable
   tokens; unwrapped they forced the page 25px wider than a 320px viewport. Kept
   scoped to this component rather than applied globally. */
const evSrc = bare.match(/^\.ev-src\s*\{[^}]*\}/m);
ok("evidence: source line can break long tokens",
   !!evSrc && /overflow-wrap:\s*(anywhere|break-word)/.test(evSrc[0]),
   evSrc ? (evSrc[0].match(/overflow-wrap:[^;]*/) || ["missing"])[0] : "no rule");
ok("evidence: source line is not forced to stay on one line",
   !!evSrc && !/white-space:\s*nowrap/.test(evSrc[0]));
ok("evidence: word-breaking is not applied globally",
   !/^(?:html|body|\*)\s*\{[^}]*overflow-wrap:\s*anywhere/m.test(bare));

/* --- report --- */
const failed = checks.filter((c) => !c.pass);
checks.forEach((c) => console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  [${c.detail}]` : ""}`));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
