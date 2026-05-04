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
  log('home: clean load', t.rows === 57 && t.visible === 57 && t.hasFilterBar && t.paletteHidden, JSON.stringify(t));
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
  log('home: ?region=china&intelligence=30-', t.visible === 8 && t.chips === 2, JSON.stringify(t));
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
  log('home: Clear all', t.chips === 0 && t.visible === 57 && t.url === '', JSON.stringify(t));
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

// ── Timeline: clean load + buttons render ────────────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline', { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => ({
    btns: Array.from(document.querySelectorAll('.dim-btn')).map(b => b.querySelector('.dim-label').textContent),
    rows: document.querySelectorAll('.tl-row').length,
  }));
  log('timeline: 4 dim buttons render', t.btns.length === 4 && t.rows > 800, JSON.stringify(t));
  await page.close();
}

// ── Timeline: panel anchored below button (Type) ────────────────────
{
  const page = await newPage();
  await page.goto('http://localhost:4321/timeline', { waitUntil: 'networkidle' });
  await page.click('.dim-wrap[data-dim-key=type] .dim-btn');
  await page.waitForFunction(() => !document.querySelector('.dim-wrap[data-dim-key=type] .dim-panel').classList.contains('hidden'));
  const pos = await page.evaluate(() => {
    const btn = document.querySelector('.dim-wrap[data-dim-key=type] .dim-btn').getBoundingClientRect();
    const panel = document.querySelector('.dim-wrap[data-dim-key=type] .dim-panel').getBoundingClientRect();
    return {
      panelX: Math.round(panel.x), btnX: Math.round(btn.x),
      panelTop: Math.round(panel.y), btnBottom: Math.round(btn.bottom),
      vw: window.innerWidth, panelRight: Math.round(panel.right),
    };
  });
  const ok = pos.panelX === pos.btnX && pos.panelTop > pos.btnBottom && pos.panelRight <= pos.vw;
  log('timeline: Type panel anchored below button', ok, JSON.stringify(pos));
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

console.log('\n--- Errors ---');
errs.forEach(e => console.log(e));
console.log(`\n${results.filter(r => r.ok).length} / ${results.length} passed`);
await browser.close();
process.exit(results.every(r => r.ok) && errs.length === 0 ? 0 : 1);
