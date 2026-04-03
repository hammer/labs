# AGENTS.md — AI Coding Agent Guidance

## Project Overview

**Lab Index** is a static site tracking Asian AI research labs, their models, and research outputs. Built with Astro, TypeScript, and Zod-validated YAML data. Deployed on Netlify.

**Live site:** https://ai-lab-tracker.netlify.app/

## Development

```bash
npm install              # Install dependencies
npm run dev              # Dev server at localhost:4321
npm run validate         # Validate all YAML against Zod schemas
npm run build            # Build static site (Astro SSG)
npm run fetch-metrics    # Fetch GitHub/HF/citation metrics
```

**YAML changes are live without restart.** In dev mode, the data loader clears its cache on every page render, so editing YAML files and refreshing the browser shows changes immediately. No need to restart the dev server for data changes. Restarts are only needed for `.astro` template or `.ts` code changes (Vite handles those via HMR automatically).

## Deployment

Hosted on **Cloudflare Pages** (project: `labindex`, domain: `labindex.ai`)
- To deploy: `npx wrangler pages deploy dist --project-name labindex`
- Build command: `npm run build`
- Always run `npm run build` before deploying to catch errors early
- First-time setup: `npx wrangler login` then `npx wrangler pages project create labindex --production-branch main`
- Static output only — do NOT add `@astrojs/cloudflare` adapter (that's for SSR)

## Data Structure

```
data/
  labs/*.yaml           # Lab profiles (one per lab)
  outputs/{lab}/*.yaml  # Research outputs (one dir per lab slug)
  metrics.json          # Impact metrics cache (auto-generated)
src/
  schema.ts             # Zod schemas for Lab and Output types
  data/loader.ts        # Data loading, caching, and query functions
  pages/                # Astro pages (index, timeline, lab, output, articles)
  components/           # Reusable Astro components
public/
  logos/{slug}.png       # Lab logos (named after lab slug, 200x200)
```

## Schema Rules

Schemas are defined in `src/schema.ts`. Always validate after editing YAML: `npm run validate`.

### Lab Schema
- **Required:** name, slug, region
- **Slug:** lowercase alphanumeric with hyphens (e.g., `deepseek`, `lg-ai-research`)
- **Region:** `china`, `korea`, etc.
- **Founded:** `YYYY` or `YYYY-MM` format
- **Type:** `corporate`, `startup`, `nonprofit`, `academic`
- **Valuation date:** `YYYY-MM` format
- **News dates:** `YYYY-MM-DD` format
- **News URLs:** can be absolute URLs or relative paths (e.g., `/articles/...`)
- **Key fields:** url, wikipedia, huggingface, github, artificialanalysis, openrouter, description (HTML in YAML `>` blocks), people, news, tags

### Output Schema
- **Required:** name, slug, lab, date, sources (min 1)
- **Slug:** lowercase alphanumeric with hyphens, dots, underscores
- **Date:** `YYYY-MM-DD` format
- **Type:** `model`, `paper`, `blog`, `library`, `dataset`, `announcement`
- **Sources:** array of `{label, url}` objects
- **Model details:** architecture (`dense`/`moe`), parameters, active_parameters, intelligence_index, context_window, variants
- **Paper details:** arxiv ID, venue
- **Grouped outputs:** use `outputs` array instead of `type` for model families with sub-entries (e.g., model + paper for same release)

### Canonical Identifiers
When adding new outputs, prioritize collecting:
- **arXiv:** Paper IDs (e.g., `2412.19437`)
- **HuggingFace:** Model/Dataset IDs
- **GitHub:** `owner/repo`
- **Artificial Analysis:** Model page URLs (`/models/...`)
- **OpenRouter:** Model page URLs (`/provider/model`)

## Key Conventions

### Descriptions
- Lab descriptions use HTML in YAML `>` blocks (`<p>`, `<strong>`, `<a>`, `&mdash;`)
- Output descriptions can be plain text (single paragraph) or HTML (multiple paragraphs)
- Output descriptions render via `set:html`

### Model Parameters
- Use structured `model.parameters` and `model.active_parameters` fields (e.g., `671B`, `37B`, `1T`)
- The home page derives "Scale" and "Intelligence" columns from these structured fields
- Always include `architecture: dense` or `architecture: moe` when known

### Logos
- Store in `public/logos/{slug}.png` at 200x200 pixels
- Use ImageMagick `convert` to resize if needed

### People
- Include Google Scholar, OpenReview, and personal website URLs when available
- Note departures with role updates (e.g., "Former Core Researcher (departed early 2026)")

### News
- Include source name and date
- For Chinese-language articles, create an English summary as a rendered Astro page under `src/pages/articles/` and link to it

## Code Standards

- **TypeScript** for all scripts and components
- **Zod** schemas for data validation
- Maintain consistency with existing component patterns in `src/components/`
- Home page table columns are sortable — new data fields should include `data-*` attributes and sort logic in the `<script>` block of `src/pages/index.astro`

## Skills

Detailed step-by-step instructions for common tasks are available as agent skills in `.agents/skills/`. These follow the [Agent Skills open standard](https://agentskills.io) and work with Claude Code (`/add-lab`), Gemini CLI, GitHub Copilot, and other tools.

| Skill | Path | When to use |
|-------|------|-------------|
| **add-lab** | [`.agents/skills/add-lab/SKILL.md`](.agents/skills/add-lab/SKILL.md) | Adding a new AI research lab with profile, logo, outputs, and README update |
| **add-output** | [`.agents/skills/add-output/SKILL.md`](.agents/skills/add-output/SKILL.md) | Adding a research output (model, paper, library, dataset) to an existing lab |
| **add-person** | [`.agents/skills/add-person/SKILL.md`](.agents/skills/add-person/SKILL.md) | Adding a researcher or leader to a lab's people section |
| **add-news** | [`.agents/skills/add-news/SKILL.md`](.agents/skills/add-news/SKILL.md) | Adding a news article to a lab's news section |

## Important Notes

- Do not push to GitHub or deploy to Netlify without explicit user approval
- When adding a new lab, also create its output directory, logo, and update README.md
- When splitting grouped outputs, preserve all existing data (sources, descriptions, model details)
- Verify builds pass (`npm run build`) before committing
