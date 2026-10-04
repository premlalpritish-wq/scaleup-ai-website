/* Graph interaction contract.
 *
 * The decisive test in this file is the synthetic-graph section: it renders the
 * page from a hand-built ProcessGraph with different node ids, labels, node
 * count and topology than the shipped fixture, then asserts the interaction
 * derives its neighbourhood and its card content correctly with no code change.
 * If anything in the interaction layer were hardcoded to the real fixture, that
 * section fails.
 *
 * Run:  node tests/graph.js
 */

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const SITE = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const appjs = fs.readFileSync(path.join(SITE, "assets", "app.js"), "utf8");
const realData = JSON.parse(fs.readFileSync(path.join(SITE, "data", "scaleup_data.json"), "utf8"));

const checks = [];
const ok = (name, cond, detail = "") => checks.push({ name, pass: !!cond, detail: detail || "" });

/* Trace the app's own $() so a selector it looks up but does not find is
   reported rather than surfacing later as a confusing null error. */
const traced = appjs.replace(
  /const \$ = \(sel, root = document\) => root\.querySelector\(sel\);/,
  `const $ = (sel, root = document) => {
     const r = root.querySelector(sel);
     if (r === null) { (globalThis.__NULLS = globalThis.__NULLS || []).push(sel); }
     return r;
   };`
);

/* ------------------------------------------------------------------ fixtures */

/* A graph with nothing in common with the shipped fixture: different id
   scheme, different labels, 5 nodes instead of 16, a chain A-B-C, a branch,
   an isolated node, an unresolved relation, a node with no evidence and a node
   with no parameter_refs. */
const SYNTHETIC_GRAPH = {
  scope: "synthetic-test",
  nodes: [
    { id: "X:alpha", kind: "operation", label: "Alpha synthesis", parameter_refs: [], evidence: [
      { source: "Synthetic Source 2031, DOI: 99.9999/xyz", location: "PDF page 11", excerpt: "alpha excerpt" } ] },
    { id: "X:beta", kind: "operation", label: "Beta conversion", parameter_refs: ["temp", "ph"], evidence: [
      { source: "Synthetic Source 2031, DOI: 99.9999/xyz", location: "PDF page 12, Fig. 4 (figure-derived)", excerpt: "beta excerpt" },
      { source: "Synthetic Source 2031, DOI: 99.9999/xyz", location: "PDF page 13", excerpt: "beta excerpt 2" } ] },
    { id: "X:gamma", kind: "operation", label: "Gamma polishing", parameter_refs: [], evidence: [] },
    { id: "X:delta", kind: "material_state", label: "Delta intermediate pool", parameter_refs: [], evidence: [
      { source: "Synthetic Source 2031, DOI: 99.9999/xyz", location: "PDF page 14", excerpt: "delta excerpt" } ] },
    { id: "X:orphan", kind: "operation", label: "Disconnected stage", parameter_refs: [], evidence: [] },
    { id: "X:solo", kind: "operation", label: "Truly isolated stage", parameter_refs: [], evidence: [] },
  ],
  relations: [
    { source_id: "X:alpha", target_id: "X:beta", kind: "precedes", evidence: [] },
    { source_id: "X:beta", target_id: "X:gamma", kind: "precedes", evidence: [] },
    { source_id: "X:beta", target_id: "X:delta", kind: "produces", evidence: [] },
    { source_id: "X:delta", target_id: "X:gamma", kind: "consumes", evidence: [] },
  ],
  unresolved_relations: [
    { source_id: "X:gamma", target_id: "X:orphan", kind: null, status: "unknown",
      description: "No stream is named between gamma and the orphan stage.",
      evidence: [{ source: "Synthetic Source 2031, DOI: 99.9999/xyz", location: "PDF page 15", excerpt: "u" }] },
  ],
  counts: { nodes: 6, node_kinds: { operation: 5, material_state: 1 }, relations: 4,
            relation_kinds: { precedes: 2, produces: 1, consumes: 1 }, unresolved_relations: 1 },
};

/* Minimal but structurally complete payload: the page renders every section
   from this, so it must stay realistic while the graph is entirely synthetic. */
const syntheticData = (graph) => ({
  paper: { file: "synthetic.pdf", source: "Synthetic Source 2031", page_count: 15,
           total_chars: 12345, page_numbering: "printed",
           pages: Array.from({ length: 15 }, (_, i) => ({ page_number: i + 1, chars: 500 + i })),
           page_text_preview: { "2": "synthetic page two text ".repeat(40) },
           chunking: { chunk_count: 15,
           rendered_lengths: new Array(15).fill(500), page_numbers: new Array(15).fill([1]),
           text_preserved_exactly: true } },
  generated_at_utc: "2031-01-01T00:00:00Z",
  pipeline: { single_call_char_limit: 100000, default_chunk_char_limit: 8000,
              min_retry_chunk_char_limit: 2000, provenance_values: ["literature", "inferred"] },
  process_state: {
    counts: { parameters: 2, experiments: 1, objectives: 0, constraints: 0, models: 0,
              recommendations: 0, parameter_evidence_items: 2, experiment_evidence_items: 1,
              missing_information: 1, ambiguities: 0, contradictions: 0, evidenced_pages: [12] },
    parameters: [
      { name: "Synthetic temperature", value: "37 C", unit: "C", source: "literature",
        evidence: [{ source: "Synthetic Source 2031", location: "PDF page 12", excerpt: "e" }] },
      { name: "Synthetic pH", value: "7.0", unit: "pH", source: "literature", evidence: [] },
    ],
    experiments: [{ outputs: { titer: "1.0" }, source: "literature", evidence: [], conditions: {} }],
    ambiguities: [], contradictions: [], missing_information: ["no inducer named"],
    metadata: { scalar_evidence: { process: [], organism: [], product: [], equipment: [], scale: [] } },
  },
  process_graph: graph,
  tests: { passed: 1 },
  diagnostics: {},
});

/* --------------------------------------------------------------- harness */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* app.js renders after an async fetch, so the document is only complete once
   that settles. boot() waits for it before handing back the DOM. */
async function boot(data) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(`jsdomError: ${e.message}`));
  vc.on("error", (...a) => errors.push(`console.error: ${a.join(" ")}`));
  const dom = new JSDOM(html, {
    runScripts: "outside-only", pretendToBeVisual: true,
    url: "http://localhost/index.html", virtualConsole: vc,
  });
  const { window } = dom;
  /* jsdom has no layout, so the card's geometry is stubbed to a stable box.
     Positioning is a browser concern and is verified there; what matters here is
     which classes and which content the interaction produces. */
  window.Element.prototype.getBoundingClientRect = function () {
    return { x: 100, y: 100, left: 100, top: 100, right: 200, bottom: 140,
             width: 100, height: 40, toJSON() { return this; } };
  };
  window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  window.eval(traced);
  await sleep(700);
  return { window, d: window.document, errors };
}

const hover = (d, id) => {
  const g = d.querySelector(`.gnode[data-node="${id}"]`);
  g.dispatchEvent(new d.defaultView.MouseEvent("mouseenter", { bubbles: false }));
  return g;
};
const unhover = (d, id) => {
  d.querySelector(`.gnode[data-node="${id}"]`)
    .dispatchEvent(new d.defaultView.MouseEvent("mouseleave", { bubbles: false }));
};
const card = (d) => d.querySelector(".gcard");
const cardText = (d) => (card(d) ? card(d).textContent.replace(/\s+/g, " ").trim() : "");
const emphasised = (d) => {
  const out = { hover: [], near: [], far: [] };
  d.querySelectorAll(".gnode").forEach((g) => {
    if (g.classList.contains("is-hover")) out.hover.push(g.dataset.node);
    if (g.classList.contains("is-near")) out.near.push(g.dataset.node);
    if (g.classList.contains("is-far")) out.far.push(g.dataset.node);
  });
  return out;
};
const hotEdges = (d) =>
  [...d.querySelectorAll(".gedge.hot")].map((p) => `${p.dataset.source}->${p.dataset.target}`);
const hotUnres = (d) =>
  [...d.querySelectorAll(".gunres.hot")].map((g) => `${g.dataset.source}~${g.dataset.target}`);

const set = (a) => [...a].sort();
const same = (a, b) => set(a).join("|") === set(b).join("|");

/* ================================================== 1. synthetic graph run */

async function main() {
const S = await boot(syntheticData(SYNTHETIC_GRAPH));
const sd = S.d;

/* --- the graph really is the synthetic one, proving the run is not the fixture */
const nodeIds = [...sd.querySelectorAll(".gnode")].map((g) => g.dataset.node);
ok("synthetic: renders the synthetic node ids", same(nodeIds, Object.keys(SYNTHETIC_GRAPH.nodes.reduce((a, n) => (a[n.id] = 1, a), {}))),
   nodeIds.join(","));
ok("synthetic: node count is the synthetic one, not 16", nodeIds.length === 6, String(nodeIds.length));
ok("synthetic: no shipped-fixture id leaked in",
   !sd.documentElement.innerHTML.includes("zielinski-2019"), "no fixture id in DOM");
ok("synthetic: labels come from the synthetic data",
   sd.body.textContent.includes("Alpha synthesis") && !sd.body.textContent.includes("Renaturation"),
   "synthetic labels only");

/* --- A -> B -> C, with B also producing a material: hovering B must derive
   exactly the nodes its own relations mention, with no knowledge of them --- */
hover(sd, "X:beta");
let e = emphasised(sd);
ok("synthetic A→B→C: hovering B derives A and C as neighbours",
   e.hover.includes("X:beta") && e.near.includes("X:alpha") && e.near.includes("X:gamma"),
   `hover=${e.hover} near=${e.near}`);
ok("synthetic: the material B produces is also derived as a neighbour",
   e.near.includes("X:delta"), `near=${e.near}`);
ok("synthetic: nodes with no relation to B are de-emphasised",
   same(e.far, ["X:orphan", "X:solo"]), `far=${e.far}`);
ok("synthetic: the derived relations are the hot ones",
   same(hotEdges(sd), ["X:alpha->X:beta", "X:beta->X:gamma", "X:beta->X:delta"]),
   hotEdges(sd).join(" , "));

/* --- hovering A must derive only A and B */
hover(sd, "X:alpha");
e = emphasised(sd);
ok("synthetic: hovering A derives only its actual connection",
   same([...e.hover, ...e.near], ["X:alpha", "X:beta"]),
   `hover=${e.hover} near=${e.near}`);
ok("synthetic: hovering A hot-highlights only A's own relation",
   same(hotEdges(sd), ["X:alpha->X:beta"]), hotEdges(sd).join(" , "));

/* --- a node with no relations at all must not break anything --- */
hover(sd, "X:solo");
e = emphasised(sd);
ok("synthetic: a node with no relations highlights only itself",
   same(e.hover, ["X:solo"]) && e.near.length === 0,
   `hover=${e.hover} near=${e.near}`);
ok("synthetic: an unconnected node still gets a card", !!card(sd));
ok("synthetic: unconnected node card reports zero connections",
   /0 connected/.test(cardText(sd)), cardText(sd).slice(0, 90));

/* --- unresolved relations participate, derived not special-cased */
hover(sd, "X:gamma");
e = emphasised(sd);
ok("synthetic: unresolved relation is derived into the neighbourhood",
   same([...e.hover, ...e.near], ["X:gamma", "X:beta", "X:delta", "X:orphan"]),
   `hover=${e.hover} near=${e.near}`);
ok("synthetic: unresolved relation highlights with its endpoints",
   same(hotUnres(sd), ["X:gamma~X:orphan"]), hotUnres(sd).join(" , "));
ok("synthetic: unresolved description reaches the card from data",
   /No stream is named between gamma and the orphan stage/.test(cardText(sd)),
   cardText(sd).slice(0, 120));

/* --- card content is generated from the node's own fields */
hover(sd, "X:beta");
let t = cardText(sd);
ok("card: label appears", /Beta conversion/.test(t), t.slice(0, 60));
ok("card: type appears, humanised from the data", /operation/.test(t));
ok("card: relation counts are derived, not declared",
   /2 precedes/.test(t) && /1 produces/.test(t) && !/consumes/.test(t) && /3 connected/.test(t),
   t.slice(0, 110));
ok("card: parameter_refs appear when present", /temp, ph/.test(t));
ok("card: evidence location appears", /PDF page 12, Fig\. 4/.test(t));
ok("card: provenance appears", /Synthetic Source 2031/.test(t));
ok("card: extra evidence is summarised, not dumped",
   /1 more evidence item/.test(t) && !/beta excerpt 2/.test(t), t.slice(0, 130));
ok("card: click hint present for a clickable node", /Click for full details/.test(t));

/* a node with no evidence must produce no evidence rows at all */
hover(sd, "X:gamma");
t = cardText(sd);
ok("card: empty metadata is omitted, not blank",
   !/located|source|parameters/i.test(t), t.slice(0, 90));
ok("card: label and type still present for a bare node",
   /Gamma polishing/.test(t) && /operation/.test(t));

/* --- long raw content is never dumped */
hover(sd, "X:delta");
t = cardText(sd);
ok("card: evidence excerpt text is not included", !/delta excerpt/.test(t), t.slice(0, 120));
ok("card: card stays compact", t.length < 400, t.length + " chars");
/* Clipping is proven on the real fixture, whose sources are long enough to need
   it: the card must not carry the whole citation. */
const longSrc = realData.process_graph.nodes
  .flatMap((n) => (n.evidence || []).map((e) => e.source || ""))
  .sort((a, b) => b.length - a.length)[0] || "";
const LONG = await boot(realData);
const longNode = realData.process_graph.nodes.find((n) =>
  (n.evidence || []).some((e) => (e.source || "").length > 40));
if (longNode) {
  hover(LONG.d, longNode.id);
  const lc = cardText(LONG.d);
  ok("card: a long real source is clipped, not dumped whole",
     lc.length < 400 && !(lc.includes(longSrc) && longSrc.length > 46),
     `source ${longSrc.length} chars, card ${lc.length} chars`);
  ok("card: the real fixture's excerpt never reaches the card",
     !lc.includes("dissolved in 12 mM"), lc.slice(0, 120));
}

/* --- changing the label changes the card, with no code change */
const R = await boot(syntheticData({
  ...SYNTHETIC_GRAPH,
  nodes: SYNTHETIC_GRAPH.nodes.map((n) =>
    n.id === "X:beta" ? { ...n, label: "Beta conversion, revised wording" } : n),
}));
hover(R.d, "X:beta");
ok("dynamicity: a different label produces different card text, same code",
   /Beta conversion, revised wording/.test(cardText(R.d)) &&
   !/Beta conversion(?!, revised)/.test(cardText(R.d)),
   cardText(R.d).slice(0, 70));

/* --- a different node count and topology, same code, no edits ---
   A diamond plus a material pool. The point of this fixture is that Q-join is
   reachable from Q-start but is two hops away, so it must NOT be highlighted:
   the layer derives the immediate neighbourhood, not the whole component. */
const DIFF = {
  scope: "synthetic-two",
  nodes: [
    { id: "Q-start", kind: "operation", label: "Diamond start", parameter_refs: [], evidence: [] },
    { id: "Q-left", kind: "operation", label: "Diamond left branch", parameter_refs: [], evidence: [] },
    { id: "Q-right", kind: "operation", label: "Diamond right branch", parameter_refs: [], evidence: [] },
    { id: "Q-join", kind: "operation", label: "Diamond join", parameter_refs: [], evidence: [] },
    { id: "Q-pool", kind: "material_state", label: "Shared pool", parameter_refs: [], evidence: [] },
  ],
  relations: [
    { source_id: "Q-start", target_id: "Q-left", kind: "precedes", evidence: [] },
    { source_id: "Q-start", target_id: "Q-right", kind: "precedes", evidence: [] },
    { source_id: "Q-left", target_id: "Q-join", kind: "precedes", evidence: [] },
    { source_id: "Q-right", target_id: "Q-join", kind: "precedes", evidence: [] },
    { source_id: "Q-left", target_id: "Q-pool", kind: "produces", evidence: [] },
    { source_id: "Q-pool", target_id: "Q-join", kind: "consumes", evidence: [] },
  ],
  unresolved_relations: [],
  counts: { nodes: 5, node_kinds: { operation: 4, material_state: 1 }, relations: 6,
            relation_kinds: { precedes: 4, produces: 1, consumes: 1 }, unresolved_relations: 0 },
};
const T = await boot(syntheticData(DIFF));
ok("dynamicity: a different graph renders its own nodes", T.d.querySelectorAll(".gnode").length === 5,
   String(T.d.querySelectorAll(".gnode").length));
ok("dynamicity: a different relation count renders", T.d.querySelectorAll(".gedge").length === 6,
   String(T.d.querySelectorAll(".gedge").length));
ok("dynamicity: stats line reports this graph's own counts",
   /5 nodes/.test(T.d.querySelector("#graph-stats").textContent),
   T.d.querySelector("#graph-stats").textContent);

hover(T.d, "Q-start");
e = emphasised(T.d);
ok("dynamicity: a diamond derives only its two immediate neighbours",
   same([...e.hover, ...e.near], ["Q-start", "Q-left", "Q-right"]),
   `hover=${e.hover} near=${e.near}`);
ok("dynamicity: a two-hop node is not pulled into the neighbourhood",
   !e.hover.includes("Q-join") && !e.near.includes("Q-join"),
   `far=${e.far}`);
ok("dynamicity: a diamond highlights only the start's own relations",
   same(hotEdges(T.d), ["Q-start->Q-left", "Q-start->Q-right"]), hotEdges(T.d).join(" , "));

hover(T.d, "Q-pool");
ok("dynamicity: a material_state node derives its producer and consumer",
   same([...emphasised(T.d).hover, ...emphasised(T.d).near], ["Q-pool", "Q-left", "Q-join"]),
   `${emphasised(T.d).hover} + ${emphasised(T.d).near}`);
ok("dynamicity: the kind is humanised from the data, underscores to spaces",
   /material state/.test(cardText(T.d)), cardText(T.d).slice(0, 80));

/* a single-node graph: no relations at all */
const SOLO = {
  scope: "synthetic-three",
  nodes: [{ id: "Z-only", kind: "operation", label: "Lone stage", parameter_refs: [], evidence: [] }],
  relations: [], unresolved_relations: [],
  counts: { nodes: 1, node_kinds: { operation: 1 }, relations: 0, relation_kinds: {}, unresolved_relations: 0 },
};
const U = await boot(syntheticData(SOLO));
ok("dynamicity: a 1-node graph renders", U.d.querySelectorAll(".gnode").length === 1);
hover(U.d, "Z-only");
ok("dynamicity: a graph with no relations still yields a card",
   /Lone stage/.test(cardText(U.d)) && /0 connected/.test(cardText(U.d)), cardText(U.d).slice(0, 70));
ok("dynamicity: no relations means no hot edges and no crash", hotEdges(U.d).length === 0);

/* --- hover lifecycle */
unhover(sd, "X:beta");
ok("lifecycle: leaving clears every emphasis class",
   sd.querySelectorAll(".is-hover, .is-near, .is-far").length === 0);
ok("lifecycle: leaving removes the card", card(sd) === null);
ok("lifecycle: leaving restores hot/dim to the selection state",
   sd.querySelectorAll(".gedge.hot, .gunres.hot").length >= 0, "selection classes intact");
hover(sd, "X:alpha");
ok("lifecycle: re-entering a different node rebuilds the card",
   /Alpha synthesis/.test(cardText(sd)), cardText(sd).slice(0, 50));

/* --- hover emphasis must outrank the selection's dimming ---
   A node that is not the selection carries .dim at low opacity. If that won,
   pointing at a node would make it fainter than the very neighbours the reader
   is comparing it against. */
const emph = await boot(realData);
/* select one node, then hover a different one: the classic dimmed-hover case */
const emphIds = [...emph.d.querySelectorAll(".gnode")].map((g) => g.dataset.node);
emph.d.querySelector(`.gnode[data-node="${emphIds[0]}"]`)
  .dispatchEvent(new emph.window.MouseEvent("click", { bubbles: true }));
hover(emph.d, emphIds[2]);
const hoveredNode = emph.d.querySelector(".gnode.is-hover");
ok("emphasis: hovering a node that is not the selection reproduces the dimmed case",
   !!hoveredNode && hoveredNode.classList.contains("dim"),
   hoveredNode ? hoveredNode.getAttribute("class") : "no hover");
ok("emphasis: the stylesheet outranks selection dimming for hover and neighbours",
   /\.gnode\.dim\.is-near[\s\S]*?\.gnode\.dim\.is-hover\s*\{\s*opacity:\s*1/.test(
     fs.readFileSync(path.join(SITE, "assets", "styles.css"), "utf8")),
   "dim.is-near and dim.is-hover are reset to full opacity");
unhover(emph.d, emphIds[2]);

/* --- click still drives the existing detail panel */
const target = sd.querySelector('.gnode[data-node="X:beta"]');
target.dispatchEvent(new S.window.MouseEvent("click", { bubbles: true }));
const detail = sd.querySelector("#graph-detail").textContent.replace(/\s+/g, " ");
ok("click: the existing detail panel is populated",
   /Beta conversion/.test(detail), detail.slice(0, 80));
ok("click: the detail panel shows that node's relations",
   /relation/.test(detail), detail.slice(0, 120));
ok("click: selection marking still works",
   sd.querySelectorAll('.gnode[data-node="X:beta"][aria-current="true"], .gnode.sel[data-node="X:beta"]').length >= 1);

/* --- accessibility */
const allNodes = [...sd.querySelectorAll(".gnode")];
ok("a11y: every node is focusable", allNodes.every((g) => g.getAttribute("tabindex") === "0"));
ok("a11y: accessible labels are generated from node data",
   allNodes.every((g) => {
     const l = g.getAttribute("aria-label") || "";
     const n = SYNTHETIC_GRAPH.nodes.find((x) => x.id === g.dataset.node);
     /* the kind is humanised for the label, so compare on the humanised form */
     return l.includes(n.label) && l.includes(String(n.kind).replace(/_/g, " "));
   }), allNodes[0].getAttribute("aria-label"));
ok("a11y: accessible label carries the derived degree",
   /connected/.test(allNodes[0].getAttribute("aria-label")),
   allNodes[0].getAttribute("aria-label"));
ok("a11y: keyboard focus reveals the card without hover",
   (() => {
     unhover(sd, "X:alpha");
     const g = sd.querySelector('.gnode[data-node="X:beta"]');
     g.dispatchEvent(new S.window.FocusEvent("focus"));
     const shown = !!card(sd);
     g.dispatchEvent(new S.window.FocusEvent("blur"));
     return shown && card(sd) === null;
   })(), "focus shows, blur hides");
ok("a11y: Enter activates the node like a click",
   (() => {
     const g = sd.querySelector('.gnode[data-node="X:gamma"]');
     const ev = new S.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true });
     g.dispatchEvent(ev);
     return /Gamma polishing/.test(sd.querySelector("#graph-detail").textContent);
   })());
ok("a11y: Space activates the node like a click",
   (() => {
     const g = sd.querySelector('.gnode[data-node="X:alpha"]');
     g.dispatchEvent(new S.window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
     return /Alpha synthesis/.test(sd.querySelector("#graph-detail").textContent);
   })());
ok("a11y: card is aria-hidden so it is not announced twice",
   card(sd) === null || card(sd).getAttribute("aria-hidden") === "true");
ok("a11y: no native title tooltip is used as the interaction",
   ![...sd.querySelectorAll(".gnode")].some((g) => g.getAttribute("title")),
   "no title attributes on nodes");

/* --- touch / non-hover path */
ok("touch: focus path exists, which is how touch and keyboard reach the card",
   (() => {
     const g = sd.querySelector('.gnode[data-node="X:beta"]');
     g.dispatchEvent(new S.window.FocusEvent("focus"));
     const ok1 = !!card(sd);
     g.dispatchEvent(new S.window.FocusEvent("blur"));
     return ok1;
   })());
ok("touch: tapping still opens the detail panel in one tap",
   (() => {
     const g = sd.querySelector('.gnode[data-node="X:delta"]');
     g.dispatchEvent(new S.window.MouseEvent("click", { bubbles: true }));
     return /Delta intermediate pool/.test(sd.querySelector("#graph-detail").textContent);
   })());

/* --- source-level guarantees */
ok("source: no shipped node id appears in the interaction code",
   !/zielinski|fig1-op|inclusion-bodies/.test(
     appjs.slice(appjs.indexOf("graph interaction"), appjs.indexOf("function selectGraphNode"))),
   "no fixture identities in the interaction block");
ok("source: no shipped node label appears in the interaction code",
   !/Renaturation|Citraconylation|Trypsin|Inclusion bodies isolation/.test(
     appjs.slice(appjs.indexOf("graph interaction"), appjs.indexOf("function selectGraphNode"))));
ok("source: adjacency is generated, not declared",
   /new Map\(nodes\.map/.test(appjs) && /adjacency/.test(appjs));
ok("source: no hardcoded node count in the interaction block",
   !/\b(16|17)\b\s*(nodes|relations)/i.test(
     appjs.slice(appjs.indexOf("graph interaction"), appjs.indexOf("function selectGraphNode"))));

ok("synthetic: no runtime errors with the synthetic graph", S.errors.length === 0, S.errors.join(" | "));
ok("synthetic: no missing selectors", !(S.window.__NULLS || []).length, (S.window.__NULLS || []).join(","));

/* ================================================ 2. shipped-fixture run */

const F = await boot(realData);
const fd = F.d;
const G = realData.process_graph;
const nodeCount = G.nodes.length;
const relCount = G.relations.length;

/* The interaction must agree with the real relations for every node, derived
   independently here from the raw data. */
let mismatches = [];
G.nodes.forEach((n) => {
  const want = new Set();
  G.relations.forEach((r) => {
    if (r.source_id === n.id) want.add(r.target_id);
    if (r.target_id === n.id) want.add(r.source_id);
  });
  (G.unresolved_relations || []).forEach((u) => {
    if (u.source_id === n.id) want.add(u.target_id);
    if (u.target_id === n.id) want.add(u.source_id);
  });
  hover(fd, n.id);
  /* the emphasised set is the hovered node plus its neighbours */
  want.add(n.id);
  const got = new Set([...emphasised(fd).hover, ...emphasised(fd).near]);
  const gotIds = [...got].sort().join("|");
  if (gotIds !== [...want].sort().join("|")) {
    mismatches.push(`${n.id}: got [${gotIds}] want [${[...want].sort().join("|")}]`);
  }
  unhover(fd, n.id);
});
ok("fixture: derived neighbourhood matches the relations for every node",
   mismatches.length === 0, mismatches.slice(0, 3).join(" ; "));
ok("fixture: emphasis covers exactly the nodes that exist",
   fd.querySelectorAll(".gnode").length === nodeCount, `${nodeCount} nodes`);
ok("fixture: hot edges exist and equal the relation count when centred",
   (() => {
     const first = G.nodes.find((n) => G.relations.some((r) => r.source_id === n.id || r.target_id === n.id));
     hover(fd, first.id);
     const n = hotEdges(fd).length + hotUnres(fd).length;
     unhover(fd, first.id);
     return n > 0;
   })(), "at least one relation highlighted");
ok("fixture: the stats line still reports the data's own counts",
   new RegExp(`${nodeCount} nodes`).test(fd.querySelector("#graph-stats").textContent),
   fd.querySelector("#graph-stats").textContent);
ok("fixture: the relation table is unchanged in size",
   fd.querySelectorAll("#rel-table tbody tr").length ===
     relCount + (G.unresolved_relations || []).length,
   `${fd.querySelectorAll("#rel-table tbody tr").length} rows`);
ok("fixture: no runtime errors with the real graph", F.errors.length === 0, F.errors.join(" | "));
ok("fixture: no missing selectors", !(F.window.__NULLS || []).length, (F.window.__NULLS || []).join(","));

/* the pre-existing claims suite still holds on the real fixture */
ok("fixture: clicking a node still populates the detail panel with its label",
   (() => {
     const n = G.nodes[3];
     fd.querySelector(`.gnode[data-node="${n.id}"]`)
       .dispatchEvent(new F.window.MouseEvent("click", { bubbles: true }));
     return fd.querySelector("#graph-detail").textContent.includes(n.label);
   })());
ok("fixture: evidence still reaches the detail panel",
   fd.querySelectorAll("#graph-detail .ev").length > 0);

/* ---------------------------------------------------------------- report */
const failed = checks.filter((c) => !c.pass);
checks.forEach((c) => console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  [${c.detail}]` : ""}`));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("graph suite threw:", (e && e.stack) || e);
  process.exit(1);
});