/* ==========================================================================
   ScaleUp AI — website
   Minimal client script: active-section tracking for the sticky nav.
   No data loading or rendering remains; the page is static.
   ========================================================================== */
(() => {
  "use strict";

  function wireSectionTracking() {
    const links = document.querySelectorAll(".nav-links a[href^='#']");
    if (!links.length || typeof IntersectionObserver !== "function") return;

    const pairs = Array.from(links)
      .map((a) => ({ a, el: document.getElementById(a.getAttribute("href").slice(1)) }))
      .filter((p) => p.el);
    if (!pairs.length) return;

    const nav = document.querySelector(".nav-links");
    const header = document.querySelector(".nav");
    let active = null;
    let queued = false;

    const line = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--anchor-offset")
        .trim();
      const offset = parseFloat(raw);
      const h = header ? header.getBoundingClientRect().height : 0;
      if (Number.isFinite(offset) && offset > 0) return offset + 4;
      return Math.max(h + 2, 2);
    };

    const apply = (id) => {
      if (active === id) return;
      active = id;
      links.forEach((a) => {
        if (a.getAttribute("href") === `#${id}`) {
          a.setAttribute("aria-current", "true");
        } else {
          a.removeAttribute("aria-current");
        }
      });
      if (!id || !nav || nav.scrollWidth <= nav.clientWidth + 1) return;
      const link = Array.from(links).find((a) => a.getAttribute("href") === `#${id}`);
      if (!link) return;
      const r = link.getBoundingClientRect();
      const nr = nav.getBoundingClientRect();
      const pad = 16;
      if (r.left < nr.left + pad || r.right > nr.right - pad) {
        nav.scrollLeft += r.left - nr.left - (nr.width - r.width) / 2;
      }
    };

    const resolve = () => {
      const y = line();
      let id = null;
      pairs.forEach((p) => {
        if (p.el.getBoundingClientRect().top <= y) id = p.el.id;
      });
      if (pairs.length && pairs[0].el.getBoundingClientRect().top > y) id = null;
      apply(id);
    };

    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        resolve();
      });
    };

    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(schedule);
      pairs.forEach((p) => ro.observe(p.el));
    }

    const io = new IntersectionObserver(schedule, {
      rootMargin: `-${line()}px 0px -${Math.max(
        0,
        window.innerHeight - line() - 1
      )}px 0px`,
      threshold: 0,
    });
    pairs.forEach((p) => io.observe(p.el));

    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule, { passive: true });
    addEventListener("hashchange", schedule);

    Array.from(links).forEach((a) =>
      a.addEventListener("click", () => {
        let last = -1;
        let stable = 0;
        let raf = 0;
        const stop = () => {
          cancelAnimationFrame(raf);
          clearTimeout(timer);
          schedule();
        };
        const settle = () => {
          const y = Math.round(window.scrollY);
          stable = y === last ? stable + 1 : 0;
          last = y;
          if (stable >= 2) return stop();
          raf = requestAnimationFrame(settle);
        };
        const timer = setTimeout(stop, 1600);
        raf = requestAnimationFrame(settle);
      })
    );

    schedule();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireSectionTracking);
  } else {
    wireSectionTracking();
  }
})();

/* ==========================================================================
   User-validation form: opens a pre-filled GitHub issue. No backend.
   ========================================================================== */
(() => {
  "use strict";
  function wireValidateForm() {
    const btn = document.getElementById("validate-submit");
    const form = document.getElementById("validate-form");
    if (!btn || !form) return;
    btn.addEventListener("click", () => {
      const get = (name) => (form.querySelector('[name="' + name + '"]')?.value || "").trim();
      const name = get("name");
      const contact = get("contact");
      const goal = get("goal");
      const pain = get("pain");
      const interest = form.querySelector('[name="interest"]').checked ? "Yes" : "No";
      const title = "User validation: " + (goal ? goal.slice(0, 60) : "ScaleUp AI interest");
      const body =
        "## Name\n" + (name || "(not provided)") + "\n\n" +
        "## Contact\n" + (contact || "(not provided)") + "\n\n" +
        "## What they are trying to build\n" + (goal || "(not provided)") + "\n\n" +
        "## What makes modelling/simulation/experimentation difficult\n" + (pain || "(not provided)") + "\n\n" +
        "## Interested in testing the prototype or discussing a pilot\n" + interest + "\n";
      const url =
        "https://github.com/premlalpritish-wq/scaleup-ai-website/issues/new?title=" +
        encodeURIComponent(title) + "&body=" + encodeURIComponent(body);
      window.open(url, "_blank", "noopener");
    });
  }

  const STAGE_STORIES = {
    overview: {
      title: "6-Stage Biorefinery Train Overview",
      transform: "Continuous multi-stage process train connecting mechanical comminution, acid de-ashing, alkaline hydrogel extraction, centrifugal phase separation, cryo-precipitation, and coagulation-bath wet-spinning.",
      params: "40-hour total biorefinery sequence, 33.07% overall extraction yield across 6 sequential unit operations.",
      provenance: "Procedural Anatomy P&ID schematic with mass-balanced stream continuity."
    },
    stage0: {
      title: "Stage 0 · Mechanical Knife Milling",
      transform: "Comminution of raw dried Saccharina latissima biomass using rotating knife blades down to a controlled 0.5–1.0 mm particle size fraction.",
      params: "Particle cutoff < 1.0 mm, initial biomass moisture content 12.4%. Single GPU draw call via MultiMeshInstance3D (120 particles).",
      provenance: "Primary seaweed processing protocol; initial solid boundary condition."
    },
    stage1: {
      title: "Stage 1 · Formalin & Acid Pre-Treatment",
      transform: "Polyphenol fixation with 0.2% formalin followed by 0.1 M HCl wash to strip divalent cations (Ca²⁺/Mg²⁺) and convert insoluble alginate into free alginic acid.",
      params: "Temperature 20°C, duration 2 h, stripping efficiency > 96% divalent ion removal.",
      provenance: "Direct extraction protocol from peer-reviewed biopolymer literature."
    },
    stage2: {
      title: "Stage 2 · Alkaline Hydrogel Dissolution",
      transform: "Conversion of alginic acid into water-soluble sodium alginate using 2% Na₂CO₃ at elevated temperature under mechanical agitation.",
      params: "Temperature 50°C, pH 9.5–10.0, extraction duration 3 h, liquor-to-seaweed ratio 30:1.",
      provenance: "Direct kinetic dissolution boundary; SHA-256 verified extraction yield."
    },
    stage3: {
      title: "Stage 3 · Centrifugation & Controlled Neutralisation",
      transform: "High-speed centrifugal clarification at 4,500 rpm to eliminate cellular debris, followed by controlled dropwise HCl neutralisation to pH 7.0.",
      params: "4,500 rpm, 30 min pellet compaction; strict pH 7.0 titration preserves macromolecular chain length at 251 kDa without acid hydrolysis.",
      provenance: "Centrifugation mass-balance identity; pH-dependent depolymerisation boundary."
    },
    stage4: {
      title: "Stage 4 · Cryo-Ethanol Precipitation",
      transform: "Addition of cold 96% ethanol (-20°C) at a 1:1 volumetric ratio to induce rapid phase separation, gel flocculation, and salt expulsion.",
      params: "Temperature -20°C, 91.5% uronic acid purity, Mannuronic/Guluronic ratio M/G = 2.491.",
      provenance: "Cryo-solvent phase equilibrium; uronic acid HPLC assay verified."
    },
    stage5: {
      title: "Stage 5 · Wet-Spinning & Tensile Testing",
      transform: "Continuous syringe extrusion of 2.5% sodium alginate dope through a 0.8 mm spinneret into a 0.1 M CaCl₂ coagulation bath, followed by monofilament drying and Instron tensile testing.",
      params: "Monofilament diameter 65 ± 5 µm; ultimate tensile strength 29.3–43.1 MPa; elongation at break 8.2–12.5%.",
      provenance: "Extrusion rheology and mechanical tensile dataset from primary experimental publications."
    },
    anatomy: {
      title: "Anatomy P&ID Topology Engine Blueprint",
      transform: "Procedural vector blueprint mapping each physical vessel, fluid line, sensor port, and material stream with formal mass-balance validation.",
      params: "Isometric SVG vector diagram; dynamic port typing and stream continuity guarantees.",
      provenance: "Generated procedurally by the Anatomy P&ID Engine."
    }
  };

  function updateStageStory(stageKey) {
    const story = STAGE_STORIES[stageKey] || STAGE_STORIES.overview;
    const title = document.getElementById("stage-story-title");
    const transform = document.getElementById("stage-story-transform");
    const params = document.getElementById("stage-story-params");
    const provenance = document.getElementById("stage-story-provenance");

    if (title) title.textContent = story.title;
    if (transform) transform.textContent = story.transform;
    if (params) params.textContent = story.params;
    if (provenance) provenance.textContent = story.provenance;
  }

  function wireShowcase() {
    const kpiYield = document.getElementById("kpi-yield");
    if (kpiYield) kpiYield.textContent = "33.07%";
    const kpiMw = document.getElementById("kpi-mw");
    if (kpiMw) kpiMw.textContent = "251 kDa";
    const kpiPurity = document.getElementById("kpi-purity");
    if (kpiPurity) kpiPurity.textContent = "91.5%";
    const kpiTensile = document.getElementById("kpi-tensile");
    if (kpiTensile) kpiTensile.textContent = "29.3 – 43.1 MPa";

    updateStageStory("overview");

    const thumbBtns = document.querySelectorAll(".thumb-btn");
    const heroImg = document.getElementById("showcase-hero-img");
    thumbBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        thumbBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const src = btn.getAttribute("data-img");
        const stage = btn.getAttribute("data-stage");
        if (heroImg && src) {
          heroImg.src = src;
        }
        if (stage) {
          updateStageStory(stage);
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      wireValidateForm();
      wireShowcase();
    });
  } else {
    wireValidateForm();
    wireShowcase();
  }
})();
