// Display names for share pages (issue #52), resolved from the build's
// search-data.json through the static-assets binding — the worker can't run
// the YAML loader at request time. Cached as a promise at module scope so one
// fetch+parse (~310 KB) serves the whole isolate and concurrent cold requests
// share it; a failure clears the cache so the next request retries.
let cache: Promise<Map<string, string>> | null = null;

export function getSiteNames(env: any, base: string | URL): Promise<Map<string, string>> {
  if (!cache) {
    cache = load(env, base).catch(() => {
      cache = null;
      return new Map<string, string>();
    });
  }
  return cache;
}

async function load(env: any, base: string | URL): Promise<Map<string, string>> {
  // ASSETS.fetch requires an absolute URL; a bare path throws in Workers.
  const res = await env.ASSETS.fetch(new URL('/search-data.json', base));
  if (!res.ok) throw new Error(`search-data.json ${res.status}`);
  const entries: Array<{ url?: string; name?: string }> = await res.json();
  const names = new Map<string, string>();
  for (const e of entries) if (e?.url && e?.name) names.set(e.url, e.name);
  return names;
}

// 'output:<lab>/<slug>' | 'lab:<slug>' → site path, mirroring the client-side
// url() helper on the collections page.
export function targetUrl(target: string): string | null {
  if (target.startsWith('output:')) return '/outputs/' + target.slice(7);
  if (target.startsWith('lab:')) return '/labs/' + target.slice(4);
  return null;
}

export function targetLabel(target: string): string {
  return (target.split('/').pop() || target).replace(/^(output:|lab:)/, '');
}
