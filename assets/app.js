/* ==========================================================================
   ScaleUp — Lovable-Style Clean Runtime Script
   Handles interactive prompt presets, showcase step switching, nav tracking,
   and Live Godot 4 WebAssembly 3D simulation integration.
   ========================================================================== */
(() => {
  "use strict";

  const PRESETS = {
    overview: {
      key: "saccharina",
      title: "🌿 Saccharina latissima Alginate Extraction",
      query: "preset=saccharina"
    },
    stage0: {
      key: "saccharina",
      title: "🌿 Saccharina latissima — Step 1: Knife Milling",
      query: "preset=saccharina"
    },
    stage2: {
      key: "saccharina",
      title: "🌿 Saccharina latissima — Step 2: Alkaline Dissolution",
      query: "preset=saccharina"
    },
    stage3: {
      key: "saccharina",
      title: "🌿 Saccharina latissima — Step 3: Spin Separation & pH Balance",
      query: "preset=saccharina"
    },
    stage4: {
      key: "saccharina",
      title: "🌿 Saccharina latissima — Step 4: Cryo-Ethanol Precipitation",
      query: "preset=saccharina"
    },
    stage5: {
      key: "saccharina",
      title: "🌿 Saccharina latissima — Step 5: Wet-Spinning & Tensile Pull",
      query: "preset=saccharina"
    },
    anatomy: {
      key: "saccharina",
      title: "🌿 Procedural Anatomy Schematic (York MSc Model)",
      query: "preset=saccharina"
    },
    "stage-insulin": {
      key: "ecoli",
      title: "🧬 E. coli Fed-Batch Fermentation (Zielinski Replay)",
      query: "preset=ecoli"
    },
    "stage-unverified": {
      key: "unverified_halt",
      title: "🧪 InsufficientEvidenceError (Scientific Integrity Guard)",
      query: "preset=unverified_halt"
    }
  };

  const SHOWCASE_DATA = {
    overview: {
      img: "assets/images/showcase/saccharina_6stage_bench_overview.png",
      caption: "Full six-stage bioprocess: tracks dried kelp through milling, acid washing, gel dissolution, spin separation, ethanol precipitation, and fibre wet-spinning.",
      metrics: [
        { text: "33.1% Yield", highlight: true },
        { text: "251 kDa Chain Length" },
        { text: "43.1 MPa Fibre Strength" },
        { text: "✓ Backed by York MSc Thesis", verified: true }
      ]
    },
    stage0: {
      img: "assets/images/showcase/stage_0_dry_milling.png",
      caption: "Step 1: Knife mill grinds 15.0 grams of dry kelp into 0.5–1.0 mm particles for uniform chemical penetration.",
      metrics: [
        { text: "15.0g Kelp", highlight: true },
        { text: "0.5–1.0 mm Cut" },
        { text: "Particle Continuity" },
        { text: "✓ Direct Protocol", verified: true }
      ]
    },
    stage2: {
      img: "assets/images/showcase/stage_2_alkaline_dissolution.png",
      caption: "Step 2: Sodium carbonate dissolves washed seaweed into thick amber gel at 50°C, extracting 33.1% pure sodium alginate.",
      metrics: [
        { text: "33.1% Yield", highlight: true },
        { text: "50°C Extraction" },
        { text: "pH 10.0 Alkaline" },
        { text: "✓ DOI Verified", verified: true }
      ]
    },
    stage3: {
      img: "assets/images/showcase/saccharina_6stage_bench_overview.png",
      caption: "Step 3: High-speed centrifugation at 4,500 rpm removes debris, followed by buffering to neutral pH 7.0.",
      metrics: [
        { text: "4,500 RPM", highlight: true },
        { text: "pH 7.0 Neutral" },
        { text: "251 kDa Length" },
        { text: "✓ Mass Conserved", verified: true }
      ]
    },
    stage4: {
      img: "assets/images/showcase/stage_4_cryo_precipitation.png",
      caption: "Step 4: Freezing ethanol at -20°C precipitates white alginate polymer strands at 91.5% uronic acid purity.",
      metrics: [
        { text: "91.5% Purity", highlight: true },
        { text: "-20°C Ethanol" },
        { text: "1:1 Solvent Ratio" },
        { text: "✓ HPLC Validated", verified: true }
      ]
    },
    stage5: {
      img: "assets/images/showcase/stage_5_wet_spinning_tensile.png",
      caption: "Step 5: Wet-spinning through a 65 µm needle into calcium chloride bath produces strong fibres rated up to 43.1 MPa.",
      metrics: [
        { text: "43.1 MPa Strength", highlight: true },
        { text: "65 µm Filament" },
        { text: "Instron Pull-Tested" },
        { text: "✓ ISO-527 Verified", verified: true }
      ]
    },
    anatomy: {
      img: "assets/images/showcase/active_anatomy_blueprint.svg",
      caption: "2D Flow Diagram: Procedural Anatomy P&ID schematic mapping every vessel, valve, and stream with zero mass loss.",
      metrics: [
        { text: "Six Vessels", highlight: true },
        { text: "Closed Piping" },
        { text: "Mass Continuity" },
        { text: "✓ Anatomy Engine", verified: true }
      ]
    },
    "stage-insulin": {
      img: "assets/images/replay3d.png",
      caption: "E. coli Fermentation Replay: Zielinski fed-batch microbial run with dissolved oxygen tracking and cybernetic cell growth.",
      metrics: [
        { text: "Human Insulin", highlight: true },
        { text: "Dissolved Oxygen" },
        { text: "BL21 Strain" },
        { text: "✓ Zielinski et al.", verified: true }
      ]
    },
    "stage-unverified": {
      img: "assets/images/composition.png",
      caption: "Fail-Closed Protocol: Missing dissolution kinetic constants halt execution with InsufficientEvidenceError rather than guessing.",
      metrics: [
        { text: "Safe-Halt Active", highlight: true },
        { text: "No Guesswork" },
        { text: "Auto-Searching Gaps" },
        { text: "✓ Zero Hallucinations", verified: true }
      ]
    }
  };

  let currentPresetKey = "saccharina";
  let isShowcaseLiveActive = false;

  function notifyIframePreset(iframe, presetKey) {
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage({ preset: presetKey }, "*");
      if (typeof iframe.contentWindow.scaleupSwitchPreset === "function") {
        iframe.contentWindow.scaleupSwitchPreset(presetKey);
      }
    } catch {
      // Cross-origin fallback if applicable
    }
  }

  function setStage(key) {
    const data = SHOWCASE_DATA[key] || SHOWCASE_DATA.overview;
    const heroImg = document.getElementById("showcase-hero-img");
    const caption = document.getElementById("showcase-caption");
    const pill1 = document.getElementById("pill-metric-1");
    const pill2 = document.getElementById("pill-metric-2");
    const pill3 = document.getElementById("pill-metric-3");
    const pill4 = document.getElementById("pill-metric-4");

    if (heroImg && data.img) {
      heroImg.src = data.img;
    }
    if (caption && data.caption) {
      caption.textContent = data.caption;
    }
    if (data.metrics && data.metrics.length >= 4) {
      const pills = [pill1, pill2, pill3, pill4];
      data.metrics.forEach((m, idx) => {
        if (pills[idx]) {
          pills[idx].textContent = m.text;
          pills[idx].className = "metric-pill" + (m.highlight ? " highlight" : "") + (m.verified ? " verified" : "");
        }
      });
    }

    // Update active state in step pills
    const pills = document.querySelectorAll(".step-pill");
    pills.forEach((p) => {
      if (p.getAttribute("data-stage") === key) {
        p.classList.add("active");
        p.setAttribute("aria-selected", "true");
      } else {
        p.classList.remove("active");
        p.setAttribute("aria-selected", "false");
      }
    });

    const presetInfo = PRESETS[key] || PRESETS.overview;
    currentPresetKey = presetInfo.key;

    // Notify any active live iframe
    const showcaseIframe = document.getElementById("showcase-live-iframe");
    if (isShowcaseLiveActive && showcaseIframe) {
      notifyIframePreset(showcaseIframe, currentPresetKey);
    }

    const modal = document.getElementById("sim-modal");
    const modalIframe = document.getElementById("modal-live-iframe");
    if (modal && modal.style.display !== "none" && modalIframe) {
      const modalTitle = document.getElementById("modal-preset-title");
      if (modalTitle) modalTitle.textContent = presetInfo.title;
      const directBtn = document.getElementById("btn-modal-direct");
      if (directBtn) directBtn.href = "simulator/live/index.html?" + presetInfo.query;
      notifyIframePreset(modalIframe, currentPresetKey);
    }
  }

  function openSimModal(presetKey) {
    const modal = document.getElementById("sim-modal");
    const modalIframe = document.getElementById("modal-live-iframe");
    const modalTitle = document.getElementById("modal-preset-title");
    const directBtn = document.getElementById("btn-modal-direct");
    if (!modal || !modalIframe) return;

    const presetObj = Object.values(PRESETS).find((p) => p.key === presetKey) || PRESETS.overview;
    if (modalTitle) modalTitle.textContent = presetObj.title;
    if (directBtn) directBtn.href = "simulator/live/index.html?" + presetObj.query;

    modalIframe.src = "simulator/live/index.html?" + presetObj.query;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeSimModal() {
    const modal = document.getElementById("sim-modal");
    const modalIframe = document.getElementById("modal-live-iframe");
    if (!modal) return;

    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (modalIframe) {
      modalIframe.src = "about:blank";
    }
  }

  function toggleShowcaseLive(presetKey) {
    const heroImg = document.getElementById("showcase-hero-img");
    const embedContainer = document.getElementById("live-embed-container");
    const iframe = document.getElementById("showcase-live-iframe");
    const btn = document.getElementById("btn-launch-live");
    if (!embedContainer || !iframe || !btn) return;

    const presetObj = Object.values(PRESETS).find((p) => p.key === presetKey) || PRESETS.overview;

    if (!isShowcaseLiveActive) {
      isShowcaseLiveActive = true;
      if (heroImg) heroImg.style.display = "none";
      embedContainer.style.display = "block";
      iframe.src = "simulator/live/index.html?" + presetObj.query;
      btn.textContent = "✕ Return to Static Screenshots";
    } else {
      isShowcaseLiveActive = false;
      embedContainer.style.display = "none";
      if (heroImg) heroImg.style.display = "block";
      iframe.src = "about:blank";
      btn.textContent = "▶ Open Live 3D Workbench";
    }
  }

  function wireLiveSimulation() {
    const btnSimulateHero = document.getElementById("btn-simulate-3d");
    if (btnSimulateHero) {
      btnSimulateHero.addEventListener("click", (e) => {
        e.preventDefault();
        openSimModal(currentPresetKey);
      });
    }

    const btnLaunchLive = document.getElementById("btn-launch-live");
    if (btnLaunchLive) {
      btnLaunchLive.addEventListener("click", () => {
        toggleShowcaseLive(currentPresetKey);
      });
    }

    const btnCloseModal = document.getElementById("btn-close-modal");
    if (btnCloseModal) {
      btnCloseModal.addEventListener("click", closeSimModal);
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeSimModal();
      }
    });
  }

  function wireShowcase() {
    const pills = document.querySelectorAll(".step-pill");
    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        const stage = pill.getAttribute("data-stage");
        if (stage) setStage(stage);
      });
    });
  }

  function wirePromptBox() {
    const textarea = document.getElementById("prompt-input");
    const chips = document.querySelectorAll(".prompt-chip");
    const statusText = document.getElementById("prompt-status-text");

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");

        const prompt = chip.getAttribute("data-prompt");
        const stage = chip.getAttribute("data-stage");

        if (textarea && prompt) {
          textarea.value = prompt;
        }

        if (statusText) {
          if (stage === "stage-unverified") {
            statusText.textContent = "Safe-Halt triggered · Missing kinetic data flagged";
          } else {
            statusText.textContent = "Zero hallucinated science · Citation locked";
          }
        }

        if (stage) {
          setStage(stage);
        }
      });
    });
  }

  function wireNavTracking() {
    const links = document.querySelectorAll(".nav-menu a[href^='#']");
    if (!links.length || typeof IntersectionObserver !== "function") return;

    const sections = Array.from(links)
      .map((a) => document.getElementById(a.getAttribute("href").slice(1)))
      .filter(Boolean);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            links.forEach((a) => {
              if (a.getAttribute("href") === `#${id}`) {
                a.setAttribute("aria-current", "true");
              } else {
                a.removeAttribute("aria-current");
              }
            });
          }
        });
      },
      { rootMargin: "-80px 0px -50% 0px", threshold: 0.1 }
    );

    sections.forEach((s) => observer.observe(s));
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireShowcase();
    wirePromptBox();
    wireLiveSimulation();
    wireNavTracking();
  });
})();
