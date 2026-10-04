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

/* --- 13. the workbench record row must be readable on a phone ---
   A record row is a field name and a value. Laid out side by side, the value
   track is `auto` and holds non-wrapping text, so a long value sizes to its own
   content width and squeezes the `minmax(0, 1fr)` field-name track down to zero.
   Values in the reference paper run to several hundred characters, so at phone
   widths the field name was not merely ellipsised but rendered 0px wide.

   Phones therefore get one column with the name wrapping. Desktop and tablet
   keep the two-column row, which this suite also asserts so the phone fix cannot
   silently become the desktop layout. */

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

const phoneItem = phone.match(/\.wb-item\s*\{[^}]*\}/);
const phoneName = phone.match(/\.wb-item \.nm\s*\{[^}]*\}/);
const phoneVal = phone.match(/\.wb-item \.vl\s*\{[^}]*\}/);

ok("phones: workbench row has a phone rule", !!phoneItem && !!phoneName && !!phoneVal,
   [phoneItem, phoneName, phoneVal].map((m) => (m ? "ok" : "MISSING")).join(","));
ok("phones: workbench row stacks to one column",
   !!phoneItem && /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/.test(phoneItem[0]),
   phoneItem ? phoneItem[0].replace(/\s+/g, " ").slice(0, 60) : "no rule");
ok("phones: field name is no longer truncated",
   !!phoneName && /white-space:\s*normal/.test(phoneName[0]) && /text-overflow:\s*clip/.test(phoneName[0]),
   phoneName ? phoneName[0].replace(/\s+/g, " ").slice(0, 60) : "no rule");
ok("phones: value width cap removed",
   !!phoneVal && /max-width:\s*none/.test(phoneVal[0]),
   phoneVal ? phoneVal[0].replace(/\s+/g, " ").slice(0, 60) : "no rule");

/* --- 14. no horizontal overflow out of the record row ---
   The field name is allowed to wrap and must break a long unbroken token rather
   than push the row wider than its container, which would scroll the page. */
ok("phones: long field names wrap instead of overflowing",
   !!phoneName && /overflow-wrap:\s*(anywhere|break-word)/.test(phoneName[0]));
ok("phones: record row introduces no fixed width",
   ![phoneItem, phoneName, phoneVal].some((m) => m && /(?<![-\w])width:\s*\d+px/.test(m[0])));
ok("phones: record row introduces no pixel width cap",
   ![phoneItem, phoneName, phoneVal].some((m) => m && /max-width:\s*\d+px/.test(m[0])));

/* Desktop and tablet must be untouched by the phone fix: still two columns, and
   still the flexible field-name track rather than the phone's single column.
   The value track is bounded (see §15); that bound is not what this asserts. */
const baseItem = css.match(/^\.wb-item\s*\{[^}]*\}/m);
ok("desktop: workbench row keeps its two columns",
   !!baseItem && /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+\S/.test(baseItem[0]) &&
   !/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/.test(baseItem[0]),
   baseItem ? (baseItem[0].match(/grid-template-columns:[^;]*/) || [""])[0].replace(/\s+/g, " ").slice(0, 64) : "no rule");
ok("desktop: the phone stack is not applied above the breakpoint",
   /@media \(max-width:\s*560px\)[\s\S]*?\.wb-item\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/.test(css) &&
   !/@media \(min-width:\s*561px\)/.test(css),
   "560px block only");

/* --- 15. the desktop value track must be bounded ---
   A bare `auto` value track sizes to the value's full intrinsic width. Some
   values in the reference paper are whole sentences (309 characters), so `auto`
   collapsed the `minmax(0, 1fr)` field-name track to 0px and the field name
   rendered invisible at desktop widths. The track must be able to shrink.

   Matched against a comment-stripped copy so the explanatory comments in the
   rule, which necessarily mention `auto`, cannot satisfy or break a pattern. */
const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
const baseItemBare = bare.match(/^\.wb-item\s*\{[^}]*\}/m);
const trackDecl = baseItemBare
  ? (baseItemBare[0].match(/grid-template-columns:[^;]*/) || [""])[0]
  : "";

ok("desktop: value track is not bare auto", !!trackDecl && !/\bauto\s*$/.test(trackDecl),
   trackDecl.replace(/\s+/g, " ").slice(0, 64) || "no declaration");
ok("desktop: value track is bounded and shrinkable",
   /minmax\(0,\s*1fr\)\s+(fit-content\(\s*\d+(?:\.\d+)?%\s*\)|minmax\(0,\s*\d+(?:\.\d+)?%\s*\))/i.test(trackDecl),
   trackDecl.replace(/\s+/g, " ").slice(0, 64));
ok("desktop: field-name track keeps its flexible share",
   /minmax\(0,\s*1fr\)/.test(trackDecl));
/* The value is `nowrap`, so its min-content width is the whole string. Without
   explicit permission to shrink, the bounded track can still be floored by the
   item's automatic minimum size and the collapse returns. */
const vlBare = bare.match(/^\.wb-item \.vl\s*\{[^}]*\}/m);
ok("desktop: value may shrink below its intrinsic width",
   !!vlBare && /min-width:\s*0/.test(vlBare[0]),
   vlBare ? "min-width present" : "no rule");
ok("desktop: value stays single-line and ellipsised",
   !!vlBare && /white-space:\s*nowrap/.test(vlBare[0]) && /text-overflow:\s*ellipsis/.test(vlBare[0]));

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
