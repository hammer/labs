import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// output:'static' keeps every page prerendered by default; individual routes
// opt into on-demand server rendering with `export const prerender = false`
// (Astro 5 folded the old 'hybrid' mode into this). The Cloudflare adapter is
// what makes those on-demand routes run — as a `dist/_worker.js` that Cloudflare
// Pages serves alongside the prerendered static assets. See issue #21 step 0.
export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
});
