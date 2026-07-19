import type { APIRoute } from 'astro';

// Step-0 spike (issue #21): proves an on-demand server route runs on the
// Cloudflare adapter alongside the otherwise-static site. `locals.runtime`
// is where Cloudflare bindings (D1, secrets) will live once auth/user-data land.
export const prerender = false;

export const GET: APIRoute = ({ locals }) => {
  const hasRuntime = Boolean((locals as { runtime?: unknown })?.runtime);
  return new Response(
    JSON.stringify({ ok: true, route: 'server', runtimeBound: hasRuntime }),
    {
      headers: {
        'content-type': 'application/json',
        // user-scoped endpoints will need this; harmless here and sets the pattern
        'cache-control': 'private, no-store',
      },
    },
  );
};
