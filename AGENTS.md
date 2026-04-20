# AGENTS.md — AI Coding Agent Guidance

## Project Overview

**Lab Index** is a static site tracking global AI research labs, their models, and research outputs. Built with Astro, TypeScript, and Zod-validated YAML data. Deployed on Cloudflare Pages.

**Live site:** https://labindex.ai/

## Research Focus

We are primarily interested in tracking:

**Frontier foundation models** — large-scale models that push the state of the art in:
- Language understanding and generation
- Reasoning and chain-of-thought (including "thinking" / test-time compute scaling)
- Coding and software engineering (SWE-Bench, HumanEval, agentic coding)
- Multi-turn agentic work (tool use, function calling, long-horizon planning)
- Multimodal capabilities (vision, audio, video understanding and generation)

**Scientific foundation models** — large-scale models for scientific domains with:
- Evidence of transfer learning across tasks/domains
- Sci-LLMs that augment general LLMs with domain-specific tokenizers, modalities, knowledge, reasoning, or agentic capabilities
- Materials science, drug discovery, weather/climate, protein structure, genomics

**Foundational technique papers** — research that introduced or popularized methods now standard across frontier labs:
- Architecture: attention mechanisms, MoE routing, vision tokenization, multimodal fusion
- Training: optimizers (Adam, AdEMAMix), scaling laws, data mixture optimization, curriculum learning
- Post-training: RLHF, DPO, GRPO, process reward models
- Efficiency: quantization, distillation, parameter-efficient fine-tuning (LoRA)
- Scaling science: compute-optimal training, scaling laws for specific domains (multimodal, forgetting, data mixtures)

**Training infrastructure** — frameworks, datasets, evaluation suites, and data curation methods that enable frontier model development.

**Industry-standard evaluations** (`type: eval`) — benchmarks that became widely adopted for measuring AI capabilities. Use `eval` type for benchmarks used in major composite indices ([AA Intelligence Index](https://artificialanalysis.ai/methodology/intelligence-benchmarking), [Epoch Capabilities Index](https://epoch.ai/benchmarks/eci)) or that most labs report scores on. Examples: GPQA (Anthropic+NYU), HumanEval (OpenAI), RULER (NVIDIA), IFBench (AI2), BBEH (Google), SuperGPQA (ByteDance Seed), Belebele (Meta). Do not add narrow/niche benchmarks that didn't achieve broad adoption.

When selecting outputs for a lab, prioritize work that falls into these categories. Do not exhaustively catalog every paper — focus on what matters for understanding the frontier.

### Periodic Arxiv Sweeps

When scanning for new papers from tracked labs, **do not limit searches to a narrow date window.** Papers can take weeks to surface in search results, and important work is easily missed if you only check "this week." Instead:

1. **Search by lab, not by date.** For each prolific lab (ByteDance Seed, Google, Meta, OpenAI, Alibaba, DeepSeek, etc.), search `site:arxiv.org [lab name] 2604` (current month prefix) AND the previous month (`2603`).
2. **Check lab research pages and GitHub orgs directly.** Many significant papers are posted without prominent lab names in the title — they're only discoverable via the lab's own publications page, HuggingFace org, or GitHub repos (e.g., `github.com/bytedance`, `github.com/hustvl` for ByteDance Seed collaborations).
3. **Search by researcher name for prolific labs.** Key authors at labs like ByteDance Seed, DeepSeek, and Google often publish under university co-affiliations (internships, joint work). Search for known researchers individually (e.g., `arxiv.org author:Lianghui_Zhu`).
4. **Cover at least 4-6 weeks back** from the current date to catch papers that were posted between sweeps.

### What to Exclude

Do **not** add outputs that are:
- **Business-specific applications** — delivery logistics, recommendation systems, e-commerce search, customer service tools, mobile infrastructure
- **Narrow benchmarks/datasets** — unless they became industry standards (MMLU, HumanEval, SWE-Bench are fine; a niche lip-reading dataset is not)
- **Low-impact minor outputs** — small papers with <500 GitHub stars and no notable citations, unless they are science-related or first-in-series

**Retention criteria** (when auditing existing outputs):
- **High GitHub stars** (1K+) — signals community adoption
- **First-in-series** — the original in a model lineage (e.g., CogView 1 before CogView 2/3/4, CPM-1 before MiniCPM)
- **Science-related** — biology, chemistry, physics, materials science, weather, protein design
- **Core to lab identity** — the DETR family is IDEA Lab's identity; the CPM series is OpenBMB's identity

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

### Priority News Sources

When searching for news about labs, prioritize these sources in order. Tier 1 sources should be checked for every lab; lower tiers are region- or topic-specific.

**Tier 1 — Check weekly (highest signal):**
- **Lab's own blog/newsroom** — always first and most authoritative for model launches and papers
- **Bloomberg** — funding rounds, valuations, strategic pivots, China AI corporate moves
- **TechCrunch** — startup fundraising and product launches
- **CNBC** — major corporate AI milestones (earnings, infrastructure)
- **The Information** — paywalled exclusives on internal strategy, unreported fundraising, team departures

**Tier 2 — Check biweekly (strong regional/specialist signal):**
- **ChinaTalk** — deep analytical pieces on Chinese labs
- **SCMP (South China Morning Post)** — broadest English-language Chinese tech/AI coverage
- **VentureBeat** — enterprise AI launches and open-weight model coverage
- **Caixin** — Chinese business/tech investigative journalism (English edition)
- **LatePost (晚点)** — Chinese-language investigative tech; frequently breaks stories about lab internals
- **Reuters** — global corporate AI news, IP/trade disputes, regulation
- **36Kr (36氪)** — premier Chinese startup news; breaks funding rounds before Bloomberg

**Tier 3 — Check when relevant (region/event-triggered):**
- **Nikkei Asia** — best for Japan/Korea lab coverage (PFN, NII, SB Intuitions, Naver)
- **Korea Times** — Korean lab news (Kakao, Naver, SKT, LG, Upstage)
- **GeekWire** — Pacific Northwest focus (AI2, Amazon)
- **Calcalist** — Israeli tech (AI21 Labs)
- **Pandaily** — China AI in English
- **Wired / Ars Technica / The Verge** — longer-form AI analysis and major launch coverage
- **Latent Space / Interconnects** — AI community deep-dives, technical context behind model launches

### Output Schema
- **Required:** name, slug, lab, date, sources (min 1)
- **Slug:** lowercase alphanumeric with hyphens, dots, underscores
- **Date:** `YYYY-MM-DD` format
- **Type:** `model`, `paper`, `blog`, `library`, `dataset`, `eval`, `announcement`
- **Eval type:** Use `eval` for benchmarks, evaluation suites, and leaderboards that became industry standards or are used in major composite indices (AA Intelligence Index, Epoch ECI). Examples: GPQA, IFBench, SuperGPQA, SWE-Bench. Routine narrow benchmarks that didn't achieve broad adoption should not be added.
- **Sources:** array of `{label, url}` objects
- **Model details:** architecture (`dense`/`moe`), parameters, active_parameters, intelligence_index, context_window, training_tokens, variants
- **Training tokens:** string like `"28.5T"`, `"15T"`, `"500B"` — the total pretraining token count from the technical report. Capture this whenever a tech report discloses it.
- **Paper details:** arxiv ID, venue
- **Grouped outputs:** use `outputs` array instead of `type` for model families with sub-entries (e.g., model + paper for same release)

### Artificial Analysis Intelligence Index

The `intelligence_index` field should reflect the **highest available score** for that model on Artificial Analysis. Many models have multiple AA entries (e.g., base, reasoning, adaptive reasoning, max effort). Always check for reasoning/thinking variants — they often score significantly higher:

- `claude-opus-4-6` (46) vs `claude-opus-4-6-adaptive` (53) — use 53
- `deepseek-v3-2` (32) vs `deepseek-v3-2-reasoning` (42) — use 42

**How to verify:** Fetch the AA model page and check for variant tabs or related model links. The AA URL in `sources` should point to the highest-scoring variant's page.

### Canonical Identifiers
When adding new outputs, prioritize collecting:
- **arXiv:** Paper IDs (e.g., `2412.19437`)
- **HuggingFace:** Model/Dataset IDs
- **GitHub:** `owner/repo`
- **Artificial Analysis:** Model page URLs (`/models/...`) — link to the highest-scoring variant
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

- **NEVER push to GitHub or deploy to Cloudflare Pages without explicit user approval.** Always ask first — even if the user just asked you to "commit", that does not mean push. Wait for a clear "push", "deploy", or "push and deploy" instruction.
- When adding a new lab, also create its output directory, logo, and update README.md
- When splitting grouped outputs, preserve all existing data (sources, descriptions, model details)
- Verify builds pass (`npm run build`) before committing
