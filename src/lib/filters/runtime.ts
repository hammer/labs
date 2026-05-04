// DOM-side orchestrator. Reads markup emitted by FilterBar.astro,
// wires up state, keyboard, clicks, URL sync, and dispatches
// `filters:changed` events on the root for the page to consume.

import type {
  FilterDimension,
  FilterState,
  DimState,
  RangeValue,
  TristateValue,
  FilterChangeDetail,
  MultiOption,
} from './types.js';
import {
  emptyState,
  isActive,
  activeCount,
  toggleMulti,
  selectOnly,
  selectAll,
  selectNone,
  invertMulti,
  setRange,
  setTristate,
  clearDim,
  clearAll,
  serialize,
  parse,
  diffStates,
} from './state.js';
import { placePanel, isMobile } from './position.js';

export interface InitConfig {
  mode: 'palette' | 'inline';
  rootEl: HTMLElement;
  dimensions: FilterDimension[];
  hotkey?: string;
  // Optional: mark this instance scope (e.g. 'home') for any future
  // multi-instance support. Not used today; reserved.
  scope?: string;
}

export interface InitResult {
  destroy: () => void;
  getState: () => FilterState;
}

const TYPEAHEAD_MIN_OPTIONS = 8;
const ALL_NONE_INVERT_MIN_OPTIONS = 5;

export function initFilterBar(config: InitConfig): InitResult {
  const { mode, rootEl, dimensions } = config;
  const hotkey = config.hotkey ?? 'f';

  // ─── State ───────────────────────────────────────────────────────────
  let state: FilterState = parse(new URLSearchParams(window.location.search), dimensions);
  let openDimKey: string | null = null;       // currently expanded dim panel
  let paletteStage: 'dim' | 'value' = 'dim';  // palette mode only
  let dimPickerIndex = 0;
  let multiRowIndex = -1;                      // focused option in multi-select panel
  const cleanups: Array<() => void> = [];

  // ─── DOM refs ────────────────────────────────────────────────────────
  const chips = rootEl.querySelector<HTMLElement>('.filter-chips');
  const clearAllBtn = rootEl.querySelector<HTMLButtonElement>('.clear-all');
  const countEl = rootEl.querySelector<HTMLElement>('.filter-count');
  const live = rootEl.querySelector<HTMLElement>('.filter-live');
  const palettePanel = rootEl.querySelector<HTMLElement>('.palette-panel');
  const stageDim = rootEl.querySelector<HTMLElement>('.stage-dim');
  const stageValue = rootEl.querySelector<HTMLElement>('.stage-value');
  const paletteInput = rootEl.querySelector<HTMLInputElement>('.palette-input');
  const dimListEl = rootEl.querySelector<HTMLUListElement>('.dim-list');
  const stageValueTitle = rootEl.querySelector<HTMLElement>('.stage-value-title');
  const stageValueBody = rootEl.querySelector<HTMLElement>('.stage-value-body');
  const stageBack = rootEl.querySelector<HTMLElement>('.stage-back');
  const paletteBtn = rootEl.querySelector<HTMLButtonElement>('.palette-btn');
  const mobileBackdrop = ensureBackdrop();

  // ─── Helpers ─────────────────────────────────────────────────────────

  function ensureBackdrop(): HTMLElement {
    let el = document.querySelector<HTMLElement>('.filter-backdrop');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'filter-backdrop hidden';
    el.addEventListener('click', closeOpenPanel);
    document.body.appendChild(el);
    return el;
  }

  function dimByKey(key: string): FilterDimension | undefined {
    return dimensions.find(d => d.key === key);
  }

  function dimWrapByKey(key: string): HTMLElement | null {
    return rootEl.querySelector<HTMLElement>(`.dim-wrap[data-dim-key="${cssEscape(key)}"]`);
  }

  function dimPanelByKey(key: string): HTMLElement | null {
    return dimWrapByKey(key)?.querySelector<HTMLElement>('.dim-panel') ?? null;
  }

  function announce(msg: string): void {
    if (live) live.textContent = msg;
  }

  function emitChange(prev: FilterState): void {
    const dirty = diffStates(prev, state);
    if (dirty.length === 0) return;
    syncUrl();
    rerender();
    rootEl.dispatchEvent(new CustomEvent<FilterChangeDetail>('filters:changed', {
      detail: { state: deepClone(state), dirtyKeys: dirty },
      bubbles: true,
    }));
  }

  function syncUrl(): void {
    const params = serialize(state, dimensions);
    const qs = params.toString();
    const target = qs ? `?${qs}` : window.location.pathname;
    history.replaceState(null, '', target);
  }

  function deepClone(s: FilterState): FilterState {
    const out: FilterState = {};
    for (const [k, v] of Object.entries(s)) {
      if (v.kind === 'multi') out[k] = { kind: 'multi', values: new Set(v.values) };
      else if (v.kind === 'range') out[k] = { kind: 'range', value: { ...v.value } };
      else out[k] = { ...v };
    }
    return out;
  }

  // ─── Render: button / chip summaries ─────────────────────────────────

  function summarizeDim(d: FilterDimension, s: DimState): string {
    if (s.kind === 'multi') {
      if (s.values.size === 0) return '';
      if (s.values.size === 1) {
        const slug = [...s.values][0]!;
        const opt = d.options?.find(o => o.slug === slug);
        if (opt) return opt.flag ? `${opt.flag} ${opt.label}` : opt.label;
        return slug;
      }
      return `${s.values.size} selected`;
    }
    if (s.kind === 'tristate') {
      if (s.value === 'any') return '';
      return s.value === 'yes' ? 'Yes' : 'No';
    }
    if (s.kind === 'range') {
      const fmt = d.format ?? ((n: number) => String(n));
      const r = s.value;
      if (r.min !== null && r.max !== null) return `${fmt(r.min)}–${fmt(r.max)}`;
      if (r.min !== null) return `≥${fmt(r.min)}`;
      if (r.max !== null) return `≤${fmt(r.max)}`;
      return '';
    }
    if (s.kind === 'single') {
      if (s.value === null) return '';
      const opt = d.options?.find(o => o.slug === s.value);
      return opt ? opt.label : s.value;
    }
    return '';
  }

  function rerender(): void {
    if (mode === 'inline') rerenderInlineButtons();
    else rerenderPaletteChips();
    rerenderClearAll();
  }

  function rerenderInlineButtons(): void {
    for (const d of dimensions) {
      const wrap = dimWrapByKey(d.key);
      if (!wrap) continue;
      const btn = wrap.querySelector<HTMLButtonElement>('.dim-btn');
      const summaryEl = wrap.querySelector<HTMLElement>('.dim-summary');
      const dotEl = wrap.querySelector<HTMLElement>('.dim-dot');
      const s = state[d.key]!;
      const active = isActive(s);
      btn?.classList.toggle('active', active);
      btn?.setAttribute('aria-expanded', String(openDimKey === d.key));
      if (summaryEl) summaryEl.textContent = summarizeDim(d, s);
      if (dotEl) dotEl.style.opacity = active ? '1' : '0';
    }
  }

  function rerenderPaletteChips(): void {
    if (!chips) return;
    const active = dimensions.filter(d => isActive(state[d.key]!));
    chips.innerHTML = active.map(d => {
      const text = summarizeDim(d, state[d.key]!);
      return `
        <span class="filter-chip-wrap">
          <button type="button" class="filter-chip" data-dim-key="${escapeAttr(d.key)}" title="Edit ${escapeAttr(d.label)}">
            <span class="chip-key">${escapeHtml(d.label)}:</span>
            <span class="chip-val">${escapeHtml(text)}</span>
          </button>
          <button type="button" class="chip-x" data-dim-key="${escapeAttr(d.key)}" aria-label="Remove ${escapeAttr(d.label)} filter">&times;</button>
        </span>`;
    }).join('');
    chips.querySelectorAll<HTMLElement>('.filter-chip').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.dimKey!;
        openPalette();
        showValueStage(dimByKey(key)!);
      });
    });
    chips.querySelectorAll<HTMLElement>('.chip-x').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const key = el.dataset.dimKey!;
        const prev = deepClone(state);
        state[key] = clearDim(dimByKey(key)!);
        emitChange(prev);
      });
    });
  }

  function rerenderClearAll(): void {
    if (!clearAllBtn) return;
    clearAllBtn.classList.toggle('hidden', activeCount(state) === 0);
  }

  // ─── Open / close panels ─────────────────────────────────────────────

  function openInlinePanel(key: string): void {
    if (openDimKey === key) { closeOpenPanel(); return; }
    if (openDimKey) closeOpenPanel();
    openDimKey = key;
    const panel = dimPanelByKey(key);
    if (!panel) return;
    const dim = dimByKey(key)!;
    renderValuePanelInto(panel, dim);
    panel.classList.remove('hidden');
    rerenderInlineButtons();
    if (isMobile()) {
      mobileBackdrop?.classList.remove('hidden');
    } else {
      placePanel(panel);
    }
    focusFirstInValuePanel(panel, dim);
    attachAutoClose();
  }

  function closeOpenPanel(): void {
    if (openDimKey) {
      const panel = dimPanelByKey(openDimKey);
      panel?.classList.add('hidden');
      panel?.classList.remove('flip-x', 'flip-y');
      openDimKey = null;
      rerenderInlineButtons();
    }
    if (palettePanel && !palettePanel.classList.contains('hidden')) {
      palettePanel.classList.add('hidden');
      palettePanel.classList.remove('flip-x', 'flip-y');
      paletteBtn?.setAttribute('aria-expanded', 'false');
    }
    mobileBackdrop?.classList.add('hidden');
    detachAutoClose();
  }

  function openPalette(): void {
    if (mode !== 'palette' || !palettePanel) return;
    palettePanel.classList.remove('hidden');
    paletteBtn?.setAttribute('aria-expanded', 'true');
    showDimStage();
    if (isMobile()) {
      mobileBackdrop?.classList.remove('hidden');
    } else {
      placePanel(palettePanel);
    }
    attachAutoClose();
  }

  function showDimStage(): void {
    paletteStage = 'dim';
    stageDim?.classList.remove('hidden');
    stageValue?.classList.add('hidden');
    if (paletteInput) {
      paletteInput.value = '';
    }
    dimPickerIndex = 0;
    renderDimList();
    paletteInput?.focus();
  }

  function showValueStage(d: FilterDimension): void {
    if (mode === 'palette') {
      paletteStage = 'value';
      stageDim?.classList.add('hidden');
      stageValue?.classList.remove('hidden');
      if (stageValueTitle) stageValueTitle.textContent = d.label;
      if (stageValueBody) {
        renderValuePanelInto(stageValueBody, d, /*topLevel*/ true);
        focusFirstInValuePanel(stageValueBody, d);
      }
    } else {
      openInlinePanel(d.key);
    }
  }

  // ─── Auto-close (scroll, click outside, esc) ─────────────────────────

  let autoCloseAttached = false;
  let initialScrollY = 0;
  function attachAutoClose(): void {
    if (autoCloseAttached) return;
    autoCloseAttached = true;
    initialScrollY = window.scrollY;
    document.addEventListener('scroll', onDocScroll, { passive: true, capture: true });
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('resize', onResize);
  }
  function detachAutoClose(): void {
    if (!autoCloseAttached) return;
    autoCloseAttached = false;
    document.removeEventListener('scroll', onDocScroll, { capture: true } as any);
    document.removeEventListener('click', onDocClick, true);
    window.removeEventListener('resize', onResize);
  }
  function onDocScroll(e: Event): void {
    const t = e.target as Element | null;
    if (!t) return;
    // Allow scrolling inside the panel itself.
    if (t instanceof HTMLElement && (
      t.closest('.dim-panel') ||
      t.closest('.palette-panel')
    )) return;
    // Ignore tiny scrolls from auto-focus-into-view; only close on real
    // user scrolls. Without this, opening a panel mid-page that auto-scrolls
    // its input into view would close itself instantly.
    if (Math.abs(window.scrollY - initialScrollY) < 24) return;
    closeOpenPanel();
  }
  function onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.dim-panel') || target.closest('.palette-panel')) return;
    if (target.closest('.dim-btn') || target.closest('.palette-btn')) return;
    if (target.closest('.filter-chip') || target.closest('.chip-x')) return;
    closeOpenPanel();
  }
  function onResize(): void {
    if (isMobile()) {
      // Mobile sheet: nothing to reposition.
      return;
    }
    if (openDimKey) {
      const panel = dimPanelByKey(openDimKey);
      if (panel && !panel.classList.contains('hidden')) placePanel(panel);
    }
    if (palettePanel && !palettePanel.classList.contains('hidden')) {
      placePanel(palettePanel);
    }
  }

  // ─── Render: dim list (palette only) ─────────────────────────────────

  function filteredDims(): FilterDimension[] {
    const q = paletteInput?.value.toLowerCase().trim() ?? '';
    if (!q) return dimensions;
    return dimensions.filter(d =>
      d.label.toLowerCase().includes(q) || d.key.toLowerCase().includes(q),
    );
  }

  function renderDimList(): void {
    if (!dimListEl) return;
    const dims = filteredDims();
    if (dimPickerIndex >= dims.length) dimPickerIndex = Math.max(0, dims.length - 1);
    if (dims.length === 0) {
      dimListEl.innerHTML = '<li class="dim-item-empty">No matching dimensions</li>';
      return;
    }
    dimListEl.innerHTML = dims.map((d, i) => {
      const summary = summarizeDim(d, state[d.key]!);
      const sel = i === dimPickerIndex ? ' selected' : '';
      return `<li class="dim-item${sel}" data-dim-key="${escapeAttr(d.key)}" data-i="${i}" role="option">
        <span class="dim-item-label">${escapeHtml(d.label)}</span>
        ${summary ? `<span class="dim-item-summary">${escapeHtml(summary)}</span>` : ''}
        <span class="dim-item-arrow">&rsaquo;</span>
      </li>`;
    }).join('');
    dimListEl.querySelectorAll<HTMLElement>('.dim-item').forEach(item => {
      item.addEventListener('click', () => {
        const key = item.dataset.dimKey!;
        showValueStage(dimByKey(key)!);
      });
      item.addEventListener('mousemove', () => {
        const idx = Number.parseInt(item.dataset.i ?? '0', 10);
        if (dimPickerIndex !== idx) {
          dimPickerIndex = idx;
          updateDimSelection();
        }
      });
    });
  }

  function updateDimSelection(): void {
    if (!dimListEl) return;
    dimListEl.querySelectorAll<HTMLElement>('.dim-item').forEach((item, i) => {
      item.classList.toggle('selected', i === dimPickerIndex);
      if (i === dimPickerIndex) item.scrollIntoView({ block: 'nearest' });
    });
  }

  // ─── Render: value panel (multi / range / tristate / single) ─────────

  function renderValuePanelInto(host: HTMLElement, d: FilterDimension, isTopLevel = false): void {
    if (d.kind === 'multi') {
      renderMultiPanel(host, d, isTopLevel);
    } else if (d.kind === 'range') {
      renderRangePanel(host, d, isTopLevel);
    } else if (d.kind === 'tristate') {
      renderTristatePanel(host, d, isTopLevel);
    } else if (d.kind === 'single') {
      renderSinglePanel(host, d, isTopLevel);
    }
  }

  function renderMultiPanel(host: HTMLElement, d: FilterDimension, isTopLevel: boolean): void {
    const opts = d.options ?? [];
    const showTypeahead = opts.length >= TYPEAHEAD_MIN_OPTIONS;
    const showAllNoneInvert = opts.length >= ALL_NONE_INVERT_MIN_OPTIONS;
    multiRowIndex = -1;

    const headerHtml = isTopLevel ? '' : `
      <div class="value-stage-header">
        <span class="value-stage-title">${escapeHtml(d.label)}</span>
        <button type="button" class="value-stage-close" aria-label="Close">&times;</button>
      </div>`;

    host.innerHTML = `
      ${headerHtml}
      <div class="value-multi">
        ${showTypeahead ? `<input type="text" class="value-typeahead" placeholder="Search ${escapeAttr(d.label.toLowerCase())}…" />` : ''}
        ${showAllNoneInvert ? `
          <div class="value-multi-toolbar">
            <button type="button" class="vmt-btn" data-op="all">All</button>
            <button type="button" class="vmt-btn" data-op="none">None</button>
            <button type="button" class="vmt-btn" data-op="invert">Invert</button>
          </div>` : ''}
        <ul class="value-multi-list" role="listbox" aria-multiselectable="true">
          ${opts.map((o, i) => renderMultiRow(o, d, i)).join('')}
        </ul>
      </div>`;

    const typeahead = host.querySelector<HTMLInputElement>('.value-typeahead');
    const listEl = host.querySelector<HTMLUListElement>('.value-multi-list')!;
    const closeBtn = host.querySelector<HTMLButtonElement>('.value-stage-close');
    closeBtn?.addEventListener('click', closeOpenPanel);

    function rebuildVisible(): void {
      const q = typeahead?.value.toLowerCase().trim() ?? '';
      const filtered = q
        ? opts.filter(o => o.label.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q))
        : opts;
      listEl.innerHTML = filtered.map((o, i) => renderMultiRow(o, d, i)).join('');
      bindMultiRows(listEl, filtered, d);
      multiRowIndex = -1;
    }

    typeahead?.addEventListener('input', rebuildVisible);
    typeahead?.addEventListener('keydown', e => onMultiPanelKeydown(e, d, listEl));

    bindMultiRows(listEl, opts, d);
    host.querySelectorAll<HTMLButtonElement>('.vmt-btn').forEach(btn => {
      btn.addEventListener('click', () => runMultiToolbarOp(btn.dataset.op!, d));
    });
  }

  function renderMultiRow(o: MultiOption, d: FilterDimension, _i: number): string {
    const checked = (state[d.key] as { kind: 'multi'; values: Set<string> }).values.has(o.slug);
    return `
      <li class="value-multi-row" data-slug="${escapeAttr(o.slug)}" tabindex="-1" role="option" aria-selected="${checked}">
        <label class="value-multi-label">
          <input type="checkbox" data-slug="${escapeAttr(o.slug)}" ${checked ? 'checked' : ''} />
          ${o.flag ? `<span class="value-flag">${o.flag}</span>` : ''}
          <span class="value-label-text">${escapeHtml(o.label)}</span>
          <span class="value-count">${o.count}</span>
        </label>
        <button type="button" class="value-only" data-slug="${escapeAttr(o.slug)}" aria-label="Select only ${escapeAttr(o.label)}">only</button>
      </li>`;
  }

  function bindMultiRows(listEl: HTMLElement, opts: MultiOption[], d: FilterDimension): void {
    listEl.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('click', e => {
        if ((e as MouseEvent).shiftKey) {
          e.preventDefault();
          const prev = deepClone(state);
          state[d.key] = selectOnly(state[d.key]!, cb.dataset.slug!);
          announce(`Only ${cb.dataset.slug} selected for ${d.label}`);
          emitChange(prev);
          // Refresh in place
          syncCheckboxes(listEl, d);
          return;
        }
        const prev = deepClone(state);
        state[d.key] = toggleMulti(state[d.key]!, cb.dataset.slug!);
        emitChange(prev);
      });
    });
    listEl.querySelectorAll<HTMLElement>('.value-only').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const slug = el.dataset.slug!;
        const prev = deepClone(state);
        state[d.key] = selectOnly(state[d.key]!, slug);
        const opt = d.options?.find(o => o.slug === slug);
        announce(`Only ${opt?.label ?? slug} selected for ${d.label}`);
        emitChange(prev);
        syncCheckboxes(listEl, d);
      });
    });
    listEl.addEventListener('keydown', e => onMultiPanelKeydown(e, d, listEl));
  }

  function syncCheckboxes(listEl: HTMLElement, d: FilterDimension): void {
    const set = (state[d.key] as { kind: 'multi'; values: Set<string> }).values;
    listEl.querySelectorAll<HTMLLIElement>('.value-multi-row').forEach(row => {
      const slug = row.dataset.slug!;
      const checked = set.has(slug);
      row.setAttribute('aria-selected', String(checked));
      const cb = row.querySelector<HTMLInputElement>('input[type=checkbox]');
      if (cb) cb.checked = checked;
    });
  }

  function runMultiToolbarOp(op: string, d: FilterDimension): void {
    const opts = d.options ?? [];
    const slugs = opts.map(o => o.slug);
    const prev = deepClone(state);
    if (op === 'all') {
      state[d.key] = selectAll(state[d.key]!, slugs);
      announce(`All ${d.label} selected (${slugs.length})`);
    } else if (op === 'none') {
      state[d.key] = selectNone(state[d.key]!);
      announce(`Cleared ${d.label}`);
    } else if (op === 'invert') {
      state[d.key] = invertMulti(state[d.key]!, slugs);
      const cnt = (state[d.key] as { kind: 'multi'; values: Set<string> }).values.size;
      announce(`Inverted ${d.label} (${cnt} of ${slugs.length})`);
    }
    emitChange(prev);
    const panel = mode === 'palette' ? stageValueBody : dimPanelByKey(d.key);
    if (panel) {
      const list = panel.querySelector<HTMLElement>('.value-multi-list');
      if (list) syncCheckboxes(list, d);
    }
  }

  function onMultiPanelKeydown(e: KeyboardEvent, d: FilterDimension, listEl: HTMLElement): void {
    const rows = listEl.querySelectorAll<HTMLLIElement>('.value-multi-row');
    if (rows.length === 0) return;

    const focusRow = (i: number) => {
      multiRowIndex = Math.max(0, Math.min(i, rows.length - 1));
      rows.forEach((row, idx) => row.classList.toggle('focused', idx === multiRowIndex));
      rows[multiRowIndex]?.scrollIntoView({ block: 'nearest' });
    };

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusRow(multiRowIndex < 0 ? 0 : multiRowIndex + 1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        focusRow(multiRowIndex < 0 ? rows.length - 1 : multiRowIndex - 1);
        return;
      case ' ':
      case 'Enter':
        if (multiRowIndex < 0) return;
        e.preventDefault();
        rows[multiRowIndex]?.querySelector<HTMLInputElement>('input[type=checkbox]')?.click();
        return;
      case 'o':
        if (multiRowIndex < 0) return;
        e.preventDefault();
        rows[multiRowIndex]?.querySelector<HTMLElement>('.value-only')?.click();
        return;
      case 'a':
        e.preventDefault();
        runMultiToolbarOp('all', d);
        return;
      case 'n':
        e.preventDefault();
        runMultiToolbarOp('none', d);
        return;
      case 'i':
        e.preventDefault();
        runMultiToolbarOp('invert', d);
        return;
      case 'Escape':
        e.preventDefault();
        if (mode === 'palette') showDimStage();
        else closeOpenPanel();
        return;
    }
  }

  function renderRangePanel(host: HTMLElement, d: FilterDimension, isTopLevel: boolean): void {
    const r = (state[d.key] as { kind: 'range'; value: RangeValue }).value;
    const headerHtml = isTopLevel ? '' : `
      <div class="value-stage-header">
        <span class="value-stage-title">${escapeHtml(d.label)}</span>
        <button type="button" class="value-stage-close" aria-label="Close">&times;</button>
      </div>`;
    host.innerHTML = `
      ${headerHtml}
      <div class="value-range">
        <input type="number" class="value-range-min" placeholder="Min" value="${r.min ?? ''}" step="any" />
        <span class="value-range-dash">–</span>
        <input type="number" class="value-range-max" placeholder="Max" value="${r.max ?? ''}" step="any" />
        ${d.unit ? `<span class="value-range-unit">${escapeHtml(d.unit)}</span>` : ''}
        <button type="button" class="value-range-apply">Apply</button>
        <button type="button" class="value-range-clear">Clear</button>
      </div>`;
    const minIn = host.querySelector<HTMLInputElement>('.value-range-min')!;
    const maxIn = host.querySelector<HTMLInputElement>('.value-range-max')!;
    const apply = () => {
      const prev = deepClone(state);
      const min = minIn.value === '' ? null : Number.parseFloat(minIn.value);
      const max = maxIn.value === '' ? null : Number.parseFloat(maxIn.value);
      state[d.key] = setRange(state[d.key]!, {
        min: min !== null && Number.isFinite(min) ? min : null,
        max: max !== null && Number.isFinite(max) ? max : null,
      });
      emitChange(prev);
    };
    host.querySelector<HTMLButtonElement>('.value-range-apply')?.addEventListener('click', () => {
      apply();
      if (mode === 'palette') showDimStage();
      else closeOpenPanel();
    });
    host.querySelector<HTMLButtonElement>('.value-range-clear')?.addEventListener('click', () => {
      minIn.value = '';
      maxIn.value = '';
      apply();
    });
    [minIn, maxIn].forEach(inp => {
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          apply();
          if (mode === 'palette') showDimStage();
          else closeOpenPanel();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          if (mode === 'palette') showDimStage();
          else closeOpenPanel();
        }
      });
    });
    host.querySelector<HTMLButtonElement>('.value-stage-close')?.addEventListener('click', closeOpenPanel);
    minIn.focus();
    minIn.select();
  }

  function renderTristatePanel(host: HTMLElement, d: FilterDimension, isTopLevel: boolean): void {
    const v = (state[d.key] as { kind: 'tristate'; value: TristateValue }).value;
    const headerHtml = isTopLevel ? '' : `
      <div class="value-stage-header">
        <span class="value-stage-title">${escapeHtml(d.label)}</span>
        <button type="button" class="value-stage-close" aria-label="Close">&times;</button>
      </div>`;
    host.innerHTML = `
      ${headerHtml}
      <div class="value-tristate" role="radiogroup" aria-label="${escapeAttr(d.label)}">
        ${(['any', 'yes', 'no'] as const).map(opt => `
          <button type="button" class="vt-btn ${v === opt ? 'active' : ''}" data-val="${opt}" aria-checked="${v === opt}" role="radio">
            ${opt === 'any' ? 'Any' : opt === 'yes' ? 'Yes' : 'No'}
          </button>`).join('')}
      </div>`;
    host.querySelectorAll<HTMLButtonElement>('.vt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prev = deepClone(state);
        state[d.key] = setTristate(state[d.key]!, btn.dataset.val as TristateValue);
        emitChange(prev);
        host.querySelectorAll<HTMLButtonElement>('.vt-btn').forEach(b => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-checked', String(isActive));
        });
      });
    });
    host.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (mode === 'palette') showDimStage();
        else closeOpenPanel();
      }
    });
    host.querySelector<HTMLButtonElement>('.value-stage-close')?.addEventListener('click', closeOpenPanel);
    host.querySelector<HTMLButtonElement>('.vt-btn.active')?.focus();
  }

  function renderSinglePanel(host: HTMLElement, d: FilterDimension, isTopLevel: boolean): void {
    const v = (state[d.key] as { kind: 'single'; value: string | null }).value;
    const opts = d.options ?? [];
    const headerHtml = isTopLevel ? '' : `
      <div class="value-stage-header">
        <span class="value-stage-title">${escapeHtml(d.label)}</span>
        <button type="button" class="value-stage-close" aria-label="Close">&times;</button>
      </div>`;
    host.innerHTML = `
      ${headerHtml}
      <div class="value-single" role="radiogroup">
        <button type="button" class="vs-btn ${v === null ? 'active' : ''}" data-val="" role="radio" aria-checked="${v === null}">Any</button>
        ${opts.map(o => `
          <button type="button" class="vs-btn ${v === o.slug ? 'active' : ''}" data-val="${escapeAttr(o.slug)}" role="radio" aria-checked="${v === o.slug}">
            ${escapeHtml(o.label)}
          </button>`).join('')}
      </div>`;
    host.querySelectorAll<HTMLButtonElement>('.vs-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prev = deepClone(state);
        const val = btn.dataset.val === '' ? null : btn.dataset.val ?? null;
        state[d.key] = { kind: 'single', value: val };
        emitChange(prev);
        host.querySelectorAll<HTMLButtonElement>('.vs-btn').forEach(b => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-checked', String(isActive));
        });
      });
    });
    host.querySelector<HTMLButtonElement>('.value-stage-close')?.addEventListener('click', closeOpenPanel);
    host.querySelector<HTMLButtonElement>('.vs-btn.active')?.focus();
  }

  function focusFirstInValuePanel(panel: HTMLElement, d: FilterDimension): void {
    if (d.kind === 'multi') {
      const ta = panel.querySelector<HTMLInputElement>('.value-typeahead');
      if (ta) { ta.focus(); return; }
      panel.querySelector<HTMLElement>('.value-multi-list')?.focus();
    } else if (d.kind === 'range') {
      panel.querySelector<HTMLInputElement>('.value-range-min')?.focus();
    } else if (d.kind === 'tristate' || d.kind === 'single') {
      panel.querySelector<HTMLButtonElement>('.vt-btn.active, .vs-btn.active')?.focus();
    }
  }

  // ─── Top-level keyboard ──────────────────────────────────────────────

  function onPageKeydown(e: KeyboardEvent): void {
    if ((window as any).isSearchOpen) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.target instanceof HTMLSelectElement) return;
    // Let panel-internal handlers handle their keys.
    const target = e.target as HTMLElement | null;
    if (target?.closest('.dim-panel') || target?.closest('.palette-panel')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === hotkey) {
      e.preventDefault();
      if (mode === 'palette') {
        if (palettePanel?.classList.contains('hidden')) openPalette(); else closeOpenPanel();
      } else {
        // Inline: open the first dim's panel.
        const first = dimensions[0];
        if (first) openInlinePanel(first.key);
      }
      return;
    }
    if (e.key === 'Escape') {
      if (openDimKey || (palettePanel && !palettePanel.classList.contains('hidden'))) {
        e.preventDefault();
        closeOpenPanel();
      }
    }
  }

  function onPaletteInputKeydown(e: KeyboardEvent): void {
    const dims = filteredDims();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (dims.length > 0) {
          dimPickerIndex = (dimPickerIndex + 1) % dims.length;
          updateDimSelection();
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (dims.length > 0) {
          dimPickerIndex = (dimPickerIndex - 1 + dims.length) % dims.length;
          updateDimSelection();
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (dims.length > 0) showValueStage(dims[dimPickerIndex]!);
        break;
      case 'Escape':
        e.preventDefault();
        closeOpenPanel();
        break;
    }
  }

  // ─── Wire it up ──────────────────────────────────────────────────────

  // Inline mode: bind each dim button.
  if (mode === 'inline') {
    rootEl.querySelectorAll<HTMLElement>('.dim-wrap[data-dim-key]').forEach(wrap => {
      const key = wrap.dataset.dimKey!;
      const btn = wrap.querySelector<HTMLButtonElement>('.dim-btn');
      btn?.addEventListener('click', e => {
        e.stopPropagation();
        openInlinePanel(key);
      });
    });
  }

  // Palette mode: bind palette button + dim picker.
  if (mode === 'palette') {
    paletteBtn?.addEventListener('click', e => {
      e.stopPropagation();
      if (palettePanel?.classList.contains('hidden')) openPalette(); else closeOpenPanel();
    });
    paletteInput?.addEventListener('input', () => {
      dimPickerIndex = 0;
      renderDimList();
    });
    paletteInput?.addEventListener('keydown', onPaletteInputKeydown);
    stageBack?.addEventListener('click', showDimStage);
  }

  clearAllBtn?.addEventListener('click', () => {
    const prev = deepClone(state);
    state = clearAll(dimensions);
    announce('All filters cleared');
    emitChange(prev);
  });

  document.addEventListener('keydown', onPageKeydown);
  cleanups.push(() => document.removeEventListener('keydown', onPageKeydown));

  // Initial render synchronously.
  rerender();
  // Emit the initial state in a macrotask so listeners attached *after*
  // this script ran (e.g. the page's own <script>) still receive it.
  // queueMicrotask isn't enough — Astro module scripts can dispatch
  // microtasks between modules, so a microtask here can still beat the
  // page-level handler attachment. setTimeout(0) defers to a clean tick.
  setTimeout(() => {
    rootEl.dispatchEvent(new CustomEvent<FilterChangeDetail>('filters:changed', {
      detail: { state: deepClone(state), dirtyKeys: Object.keys(state) },
      bubbles: true,
    }));
  }, 0);

  return {
    destroy(): void {
      detachAutoClose();
      cleanups.forEach(fn => fn());
    },
    getState(): FilterState {
      return deepClone(state);
    },
  };
}

// ─── Tiny safety helpers (we can't depend on browser libs at type-check time) ─

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }
function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && (CSS as any).escape) return (CSS as any).escape(s);
  return s.replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
}
