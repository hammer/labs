import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const errs = [];

async function newPage(viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`${page.url()}: ${e.message}`));
  return page;
}

const results = [];
function log(name, ok, detail = '') {
  const status = ok ? '✓' : '✗';
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ''}`);
  results.push({ name, ok, detail });
}

// ── Home: clean load ─────────────────────────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => ({
    rows: document.querySelectorAll('.lab-row').length,
    visible: Array.from(document.querySelectorAll('.lab-row')).filter(r => r.style.display !== 'none').length,
    hasFilterBar: !!document.querySelector('.filter-bar .palette-btn'),
    paletteHidden: document.querySelector('.palette-panel').classList.contains('hidden'),
  }));
  log('home: clean load', t.rows === 58 && t.visible === 58 && t.hasFilterBar && t.paletteHidden, JSON.stringify(t));
  await page.close();
}

// ── Home: URL filter ─────────────────────────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/?region=china&intelligence=30-', { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => ({
    visible: Array.from(document.querySelectorAll('.lab-row')).filter(r => r.style.display !== 'none').length,
    chips: document.querySelectorAll('.filter-chip').length,
    countText: document.querySelector('.filter-count').textContent,
  }));
  log('home: ?region=china&intelligence=30-', t.visible === 9 && t.chips === 2, JSON.stringify(t));
  await page.close();
}

// ── Home: f opens palette, position is below button ──────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  const pos = await page.evaluate(() => {
    const btn = document.querySelector('.palette-btn').getBoundingClientRect();
    const panel = document.querySelector('.palette-panel').getBoundingClientRect();
    return {
      btnX: Math.round(btn.x), btnBottom: Math.round(btn.bottom),
      panelX: Math.round(panel.x), panelTop: Math.round(panel.y),
      panelRight: Math.round(panel.right), vw: window.innerWidth,
    };
  });
  const ok = pos.panelX === pos.btnX && pos.panelTop > pos.btnBottom && pos.panelRight <= pos.vw - 0;
  log('home: palette anchored below button', ok, JSON.stringify(pos));
  await page.close();
}

// ── Home: Esc closes palette ─────────────────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('.palette-panel').classList.contains('hidden'));
  log('home: Esc closes palette', true);
  await page.close();
}

// ── Home: pick Region → China, verify URL + visible count ───────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  await page.keyboard.type('reg');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.value-multi-list');
  await page.click('.value-multi-row[data-slug=china] input[type=checkbox]');
  await page.waitForTimeout(100);
  const t = await page.evaluate(() => ({
    url: window.location.search,
    visible: Array.from(document.querySelectorAll('.lab-row')).filter(r => r.style.display !== 'none').length,
  }));
  log('home: select region=china', t.url === '?region=china' && t.visible === 24, JSON.stringify(t));
  await page.close();
}

// ── Home: only-link selects single value ─────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  await page.keyboard.type('reg');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.value-multi-list');
  // Check 3 first
  await page.click('.value-multi-row[data-slug=china] input[type=checkbox]');
  await page.click('.value-multi-row[data-slug=usa] input[type=checkbox]');
  // Now click only on Korea
  await page.click('.value-multi-row[data-slug=korea] .value-only');
  await page.waitForTimeout(100);
  const t = await page.evaluate(() => window.location.search);
  log('home: only-link selects single value', t === '?region=korea', t);
  await page.close();
}

// ── Home: All / None / Invert ────────────────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  await page.keyboard.type('reg');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.value-multi-list');
  await page.click('.vmt-btn[data-op=all]');
  await page.waitForTimeout(100);
  const allChecked = await page.evaluate(() => {
    const cbs = document.querySelectorAll('.value-multi-row input[type=checkbox]');
    return Array.from(cbs).every(c => c.checked);
  });
  log('home: All button checks every option', allChecked);
  await page.click('.vmt-btn[data-op=none]');
  await page.waitForTimeout(100);
  const noneChecked = await page.evaluate(() => {
    const cbs = document.querySelectorAll('.value-multi-row input[type=checkbox]');
    return Array.from(cbs).every(c => !c.checked);
  });
  log('home: None button clears every option', noneChecked);
  await page.close();
}

// ── Home: chip × removes filter ──────────────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/?region=china,korea&type=public', { waitUntil: 'networkidle' });
  const before = await page.evaluate(() => document.querySelectorAll('.filter-chip').length);
  await page.click('.chip-x[data-dim-key=type]');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({
    chips: document.querySelectorAll('.filter-chip').length,
    url: window.location.search,
  }));
  log('home: chip × removes its filter', before === 2 && after.chips === 1 && !after.url.includes('type=') && after.url.includes('region=china'), JSON.stringify(after));
  await page.close();
}

// ── Home: Clear all ──────────────────────────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/?region=china', { waitUntil: 'networkidle' });
  await page.click('.clear-all');
  await page.waitForTimeout(100);
  const t = await page.evaluate(() => ({
    chips: document.querySelectorAll('.filter-chip').length,
    visible: Array.from(document.querySelectorAll('.lab-row')).filter(r => r.style.display !== 'none').length,
    url: window.location.search,
  }));
  log('home: Clear all', t.chips === 0 && t.visible === 58 && t.url === '', JSON.stringify(t));
  await page.close();
}

// ── Home: j/k after filtering ────────────────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/?region=korea', { waitUntil: 'networkidle' });
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  const t = await page.evaluate(() => {
    const sel = document.querySelector('.lab-row.selected');
    return { name: sel?.dataset.name, hidden: sel?.style.display === 'none' };
  });
  log('home: j/k respects filter', !t.hidden && t.name, JSON.stringify(t));
  await page.close();
}

// ── Timeline: clean load, palette mode, scoped dims hidden ───────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline', { waitUntil: 'networkidle' });
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  const t = await page.evaluate(() => ({
    rows: document.querySelectorAll('.tl-row').length,
    dims: Array.from(document.querySelectorAll('.dim-item .dim-item-label')).map(e => e.textContent),
    attrColHidden: getComputedStyle(document.querySelector('th.col-attr')).display === 'none',
  }));
  const ok = t.rows > 800 && t.dims.length === 4 && t.attrColHidden;
  log('timeline: palette lists 4 dims, scoped dims hidden, attr column hidden', ok, JSON.stringify({ ...t, dims: t.dims.length }));
  await page.close();
}

// ── Timeline: type=model reveals scoped dims in the palette ──────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline?type=model', { waitUntil: 'networkidle' });
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  const t = await page.evaluate(() => ({
    dims: Array.from(document.querySelectorAll('.dim-item .dim-item-label')).map(e => e.textContent),
  }));
  const ok = t.dims.length === 11 && t.dims.includes('Architecture') && t.dims.includes('Active params');
  log('timeline: type=model reveals scoped dims', ok, JSON.stringify(t.dims));
  await page.close();
}

// ── Timeline: ?type=model&arch=moe round-trip ────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline?type=model&arch=moe', { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  const t = await page.evaluate(() => {
    const visible = Array.from(document.querySelectorAll('.tl-row')).filter(r => r.style.display !== 'none');
    return {
      visible: visible.length,
      allMoe: visible.every(r => (r.dataset.arch || '').split(',').includes('moe')),
      url: window.location.search,
      chips: document.querySelectorAll('.filter-chip').length,
    };
  });
  const ok = t.visible > 0 && t.allMoe && t.url.includes('arch=moe') && t.chips === 2;
  log('timeline: ?type=model&arch=moe filters to MoE rows', ok, JSON.stringify(t));
  await page.close();
}

// ── Timeline: bare ?arch=moe is suspended (never filters invisibly) ──
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline?arch=moe', { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  const t = await page.evaluate(() => ({
    total: document.querySelectorAll('.tl-row').length,
    visible: Array.from(document.querySelectorAll('.tl-row')).filter(r => r.style.display !== 'none').length,
    chips: document.querySelectorAll('.filter-chip').length,
  }));
  const ok = t.visible === t.total && t.chips === 0;
  log('timeline: bare ?arch=moe does not filter (suspended out of scope)', ok, JSON.stringify(t));
  await page.close();
}

// ── Timeline: scoped state suspends on type-widen, restores on re-narrow ──
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline?type=model&arch=moe', { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  const narrowed = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tl-row')).filter(r => r.style.display !== 'none').length);
  // Widen the type filter: model + paper → arch goes out of scope.
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  await page.keyboard.type('type');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.value-multi-list');
  await page.click('.value-multi-row[data-slug=paper] input[type=checkbox]');
  await page.waitForTimeout(150);
  const widened = await page.evaluate(() => ({
    visible: Array.from(document.querySelectorAll('.tl-row')).filter(r => r.style.display !== 'none').length,
    archInUrl: window.location.search.includes('arch='),
  }));
  // Re-narrow to model only → arch=moe springs back.
  await page.click('.value-multi-row[data-slug=paper] input[type=checkbox]');
  await page.waitForTimeout(150);
  const restored = await page.evaluate(() => ({
    visible: Array.from(document.querySelectorAll('.tl-row')).filter(r => r.style.display !== 'none').length,
    archInUrl: window.location.search.includes('arch=moe'),
  }));
  const ok = !widened.archInUrl && widened.visible > narrowed
    && restored.archInUrl && restored.visible === narrowed;
  log('timeline: scoped filter suspends on widen, restores on re-narrow', ok,
    JSON.stringify({ narrowed, widened, restored }));
  await page.close();
}

// ── Timeline: model sort via select fills the attribute column ───────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline?type=model', { waitUntil: 'networkidle' });
  await page.selectOption('#sort-select', 'aparams');
  await page.waitForTimeout(150);
  const t = await page.evaluate(() => {
    const ranked = Array.from(document.querySelectorAll('.tl-row'))
      .filter(r => r.style.display !== 'none' && r.dataset.aparams)
      .slice(0, 3)
      .map(r => Number(r.dataset.aparams));
    const th = document.querySelector('th.col-attr');
    const firstCell = Array.from(document.querySelectorAll('.tl-row'))
      .find(r => r.style.display !== 'none' && r.dataset.aparams)
      ?.querySelector('td.col-attr');
    return {
      ranked,
      desc: ranked.every((v, i) => i === 0 || ranked[i - 1] >= v),
      thVisible: getComputedStyle(th).display !== 'none',
      thLabel: th.querySelector('.attr-label').textContent,
      arrowActive: th.querySelector('.sort-arrow').classList.contains('active-desc'),
      cellText: firstCell?.textContent ?? '',
      attrKey: document.getElementById('timeline-table').dataset.attrKey,
    };
  });
  const ok = t.ranked.length === 3 && t.desc && t.thVisible && t.thLabel === 'Active'
    && t.arrowActive && t.cellText.includes('B') && t.attrKey === 'aparams';
  log('timeline: sort by active params fills attribute column', ok, JSON.stringify(t));

  // Header click toggles to ascending — direction must be reachable.
  await page.click('th.col-attr');
  await page.waitForTimeout(150);
  const asc = await page.evaluate(() => {
    const ranked = Array.from(document.querySelectorAll('.tl-row'))
      .filter(r => r.style.display !== 'none' && r.dataset.aparams)
      .slice(0, 3)
      .map(r => Number(r.dataset.aparams));
    return { ranked, asc: ranked.every((v, i) => i === 0 || ranked[i - 1] <= v), url: window.location.search };
  });
  log('timeline: attr column header click flips to ascending', asc.asc && asc.url.includes('asc=1'), JSON.stringify(asc));
  await page.close();
}

// ── Timeline: filter change preserves ?sort (non-destructive URL sync) ──
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline?type=model&sort=aparams', { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  await page.keyboard.type('arch');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.value-multi-list');
  await page.click('.value-multi-row[data-slug=moe] input[type=checkbox]');
  await page.waitForTimeout(150);
  const t = await page.evaluate(() => window.location.search);
  const ok = t.includes('sort=aparams') && t.includes('arch=moe') && t.includes('type=model');
  log('timeline: toggling a filter preserves ?sort in the URL', ok, t);
  await page.close();
}

// ── Timeline: range panel shows the coverage hint ─────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline?type=model', { waitUntil: 'networkidle' });
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  await page.keyboard.type('training');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.value-range');
  const hint = await page.evaluate(() => document.querySelector('.value-hint')?.textContent ?? '');
  const ok = /Data: \d+ of \d+ model rows/.test(hint);
  log('timeline: tokens range panel shows coverage hint', ok, hint);
  await page.close();
}

// ── Lab page: filter bar + URL sync ──────────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/labs/openai', { waitUntil: 'networkidle' });
  const before = await page.evaluate(() => Array.from(document.querySelectorAll('.output-item')).filter(i => i.style.display !== 'none').length);
  await page.click('.dim-wrap[data-dim-key=type] .dim-btn');
  await page.waitForSelector('.value-multi-list');
  await page.click('.value-multi-row[data-slug=model] input[type=checkbox]');
  await page.waitForTimeout(100);
  const t = await page.evaluate(() => ({
    visible: Array.from(document.querySelectorAll('.output-item')).filter(i => i.style.display !== 'none').length,
    url: window.location.search,
  }));
  log('lab: filter applies + URL syncs', t.url === '?type=model' && t.visible < before, JSON.stringify({ before, ...t }));
  await page.close();
}

// ── Mobile: palette becomes bottom sheet ─────────────────────────────
{
  const page = await newPage({ width: 375, height: 667 });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.click('.palette-btn');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  const pos = await page.evaluate(() => {
    const r = document.querySelector('.palette-panel').getBoundingClientRect();
    const bd = document.querySelector('.filter-backdrop');
    return {
      x: Math.round(r.x), right: Math.round(r.right), vw: window.innerWidth,
      backdropVisible: bd && !bd.classList.contains('hidden'),
    };
  });
  const ok = pos.x === 0 && pos.right === pos.vw && pos.backdropVisible;
  log('mobile: palette becomes full-width sheet + backdrop', ok, JSON.stringify(pos));
  await page.close();
}

// ── Mobile: does NOT auto-focus the search input ─────────────────────
// iOS Safari scrolls the page to bring a focused input into view *before*
// the just-revealed bottom-sheet finishes laying out. That scroll then
// trips the scroll-close handler and the panel closes the same tick it
// opened. Fix: skip auto-focus on mobile so the soft keyboard doesn't
// pop up, and the page doesn't scroll.
{
  const page = await newPage({ width: 375, height: 667 });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.click('.palette-btn');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  const t = await page.evaluate(() => ({
    focusedTag: document.activeElement?.tagName,
    focusedClass: document.activeElement?.className,
    panelOpen: !document.querySelector('.palette-panel').classList.contains('hidden'),
  }));
  const ok = t.focusedTag !== 'INPUT' && !String(t.focusedClass).includes('palette-input') && t.panelOpen;
  log('mobile: palette open without auto-focusing the search input', ok, JSON.stringify(t));
  await page.close();
}

// ── Mobile: programmatic scroll does NOT close the palette ───────────
// Simulates iOS Safari auto-scrolling the page when the soft keyboard
// would appear. On mobile, scroll-close should be disabled — the
// backdrop handles outside-tap dismiss instead.
{
  const page = await newPage({ width: 375, height: 667 });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.click('.palette-btn');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  // Simulate a 200px scroll like an iOS keyboard-driven scroll would do
  await page.evaluate(() => {
    document.documentElement.style.height = '4000px';
    window.scrollTo({ top: 200, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
  await page.waitForTimeout(150);
  const t = await page.evaluate(() => ({
    panelOpen: !document.querySelector('.palette-panel').classList.contains('hidden'),
    backdropVisible: !document.querySelector('.filter-backdrop').classList.contains('hidden'),
  }));
  const ok = t.panelOpen && t.backdropVisible;
  log('mobile: 200px scroll does NOT close palette (no scroll-close on mobile)', ok, JSON.stringify(t));
  await page.close();
}

// ── Mobile: backdrop tap closes palette ──────────────────────────────
{
  const page = await newPage({ width: 375, height: 667 });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.click('.palette-btn');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  await page.click('.filter-backdrop');
  await page.waitForTimeout(100);
  const t = await page.evaluate(() => ({
    panelOpen: !document.querySelector('.palette-panel').classList.contains('hidden'),
    backdropVisible: !document.querySelector('.filter-backdrop').classList.contains('hidden'),
  }));
  const ok = !t.panelOpen && !t.backdropVisible;
  log('mobile: backdrop tap closes palette', ok, JSON.stringify(t));
  await page.close();
}

// ── Mobile: panel sits within viewport after open ────────────────────
// Anti-regression for the "page scrolls down but nothing pops up" report.
{
  const page = await newPage({ width: 375, height: 667 });
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.click('.palette-btn');
  await page.waitForFunction(() => !document.querySelector('.palette-panel').classList.contains('hidden'));
  await page.waitForTimeout(250);  // let any iOS-style scroll-into-view race fire
  const t = await page.evaluate(() => {
    const r = document.querySelector('.palette-panel').getBoundingClientRect();
    return {
      panelOpen: !document.querySelector('.palette-panel').classList.contains('hidden'),
      panelTop: Math.round(r.top), panelBottom: Math.round(r.bottom),
      vh: window.innerHeight, scrollY: Math.round(window.scrollY),
    };
  });
  // Panel must still be open, bottom at viewport bottom, top within viewport.
  const ok = t.panelOpen && t.panelTop >= 0 && t.panelTop < t.vh && t.panelBottom === t.vh && t.scrollY === 0;
  log('mobile: panel within viewport + no page scroll after open', ok, JSON.stringify(t));
  await page.close();
}

console.log('\n--- Errors ---');
errs.forEach(e => console.log(e));
console.log(`\n${results.filter(r => r.ok).length} / ${results.length} passed`);
await browser.close();
process.exit(results.every(r => r.ok) && errs.length === 0 ? 0 : 1);
