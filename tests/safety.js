/* Adversarial check: prove that a hostile scientific excerpt cannot inject
 * markup or script into the page.
 *
 * Every excerpt on the site is rendered either through textContent (safe by
 * construction) or, for the JSON code panels, through an escape() + span-wrap
 * pipeline. This test feeds a payload through the real data shape and asserts
 * it stays inert text.
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

const PAYLOAD = '<img src=x onerror="window.__PWNED=1">';
const SCRIPT = "</pre><script>window.__PWNED=1<\/script>";

/* Clone the real payload shape and poison every user-facing string. */
const base = JSON.parse(fs.readFileSync(path.join(SITE, "data", "scaleup_data.json"), "utf8"));
const poison = (s) => (typeof s === "string" ? PAYLOAD + s + SCRIPT : s);

base.process_state.parameters.forEach((p) => {
  p.name = poison(p.name);
  p.value = poison(p.value);
  (p.evidence || []).forEach((e) => {
    e.excerpt = poison(e.excerpt);
    e.location = poison(e.location);
  });
});
base.process_state.experiments.forEach((e) => {
  (e.evidence || []).forEach((ev) => {
    ev.excerpt = poison(ev.excerpt);
  });
});
base.process_graph.nodes.forEach((n) => {
  n.label = poison(n.label);
  (n.evidence || []).forEach((e) => (e.excerpt = poison(e.excerpt)));
});
base.process_state.contradictions = [poison(base.process_state.contradictions[0])];
base.process_state.ambiguities = [poison(base.process_state.ambiguities[0])];
base.process_state.missing_information = [poison(base.process_state.missing_information[0])];
Object.keys(base.process_state).forEach((k) => {
  if (typeof base.process_state[k] === "string") base.process_state[k] = poison(base.process_state[k]);
});

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/index.html",
  virtualConsole: vc,
});
const { window } = dom;
window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(base) });

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

  /* --- interact first, so the detail panel is populated --- */
  d.querySelector("#wb-list .wb-item").dispatchEvent(new window.Event("click", { bubbles: true }));

  /* --- the payload must not have executed --- */
  ok("no script executed", window.__PWNED === undefined, String(window.__PWNED));
  ok("no injected <img> anywhere", d.querySelectorAll("img").length === 0, String(d.querySelectorAll("img").length));
  ok("no injected <script> beyond the two real ones", d.querySelectorAll("script").length <= 2,
     String(d.querySelectorAll("script").length));
  ok("no inline event handler attributes",
     ![...d.querySelectorAll("*")].some((n) => [...n.attributes].some((a) => /^on/i.test(a.name))));

  /* --- it must still be visible as literal text --- */
  const body = d.body.textContent;
  ok("payload appears as literal text", body.includes(PAYLOAD), "payload not found in text");
  ok("closing tag is not interpreted", body.includes("</pre><script>"), "closing tag not literal");
  ok("payload survived in the workbench detail", d.querySelector("#wb-main").textContent.includes(PAYLOAD));
  ok("payload survived in the uncertainty list", d.querySelector("#unc-grid").textContent.includes(PAYLOAD));

  /* --- the JSON panel is the one place that uses innerHTML, so check its
         spans are balanced and contain only text --- */
  const ex = d.querySelector("#d5-ex");
  const spans = [...ex.querySelectorAll("span")];
  ok("code panel spans carry no child elements", spans.every((s) => s.children.length === 0));
  ok("code panel escapes the angle brackets",
     !/[<>]/.test([...spans].map((s) => s.innerHTML).join(" ")));

  /* --- the graph label path also builds text nodes --- */
  const gLabels = [...d.querySelectorAll("#graph-svg text")];
  ok("graph labels carry no child elements", gLabels.every((t) => t.children.length === 0));
  ok("graph still rendered every node", d.querySelectorAll("#graph-svg .gnode").length === base.process_graph.nodes.length,
     String(d.querySelectorAll("#graph-svg .gnode").length));

  /* --- nothing threw while rendering hostile input --- */
  ok("no runtime errors under hostile input", errors.length === 0, errors.slice(0, 2).join(" | "));

  const failed = checks.filter((c) => !c.pass);
  checks.forEach((c) => console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  [${c.detail}]` : ""}`));
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}, 500);
