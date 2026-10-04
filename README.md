# ScaleUp AI

> ScaleUp AI turns scientific literature into structured, machine-readable
> process knowledge.

This repository is the source for the **ScaleUp AI website (Website V1)**. It
is a static site: no backend, no build step, no framework, no runtime
dependency.

## What the website demonstrates

The page walks a real scientific paper through the ScaleUp AI extraction
pipeline and shows the result at every stage:

1. **Paper** — the source PDF read with page-preserving text
2. **Extraction** — page-bounded chunks, with the reassembly round-trip verified
3. **ProcessState** — the typed, deliberately partial structured record
4. **ProcessGraph** — operations, material states and typed relations
5. **Evidence** — every value traced to a source, a page and an excerpt
6. **Uncertainty** — what is ambiguous, contradictory, or not reported

You can filter the extracted fields, click any field to see the exact excerpt
it came from, and inspect the process graph node by node. A final section
publishes the recorded live-provider validation runs, including the ones that
failed.

The reference artifact is a single paper: Zieliński et al. (2019),
*Process Biochemistry*, DOI 10.1016/j.pep.2019.02.002.

## This is Website V1

It is a demonstrable prototype, not a product surface. Specifically:

- The demo data is a **deterministic reference fixture** — facts manually
  verified against the bundled PDF, then passed through the real extraction and
  evidence-validation code. It is not a live model response, and the site says
  so where the walkthrough begins.
- The **process graph is a separately audited representation**. The extraction
  path does not yet attach a graph to `ProcessState` automatically, and
  figure-arrow geometry is not verified by a text validator.
- **Live extraction does not currently pass validation end-to-end** on this
  paper. Those failures are published rather than hidden.
- No accuracy, precision or recall figure is claimed. Validation results come
  from one paper, one model, a 12-run sample.
- The steps after *Understand* in *Understand → Model → Simulate → Optimize →
  Scale* are research direction, not shipped capability.
- No customers, funding, partnerships, deployment or traction is claimed.

## Run it locally

```powershell
# simplest: open the file directly
start index.html
```

Or serve it over HTTP, which is what you want before sending a link to anyone:

```powershell
python -m http.server 8811
# → http://127.0.0.1:8811
```

The site works from `file://` because the exporter writes the data payload a
second time as a plain script, which `fetch()` cannot reach on a `file://`
origin. Over HTTP the JSON is used.

## Public deployment

Hosted with **GitHub Pages**, serving this repository's `main` branch root
directly. There is no build step, so there is nothing to configure beyond
enabling Pages for the branch:

**Settings → Pages → Build and deployment → Source: Deploy from a branch →
Branch: `main`, folder: `/ (root)`**

All asset and data references are relative (`assets/…`, `data/…`), so the site
serves correctly from a project-path URL such as
`https://<owner>.github.io/scaleup-ai-website/` with no base-path
configuration.

Deploying a change is a `git push` to `main`. Pages rebuilds automatically.

## Where the data comes from

`data/scaleup_data.json` and `data/scaleup_data.js` are **generated, not
hand-written**. They are produced by `scripts/export_website_data.py`, which
lives in the separate ScaleUp AI scientific pipeline repository — it is not
part of this one, and this website is not what generates the science.

The exporter imports the real schemas, the verified paper fixture, the process
graph fixture, the reconciliation sidecar and the committed validation
diagnostics, runs the real extraction path against the source PDF, and writes
the result here. It retypes nothing, so the page cannot drift from what the
pipeline actually produces.

Regenerating requires that repository:

```powershell
python scripts\export_website_data.py --with-tests        # in the pipeline repo
```

Add `--out <dir>` to target a different folder, and drop `--with-tests` to skip
the pytest run. The exported paths are reduced to bare filenames so no local
directory layout reaches a public payload.

**After changing the pipeline or the fixture, re-run the exporter.** The site
will not notice on its own, and a stale data file is the fastest way to publish
something the code no longer supports.

## Tests

```powershell
npm install     # jsdom only, for the headless checks
npm test
```

Three suites, 142 assertions, all exiting non-zero on failure so they can gate a
deploy.

- **`tests/check.js` - render and claims (101).** Loads `index.html` and
  `app.js` in jsdom against the real data file and asserts that every panel
  renders real content, that filtering and field→evidence inspection work, that
  the graph draws the expected counts, that accessibility basics hold, that
  future capabilities stay labelled as research, and that **no forbidden claim**
  (customers, funding, partnerships, accuracy percentages, industrial
  validation, …) appears anywhere unless it sits inside an explicit disclaimer.
- **`tests/responsive.js` - layout and touch (28).** Catches fixed widths that
  would force horizontal page scroll, a workbench that fails to collapse, a
  graph that escapes its scroll container, missing phone/tablet breakpoints,
  `prefers-reduced-motion` being ignored, hard-coded counts in prose, and an
  anchor offset applied twice.
- **`tests/safety.js` — injection (13).** Poisons every excerpt, label and value
  with `<img src=x onerror=…>` and a `</pre><script>` break-out, then asserts
  nothing executes and the payload stays literal text.

jsdom does not perform layout, so none of these substitute for opening the page
in a real browser on a real phone.

## Design system

Three things are worth knowing before editing the stylesheet:

- **One type ramp.** Every text rule resolves to a `--fs-*` token in `:root`
  (`--fs-micro` machine labels, `--fs-cap` captions, `--fs-sm` card body,
  `--fs-base` body, `--fs-lg` readouts, `--fs-h1`…`--fs-h4` headings). The only
  deliberate exceptions are `.nav-links a`, whose 0.79rem is the size that fits
  all nine items in the bar without scrolling, and the SVG-internal graph label
  sizes, which belong to the diagram rather than the page. Adding a raw
  `font-size` outside a token is what produced the 37-size pile-up this replaced.
- **One font family.** `--sans` prefers Inter and otherwise uses the platform UI
  font. There is no webfont request, so the page renders identically offline and
  over `file://`.
- **One anchor offset.** `--anchor-offset` is applied as `scroll-padding-top` on
  the scroll container and is read back by the nav tracker in `app.js`, so the
  resting position of a clicked heading and the active-section highlight can
  never disagree. Do **not** also set `scroll-margin-top` on `section`: the two
  offsets add and every anchor would land at twice the intended clearance.

The active-section indicator reuses the accent treatment already used by the
stepper tabs and the workbench list: accent-coloured label plus a 2px accent
rule, drawn with `::after` so it adds no width to the item.

## Layout

```text
index.html              structure and all static copy
assets/styles.css       design system
assets/app.js           data binding, graph layout, interactions
data/scaleup_data.json  generated — do not edit
data/scaleup_data.js    generated — do not edit
tests/                  headless render, responsive and safety checks
```

## Known limitations

- The reference artifact is a single paper. A second paper needs a second
  fixture in the pipeline, then a re-export.
- The graph layout is a hand-written layered layout in `computeLayout()`
  (`assets/app.js`). It assumes a mostly-linear `precedes` chain with material
  states branching off it, which fits this paper; a densely branching process
  would need a real layout pass.
- The graph scrolls horizontally on narrow viewports rather than reflowing.
- Search filters by substring only. No facets, no stemming.
- No analytics and no cookie banner.
- Excerpt text is shown verbatim from the fixture. Excerpts are short factual
  sentences from a published paper, used here to demonstrate traceability. If a
  future fixture carries larger passages, review that before publishing.
