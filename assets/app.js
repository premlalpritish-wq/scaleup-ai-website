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
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireValidateForm);
  } else {
    wireValidateForm();
  }
})();