# Lab Index

**The most comprehensive open tracker of the global AI research ecosystem.**

**Live site: [labindex.ai](https://labindex.ai)**

## What This Is

Lab Index tracks **104 AI labs and universities** across **16 regions**, their **~1,500 research outputs** (models, papers, evals, datasets, libraries), and **460+ key researchers** — from trillion-parameter frontier models to foundational technique papers that changed how everyone trains. The 42 university entries (added July 2026) group each university with its co-located research institutes and follow strict attribution rules against the industrial labs.

Every lab has a profile with description, key people, news, and a chronological output list. Every output has structured metadata appropriate to its type: model specs and benchmark scores, paper venues and linked authors, eval leaderboards, dataset sizes. Every person has a page showing their career trajectory across labs, profile links, and related work.

The [timeline](https://labindex.ai/timeline) interleaves research outputs with industry news (funding rounds, leadership changes, strategic pivots) — because understanding the frontier requires both technical and business context. Global keyboard-driven search and type-scoped filters make the whole corpus navigable, on desktop and mobile.

## Accounts (optional)

Signing in with GitHub unlocks a private, personal layer over the index — everything is scoped to your account and never shared:

- **Saved filters** — capture a filtered view of the tables and re-open it later.
- **Tags** — tag any output or lab, with optional `prefix:value` conventions for organizing (e.g. `status:reading`, `topic:moe`). Your tags double as an additive on-table filter.
- **Collections** — group outputs and labs into named sets.
- **Notes** — keep private notes on individual outputs, labs, or collections.

The site is fully usable without an account; sign-in only adds the personal layer.

## Why This Exists

There is no single place that tracks the global AI research landscape with structured data across labs, models, papers, people, and news. Lab Index fills that gap as an open, data-driven resource.

## Quick Start

```bash
npm install
npm run dev          # content dev server at localhost:4321 (YAML hot-reloads)
```

Edit any YAML file under `data/` and refresh — no restart needed.

Common tasks:

```bash
npm run validate     # Zod-validate every lab/output against the schemas
npm run test:filter  # filter-framework smoke tests
npm run test:mobile  # responsive / no-overflow smoke tests (Playwright)
npm run build        # static build → dist/
npm run preview      # serve the built site under wrangler (exercises /api/* routes)
npm run deploy       # build + deploy to Cloudflare Pages (production: labindex.ai)
```

The account API routes (`/api/*`) need Cloudflare bindings — a [D1](https://developers.cloudflare.com/d1/) database and GitHub OAuth secrets — so login runs in production and under `wrangler` local dev, not plain `astro dev`. See `migrations/` for the schema and [AGENTS.md](./AGENTS.md) for setup.

## How It's Built

**Static-first with a thin dynamic layer.** Every lab/output/person page is prerendered to static, user-agnostic HTML — fast, cacheable, and the bulk of the site. A handful of on-demand server routes (`/api/*`, marked `prerender = false`) run on the Cloudflare adapter and back the optional account features. User-specific state is always fetched client-side, so cached page HTML never contains anyone's private data.

All content lives in YAML, validated against TypeScript/Zod schemas at build time. Account data lives in Cloudflare D1 (SQLite), one migration per feature.

```
data/labs/*.yaml            one file per lab (profile, people, news)
data/outputs/<lab>/*.yaml   one file per output (model / paper / eval / dataset / library)
src/pages/                  Astro routes (labs, outputs, people, timeline, whats-new) + /api/* server routes
src/                        schemas, data loaders, components, the filter framework
migrations/                 D1 SQL migrations (users, sessions, saved filters, tags, collections, notes)
tests/                      filter + mobile smoke tests
scripts/                    metric fetchers (Artificial Analysis scores, etc.)
```

## Built With

[Astro](https://astro.build/) (static-first SSG with on-demand routes), [Zod](https://zod.dev/) (schema validation), [Cloudflare Pages](https://pages.cloudflare.com/) (hosting) with [D1](https://developers.cloudflare.com/d1/) (account data) and GitHub OAuth (sign-in).

## Contributing

See [AGENTS.md](./AGENTS.md) for project guidance, schema rules, research focus, and contributor instructions. Agent skills for common tasks (adding labs, outputs, people, news) are in `.agents/skills/`.

## License

Data and code in this repository are available for research and educational use.
