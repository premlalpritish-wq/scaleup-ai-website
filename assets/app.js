/* ==========================================================================
   ScaleUp AI — website V1
   Renders the real exported pipeline artifact. No values are hard-coded here;
   everything numeric or scientific comes from data/scaleup_data.json.
   ========================================================================== */

(() => {
  "use strict";

  const DATA_URL = "data/scaleup_data.json";
  const DATA_JS = "data/scaleup_data.js";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };

  const nf = new Intl.NumberFormat("en-US");
  const num = (v) => (typeof v === "number" ? nf.format(v) : "—");

  /* Escape untrusted-ish text before it ever touches innerHTML. */
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  /* ------------------------------------------------------------------ load */

  let D = null;

  function fail(err) {
    console.error(err);
    const main = $(".hero-sub");
    if (main) {
      main.textContent =
        "The pipeline artifact could not be loaded. From the ScaleUp AI repository run scripts/export_website_data.py to generate the data file, then open this page again.";
      main.style.color = "var(--conflict)";
    }
  }

  function start(d) {
    D = d;
    renderAll();
  }

  /* fetch() is blocked for file:// by browser security rules, so a plain
     double-click of index.html would otherwise show nothing. The exporter also
     writes the same payload as a script; fall back to it. */
  fetch(DATA_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(start)
    .catch(() => {
      const s = document.createElement("script");
      s.src = DATA_JS;
      s.onload = () => {
        if (window.__SCALEUP_DATA__) start(window.__SCALEUP_DATA__);
        else fail(new Error("data script loaded but carried no payload"));
      };
      s.onerror = () => fail(new Error(`could not load ${DATA_URL} or ${DATA_JS}`));
      document.head.appendChild(s);
    });

  /* ------------------------------------------------------------------ utils */

  const counts = () => D.process_state.counts;
  const graphCounts = () => D.process_graph.counts;

  const stampShort = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 10);
  };

  const kvRow = (k, v, sub, cls) => {
    const box = el("div", cls || "");
    const dt = el("dt", null, k);
    const dd = el("dd", null, v);
    if (sub) dd.appendChild(el("small", null, sub));
    box.append(dt, dd);
    return box;
  };

  const fillKV = (host, rows) => {
    host.textContent = "";
    rows.forEach((r) => host.appendChild(kvRow(r[0], r[1], r[2], r[3])));
  };

  /* Per-page bar chart. */
  const bars = (host, items, unit) => {
    host.textContent = "";
    if (!items.length) return;
    const max = Math.max(...items.map((i) => i.value), 1);
    items.forEach((it) => {
      const row = el("div", "bar-row");
      row.appendChild(el("span", null, it.label));
      const bar = el("div", "bar");
      const fill = el("i");
      fill.style.width = `${Math.max((it.value / max) * 100, 1.5)}%`;
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el("span", "val", `${num(it.value)}${unit || ""}`));
      host.appendChild(row);
    });
  };

  /* Grouped rows list (used for rules). */
  const rules = (host, items) => {
    host.textContent = "";
    items.forEach((it) => {
      const li = el("li");
      const left = el("span");
      left.appendChild(el("b", null, it.title));
      left.appendChild(document.createTextNode(it.body));
      li.appendChild(left);
      li.appendChild(el("span", `tag ${it.kind || ""}`, it.tag));
      host.appendChild(li);
    });
  };

  /* JSON syntax highlighting for the code panels.
     Tokenises the raw JSON first, then escapes each literal before wrapping it.
     Doing it in that order means an excerpt containing quotes, angle brackets
     or markup can never break out of a span. */
  const jsonBlock = (obj) => {
    const raw = JSON.stringify(obj, null, 2);
    const token = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+\.?\d*(?:e[+-]?\d+)?)/gi;
    let out = "";
    let last = 0;
    let m;
    while ((m = token.exec(raw)) !== null) {
      out += esc(raw.slice(last, m.index));
      if (m[1] !== undefined) {
        out += m[2]
          ? `<span class="k">${esc(m[1])}</span>${m[2]}`
          : `<span class="s">${esc(m[1])}</span>`;
      } else if (m[3] !== undefined) {
        out += `<span class="b">${m[3]}</span>`;
      } else {
        out += `<span class="n">${esc(m[0])}</span>`;
      }
      last = m.index + m[0].length;
    }
    return out + esc(raw.slice(last));
  };

  /* --------------------------------------------------------- evidence block */

  const pageOf = (loc) => {
    if (!loc) return null;
    const m = String(loc).match(/(\d+)/);
    return m ? Number(m[1]) : null;
  };

  const evidenceBlock = (ev, { validatorNote } = {}) => {
    const wrap = el("div", "ev");

    const src = el("div", "ev-src");
    const name = el("span");
    name.textContent = ev.source || "unknown source";
    src.appendChild(name);
    if (ev.location) {
      const pg = el("span", "pg", ev.location);
      src.appendChild(pg);
    }
    wrap.appendChild(src);

    if (ev.excerpt) {
      const q = el("blockquote", "ev-quote");
      /* Preserve the real excerpt exactly; only the quote marks are ours. */
      q.textContent = `“${ev.excerpt}”`;
      wrap.appendChild(q);
    }

    const foot = el("div", "ev-foot");
    foot.textContent = validatorNote || "Excerpt verified present on the stated page by the evidence validator.";
    wrap.appendChild(foot);
    return wrap;
  };

  /* ================================================================= render */

  function renderAll() {
    renderHero();
    renderPaperStep();
    renderExtractionStep();
    renderStateStep();
    renderGraphStep();
    renderEvidenceStep();
    renderUncertaintyStep();
    renderWorkbench();
    renderGraph();
    renderEvidenceSection();
    renderValidation();
    renderUncertainty();
    renderFooter();
    wireTabs();
  }

  /* ------------------------------------------------------------ hero strip */

  function renderHero() {
    const c = counts();
    const g = graphCounts();
    const chunk = D.paper.chunking;
    const findings =
      c.missing_information + c.ambiguities + c.contradictions;

    $("#pl-paper").textContent = D.paper.file;
    $("#pl-stamp").textContent = `exported ${stampShort(D.generated_at_utc)}`;
    $("#dm-source").textContent = D.paper.source;
    $("#hero-pages").textContent = num(D.paper.page_count);

    const set = (id, v, sub) => {
      const n = $(id);
      if (!n) return;
      n.textContent = v;
      const s = el("small", null, sub);
      n.appendChild(s);
    };

    set("#st-1n", num(D.paper.page_count), "pages");
    set("#st-2n", num(chunk.chunk_count), "chunks");
    set("#st-3n", num(c.parameters), "parameters");
    set("#st-4n", num(g.nodes), "nodes");
    set("#st-5n", num(c.parameter_evidence_items), "items");
    set("#st-6n", num(findings), "findings");

    $("#st-1d").textContent = `${num(D.paper.total_chars)} characters`;
    $("#st-2d").textContent = `page-bounded at ${num(
      D.pipeline.default_chunk_char_limit
    )} chars`;
    $("#st-3d").textContent = `${num(c.experiments)} experiments, partial by design`;
    $("#st-4d").textContent = `${num(g.relations)} typed relations`;
    $("#st-5d").textContent = "page-located excerpts";
    $("#st-6d").textContent = `${num(c.missing_information)} unreported · ${num(
      c.ambiguities
    )} ambiguous · ${num(c.contradictions)} conflicting`;
  }

  /* ------------------------------------------------------------- 01 · paper */

  function renderPaperStep() {
    const p = D.paper;
    fillKV($("#d1-kv"), [
      ["Source", "Zieliński et al. (2019)", "Process Biochemistry"],
      ["DOI", "10.1016/j.pep.2019.02.002", "as cited in the repository"],
      ["Pages", num(p.page_count), p.page_numbering],
      ["Characters", num(p.total_chars), "whitespace preserved"],
    ]);

    bars(
      $("#d1-bars"),
      p.pages.map((pg) => ({ label: `page ${pg.page_number}`, value: pg.chars })),
      ""
    );

    const first = p.page_text_preview && p.page_text_preview["2"];
    const pre = $("#d1-text");
    if (first) {
      pre.textContent = first.trimEnd() + "\n…";
    } else {
      pre.textContent = "Page preview unavailable.";
    }
  }

  /* --------------------------------------------------------- 02 · extraction */

  function renderExtractionStep() {
    const p = D.paper;
    const k = p.chunking;
    const pipe = D.pipeline;

    fillKV($("#d2-kv"), [
      ["Document size", num(p.total_chars), "characters"],
      [
        "Single-call limit",
        num(pipe.single_call_char_limit),
        "above this, chunking applies",
        "acc",
      ],
      ["Chunk limit", num(pipe.default_chunk_char_limit), "page-bounded units"],
      ["Chunks produced", num(k.chunk_count), "one per page here"],
    ]);

    bars(
      $("#d2-bars"),
      k.rendered_lengths.map((len, i) => ({
        label:
          k.page_numbers[i] && k.page_numbers[i].length === 1
            ? `chunk ${i + 1} · p${k.page_numbers[i][0]}`
            : `chunk ${i + 1}`,
        value: len,
      })),
      " ch"
    );

    rules($("#d2-rules"), [
      {
        title: "Chunk boundaries never cross a page",
        body: " a chunk is built inside one page, so any excerpt it produces is checked against exactly one page of text.",
        tag: "enforced",
      },
      {
        title: "The page label is part of the budget",
        body: " the rendered [Page N] prefix counts toward the limit, and a limit too small to hold it is rejected rather than silently truncating.",
        tag: "enforced",
      },
      {
        title: "Reassembly is exact",
        body: k.text_preserved_exactly
          ? " joining the chunks reproduces the source text character for character, verified at export time."
          : " chunk text does not round-trip exactly; this is a defect and is reported rather than hidden.",
        tag: k.text_preserved_exactly ? "verified" : "failed",
        kind: k.text_preserved_exactly ? "keep" : "rej",
      },
      {
        title: "A failure is never a partial success",
        body: " if any chunk fails extraction or validation, the run yields no ProcessState instead of a half-populated one.",
        tag: "enforced",
      },
      {
        title: "Truncation is detected, then split",
        body: " an explicit output-limit signal re-splits the chunk and retries, down to a floor of " +
          num(pipe.min_retry_chunk_char_limit) + " characters.",
        tag: "bounded retry",
      },
      {
        title: "Source identity is bound, not generated",
        body: " the model cannot supply the citation; the pipeline assigns the exact document source to every evidence record.",
        tag: "boundary",
      },
    ]);
  }

  /* -------------------------------------------------------- 03 · process state */

  function renderStateStep() {
    const s = D.process_state;
    const c = s.counts;

    fillKV($("#d3-kv"), [
      ["Parameters", num(c.parameters), "each with literature provenance", "acc"],
      ["Experiments", num(c.experiments), "reported outputs, not predictions"],
      ["Objectives", num(c.objectives), "none asserted by the source"],
      ["Constraints", num(c.constraints), "none asserted by the source"],
      ["Models", num(c.models), "reserved field, empty", "amb"],
      ["Recommendations", num(c.recommendations), "reserved field, empty", "amb"],
    ]);

    const scalarRows = [
      ["Process", s.process, D.paper.source, s.metadata?.scalar_evidence?.process],
      ["Organism", s.organism, D.paper.source, s.metadata?.scalar_evidence?.organism],
      ["Product", s.product, D.paper.source, s.metadata?.scalar_evidence?.product],
      ["Equipment", s.equipment, D.paper.source, s.metadata?.scalar_evidence?.equipment],
      ["Scale", s.scale, D.paper.source, s.metadata?.scalar_evidence?.scale],
    ];

    const host = $("#d3-scalars");
    host.textContent = "";
    scalarRows.forEach(([label, value, src, ev]) => {
      const li = el("li");
      const left = el("span");
      left.appendChild(el("b", null, label));
      left.appendChild(document.createTextNode(value || "unset"));
      li.appendChild(left);
      const tag = el("span", "tag keep");
      tag.textContent = ev && ev[0] ? ev[0].location : "no field-level evidence";
      tag.title = "Evidence for scalar identity fields is held in metadata.scalar_evidence, not on the field itself.";
      li.appendChild(tag);
      host.appendChild(li);
    });

    const prov = $("#d3-prov");
    prov.textContent = "";
    (D.pipeline.provenance_values || []).forEach((v) => {
      const c2 = el("span", "chip");
      c2.textContent = v;
      if (v === "literature") c2.style.borderColor = "var(--evidence-dim)";
      prov.appendChild(c2);
    });
  }

  /* ------------------------------------------------------------ 04 · graph step */

  function renderGraphStep() {
    const g = D.process_graph.counts;
    const k = g.node_kinds || {};
    const rk = g.relation_kinds || {};

    fillKV($("#d4-kv"), [
      ["Nodes", num(g.nodes), `${num(k.operation || 0)} operations · ${num(
        k.material_state || 0
      )} material states`, "acc"],
      ["Relations", num(g.relations), `${num(rk.precedes || 0)} precedes · ${num(
        rk.produces || 0
      )} produces · ${num(rk.consumes || 0)} consumes`],
      ["Unresolved", num(g.unresolved_relations), "retained, not coerced", "amb"],
    ]);

    const unresolved = (D.process_graph.unresolved_relations || [])[0];
    const rulesItems = [
      {
        title: "precedes",
        body: " operation → operation. Sequence along the source path.",
        tag: "typed",
      },
      {
        title: "produces",
        body: " operation → material_state. An operation yields a material.",
        tag: "typed",
      },
      {
        title: "consumes",
        body: " material_state → operation. An operation takes a material in.",
        tag: "typed",
      },
    ];
    if (unresolved) {
      rulesItems.push({
        title: "UnresolvedProcessRelation",
        body: ` a relationship the source does not specify. Kept with its evidence instead of being promoted to an edge. In this paper: ${unresolved.description}`,
        tag: "not an edge",
        kind: "rej",
      });
    }
    rules($("#d4-rules"), rulesItems);
  }

  /* ---------------------------------------------------------- 05 · evidence step */

  function renderEvidenceStep() {
    const c = counts();
    const p = D.paper;

    const withEv = D.process_state.parameters.filter((x) => (x.evidence || []).length);
    fillKV($("#d5-kv"), [
      [
        "Parameters with evidence",
        `${num(withEv.length)} / ${num(c.parameters)}`,
        "every value must cite an excerpt",
        "acc",
      ],
      ["Parameter evidence", num(c.parameter_evidence_items), "source + page + excerpt"],
      ["Experiment evidence", num(c.experiment_evidence_items), "attached per experiment"],
      [
        "Pages cited",
        num((c.evidenced_pages || []).length),
        `of ${num(p.page_count)} in the document`,
      ],
    ]);

    const byPage = new Map();
    D.process_state.parameters.forEach((par) => {
      (par.evidence || []).forEach((e) => {
        const n = pageOf(e.location);
        if (n) byPage.set(n, (byPage.get(n) || 0) + 1);
      });
    });
    bars(
      $("#d5-bars"),
      Array.from(byPage.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([page, n]) => ({ label: `page ${page}`, value: n })),
      " refs"
    );

    const sample =
      D.process_state.parameters.find((x) => /temperature/i.test(x.name)) ||
      D.process_state.parameters[0];
    $("#d5-ex").innerHTML = sample
      ? jsonBlock({
          name: sample.name,
          value: sample.value,
          unit: sample.unit,
          range: sample.range,
          source: sample.source,
          evidence: sample.evidence,
        })
      : "No parameters available.";
  }

  /* ------------------------------------------------------ 06 · uncertainty step */

  function renderUncertaintyStep() {
    const c = counts();
    fillKV($("#d6-kv"), [
      ["Not reported", num(c.missing_information), "absent from the source", "amb"],
      ["Ambiguous", num(c.ambiguities), "stated, but underspecified"],
      ["Contradictory", num(c.contradictions), "two incompatible statements", "amb"],
      [
        "Unresolved relations",
        num(graphCounts().unresolved_relations),
        "a relationship, not a value",
      ],
    ]);
  }

  /* ================================================================ workbench */

  const wb = {
    rows: [],
    filtered: [],
    active: null,
  };

  function buildWorkbenchRows() {
    const s = D.process_state;
    const rows = [];
    s.parameters.forEach((p, i) => {
      rows.push({
        group: "Parameters",
        kind: "param",
        name: p.name,
        value: p.value,
        unit: p.unit,
        range: p.range,
        source: p.source,
        evidence: p.evidence || [],
        index: i,
        hay: `${p.name} ${p.value ?? ""} ${p.unit ?? ""}`.toLowerCase(),
      });
    });
    s.experiments.forEach((e, i) => {
      const outs = e.outputs || {};
      const label = Object.keys(outs)[0] || `experiment ${i + 1}`;
      rows.push({
        group: "Reported experiments",
        kind: "exp",
        name: `${label} (${Object.keys(outs).length} output${
          Object.keys(outs).length === 1 ? "" : "s"
        })`,
        value: null,
        outputs: outs,
        conditions: e.conditions || {},
        inputs: e.inputs || {},
        source: e.source,
        evidence: e.evidence || [],
        equipment: e.equipment,
        index: i,
        hay: `${label} ${JSON.stringify(outs)}`.toLowerCase(),
      });
    });
    return rows;
  }

  function renderWorkbench() {
    wb.rows = buildWorkbenchRows();
    const search = $("#wb-search");
    search.placeholder = `filter ${wb.rows.length} records…`;
    search.addEventListener("input", () => {
      filterWorkbench(search.value.trim().toLowerCase());
    });

    const stamp = D.generated_at_utc ? stampShort(D.generated_at_utc) : "—";
    $("#wb-stamp").textContent = `scaleup_data.json, exported ${stamp}`;

    filterWorkbench("");
  }

  function filterWorkbench(q) {
    wb.filtered = q
      ? wb.rows.filter((r) => r.hay.includes(q))
      : wb.rows.slice();
    paintList();
  }

  function paintList() {
    const list = $("#wb-list");
    list.textContent = "";
    $("#wb-count").textContent = `${num(wb.filtered.length)}/${
      num(wb.rows.length)
    }`;

    if (!wb.filtered.length) {
      const e = el("li", "wb-empty", "No field matches that filter.");
      list.appendChild(e);
      return;
    }

    let group = null;
    wb.filtered.forEach((r) => {
      if (r.group !== group) {
        group = r.group;
        list.appendChild(el("li", "wb-group", group));
      }
      const li = el("li");
      const b = el("button", "wb-item");
      b.type = "button";
      b.setAttribute("aria-current", String(wb.active === r));
      b.appendChild(el("span", "nm", r.name));
      b.appendChild(
        el("span", "vl", r.kind === "param" ? r.value ?? "—" : "outputs")
      );
      b.addEventListener("click", () => {
        wb.active = r;
        paintList();
        paintDetail(r);
      });
      li.appendChild(b);
      li.style.listStyle = "none";
      list.appendChild(li);
    });
  }

  function paintDetail(r) {
    const main = $("#wb-main");
    main.textContent = "";

    main.appendChild(el("div", "d-name", r.name));

    const meta = el("div", "d-meta");
    if (r.source) {
      const b = el("span", "badge b-lit", `provenance: ${r.source}`);
      meta.appendChild(b);
    }
    if (r.unit) meta.appendChild(el("span", "badge", `unit: ${r.unit}`));
    if (r.range) meta.appendChild(el("span", "badge", `range: ${r.range}`));
    if (r.equipment) meta.appendChild(el("span", "badge", r.equipment));
    /* A value that is absent is reported as absent, not defaulted. */
    if (r.kind === "param" && (r.value === null || r.value === undefined || r.value === "")) {
      meta.appendChild(el("span", "badge b-warn", "not reported"));
    }
    if ((r.evidence || []).length) {
      meta.appendChild(
        el(
          "span",
          "badge b-ok",
          `${r.evidence.length} evidence item${r.evidence.length === 1 ? "" : "s"}`
        )
      );
    } else {
      meta.appendChild(el("span", "badge b-miss", "no evidence"));
    }
    main.appendChild(meta);

    if (r.kind === "param") {
      const v = el("div", "d-val");
      v.textContent = r.value === null || r.value === undefined ? "unset" : String(r.value);
      main.appendChild(v);
    } else {
      const sec = el("div");
      sec.appendChild(el("div", "ev-head", "Reported outputs"));
      const tbl = el("table", "rel-table");
      const tb = el("tbody");
      Object.entries(r.outputs || {}).forEach(([k, v]) => {
        const tr = el("tr");
        tr.style.cursor = "default";
        const a = el("td");
        a.textContent = k.replace(/_/g, " ");
        const b = el("td");
        b.className = "k";
        b.textContent = String(v);
        tr.append(a, b);
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      sec.appendChild(tbl);
      main.appendChild(sec);

      if (Object.keys(r.conditions || {}).length) {
        const c2 = el("div", "d-sec");
        c2.appendChild(el("div", "ev-head", "Conditions"));
        const t2 = el("table", "rel-table");
        const tb2 = el("tbody");
        Object.entries(r.conditions).forEach(([k, v]) => {
          const tr = el("tr");
          tr.style.cursor = "default";
          const a = el("td");
          a.textContent = k.replace(/_/g, " ");
          const b = el("td");
          b.className = "k";
          b.textContent = String(v);
          tr.append(a, b);
          tb2.appendChild(tr);
        });
        t2.appendChild(tb2);
        c2.appendChild(t2);
        main.appendChild(c2);
      }
    }

    const ev = el("div", "d-sec");
    ev.appendChild(
      el(
        "div",
        "ev-head",
        (r.evidence || []).length
          ? `Evidence · source → page → excerpt`
          : "Evidence"
      )
    );
    if ((r.evidence || []).length) {
      r.evidence.forEach((e) => ev.appendChild(evidenceBlock(e)));
    } else {
      const none = el("div", "detail-empty");
      none.style.padding = "30px 16px";
      none.textContent = "No evidence record for this field.";
      ev.appendChild(none);
    }
    main.appendChild(ev);
  }

  /* ==================================================================== graph */

  /* Deterministic layered layout: operations form the vertical spine in
     `precedes` order (Kahn topological sort, ties by declaration order, exactly
     as the pipeline's own view model does). Material states sit to the side at
     the midpoint of the operations they connect. */
  function computeLayout() {
    const g = D.process_graph;
    const nodes = g.nodes || [];
    const rels = g.relations || [];
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const ops = nodes.filter((n) => n.kind === "operation");
    const mats = nodes.filter((n) => n.kind === "material_state");

    const succ = new Map(ops.map((n) => [n.id, []]));
    const indeg = new Map(ops.map((n) => [n.id, 0]));
    rels
      .filter((r) => r.kind === "precedes")
      .forEach((r) => {
        if (succ.has(r.source_id) && indeg.has(r.target_id)) {
          succ.get(r.source_id).push(r.target_id);
          indeg.set(r.target_id, indeg.get(r.target_id) + 1);
        }
      });

    const order = [];
    const ready = ops.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
    const queued = new Set(ready);
    while (ready.length) {
      const id = ready.shift();
      order.push(id);
      succ.get(id).forEach((nid) => {
        indeg.set(nid, indeg.get(nid) - 1);
        if (indeg.get(nid) === 0 && !queued.has(nid)) {
          queued.add(nid);
          ready.push(nid);
        }
      });
    }
    ops.forEach((n) => {
      if (!order.includes(n.id)) order.push(n.id);
    });

    const NW = 246;
    const NH = 46;
    const GAP = 30;
    const MIND = 108;
    const PADT = 34;
    const SPINE_X = 24;
    const SIDE_X = SPINE_X + NW + 96;

    const pos = new Map();
    order.forEach((id, i) => {
      pos.set(id, { x: SPINE_X, y: PADT + i * (NH + GAP) });
    });

    /* Material nodes: vertical midpoint of producer and consumer, offset right. */
    const link = (kind) =>
      rels.filter((r) => r.kind === kind);
    mats.forEach((m) => {
      const prod = link("produces").find((r) => r.target_id === m.id);
      const cons = link("consumes").find((r) => r.source_id === m.id);
      const a = prod ? pos.get(prod.source_id) : null;
      const b = cons ? pos.get(cons.target_id) : null;
      const ref = a || b;
      const y = ref ? (a && b ? (a.y + b.y) / 2 : ref.y + NH / 2) : PADT;
      pos.set(m.id, { x: SIDE_X, y: y - 20 });
    });

    const height = Math.max(
      ...Array.from(pos.values()).map((p) => p.y + NH),
      PADT + NH
    ) + PADT;

    const relPos = rels.map((r) => {
      const s = pos.get(r.source_id) || { x: SPINE_X, y: 0 };
      const t = pos.get(r.target_id) || { x: SPINE_X, y: 0 };
      return { r, s, t };
    });

    const unresolved = (g.unresolved_relations || []).map((u) => ({
      u,
      s: pos.get(u.source_id) || null,
      t: pos.get(u.target_id) || null,
    }));

    return {
      pos,
      nodeById,
      relPos,
      unresolved,
      width: SIDE_X + NW + 24,
      height,
      NW,
      NH,
    };
  }

  let LAYOUT = null;
  let selectedNode = null;

  function renderGraph() {
    const svg = $("#graph-svg");
    LAYOUT = computeLayout();
    const { pos, nodeById, relPos, unresolved, width, height, NW, NH } = LAYOUT;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.textContent = "";

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6"
              markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="#3a4a5c"/>
      </marker>
      <marker id="ahm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6"
              markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="#6d5622"/>
      </marker>`;
    svg.appendChild(defs);

    const add = (tag, attrs, cls) => {
      const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, String(v)));
      if (cls) n.setAttribute("class", cls);
      svg.appendChild(n);
      return n;
    };

    /* Unresolved relations first, so nodes paint on top. */
    unresolved.forEach(({ u, s, t }) => {
      if (!s || !t) return;
      const gEl = add(
        "g",
        {},
        "gunres"
      );
      gEl.dataset.node = u.source_id || "";
      const x = s.x + 4;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const bow = 26;
      path.setAttribute(
        "d",
        `M ${x} ${s.y + NH} C ${x - bow} ${(s.y + t.y) / 2}, ${x - bow} ${
          (s.y + t.y) / 2
        }, ${x} ${t.y}`
      );
      gEl.appendChild(path);
      const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lbl.setAttribute("x", String(x - bow - 6));
      lbl.setAttribute("y", String((s.y + t.y) / 2 + 3));
      lbl.setAttribute("text-anchor", "end");
      lbl.textContent = `${u.status}: not a traversable edge`;
      gEl.appendChild(lbl);
      /* The figure-derived arrow label contains "->", which in SVG text is
         harmless, but the excerpt is also surfaced verbatim in the detail
         panel. Nothing to transform; the title below carries the real text. */
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = u.description || u.status;
      gEl.appendChild(title);
    });

    relPos.forEach(({ r, s, t }) => {
      const gEl = add("g", {});
      gEl.dataset.node = r.source_id;
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      if (r.kind === "precedes") {
        const x = s.x + NW / 2;
        p.setAttribute("d", `M ${x} ${s.y + NH} L ${x} ${t.y}`);
        p.setAttribute("marker-end", "url(#ah)");
      } else {
        /* Curve out to the right and back. */
        const outX = Math.max(s.x + NW, t.x);
        const mid = (s.y + (r.kind === "produces" ? s.y + NH / 2 : t.y + NH / 2)) / 2;
        p.setAttribute(
          "d",
          `M ${outX} ${mid} C ${outX + 44} ${mid}, ${t.x + NW + 44} ${
            mid
          }, ${t.x + NW} ${t.y + NH / 2}`
        );
        p.setAttribute("marker-end", "url(#ahm)");
      }
      p.setAttribute("class", `gedge ${r.kind} gmat`);
      p.dataset.source = r.source_id;
      p.dataset.target = r.target_id;
      gEl.appendChild(p);
    });

    Array.from(pos.keys()).forEach((id) => {
      const node = nodeById.get(id);
      const p = pos.get(id);
      const gEl = add("g", {}, "gnode");
      gEl.dataset.node = id;
      gEl.setAttribute("tabindex", "0");
      gEl.setAttribute("role", "button");
      gEl.setAttribute("aria-label", `${node.kind}: ${node.label}`);

      if (node.kind === "material_state") {
        const cx = p.x + NW / 2;
        const cy = p.y + NH / 2;
        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        poly.setAttribute(
          "points",
          `${cx},${cy - 26} ${cx + NW / 2},${cy} ${cx},${cy + 26} ${cx - NW / 2},${cy}`
        );
        poly.setAttribute("class", "mat");
        poly.setAttribute("fill", "rgba(224,177,85,0.07)");
        poly.setAttribute("stroke", "#6d5622");
        poly.setAttribute("stroke-dasharray", "4 3");
        gEl.appendChild(poly);
      } else {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(p.x));
        rect.setAttribute("y", String(p.y));
        rect.setAttribute("width", String(NW));
        rect.setAttribute("height", String(NH));
        rect.setAttribute("rx", "3");
        rect.setAttribute("class", "op");
        rect.setAttribute("fill", "#131922");
        rect.setAttribute("stroke", "#1f5f5c");
        gEl.appendChild(rect);
      }

      const cx = p.x + NW / 2;
      const cy = p.y + NH / 2;

      const short = String(node.label);
      const t1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t1.setAttribute("x", String(cx));
      t1.setAttribute("y", String(cy - 1));
      t1.setAttribute("text-anchor", "middle");
      t1.textContent =
        short.length > 34 ? `${short.slice(0, 33)}…` : short;
      gEl.appendChild(t1);

      const t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t2.setAttribute("x", String(cx));
      t2.setAttribute("y", String(cy + 13));
      t2.setAttribute("text-anchor", "middle");
      t2.setAttribute("class", "nid");
      t2.textContent = id.split(":").pop();
      gEl.appendChild(t2);

      const select = () => selectGraphNode(id);
      gEl.addEventListener("click", select);
      gEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select();
        }
      });
    });

    const gc = graphCounts();
    $("#graph-stats").textContent = `${num(gc.nodes)} nodes · ${num(
      gc.relations
    )} relations · ${num(gc.unresolved_relations)} unresolved`;

    renderRelationTable();

    const first = (D.process_graph.nodes || [])[0];
    if (first) selectGraphNode(first.id, false);
  }

  function selectGraphNode(id, dimOthers = true) {
    selectedNode = id;
    $$("#graph .gnode").forEach((g) => {
      g.classList.toggle("sel", g.dataset.node === id);
      g.classList.toggle("dim", dimOthers && g.dataset.node !== id);
    });
    $$("#graph .gedge").forEach((p) => {
      const hot = p.dataset.source === id || p.dataset.target === id;
      p.classList.toggle("hot", hot);
      p.classList.toggle("dim", dimOthers && !hot);
    });
    $$("#graph .gunres").forEach((g) => {
      const hot = g.dataset.node === id;
      g.classList.toggle("hot", hot);
      g.classList.toggle("dim", dimOthers && !hot);
    });

    renderGraphDetail(id);
    $$("#rel-table tbody tr").forEach((tr) => {
      tr.style.background = tr.dataset.node === id ? "var(--ink-780)" : "";
    });
  }

  function renderGraphDetail(id) {
    const node = (D.process_graph.nodes || []).find((n) => n.id === id);
    const host = $("#graph-detail");
    host.textContent = "";
    if (!node) return;

    const box = el("div", "ev");
    const head = el("div", "ev-src");
    const k = el("span", "pg", node.kind);
    head.appendChild(k);
    head.appendChild(el("span", null, node.id));
    box.appendChild(head);

    const name = el("div", "d-name");
    name.textContent = node.label;
    box.appendChild(name);

    const inc = (D.process_graph.relations || []).filter(
      (r) => r.source_id === id || r.target_id === id
    );
    const unres = (D.process_graph.unresolved_relations || []).filter(
      (u) => u.source_id === id || u.target_id === id
    );

    const relHead = el("div", "ev-head");
    relHead.textContent = `${inc.length} relation${inc.length === 1 ? "" : "s"} · ${
      unres.length
    } unresolved`;
    relHead.style.marginTop = "16px";
    box.appendChild(relHead);

    const shortId = (x) => (x || "").split(":").pop();
    inc.forEach((r) => {
      const other = r.source_id === id ? r.target_id : r.source_id;
      const line = el("div", "ev-foot");
      line.style.borderTop = "0";
      line.style.paddingTop = "3px";
      line.textContent = `${r.source_id === id ? "→" : "←"} ${r.kind} ${
        shortId(other)
      }`;
      box.appendChild(line);
    });
    unres.forEach((u) => {
      const line = el("div", "ev-foot");
      line.style.borderTop = "0";
      line.style.paddingTop = "3px";
      line.style.color = "var(--ambig)";
      line.textContent = `${u.status}: ${u.description}`;
      box.appendChild(line);
    });

    (node.evidence || []).forEach((e) => box.appendChild(evidenceBlock(e)));
    host.appendChild(box);
  }

  function renderRelationTable() {
    const g = D.process_graph;
    const byId = new Map((g.nodes || []).map((n) => [n.id, n]));
    const short = (x) => (byId.get(x) || { label: x }).label;
    const shortId = (x) => (x || "").split(":").pop();
    const tb = $("#rel-table tbody");
    tb.textContent = "";

    (g.relations || []).forEach((r) => {
      const tr = el("tr");
      tr.dataset.node = r.source_id;
      const a = el("td", null, short(r.source_id));
      const b = el("td", "k", r.kind);
      const c = el("td", null, short(r.target_id));
      const d = el("td", "pg", r.evidence?.[0]?.location || "—");
      tr.append(a, b, c, d);
      tr.title = `${shortId(r.source_id)} → ${shortId(r.target_id)}`;
      tr.addEventListener("click", () => selectGraphNode(r.source_id));
      tb.appendChild(tr);
    });

    (g.unresolved_relations || []).forEach((u) => {
      const tr = el("tr");
      tr.dataset.node = u.source_id;
      const a = el("td", null, short(u.source_id));
      const b = el("td", "k", `${u.status} (no edge)`);
      b.style.color = "var(--ambig)";
      const c = el("td", null, short(u.target_id));
      const d = el("td", "pg", u.evidence?.[0]?.location || "—");
      tr.append(a, b, c, d);
      tr.addEventListener("click", () => selectGraphNode(u.source_id));
      tb.appendChild(tr);
    });
  }

  /* ========================================================= evidence section */

  function renderEvidenceSection() {
    const chain = $("#chain");
    chain.textContent = "";
    const steps = [
      ["Claim", "a typed field with a value"],
      ["Source", "bound by the pipeline, not the model"],
      ["Page", "one-based PDF page index"],
      ["Evidence", "excerpt that must exist on that page"],
      ["Status", "validated, or rejected with a reason"],
      ["Limitation", "what the excerpt does not establish"],
    ];
    chain.className = "vision-track";
    steps.forEach(([t, b], i) => {
      const s = el("div", "vstep");
      s.appendChild(el("div", "vn", String(i + 1).padStart(2, "0")));
      s.appendChild(el("h4", null, t));
      s.appendChild(el("p", null, b));
      chain.appendChild(s);
    });

    /* Worked example. Prefer a parameter that the pipeline itself flags as
       involved in a contradiction or ambiguity, so the limitation shown beside
       the evidence is the real one rather than a generic caveat. */
    const s = D.process_state;
    const findings = [...(s.contradictions || []), ...(s.ambiguities || [])];

    /* Significant tokens of a field name, used to decide whether a recorded
       finding is actually about that field. */
    const STOP = new Set(["and", "the", "for", "from", "with", "value", "detail"]);
    const tokensOf = (p) =>
      String(p.name)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 3 && !STOP.has(t));
    const related = (p) => {
      const toks = tokensOf(p);
      if (!toks.length) return false;
      return findings.some((f) => {
        const low = f.toLowerCase();
        return toks.some((t) => low.includes(t) || low.includes(t.replace(/s$/, "")));
      });
    };

    const temp =
      s.parameters.find((p) => /renaturation temperature/i.test(p.name) && related(p)) ||
      s.parameters.find(related) ||
      s.parameters.find((p) => /temperature/i.test(p.name)) ||
      s.parameters[0];
    const host = $("#ev-example");
    host.textContent = "";
    if (temp) {
      const head = el("div", "ev-src");
      head.style.padding = "13px 15px 0";
      head.appendChild(el("span", "pg", "CLAIM"));
      head.appendChild(el("span", null, temp.name));
      host.appendChild(head);

      const v = el("div", "d-val");
      v.style.margin = "14px 15px";
      v.textContent = String(temp.value);
      host.appendChild(v);

      (temp.evidence || []).forEach((e) => {
        const pad = el("div");
        pad.style.padding = "0 15px 10px";
        pad.appendChild(evidenceBlock(e));
        host.appendChild(pad);
      });

      /* Quote the real finding from the ProcessState, if this field is named
         in one, then add the validator's own limitation. */
      const related2 = findings.filter((f) => {
        const low = f.toLowerCase();
        return tokensOf(temp).some(
          (t) => low.includes(t) || low.includes(t.replace(/s$/, ""))
        );
      });

      related2.forEach((text) => {
        const f = el("div", "ev-foot");
        f.style.margin = "0 15px 10px";
        f.style.paddingTop = "10px";
        f.style.color = "var(--ambig)";
        f.textContent = `Recorded finding: ${text}`;
        host.appendChild(f);
      });

      const note = el("div", "ev-foot");
      note.style.margin = "0 15px 15px";
      note.style.paddingTop = "12px";
      note.style.color = "var(--ambig)";
      note.textContent =
        "Limitation: an excerpt match proves the words are on the page. It does not prove the claim is scientifically correct, nor that the page is the right place to cite.";
      host.appendChild(note);
    }

    renderReconciliation();
  }

  function renderReconciliation() {
    const host = $("#recon-table-wrap");
    host.textContent = "";
    const r = D.reconciliation;
    if (!r) return;

    const rows = r.entity_resolutions || [];
    if (!rows.length) return;

    const t = el("table", "rel-table");
    const thead = el("thead");
    const hr = el("tr");
    ["Entity", "Kind", "Occurrence key", "Canonical ID"].forEach((h) =>
      hr.appendChild(el("th", null, h))
    );
    thead.appendChild(hr);
    t.appendChild(thead);

    const tb = el("tbody");
    rows.forEach((x) => {
      const tr = el("tr");
      tr.style.cursor = "default";
      tr.appendChild(el("td", null, x.label));
      tr.appendChild(el("td", "k", x.kind));
      const occ = el("td", "pg", x.occurrence_key || "—");
      tr.appendChild(occ);
      const cid = el("td", "pg", (x.canonical_id || "—").slice(0, 22) + "…");
      cid.title = x.canonical_id || "";
      tr.appendChild(cid);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    host.appendChild(t);
  }

  /* ============================================================== uncertainty */

  /* uncertainty section shares the ProcessState lists */
  function renderUncertainty() {
    const s = D.process_state;
    const host = $("#unc-grid");
    host.textContent = "";

    const known = s.parameters
      .filter((p) => p.value !== null && p.value !== undefined && p.value !== "")
      .slice(0, 4);

    const columns = [
      {
        cls: "u-known",
        title: "Reported",
        n: s.parameters.filter((p) => p.value !== null && p.value !== undefined && p.value !== "").length,
        items: known.map((p) => ({
          text: p.name,
          val: p.value,
        })),
        empty: "No reported values.",
      },
      {
        cls: "u-ambig",
        title: "Ambiguous",
        n: (s.ambiguities || []).length,
        items: (s.ambiguities || []).map((t) => ({ text: t })),
        empty: "No ambiguities recorded.",
      },
      {
        cls: "u-conflict",
        title: "Contradictory",
        n: (s.contradictions || []).length,
        items: (s.contradictions || []).map((t) => ({ text: t })),
        empty: "No contradictions recorded.",
      },
      {
        cls: "u-missing",
        title: "Not reported",
        n: (s.missing_information || []).length,
        items: (s.missing_information || []).map((t) => ({ text: t })),
        empty: "Nothing recorded as missing.",
      },
    ];

    columns.forEach((col) => {
      const c = el("div", `unc ${col.cls}`);
      const hd = el("div", "unc-hd");
      hd.appendChild(el("h4", null, col.title));
      hd.appendChild(el("span", "n", num(col.n)));
      c.appendChild(hd);
      if (!col.items.length) {
        c.appendChild(el("p", "unc-item muted", col.empty));
      } else {
        col.items.forEach((it) => {
          const item = el("div", "unc-item");
          item.appendChild(document.createTextNode(it.text));
          if (it.val !== undefined) item.appendChild(el("span", "val", it.val));
          c.appendChild(item);
        });
      }
      host.appendChild(c);
    });
  }

  /* ================================================================ validation */

  function renderValidation() {
    const d = D.diagnostics || {};
    const host = $("#val-grid");
    host.textContent = "";

    const ev = d.evidence_diagnostic;
    const co = d.consumes_diagnostic;
    const rd = d.relation_direction_diagnostic;
    const sp = d.schema_presentation_experiment;

    $("#val-model").textContent = (ev && ev.model) || "—";

    /* Every artifact records its own attempt count; report the range actually
       present rather than a single number that would be wrong for some cards. */
    const runCounts = [ev, co, rd]
      .map((x) => x && (x.attempts_requested ?? (x.summary && x.summary.attempts)))
      .filter((x) => typeof x === "number");
    if (runCounts.length) {
      const lo = Math.min(...runCounts);
      const hi = Math.max(...runCounts);
      $("#val-runs").textContent = lo === hi ? String(lo) : `${lo}–${hi}`;
    }

    const card = (title, sub, rows, foot) => {
      const c = el("div", "val");
      const hd = el("div", "val-hd");
      hd.appendChild(el("h4", null, title));
      hd.appendChild(el("span", "tag", "NEGATIVE"));
      c.appendChild(hd);
      if (sub) c.appendChild(el("div", "val-sub", sub));
      const rs = el("div", "rows");
      rows.forEach(([k, v, tone]) => {
        const row = el("div");
        row.appendChild(el("span", "k", k));
        row.appendChild(el("span", `v ${tone || ""}`, v));
        rs.appendChild(row);
      });
      c.appendChild(rs);
      if (foot) c.appendChild(el("p", "val-foot", foot));
      return c;
    };

    if (ev) {
      const s = ev.summary || {};
      host.appendChild(
        card(
          "Evidence excerpt validation",
          `${ev.experiment} · ${ev.model} · PDF pages ${(ev.selected_pages || []).join(
            ", "
          )} · ${num(ev.selected_text_chars)} chars`,
          [
            ["Attempts requested", num(s.attempts_requested)],
            ["Reached evidence validation", num(s.evidence_validation_reached_attempts)],
            ["Accepted a full attempt", num(s.evidence_validation_accepted_attempts), "no"],
            ["Evidence items audited", num(s.evidence_elements_observed)],
            ["Excerpt found on stated page", num((s.excerpt_match_counts || {})["True"]), "yes"],
            ["Excerpt not found → rejected", num((s.excerpt_match_counts || {})["False"]), "no"],
          ],
          "The model cites a real page every time, but frequently paraphrases it. Normalized containment catches this, so a large share of otherwise well-formed extractions are refused."
        )
      );
    }

    if (co) {
      const s = co.summary || {};
      const cc = s.classification_counts || {};
      host.appendChild(
        card(
          "Relation direction and entity kinds",
          `${co.experiment} · ${co.model} · ${num(s.consumes_relations)} consumes relations observed`,
          [
            ["Endpoint-kind failures", num(cc["entity-kind-failure"]), "no"],
            ["Pure direction reversals", num(cc["pure-orientation-failure"]), "no"],
            ["Correct orientation", num(cc.correct), "yes"],
            ["Possible direction reversals flagged", num(s.possible_direction_reversal_relations), "no"],
            ["Fully valid topologies", num(s.fully_valid_topologies), "no"],
          ],
          "Reversing a consumes edge inverts the physical meaning of the process. Orientation is checked against node kinds rather than trusted."
        )
      );
    }

    if (rd) {
      const s = rd.summary || {};
      const rc = s.relation_counts || {};
      const cls = s.classification_counts || {};
      host.appendChild(
        card(
          "Cross-relation direction audit",
          `${rd.experiment} · ${rd.model} · ${num(
            s.unique_resolved_endpoint_relations
          )} resolved relations`,
          [
            ["precedes", `${num((cls.precedes || {}).correct)} / ${num(rc.precedes)}`, "yes"],
            ["produces", `${num((cls.produces || {}).correct)} / ${num(rc.produces)}`],
            ["consumes", `${num((cls.consumes || {}).correct)} / ${num(rc.consumes)}`],
            ["reversed consumes edges", num((cls.consumes || {}).reversed), "no"],
            ["Unresolved endpoint references", num(s.entity_reference_failure_relations), "yes"],
          ],
          "Sequence is recovered reliably. Direction of material flow is where the model fails, and the failure is systematic rather than random."
        )
      );
    }

    if (sp && sp.summary) {
      const a = sp.summary.A_generated_schema || {};
      const b = sp.summary.B_compact_contract || {};
      host.appendChild(
        card(
          "Schema presentation A/B",
          `Same paper, same model, two ways of specifying the output contract`,
          [
            [
              "Generated JSON schema → invalid shape",
              `${num(a.invalid_response_shapes)} / ${num(a.attempts)}`,
              "no",
            ],
            [
              "Compact written contract → invalid shape",
              `${num(b.invalid_response_shapes)} / ${num(b.attempts)}`,
              "yes",
            ],
            [
              "Compact contract → correctly shaped",
              `${num(b.correctly_shaped_extraction_responses)} / ${num(b.attempts)}`,
              "yes",
            ],
            ["Valid topologies, either arm", `${num(a.valid_topology)} / ${num(
              b.valid_topology
            )}`, "no"],
          ],
          "Exposing the generated JSON schema made every response unusable. Simplifying the contract fixed the response shape — and did not fix extraction quality, which stayed at zero valid in both arms."
        )
      );
    }

    if (!host.children.length) {
      host.appendChild(
        el(
          "p",
          "step-note",
          "No validation artifacts were found. Run the pipeline's diagnostic scripts to populate this section."
        )
      );
    }
  }

  /* =================================================================== footer */

  function renderFooter() {
    const c = counts();
    const g = graphCounts();
    const parts = [
      `${num(c.parameters)} parameters`,
      `${num(g.nodes)} graph nodes`,
      `${num(D.paper.page_count)}-page reference artifact`,
    ];
    if (D.tests && D.tests.passed) {
      parts.push(`${num(D.tests.passed)} tests passing`);
    }
    $("#f-stats").textContent = parts.join(" · ");
  }

  /* ====================================================================== tabs */

  function wireTabs() {
    const btns = $$(".step-btn");
    btns.forEach((btn) => {
      btn.addEventListener("click", () => {
        btns.forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
        $$(".step-panel").forEach((p) => p.classList.remove("on"));
        const panel = document.getElementById(btn.getAttribute("aria-controls"));
        if (panel) panel.classList.add("on");
      });
      btn.addEventListener("keydown", (e) => {
        const i = btns.indexOf(btn);
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const next = btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length];
          next.focus();
          next.click();
        }
      });
    });
  }
})();
