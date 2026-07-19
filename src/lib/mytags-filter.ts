// Client-only "My tags" filter for a filtered table (issue #21, final step).
// ADDITIVE + SAFE: registers a `mytag` dimension and writes data-mytags on rows,
// but getState() returns null until the user actually selects a tag — so the
// page's rowMatches sees exactly today's state for logged-out users and for
// logged-in users who haven't picked a tag. The whole install is best-effort;
// callers wrap it in try/catch so any failure leaves the existing filter intact.
import type { FilterDimension, DimState } from './filters/types.js';

interface Opts {
  dimensions: FilterDimension[];
  rows: HTMLElement[];
  filterBarEl: HTMLElement;
  onChange: () => void;
  rowTarget: (row: HTMLElement) => string | null;
}
export interface MyTagFilter { getState: () => DimState | null; }

export async function installMyTagFilter(opts: Opts): Promise<MyTagFilter | null> {
  let res: Response;
  try { res = await fetch('/api/me/tags', { headers: { 'x-requested-with': 'labindex' } }); } catch { return null; }
  if (res.status !== 200) { res.body?.cancel(); return null; } // logged out
  const tags: { target: string; tag: string }[] = (await res.json()).tags ?? [];
  if (!tags.length) return null;

  // target -> [tags]; then stamp data-mytags on each row.
  const byTarget = new Map<string, string[]>();
  for (const { target, tag } of tags) {
    const arr = byTarget.get(target);
    if (arr) arr.push(tag); else byTarget.set(target, [tag]);
  }
  for (const row of opts.rows) {
    const t = opts.rowTarget(row);
    row.dataset.mytags = (t ? byTarget.get(t) : null)?.join(',') ?? '';
  }

  const distinct = [...new Set(tags.map((t) => t.tag))].sort();
  // Register the dimension so rowMatches can evaluate `data-mytags`.
  opts.dimensions.push({
    key: 'mytag', label: 'My tags', kind: 'multi', rowAttr: 'mytags',
    options: distinct.map((s) => ({ slug: s, label: s, count: 0 })),
  });

  const values = new Set<string>();

  // Compact dropdown control inserted right after the filter bar.
  const wrap = document.createElement('div');
  wrap.className = 'mytag-filter';
  wrap.innerHTML = `<button type="button" class="mtf-toggle" aria-expanded="false">★ My tags</button><div class="mtf-menu" hidden></div>`;
  const toggle = wrap.querySelector<HTMLButtonElement>('.mtf-toggle')!;
  const menu = wrap.querySelector<HTMLElement>('.mtf-menu')!;
  for (const tag of distinct) {
    const label = document.createElement('label');
    label.className = 'mtf-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.value = tag;
    cb.addEventListener('change', () => {
      cb.checked ? values.add(tag) : values.delete(tag);
      toggle.textContent = values.size ? `★ My tags (${values.size})` : '★ My tags';
      toggle.classList.toggle('active', values.size > 0);
      opts.onChange();
    });
    const span = document.createElement('span'); span.textContent = tag;
    label.append(cb, span); menu.appendChild(label);
  }
  toggle.addEventListener('click', () => { const open = menu.hidden; menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target as Node)) menu.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.hidden = true; });
  opts.filterBarEl.after(wrap);

  if (!document.getElementById('mtf-style')) {
    const st = document.createElement('style'); st.id = 'mtf-style';
    st.textContent = `.mytag-filter{position:relative;display:inline-block;margin:.25rem 0 .5rem;font-size:.85rem}
.mtf-toggle{background:transparent;border:1px solid var(--border,#ddd);border-radius:6px;padding:.2rem .6rem;cursor:pointer;color:inherit}
.mtf-toggle.active{border-color:var(--color-accent,#0645ad);color:var(--color-accent,#0645ad)}
.mtf-menu{position:absolute;z-index:20;margin-top:.25rem;min-width:200px;max-height:300px;overflow-y:auto;background:var(--surface,#fff);border:1px solid var(--border,#ddd);border-radius:8px;padding:.4rem;box-shadow:0 6px 24px rgba(0,0,0,.12)}
.mtf-item{display:flex;align-items:center;gap:.5rem;padding:.15rem .2rem;cursor:pointer}
@media(pointer:coarse){.mtf-item{min-height:44px}.mtf-toggle{min-height:44px}}`;
    document.head.appendChild(st);
  }

  return { getState: () => (values.size ? ({ kind: 'multi', values: new Set(values) } as DimState) : null) };
}

// Derive a canonical tag target from a row's data-href, or null (e.g. news).
export function hrefToTarget(href: string | undefined): string | null {
  if (!href) return null;
  if (href.startsWith('/labs/')) return 'lab:' + href.slice(6).replace(/\/$/, '');
  if (href.startsWith('/outputs/')) return 'output:' + href.slice(9).replace(/\/$/, '');
  return null;
}
