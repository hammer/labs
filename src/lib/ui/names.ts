// Client-side display-name resolver for user-data targets (issue #53).
// Maps 'lab:<slug>' / 'output:<lab>/<slug>' to real display names via the
// static /search-data.json (~310KB, CDN-cached — the same file SearchDropdown
// fetches), so the owner's /collections and /account pages show "DeepSeek-V4"
// instead of "deepseek-v4". Call loadNameMap() only after sign-in is
// confirmed, so anonymous visitors never pay the fetch.

let promise: Promise<Map<string, string>> | null = null;

export function targetUrl(t: string): string {
  if (t.startsWith('output:')) return '/outputs/' + t.slice(7);
  if (t.startsWith('lab:')) return '/labs/' + t.slice(4);
  return '#';
}

// Slug-derived fallback label (what these pages showed before names resolved).
export function targetSlugLabel(t: string): string {
  return (t.split('/').pop() || t).replace(/^(output:|lab:)/, '');
}

export function loadNameMap(): Promise<Map<string, string>> {
  promise ??= fetch('/search-data.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((list: { url?: string; name?: string }[]) => {
      const m = new Map<string, string>();
      for (const e of list) if (e?.url && e?.name) m.set(e.url, e.name);
      return m;
    })
    .catch(() => new Map<string, string>());
  return promise;
}

export function targetName(names: Map<string, string>, t: string): string {
  return names.get(targetUrl(t)) ?? targetSlugLabel(t);
}
