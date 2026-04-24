# Lab Index

**The most comprehensive open tracker of the global AI research ecosystem.**

**Live site: [labindex.ai](https://labindex.ai)**

## What This Is

Lab Index tracks **57 AI labs** across **11 countries**, their **870+ research outputs** (models, papers, evals, datasets, libraries), and **230+ key researchers** — from trillion-parameter frontier models to foundational technique papers that changed how everyone trains.

Every lab has a profile with description, key people, news, and a chronological output list. Every output has structured metadata appropriate to its type: model specs and benchmark scores, paper venues and linked authors, eval leaderboards, dataset sizes. Every person has a page showing their career trajectory across labs, profile links, and related work.

The [timeline](https://labindex.ai/timeline) interleaves research outputs with industry news (funding rounds, leadership changes, strategic pivots) — because understanding the frontier requires both technical and business context.

## Why This Exists

There is no single place that tracks the global AI research landscape with structured data across labs, models, papers, people, and news. Lab Index fills that gap as an open, data-driven resource.

## Quick Start

```bash
npm install && npm run dev    # Dev server at localhost:4321
```

YAML changes are live without restart. Edit any YAML file and refresh.

## Built With

[Astro](https://astro.build/) (static site generation), [Zod](https://zod.dev/) (schema validation), [Cloudflare Pages](https://pages.cloudflare.com/) (hosting). All data in YAML, validated against TypeScript schemas, deployed as a fully static site.

## Contributing

See [AGENTS.md](./AGENTS.md) for project guidance, schema rules, and contributor instructions. Agent skills for common tasks (adding labs, outputs, people, news) are in `.agents/skills/`.

## License

Data and code in this repository are available for research and educational use.
