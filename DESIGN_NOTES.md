# Design Notes

## Frontend & Responsive Design

Rationale and hard-won traps behind the rules in [AGENTS.md → Responsive & Mobile UI Conventions](./AGENTS.md#responsive--mobile-ui-conventions). Recorded during the issue #17 mobile overhaul (June 2026).

### Why tables stay tables

The home page is a *ranking* table — columnar comparison is its point — so phones get column trimming, not a card re-render. The timeline is a *feed*, so phones get stacked rows. Both restructures are pure CSS because every piece of table interactivity (sort, filter, rerank, row selection, URL state) reads row `data-*` attributes rather than visible cells. Preserving that invariant is what keeps responsive work cheap here; a card re-render would have meant duplicating the sort/filter logic.

### The sticky-table / overflow-wrapper trap

The "obvious" mobile fallback — wrap a wide table in `div { overflow-x: auto }` — silently kills `position: sticky` table headers **at every viewport width including desktop**, because the wrapper becomes the sticky element's scroll container and never scrolls vertically itself. This was caught only because an adversarial review measured it (thead at −386px after scrolling, instead of pinned at 0). The fix chosen instead: measured column-trim tiers so the table genuinely fits, plus a desktop regression test. Inner detail tables (variants, benchmark scores) are not sticky, so they *do* use scroll wrappers.

### Measure, don't estimate

Two layout plans in a row had wrong width arithmetic ("fits 360px" was off by 50px; "~1000px min-content" was actually 1072px). Computed column budgets from reading CSS are unreliable: uppercase header tracking, reserved `::after` sort-arrow slots, and font metrics all add real pixels. Plan layout changes by measuring the live page in headless Chromium (Playwright is already a devDependency; `tests/mobile-smoke.mjs` shows the pattern), and gate the result with a `scrollWidth <= innerWidth` assertion rather than a claim.

### Floating panels and bottom sheets

- Panels must be DOM descendants of a `position: relative` wrapper containing their trigger (see the comment in `FilterBar.astro`); auto-flip via `placePanel()` keeps them in-viewport on desktop.
- Below 600px, panels convert to fixed bottom sheets with a tap-to-dismiss backdrop. Scroll-to-close is desktop-only by design: on iOS the keyboard-driven focus scroll would close the sheet the moment a user tapped an input. The same iOS focus-scroll is why autofocus is desktop-only (see the AGENTS.md bullets for the rules themselves).

### Keyboard and touch

Keyboard shortcuts are power-user accelerators; most need no touch substitute because a tap already covers the goal (j/k selection vs. tapping a row). The ones that *did* need visible alternatives were the ones whose UI disappears on phones (timeline metric sorts → the sort `<select>`) or whose triggers vanish mid-page (search → sticky nav). Conversely, any global keydown handler with single-letter shortcuts must skip events whose `e.target` is a text input — the filter typeahead shipped with `a`/`n`/`i` untypeable for five weeks (since the filter unification in #36) because the handler ran All/None/Invert instead.

### Process note

The plan → adversarial-review → implement loop on issue #17 (plan posted as an issue comment, four reviewers with distinct lenses, several measuring the live site) killed two desktop regressions and one over-built design before any code was written. For layout work especially, reviewers should measure rather than reason from the CSS.

## Canonical Identifiers

We should collect canonical identifiers across APIs for models, datasets, libraries, and papers. This enables automated metrics gathering, cross-referencing, and deduplication.

### Models
- **Hugging Face**: model ID (e.g. `BAAI/bge-m3`, `deepseek-ai/DeepSeek-V3`)
- **Artificial Analysis**: provider/model slug (e.g. `deepseek/deepseek-v3`)
- **OpenRouter**: model ID
- **Together AI**: model ID

### Papers
- **arXiv**: paper ID (e.g. `2412.19437`)
- **Hugging Face Papers**: slug (e.g. `2412.19437`)
- **Semantic Scholar**: corpus ID or arXiv-based lookup
- **Google Scholar**: cluster ID

### Datasets
- **Hugging Face Datasets**: dataset ID (e.g. `BAAI/ToucHD-Force`)
- **Papers With Code**: dataset slug

### Libraries
- **GitHub**: `owner/repo` (e.g. `FlagOpen/FlagEmbedding`)
- **PyPI**: package name
- **npm**: package name
