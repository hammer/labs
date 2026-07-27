// Mobile/responsive smoke tests. Structural assertions only — no pinned
// data counts, and test pages are discovered dynamically where possible,
// so routine data commits don't break this file.
//
// Run with the dev server up:  npm run dev  &  node tests/mobile-smoke.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const browser = await chromium.launch({ headless: true });
const errs = [];

async function newPage(viewport = { width: 375, height: 667 }) {
  const ctx = await browser.newContext({ viewport, hasTouch: true });
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

async function overflowAt(page) {
  return page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
}

// Chromium occasionally crashes a tab under rapid navigation; retry once
// on a fresh page rather than failing the whole suite.
async function goVisit(page, viewport, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    return page;
  } catch {
    try { await page.close(); } catch {}
    const fresh = await newPage(viewport);
    await fresh.goto(url, { waitUntil: 'networkidle' });
    return fresh;
  }
}

// ── Discover representative pages dynamically ─────────────────────────
const discover = await newPage({ width: 1280, height: 800 });
await discover.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const labHref = await discover.evaluate(() =>
  document.querySelector('.lab-row')?.dataset.href ?? '/labs/anthropic');
await discover.goto(`${BASE}/timeline`, { waitUntil: 'networkidle' });
const outputHref = await discover.evaluate(() =>
  Array.from(document.querySelectorAll('.tl-row'))
    .map(r => r.dataset.href)
    .find(h => h && h.startsWith('/outputs/')) ?? null);
await discover.close();

const pages = ['/', '/timeline', labHref, '/whats-new'];
if (outputHref) pages.push(outputHref);
// The one historically-broken output page (long raw URL in notes); keep it
// in the matrix while it exists.
const mimo = await fetch(`${BASE}/outputs/xiaomi/mimo-v2-pro/`).then(r => r.ok).catch(() => false);
if (mimo) pages.push('/outputs/xiaomi/mimo-v2-pro');

// ── No horizontal overflow at phone/tablet widths ─────────────────────
const widths = [360, 375, 412, 600, 700, 800, 900];
for (const width of widths) {
  const viewport = { width, height: 800 };
  let page = await newPage(viewport);
  for (const path of pages) {
    page = await goVisit(page, viewport, `${BASE}${path}`);
    const t = await overflowAt(page);
    log(`no h-overflow ${path} @ ${width}px`, t.scrollW <= t.innerW, JSON.stringify(t));
  }
  await page.close();
}

// ── Landscape phone ───────────────────────────────────────────────────
{
  const page = await newPage({ width: 844, height: 390 });
  for (const path of ['/', '/timeline']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    const t = await overflowAt(page);
    log(`no h-overflow ${path} @ 844x390`, t.scrollW <= t.innerW, JSON.stringify(t));
  }
  await page.close();
}

// ── Signed-in nav must not overflow (issue #48) ───────────────────────
// The suite runs logged-out; the nav's crowded state (Collections + @user)
// only appears when signed in. DOM-inject that state and assert the nav bar
// still fits — this is a layout-only check, no real session needed.
// Widths match the main loop's phone range (360+); 320 is below the site's
// supported minimum and the home .lab-table alone overflows it (pre-existing).
for (const width of [360, 375, 390, 412]) {
  const page = await newPage({ width, height: 800 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => {
    const nc = document.getElementById('nav-collections'); if (nc) nc.hidden = false;
    const na = document.getElementById('nav-account'); if (na) na.textContent = '@hammerbacher';
    const ni = document.querySelector('.nav-inner');
    return { over: ni.scrollWidth - ni.clientWidth };
  });
  log(`signed-in nav no-overflow @ ${width}px`, t.over <= 0, JSON.stringify(t));
  await page.close();
}

// ── Public collection share page 404 (issue #52) ──────────────────────
// Unknown token → styled 404 from the on-demand route; seed-free, so the
// suite can assert the new template's layout at every phone width. Needs
// migration 0006 on the local D1 (wrangler d1 migrations apply … --local).
{
  const path = '/collections/00000000000000000000000000000000';
  for (const width of widths) {
    const viewport = { width, height: 800 };
    let page = await newPage(viewport);
    page = await goVisit(page, viewport, `${BASE}${path}`);
    const t = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      h1: document.querySelector('.pubcoll h1')?.textContent ?? '',
    }));
    log(`share-page 404 renders, no h-overflow @ ${width}px`,
      t.h1 === 'Collection not found' && t.scrollW <= t.innerW, JSON.stringify(t));
    await page.close();
  }
}

// ── Collections sharing pane layout (issue #52) ───────────────────────
// The suite runs logged-out, so DOM-inject the worst-case signed-in state:
// 120-char unbroken collection name + the public link row with a full URL.
for (const width of [360, 375, 412, 600]) {
  const page = await newPage({ width, height: 800 });
  await page.goto(`${BASE}/collections`, { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => {
    document.getElementById('coll-app').hidden = false;
    document.getElementById('coll-detail').hidden = false;
    document.getElementById('coll-detail-name').textContent = 'x'.repeat(120);
    document.getElementById('cs-private').hidden = true;
    document.getElementById('cs-public').hidden = false;
    document.getElementById('cs-url').value =
      location.origin + '/collections/' + 'a'.repeat(32);
    return {
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    };
  });
  log(`collections sharing pane no h-overflow @ ${width}px`, t.scrollW <= t.innerW, JSON.stringify(t));
  await page.close();
}

// ── Search dropdown stays within the viewport ─────────────────────────
for (const width of [375, 620]) {
  const page = await newPage({ width, height: 800 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.click('#nav-search-btn');
  await page.waitForSelector('.search-dropdown:not(.hidden)');
  const r = await page.evaluate(() => {
    const b = document.querySelector('.search-dropdown').getBoundingClientRect();
    return { left: Math.round(b.left), right: Math.round(b.right), vw: window.innerWidth };
  });
  log(`search dropdown within viewport @ ${width}px`, r.left >= 0 && r.right <= r.vw, JSON.stringify(r));
  await page.close();
}

// ── Typeahead: letters a/n/i must type, not run All/None/Invert ───────
{
  const page = await newPage({ width: 1280, height: 800 });
  await page.goto(`${BASE}/timeline`, { waitUntil: 'networkidle' });
  await page.keyboard.press('f');
  await page.waitForSelector('.palette-panel:not(.hidden)');
  await page.keyboard.type('lab');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.value-typeahead');
  await page.fill('.value-typeahead', '');
  await page.type('.value-typeahead', 'anthropic');
  const t = await page.evaluate(() => ({
    value: document.querySelector('.value-typeahead').value,
    chips: new URLSearchParams(window.location.search).get('lab'),
  }));
  log('typeahead types "anthropic" intact', t.value === 'anthropic' && !t.chips, JSON.stringify(t));
  await page.close();
}

// ── Timeline mobile sort select: visible, sorts, syncs from URL ───────
{
  const page = await newPage({ width: 375, height: 667 });
  await page.goto(`${BASE}/timeline`, { waitUntil: 'networkidle' });
  const visible = await page.evaluate(() => {
    const el = document.querySelector('#sort-control');
    return el && getComputedStyle(el).display !== 'none';
  });
  log('timeline sort select visible @ 375px', !!visible);

  await page.selectOption('#sort-select', 'stars');
  const order = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.tl-row'))
      .filter(r => r.style.display !== 'none' && r.dataset.stars)
      .slice(0, 2);
    return rows.map(r => Number(r.dataset.stars));
  });
  log('sort select reorders by stars desc', order.length === 2 && order[0] >= order[1], JSON.stringify(order));

  // Active-metric value is visible in the stacked meta line.
  const metricShown = await page.evaluate(() => {
    const cell = document.querySelector('.tl-row td.col-stars');
    return cell && getComputedStyle(cell).display !== 'none';
  });
  log('active metric visible while metric-sorted @ 375px', !!metricShown);

  await page.goto(`${BASE}/timeline?sort=citations`, { waitUntil: 'networkidle' });
  const synced = await page.evaluate(() => document.querySelector('#sort-select').value);
  log('sort select syncs from ?sort=citations', synced === 'citations', synced);
  await page.close();
}

// ── View bar: sort select must not clip the view-toggle buttons ───────
// The always-visible select shares one flex row with the view toggle at
// zero slack; clipping happens inside overflow:hidden, so document
// scrollWidth checks can never catch it — assert containment directly.
for (const width of [360, 375]) {
  const page = await newPage({ width, height: 740 });
  await page.goto(`${BASE}/timeline`, { waitUntil: 'networkidle' });
  const t = await page.evaluate(() => {
    const toggle = document.querySelector('.view-toggle');
    const tr = toggle.getBoundingClientRect();
    const btns = Array.from(document.querySelectorAll('.view-btn'));
    const lastBtn = btns[btns.length - 1].getBoundingClientRect();
    const ctl = document.querySelector('#sort-control');
    return {
      toggleClipped: toggle.scrollWidth > toggle.clientWidth + 1,
      lastBtnInside: lastBtn.right <= tr.right + 1,
      sortVisible: getComputedStyle(ctl).display !== 'none',
    };
  });
  const ok = !t.toggleClipped && t.lastBtnInside && t.sortVisible;
  log(`view bar: sort select does not clip view toggle @ ${width}px`, ok, JSON.stringify(t));
  await page.close();
}

// ── Model column set active: no overflow in the 1081–1240px band ──────
// Above the 1080px relaxation tier the 7-column table is already near
// min-content; the 6-column model set must trigger the relaxations itself.
for (const width of [1100, 1200]) {
  const page = await newPage({ width, height: 800 });
  await page.goto(`${BASE}/timeline?type=model&sort=params`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() =>
    document.getElementById('timeline-table').dataset.colset === 'model');
  const t = await overflowAt(page);
  log(`no h-overflow timeline model colset @ ${width}px`, t.scrollW <= t.innerW, JSON.stringify(t));
  await page.close();
}

// ── Sorted model value visible in the stacked meta line @ 375px ───────
{
  const page = await newPage({ width: 375, height: 667 });
  await page.goto(`${BASE}/timeline?type=model&sort=params`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() =>
    document.getElementById('timeline-table').dataset.colset === 'model');
  const t = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.tl-row'))
      .find(r => r.style.display !== 'none' && r.dataset.params);
    const cell = row?.querySelector('td.col-params');
    return {
      shown: cell && getComputedStyle(cell).display !== 'none',
      text: cell?.textContent ?? '',
    };
  });
  log('sorted model value visible in stacked row @ 375px',
    !!t.shown && t.text.length > 0, JSON.stringify(t));
  await page.close();
}

// ── Scoped filter state: no overflow with filters + attr sort active ──
{
  const viewport = { width: 360, height: 740 };
  const page = await newPage(viewport);
  await page.goto(`${BASE}/timeline?type=model&arch=moe&sort=aparams`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  const t = await overflowAt(page);
  log('no h-overflow timeline scoped-filtered @ 360px', t.scrollW <= t.innerW, JSON.stringify(t));
  await page.close();
}

// ── Back-to-top appears on deep scroll (timeline @ phone width) ───────
{
  const page = await newPage({ width: 375, height: 667 });
  await page.goto(`${BASE}/timeline`, { waitUntil: 'networkidle' });
  const before = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#back-to-top')).display);
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 3));
  await page.waitForTimeout(150);
  const after = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#back-to-top')).display);
  log('back-to-top hidden at top, shown after scroll', before === 'none' && after !== 'none',
    `${before} -> ${after}`);
  await page.close();
}

// ── Desktop regression guards ─────────────────────────────────────────
{
  const page = await newPage({ width: 1280, height: 800 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // Sticky thead still pins to the viewport (no overflow wrapper crept in).
  await page.evaluate(() => window.scrollTo(0, 500));
  const theadTop = await page.evaluate(() =>
    Math.round(document.querySelector('.lab-table thead').getBoundingClientRect().top));
  log('sticky thead pinned @ 1280px after scroll', theadTop === 0, `top=${theadTop}`);

  // Desktop scroll-to-close of filter panels still works (body not locked).
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('f');
  await page.waitForSelector('.palette-panel:not(.hidden)');
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(250);
  const closed = await page.evaluate(() =>
    document.querySelector('.palette-panel').classList.contains('hidden'));
  log('desktop scroll still closes filter panel', closed);
  await page.close();
}

// ── Summary ───────────────────────────────────────────────────────────
const failed = results.filter(r => !r.ok);
if (errs.length) {
  console.error('\nPage errors:');
  errs.forEach(e => console.error(`  ${e}`));
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
await browser.close();
process.exit(failed.length || errs.length ? 1 : 0);
