---
name: ui-change
description: Change, fix, or review layouts, components, interaction behavior, or styles on labindex.ai. Use for responsive work, overflow bugs, table columns, filters, navigation, accessibility, and any UI change that needs measurement plus both smoke suites.
---

# Make a UI / Layout Change

## 1. Read the conventions first

- [AGENTS.md → Responsive & Mobile UI Conventions](../../../AGENTS.md) — the normative rules (600px phone breakpoint, data-* driven tables, `.kbd-only`, 16px inputs on touch, no autofocus on mobile, the sticky-table/overflow-wrapper trap).
- [DESIGN_NOTES.md → Frontend & Responsive Design](../../../DESIGN_NOTES.md) — why each rule exists and the traps that motivated it.

## 2. Plan with measurements, not arithmetic

Width estimates from reading CSS have been wrong repeatedly (uppercase tracking, reserved `::after` slots, font metrics). With the dev server running (`npm run dev`), measure the real thing:

```js
// node - <<'EOF' style scratch script; Playwright is a devDependency
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 375, height: 720 } })).newPage();
await p.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
console.log(await p.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,   // > innerWidth ⇒ horizontal scroll
  innerW: window.innerWidth,
})));
await b.close();
EOF
```

To find *what* overflows, iterate `document.querySelectorAll('*')` and report elements whose `getBoundingClientRect().right` exceeds the viewport.

For non-trivial layout changes, prepare a written plan and get an adversarial review that measures rather than estimates. File or comment on a GitHub issue only when the user has authorized that external write.

## 3. Implement within the conventions

Checklist while editing:

- New media queries at **600px** for phone behavior (1176/880/720px are home-table trim tiers, and the 600px phone tier itself also trims the rank column; 768px is the timeline metric tier). No new nearby breakpoints.
- New home-table columns: `data-*` attribute + sort wiring **and** a trim-tier assignment.
- Anything keyboard-only that renders on screen gets `class="kbd-only"`.
- New text inputs: 16px font under `@media (pointer: coarse)`; never autofocus when `isMobile()`.
- Touch targets for small controls: pad inside `@media (pointer: coarse)`; a control at the container's right edge must not get right padding that paints past the viewport.
- Do not wrap sticky-header tables in overflow containers.

## 4. Verify

```bash
npm run dev          # in one shell
npm run test:filter  # filter UI behavior, desktop + mobile sheet
npm run test:mobile  # no h-overflow at phone-through-desktop widths, desktop guards
```

Then eyeball it: screenshot the changed pages at 375×720 (and 1280×800 for desktop regressions) with Playwright and actually look at them — the suites catch overflow and broken behavior, not ugly.

Extend `tests/mobile-smoke.mjs` when adding new UI surface. Keep assertions **structural** (overflow, visibility, element-in-viewport) and discover test pages dynamically — never pin data counts or slugs that break on routine data commits.

## 5. Ship

```bash
npm run validate && npm run build   # build must pass before committing
git add -A && git commit -m "..."
```

Do **not** push or deploy without explicit approval — see AGENTS.md Important Notes. The deploy recipe (build *after* commit, then wrangler) is in AGENTS.md → Deployment.
