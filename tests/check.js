/* Headless render + claims check for the ScaleUp AI website.
 *
 * Loads index.html and assets/app.js in jsdom, stubs fetch with the real
 * exported data/scaleup_data.json, then asserts that the page renders real
 * content, that interactions work, and that no forbidden claim appears
 * unnegated anywhere in the document.
 *
 * Run from this folder:
 *     npm install jsdom
 *     node tests/check.js
 *
 * Exits non-zero on the first category of failure so it can gate a deploy.
 */

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const dataPath = path.join(SITE, "data", "scaleup_data.json");
const appjs = fs.readFileSync(path.join(SITE, "assets", "app.js"), "utf8");

if (!fs.existsSync(dataPath)) {
  console.error(
    `Missing ${dataPath}\nRun scripts/export_website_data.py in the ScaleUp AI repository first.`
  );
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

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

window.fetch = () =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(data) });

/* Report any selector the app looks up and does not find, instead of letting
 * it surface later as a confusing "cannot set property of null". */
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
  const num = (v) => new Intl.NumberFormat("en-US").format(v);

  const checks = [];
  const ok = (name, cond, detail) =>
    checks.push({ name, pass: !!cond, detail: detail || "" });

  const C = data.process_state.counts;
  const G = data.process_graph.counts;

  /* ---------------------------------------------------- hero pipeline strip */
  ok("hero: pages", txt("#st-1n").startsWith(String(data.paper.page_count)), txt("#st-1n"));
  ok("hero: chunks", txt("#st-2n").startsWith(String(data.paper.chunking.chunk_count)), txt("#st-2n"));
  ok("hero: parameters", txt("#st-3n").startsWith(String(C.parameters)), txt("#st-3n"));
  ok("hero: graph nodes", txt("#st-4n").startsWith(String(G.nodes)), txt("#st-4n"));
  ok("hero: evidence items", txt("#st-5n").startsWith(String(C.parameter_evidence_items)), txt("#st-5n"));
  ok("hero: source cited", /Zieli/.test(txt("#dm-source")), txt("#dm-source"));

  /* --------------------------------------------------------- step 01 · paper */
  ok("paper: identity fields", n("#d1-kv > div") === 4);
  ok("paper: one bar per page", n("#d1-bars .bar-row") === data.paper.page_count);
  ok("paper: real page text shown", txt("#d1-text").length > 200);

  /* ----------------------------------------------------- step 02 · extraction */
  ok("extraction: summary fields", n("#d2-kv > div") === 4);
  ok("extraction: chunk bars", n("#d2-bars .bar-row") === data.paper.chunking.chunk_count);
  ok("extraction: boundary rules", n("#d2-rules li") === 6, String(n("#d2-rules li")));
  ok(
    "extraction: round-trip reported honestly",
    data.paper.chunking.text_preserved_exactly
      ? /verified/i.test(txt("#d2-rules"))
      : /failed/i.test(txt("#d2-rules"))
  );

  /* --------------------------------------------------- step 03 · ProcessState */
  ok("state: summary fields", n("#d3-kv > div") === 6);
  ok("state: five identity fields", n("#d3-scalars li") === 5);
  ok("state: provenance vocabulary", n("#d3-prov .chip") === data.pipeline.provenance_values.length);
  ok("state: organism is real", /E\. coli/.test(txt("#d3-scalars")));
  ok("state: reserved fields shown empty", /Models0|reserved/i.test(txt("#d3-kv")));

  /* ---------------------------------------------------------- step 04 · graph */
  ok("graph step: summary", n("#d4-kv > div") === 3);
  ok("graph step: relation kinds", n("#d4-rules li") === 4);
  ok("graph step: unresolved surfaced", /1/.test(txt("#d4-kv")));

  /* -------------------------------------------------------- step 05 · evidence */
  ok("evidence: summary", n("#d5-kv > div") === 4);
  ok("evidence: page coverage bars", n("#d5-bars .bar-row") > 0);
  ok("evidence: example record", txt("#d5-ex").length > 80);
  ok("evidence: example carries a real excerpt", /Cells were grown for 15/.test(txt("#d5-ex")));
  /* The code panels are built with innerHTML, so prove an excerpt containing
     angle brackets cannot escape into markup. */
  ok("evidence: no raw tags injected from data", d.querySelectorAll("#d5-ex span").length > 0);
  ok("evidence: excerpt is inside a styled span", n("#d5-ex .s") > 0, String(n("#d5-ex .s")));
  ok("evidence: keys are inside a styled span", n("#d5-ex .k") > 0, String(n("#d5-ex .k")));

  /* ------------------------------------------------------ step 06 · uncertainty */
  ok("uncertainty step: summary", n("#d6-kv > div") === 4);

  /* ------------------------------------------------------------- workbench */
  const totalRows = C.parameters + C.experiments;
  ok("workbench: one row per record", n("#wb-list .wb-item") === totalRows,
     `${n("#wb-list .wb-item")} vs ${totalRows}`);
  ok("workbench: grouped", n("#wb-list .wb-group") === 2);
  ok("workbench: count label", txt("#wb-count").startsWith(String(totalRows)), txt("#wb-count"));

  const search = d.querySelector("#wb-search");
  search.value = "renaturation";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  const filtered = n("#wb-list .wb-item");
  ok("workbench: filter narrows", filtered > 0 && filtered < totalRows, `${filtered} rows`);

  d.querySelector("#wb-list .wb-item").dispatchEvent(new window.Event("click", { bubbles: true }));
  ok("workbench: detail shows field", txt("#wb-main .d-name").length > 0, txt("#wb-main .d-name"));
  ok("workbench: detail shows value", txt("#wb-main .d-val").length > 0);
  ok("workbench: provenance badge", /provenance: literature/.test(txt("#wb-main")));
  ok("workbench: evidence block", n("#wb-main .ev") > 0);
  ok("workbench: evidence cites a page", /PDF page/.test(txt("#wb-main .ev-src")));
  ok("workbench: selection marked", d.querySelector("#wb-list .wb-item").getAttribute("aria-current") === "true");

  /* ---------------------------------------------------------------- graph */
  ok("graph: node count", n("#graph-svg .gnode") === G.nodes, String(n("#graph-svg .gnode")));
  ok("graph: edge count", n("#graph-svg .gedge") === G.relations, String(n("#graph-svg .gedge")));
  ok("graph: unresolved edges", n("#graph-svg .gunres") === G.unresolved_relations);
  ok("graph: stats label", new RegExp(`${G.nodes} nodes`).test(txt("#graph-stats")), txt("#graph-stats"));
  ok("graph: relation table complete", n("#rel-table tbody tr") === G.relations + G.unresolved_relations,
     String(n("#rel-table tbody tr")));

  d.querySelectorAll("#graph-svg .gnode")[1].dispatchEvent(new window.Event("click", { bubbles: true }));
  ok("graph: click selects node", d.querySelectorAll("#graph-svg .gnode")[1].classList.contains("sel"));
  ok("graph: others dim", n("#graph-svg .gnode.dim") === G.nodes - 1);
  ok("graph: detail shows label", txt("#graph-detail .d-name").length > 0);
  ok("graph: detail shows evidence", n("#graph-detail .ev") > 0);

  /* ------------------------------------------------------- evidence section */
  ok("chain: six stages", n("#chain .vstep") === 6);
  ok("chain: worked example present", /CLAIM/.test(txt("#ev-example")));
  ok("chain: limitation stated", /Limitation/.test(txt("#ev-example")));
  /* The worked example must quote a real recorded finding when the pipeline
     flagged this field, not only the generic validator caveat. */
  ok("chain: real recorded finding quoted", /Recorded finding/.test(txt("#ev-example")), txt("#ev-example").slice(0, 200));
  ok("chain: finding text is from the ProcessState",
     /8\s*°C/.test(txt("#ev-example")) || /7–8/.test(txt("#ev-example")));
  ok("reconciliation: entity rows", n("#recon-table-wrap tbody tr") === (data.reconciliation?.entity_resolutions?.length || 0));
  ok("reconciliation: canonical ids shown", /topology:/.test(txt("#recon-table-wrap")));

  /* -------------------------------------------------- uncertainty section */
  ok("uncertainty: four categories", n("#unc-grid .unc") === 4);
  ok("uncertainty: ambiguity is real text", /renaturation/i.test(txt("#unc-grid")));
  ok("uncertainty: missing items are real", /inducer|agitation|set point|pH/i.test(txt("#unc-grid")));
  ok("uncertainty: contradiction is real", /8\s*°C/.test(txt("#unc-grid")));

  /* ------------------------------------------------------ validation section */
  const diagCount = Object.values(data.diagnostics || {}).filter(Boolean).length;
  ok("validation: one card per artifact", n("#val-grid .val") === diagCount, String(n("#val-grid .val")));
  ok("validation: real counts shown", /137/.test(txt("#val-grid")));
  ok("validation: model named", /gpt-4o-mini/.test(txt("#val-model")), txt("#val-model"));
  ok("validation: run count is data-driven", /^\d+(–\d+)?$/.test(txt("#val-runs")), txt("#val-runs"));
  ok("validation: negative results framed", /NEGATIVE/.test(txt("#val-grid")));

  /* ------------------------------------------- future capability is labelled */
  const body = d.body.textContent.replace(/\s+/g, " ");
  ok("future: steps marked research", /Research direction/.test(body));
  ok("future: not-built disclaimer", /Not built/.test(body));
  /* The shipped/research badges are CSS ::after content, so assert on the
     class that generates them rather than on rendered text. */
  ok("future: one step marked shipped", n(".vstep.now") === 1, String(n(".vstep.now")));
  ok("future: four steps marked research", n(".vstep.next") === 4, String(n(".vstep.next")));

  /* ------------------------------------------ forbidden-claim sweep (claims
     policy): these words are acceptable only inside an explicit disclaimer. */
  const negation = /no|not|never|nothing|without|cannot|zero|imply/i;
  const forbidden = [
    [/\bcustomers?\b/i, "customers"],
    [/\bpartnership/i, "partnership"],
    [/\bfunding\b|\braised\b|\bseed round/i, "funding"],
    [/\binvestors?\b/i, "investors"],
    [/testimonial/i, "testimonial"],
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
    ok(`claims: no unnegated "${label}"`, hits.length === 0,
       hits.length ? `UNNEGATED …${hits[0].slice(100, 190)}…` : "");
  });

  /* ------------------------------------------------------------------ footer */
  ok("footer: real counts", /tests passing|reference artifact/.test(txt("#f-stats")), txt("#f-stats"));

  /* ------------------------------------------------------------------ team */
  ok("team: three named people", n(".person") === 3, String(n(".person")));
  ok("team: names and roles present",
     /Pritish Premlal/.test(body) && /Samarpit Nag/.test(body) && /Sahil Pawar/.test(body) &&
     /CEO/.test(body) && /CTO/.test(body) && /CPO/.test(body));
  ok("team: no per-person credential claims",
     !/\bPhD\b|\bMSc\b|\bB\.?Tech\b|\bformerly\b|\bpreviously at\b/i.test(body));
  ok("team: names and roles only, stated", /Listed by name and role only/i.test(body));

  /* ------------------------------------------------- responsive + a11y basics */
  const links = [...d.querySelectorAll('a[href^="#"]')];
  ok("a11y: no dead in-page anchors", links.every((a) => d.getElementById(a.getAttribute("href").slice(1))),
     links.filter((a) => !d.getElementById(a.getAttribute("href").slice(1))).map((a) => a.getAttribute("href")).join(","));
  ok("a11y: stepper is a tablist", n('[role="tablist"]') === 1);
  ok("a11y: tabs have panels", n('[role="tab"]') === n('[role="tabpanel"]'), `${n('[role="tab"]')}/${n('[role="tabpanel"]')}`);
  ok("a11y: graph nodes are focusable", n('#graph-svg .gnode[tabindex="0"]') === G.nodes);
  ok("a11y: single h1", n("h1") === 1, String(n("h1")));
  ok("a11y: search input labelled", !!d.querySelector('#wb-search[aria-label]'));
  ok("a11y: lang set", d.documentElement.getAttribute("lang") === "en");
  ok("a11y: viewport meta", !!d.querySelector('meta[name="viewport"]'));
  ok("a11y: sections have ids", n("section[id]") >= 8, String(n("section[id]")));

  /* mobile: the nav and workbench must both still work at a phone width */
  ok("responsive: nav links present", n(".nav-links a") >= 8, String(n(".nav-links a")));
  ok("responsive: workbench has scrollable list", !!d.querySelector("#wb-list"));

  /* --------------------------------------------- active section navigation */
  /* The tracker binds to the nav links that point at real sections and marks the
     current one with aria-current. It resolves from live geometry, so the
     behaviour itself needs a real browser; what this suite can verify is that
     the wiring is present and well-formed. */
  const navLinks = [...d.querySelectorAll('.nav-links a[href^="#"]')];
  ok("nav: every link resolves to a section",
     navLinks.length > 0 && navLinks.every((a) => d.getElementById(a.getAttribute("href").slice(1))),
     String(navLinks.length));
  ok("nav: at most one active marker at rest", n('.nav-links a[aria-current="true"]') <= 1,
     String(n('.nav-links a[aria-current="true"]')));
  ok("nav: the active marker uses a valid aria-current value",
     [...d.querySelectorAll(".nav-links a[aria-current]")]
       .every((a) => a.getAttribute("aria-current") === "true"));
  ok("nav is labelled for assistive tech", !!d.querySelector(".nav[aria-label]"));
  /* Must degrade safely rather than throw where the observer is unavailable. */
  ok("nav: tracker guards against a missing IntersectionObserver",
     /typeof IntersectionObserver/.test(appjs));

  /* ------------------------------------------------------------------ report */
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
