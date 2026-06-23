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

**Industry-standard evaluations** (`type: eval`) — benchmarks that became widely adopted for measuring AI capabilities. Use `eval` type for benchmarks used in major composite indices ([AA Intelligence Index](https://artificialanalysis.ai/methodology/intelligence-benchmarking), [Epoch Capabilities Index](https://epoch.ai/benchmarks/eci)) or that most labs report scores on. Examples: GPQA (Anthropic+NYU), HumanEval (OpenAI), RULER (NVIDIA), IFBench (AI2), BBEH (Google), SuperGPQA (ByteDance Seed), Belebele (Meta). Also include **reasoning process benchmarks** that evaluate extended chain-of-thought quality and step-level correctness, not just final answers (e.g., ProcessBench, LongCoT, PRMBench). Do not add narrow/niche benchmarks that didn't achieve broad adoption.

When selecting outputs for a lab, prioritize work that falls into these categories. Do not exhaustively catalog every paper — focus on what matters for understanding the frontier.

### Periodic Arxiv Sweeps

When scanning for new papers from tracked labs, **do not limit searches to a narrow date window.** Papers can take weeks to surface in search results, and important work is easily missed if you only check "this week." Instead:

1. **Search by lab, not by date.** For each prolific lab (ByteDance Seed, Google, Meta, OpenAI, Alibaba, DeepSeek, etc.), search `site:arxiv.org [lab name] 2604` (current month prefix) AND the previous month (`2603`).
2. **Search by known internal team names.** Large companies publish under internal team names that don't contain the parent company name. Known mappings:
   - **Alibaba**: Qwen, Tongyi, DAMO Academy, Accio Team, Ant Group (separate lab)
   - **ByteDance Seed**: FoundationVision, HUST Vision Lab (`hustvl`), Seedance Team
   - **Google**: DeepMind, Google Research, Google Brain (legacy), Gemma Team, Gemini Team
   - **Meta**: FAIR, GenAI, Superintelligence Labs (MSL)
   - **Tencent**: Hunyuan, ARC Lab, AI Lab (now merged), PCG
   - **Microsoft**: MSR Asia, MSR Redmond, Phi Team, GenAI
   - **Huawei**: Noah's Ark Lab, MindSpore
   - **Shanghai AI Lab (PJLab)**: InternLM (`github.com/InternLM`), OpenGVLab (`github.com/OpenGVLab`), and **InternScience** (`github.com/InternScience`) — the autonomous-scientific-discovery line (e.g. InternAgent, formerly NovelSeek). Don't assume all PJLab work lives under InternLM/OpenGVLab.
   When sweeping, search for these team names too, not just the parent company.
3. **Check lab research pages and GitHub orgs directly.** Many significant papers are posted without prominent lab names in the title — they're only discoverable via the lab's own publications page, HuggingFace org, or GitHub repos (e.g., `github.com/bytedance`, `github.com/hustvl` for ByteDance Seed collaborations, `Accio-Lab.github.io` for Alibaba's Accio team).
   - **HuggingFace org "recent uploads" check is the highest-yield single probe** for catching releases that ship without a paper or blog post — datasets especially. Hit the API directly: `curl -sL 'https://huggingface.co/api/models?author=<org>&sort=lastModified&direction=-1&limit=30'` and the parallel `?author=<org>&sort=lastModified` URL for datasets. Real catches that *only* show up this way: Ultra-FineWeb-L3 (OpenBMB, no announcement), WebWorld (Alibaba, paper from Feb but weights re-uploaded May), Qwen SAE residuals. Skip if results match a paper/blog you already saw — but always run the probe.
4. **Search by researcher name for prolific labs.** Key authors at labs like ByteDance Seed, DeepSeek, and Google often publish under university co-affiliations (internships, joint work). Search for known researchers individually (e.g., `arxiv.org author:Lianghui_Zhu`).
5. **Cover at least 4-6 weeks back** from the current date to catch papers that were posted between sweeps.
6. **Search for new evaluation benchmarks independently** — evals often come from multi-institutional collaborations not tied to a single tracked lab and are easily missed by lab-centric sweeps. Run dedicated searches each sweep cycle: `site:arxiv.org benchmark evaluation LLM 2604`, `site:arxiv.org reasoning evaluation benchmark 2604`, `site:arxiv.org "chain of thought" evaluation benchmark 2604`, `site:arxiv.org long reasoning benchmark 2604`. Pay special attention to benchmarks that stress-test **extended reasoning chains** (long CoT), **reasoning process quality** (step-level correctness), and **test-time compute scaling** — these tend to be important for tracking thinking models (o-series, DeepSeek R1, QwQ) and are often from academic groups rather than labs.

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
npm run test:filter      # Filter UI smoke tests (needs dev server running)
npm run test:mobile      # Responsive/mobile smoke tests (needs dev server running)
```

**Run both smoke suites before shipping any UI change.** `test:mobile` asserts zero horizontal overflow on every key page type (home, timeline, lab, output, whats-new) at seven widths plus landscape, and guards desktop regressions (sticky table header, scroll-to-close). Both suites use structural assertions where possible, but `test:filter` pins some data counts that shift when labs are added — if it fails on counts after a data commit, update the expected numbers, don't suppress the test.

**YAML changes are live without restart.** In dev mode, the data loader clears its cache on every page render, so editing YAML files and refreshing the browser shows changes immediately. No need to restart the dev server for data changes. Restarts are only needed for `.astro` template or `.ts` code changes (Vite handles those via HMR automatically).

## Deployment

Hosted on **Cloudflare Pages** (project: `labindex`, domain: `labindex.ai`)

**Recipe for ship-content-changes** (build must happen *after* commit so the `/whats-new` page sees the new commit in `git log`):

```
npm run validate
git add -A && git commit -m "..."
git push origin <branch>:main
npm run build                        # build AFTER commit
npx wrangler pages deploy dist --project-name labindex --branch main
```

**Why the order matters.** `src/data/changelog.ts` shells out to `git log` at build time to populate the `/whats-new` page. If you build *before* committing, the new commit is invisible to the build and the deployed `/whats-new` page misses the latest day. The site looks live and current on the home page but the change feed lies — a silent failure mode.

- First-time setup: `npx wrangler login` then `npx wrangler pages project create labindex --production-branch main`
- Static output only — do NOT add `@astrojs/cloudflare` adapter (that's for SSR)
- Always pass `--branch main` to the deploy so the production alias (labindex.ai) is updated, not just a preview alias.

**Troubleshooting `Invalid access token [code: 9109]`.** Auth normally comes from a `CLOUDFLARE_API_TOKEN` exported in the shell profile, and the env var **takes precedence over `wrangler login` OAuth credentials** — so re-running `wrangler login` does not help while a stale token is exported. Diagnose the token directly:

```bash
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
```

If that returns `Invalid API Token`, the token was rotated/revoked — mint a new one at https://dash.cloudflare.com/profile/api-tokens (needs Cloudflare Pages:Edit) and update the export. This has happened more than once.

## Data Structure

```
data/
  labs/*.yaml           # Lab profiles (57 labs) with people, news, descriptions
  outputs/{lab}/*.yaml  # Research outputs (~870 files, one dir per lab slug)
  metrics.json          # Impact metrics cache (auto-generated)
src/
  schema.ts             # Zod schemas for Lab, Output, and type-specific details
  data/loader.ts        # Data loading, caching, people/news/timeline functions
  pages/
    index.astro         # Home page (sortable lab table)
    timeline.astro      # Timeline (outputs + news, filterable, keyboard nav)
    labs/[slug].astro    # Lab profiles
    outputs/[lab]/[slug].astro  # Output pages with type-specific components
    people/[slug].astro  # Person pages (auto-generated from lab people data)
    search-data.json.ts  # Global search index
  components/
    ModelDetails.astro   # Model specs grid, benchmark scores, variants table
    PaperDetails.astro   # Venue, citations, author→people page linking
    EvalDetails.astro    # Benchmark info, top scores table, composite index badges
    DatasetDetails.astro # Size, format, license, languages
    LibraryDetails.astro # Stars, language, framework, pip package
    TypeBadge.astro      # Colored type badge (model/paper/eval/etc.)
    Layout.astro         # Shared page wrapper with nav and search
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
- **People fields:** name (required), slug (optional, auto-derived from name), url, urls (labeled links array), role, formerly, description (optional HTML bio for person page)
- **People slugs:** auto-derived from name ("Daya Guo" → `daya-guo`). Set explicitly only for disambiguation (e.g., two "Wei Zhang"s).
- **Cross-lab people:** Same person in multiple labs is merged by slug on the person page. Use same name spelling across labs.

### Person Pages
- Generated automatically from `people` arrays across all lab YAML files
- URL: `/people/[slug]` (flat namespace, not nested under labs)
- Cross-lab merging: entries with matching slugs are combined into one page showing all affiliations
- Related outputs: auto-linked by searching output descriptions for the person's name
- News mentions: auto-linked by searching news titles for the person's name

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
- **QbitAI (量子位)** — leading Chinese-language AI news aggregator at [qbitai.com](https://www.qbitai.com/); dense daily coverage of model releases, funding, and papers across Chinese labs. Aggregator rather than primary source, so cross-check claims with the upstream announcement before citing. Translate to English via the `src/pages/articles/` pattern when adding as a news entry.

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
- **Sources:** array of `{label, url}` objects
- **Grouped outputs:** use `outputs` array instead of `type` for model families with sub-entries (e.g., model + paper for same release)

### Type-Specific Structured Fields

Each output type has dedicated structured fields rendered by a type-specific component. All fields are optional — populate what's available.

**Model details** (`model:`):
- Core: `architecture` (dense/moe), `parameters`, `active_parameters`, `context_window`, `training_tokens`, `intelligence_index`, `base_model`, `variants[]`
- MoE: `num_experts`, `top_k`
- Training: `training_hardware`, `training_cost`, `training_time`, `optimizer`
- Meta: `license`
- Performance: `benchmark_scores[]` — array of `{benchmark, score, mode}` for structured display

**Paper details** (`paper:`):
- Core: `arxiv`, `venue`
- Enhanced: `authors[]` (names auto-linked to person pages), `code_url`, `pdf_url`, `huggingface_url`

**Block/type convention:** companion `paper:`/`library:`/`dataset:` blocks on a `type: model` unit are the established pattern (a model release with its paper). The reverse — a `model:` block on a non-model unit — is schema leakage: the entry invisibly escapes every model facet on the timeline. `npm run validate` warns on it; fix by flipping the type (a release that ships weights is a model) or splitting into a grouped output.

**Scale strings must stay machine-parseable.** `parameters`, `active_parameters`, and `training_tokens` feed sortable numeric attributes on the timeline via `src/lib/scale.ts` (accepted: `"671B"`, `"1.5T"`, `"350M"`, with optional `~`/`+`). `npm run validate` warns on values that don't parse — don't put prose in these fields (it belongs in the description).

**Eval details** (`eval:`):
- Scale: `num_tasks`, `num_questions`, `domains[]`
- Method: `scoring_method`, `human_baseline`, `random_baseline`
- Status: `saturation`, `used_in[]` (composite indices), `leaderboard_url`
- Results: `top_scores[]` — array of `{model, score, date}`

**Dataset details** (`dataset:`):
- Core: `github`, `url`, `huggingface_url`
- Enhanced: `size`, `format`, `languages[]`, `license`

**Library details** (`library:`):
- Core: `github` (required)
- Enhanced: `language`, `framework`, `license`, `pip_package`

**Eval type guidance:** Use `eval` for benchmarks used in major composite indices ([AA Intelligence Index](https://artificialanalysis.ai/methodology/intelligence-benchmarking), [Epoch ECI](https://epoch.ai/benchmarks/eci)) or that most labs report scores on. Do not add narrow/niche benchmarks.

### Timeline Type-Scoped Filters, Columns & Sorts

The timeline's metric columns, filters, and sorts all follow the Type filter. Narrowing Type to one output type swaps the table to that type's column set (`COLSETS` in `timeline.astro`: general → Stars/Downloads/Citations; model → Params/Active/Tokens/Context/Intel/Open; paper → Citations/Stars; eval → Questions/Tasks/Citations; library/dataset → their adoption metrics) and reveals that type's filter dimensions (`visibleWhen` on `FilterDimension`, generic in `src/lib/filters/`). Conventions that keep this honest:

- **Containment semantics.** Row attributes answer "does this release *contain* a model with X": `data-arch` is the union across all model units in the file; numeric attrs are the file-wide max across units, variants, and `parameters_estimated` (`getModelFacets`/`getEvalFacets` in `src/data/loader.ts`). Cells mark derived values: `~` = third-party estimate, `(max)` = largest family variant — so a displayed number that matches no top-level field is self-explaining (the top-level-anchoring rule is about *displayed* values; filtering deliberately uses containment).
- **Suspend, don't destroy.** When the Type filter widens, scoped filter state is suspended — excluded from matching, chips, and the URL, but restored when the scope returns. A bare `?arch=moe` URL never filters invisibly; it activates if Type is later narrowed to model. Implemented as pure state normalization (`effectiveState` in `src/lib/filters/state.ts`), never via event listeners. Sorts follow the same scope: a sort whose column isn't in the active set reverts to date.
- **All metric columns are server-rendered** (cells filled, headers sortable `<th>`s); the page script only toggles `table[data-colset]`. The colset show/hide CSS is *generated in the frontmatter from the same `COLSETS`/`COLUMNS` source as the markup* and injected as an inline `<style>` — don't hand-edit parallel selector lists. Header clicks are the desktop sort affordance (second click = ascending); the sort `<select>` is the ≤768px touch alternative and rebuilds its options per colset; the `s` key cycles date + the active set.
- **Trim tiers are measured, not estimated.** The 6-column model set's min-content is a measured 884px — a banded 769–900px tier hides Tokens/Context/Open (except the actively-sorted one); the model colset also applies the 1080px rigid-column relaxations at all widths (measured overflow band 1081–1240px otherwise). Re-measure with the Playwright sweep when adding a column.
- **Intelligence facet is AA v4-only.** `data-intel` carries only `intelligence_index` values whose version starts with `AA v4` — unversioned pre-recalibration scores are not comparable and are excluded (they're the re-verification work-list).
- **Sort select labels stay short.** The view bar has zero slack at 360px; a wide `<select>` clips the view-toggle buttons inside `overflow: hidden`, invisible to scrollWidth checks (guarded by a `test:mobile` clip assertion).
- **Page scripts pull initial filter state** via `filterBarEl.__filterBarApi.getState()` after attaching their `filters:changed` listener — module fetch order can delay a page script past the FilterBar's deferred initial dispatch; the handshake covers both orders.

### Artificial Analysis Intelligence Index

The `intelligence_index` field records a model's score on Artificial Analysis's composite Intelligence Index. **Always also set the sibling `intelligence_index_version` field** so future sweeps can spot stale values.

```yaml
model:
  intelligence_index: 44
  intelligence_index_version: "AA v4.1"   # current AA Intelligence Index version (June 2026)
```

**Whenever you set `intelligence_index`, also add the matching AA model page to `sources`.** This is the canonical link to the AA-scored variant and the only handle the `fetch-aa-openness` script uses to map our outputs to AA's slugs — without it, the AAOI backfill silently skips the entry. Format:

```yaml
sources:
  - label: Artificial Analysis
    url: https://artificialanalysis.ai/models/<aa-slug>
```

Use the slug that AA's URL actually serves. AA's slug often differs from ours: labindex `hy3` → AA `hy3`; labindex `ministral-3` → AA `ministral-3-3b`; labindex `jamba` → AA `jamba-1-7-large`. HEAD the URL before committing.

**Pick the right score within a single model's family.** Many models have multiple AA entries representing modes (base, reasoning, adaptive, max effort). Use the **highest mode score**, link the AA source to that mode's page:

- `claude-opus-4-6` (46) vs `claude-opus-4-6-adaptive` (53) — use 53
- `deepseek-v3-2` (32) vs `deepseek-v3-2-reasoning` (42) — use 42

**Pick the right model when an entry covers a family.** When a YAML file represents a multi-model family (e.g., `o3.yaml` containing o3-mini, o3, o4-mini, o3-pro), the top-level `intelligence_index` should match the model named by the file slug and the AA URL in `sources` — not blindly the highest variant. Higher variants belong in the description and the `variants` list. Otherwise users cross-checking against AA see a number that doesn't match the linked page (a real source of confusion).

Rule of thumb: the top-level number, the file slug, and the primary AA URL should always describe the same thing.

**The version trap.** AA periodically recalibrates the composite. Each version change can drop scores 10+ points as evals are swapped/updated. AA v4.0 (composite of GDPval-AA, τ²-Bench Telecom, Terminal-Bench Hard, SciCode, AA-LCR, AA-Omniscience, IFBench, Humanity's Last Exam, GPQA Diamond, CritPt) shipped late 2025 and silently invalidated many older scores — Granite 4.0 H-Small went 23 → 11 across that migration. **v4.1 (current, June 2026)** updated GDPval-AA→V2, τ²-Banking→τ³-Banking, and Terminal-Bench Hard→v2.1, recalibrating everything downward again (e.g. Kimi-K2.6 54 → 43, Grok-4.20 49 → 37). Treat any score tagged below the current version as needing re-verification; refresh the whole set with `npm run fetch-aa-intelligence` (bump its `AAII_VERSION` constant first).

**Audit pattern.** When AA bumps to a new index version:

1. Run `npm run fetch-aa-intelligence` (or `-- --dry-run` first). It pulls all ~500 scored records from AA's models-leaderboard RSC payload in one request, matches each output's AA URL slug, and rewrites `intelligence_index` + `intelligence_index_version` in place. It never *adds* scores — anchoring a new entry to the right variant/mode is a curation decision.
2. The script's "slug not on leaderboard" list is the manual work-list: renamed slugs (AA renamed `glm-4-5` → `glm-4.5`), models retired from the index, or files whose AA URL is missing/an `/articles/` link. Resolve each, then re-run.
3. Models AA no longer scores keep their number with an explicit tag: `"pre-v4 (not in current AA index; unverifiable as of YYYY-MM-DD)"` for never-v4-verified scores (excluded from the timeline Intelligence facet), or `"AA v4.0 (delisted from AA leaderboard as of YYYY-MM-DD)"` for v4-verified scores AA later dropped (still v4-comparable, stays in the facet).
4. **Large score drops from the sync are usually anchoring bugs, not rescores.** When AA splits a model into mode/variant slugs, a URL pointing at the non-reasoning or small-variant page silently downgrades the score. Check the family's full slug list before accepting a big drop — the fix is usually correcting the URL to the highest-*mode* page (same model), while size *variants* stay in the variants list per the anchoring rule.

**Useful URLs:**
- Per-model: `https://artificialanalysis.ai/models/<slug>`
- Provider: `https://artificialanalysis.ai/providers/<provider>`
- Leaderboard: `https://artificialanalysis.ai/leaderboards/models` — best for surveying many models at once

### Artificial Analysis Openness Index

The `openness_index` field records a model's score on [AA's Openness Index](https://artificialanalysis.ai/evaluations/artificial-analysis-openness-index), a composite of model availability (weights access + commercial license) and transparency (pre/post training data, methodology, code). Score is 0–100, always a multiple of 1/18 ≈ 5.56 — we store the value rounded to one decimal. Always set the sibling `openness_index_version` (currently `"AA Openness Index v1.0"`).

```yaml
model:
  openness_index: 44.4
  openness_index_version: "AA Openness Index v1.0"
```

**Per-checkpoint rule.** AA scores AAOI on individual checkpoints; the value here MUST come from the same AA model entry whose `intelligence_index` we recorded — *not* the family's max openness. E.g., if `intelligence_index` is the score for `qwen3-vl-32b-reasoning`, then `openness_index` is AAOI's number for `qwen3-vl-32b-reasoning` too (50), not the higher value some other Qwen3 variant has.

**Family-inference fallback** for the version-drift backlog. The per-checkpoint rule is the strict ideal, but the AAOI rubric is fundamentally *lab-level* (weights access, commercial license, training-data disclosure, methodology disclosure, code license) — a new closed-frontier checkpoint from a lab whose openness profile hasn't moved gets the same AAOI as every other variant. When AA has scored ≥3 sibling checkpoints from a family at a **uniform** AAOI value, you may apply that value to an unscored sibling with two markers so the inference is audit-trail-visible:

```yaml
model:
  openness_index: 5.6
  openness_index_version: "AA Openness Index v1.0 (family inference)"  # ← parenthetical tags the inference
```

Plus one line in the description noting the inference, e.g.: *"Openness Index inferred from family profile — AA has scored N sibling Gemini checkpoints at uniform 5.6 as of YYYY-MM-DD; this checkpoint not yet directly scored."*

Eligible families (as of the last sweep): Anthropic (all 11.1), Amazon Nova (all 11.1), Google Gemini reasoning-tier (all 5.6), OpenAI closed-GPT reasoning-tier (all 5.6). Open-weight families (DeepSeek, Qwen3, Llama, Mistral, Gemma) routinely have AAOI spread across variants and are **NOT** eligible — those entries stay openness-unset until AA scores them directly.

When AA later scores the checkpoint, `fetch-aa-openness` will overwrite the inferred value with the directly-scored one and the version tag returns to the un-parenthetical form. Grep for `(family inference)` to find inferred values needing re-verification.

**Coverage gap.** AAOI v1.0 covers ~234 models; AAII covers 357+. Many of labindex's current-checkpoint entries (`claude-opus-4-7`, `gpt-5-5`, `gemini-3-1-pro-preview`, `nova-2-0-pro`) aren't in AAOI yet — AAOI tracks older snapshots. Leave `openness_index` unset in that case (or apply the family-inference fallback above when eligible); the home page Openness column falls back to the highest-AAII labindex model that *does* have an AAOI (see `getTopIntelligence` in `src/data/loader.ts`).

**Backfill workflow.** Run `npm run fetch-aa-openness` (or `npm run fetch-aa-openness -- --dry-run`). The script pulls AA's openness leaderboard via its React Server Component endpoint (one request, full 234-record dataset), matches each labindex output's AA URL slug, and writes the score+version into the YAML. It also lists slugs that have an AA URL but no AAOI entry — those are the manual-attention cases.

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
- **Always link to people pages** when mentioning a researcher by name in descriptions. Check if we track them (search `data/labs/` for the name), and if so, link: `<a href="/people/yao-shunyu">Yao Shunyu</a>`. This connects outputs to people and improves navigation.

### Model Parameters
- Use structured `model.parameters` and `model.active_parameters` fields (e.g., `671B`, `37B`, `1T`)
- The home page derives "Scale" and "Intelligence" columns from these structured fields
- Always include `architecture: dense` or `architecture: moe` when known

#### Estimated parameters (third-party, non-vendor-disclosed)

Some closed proprietary models have parameter-count estimates from third-party methodologies (currently the IKP paper, [arXiv:2604.24827](https://arxiv.org/abs/2604.24827), which back-calibrates from factual recall on 89 open-weight models). **Never overwrite vendor-disclosed `parameters` with these estimates.** Use the separate `parameters_estimated` field with structured provenance:

```yaml
model:
  parameters_estimated:
    value: "9.7T"
    source: https://arxiv.org/abs/2604.24827
    source_label: "IKP factual-capacity estimate (Li 2026)"
    method: ikp-factual-capacity
    posted: "2026-04-27"
    notes: "90% PI [3.2T–28.7T]"
```

The home page Scale column shows `max(parameters, parameters_estimated.value)` with a small `~` marker when the estimate wins. The schema is in `src/schema.ts` (`ParametersEstimatedSchema`). The same shape generalises to any future "third-party estimate of a thing the vendor didn't disclose" — keep the authoritative field clean and put estimates in a sibling field with the source recorded.

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
- Home page table columns are sortable — new data fields should include `data-*` attributes and sort logic in the `<script>` block of `src/pages/index.astro`, AND must be assigned to a responsive trim tier (see below) — the width budgets are measured and tight, so an untiered new column reintroduces horizontal scroll on phones. Re-run `npm run test:mobile` after adding one.

## Responsive & Mobile UI Conventions

Established in the issue #17 mobile overhaul. The deeper rationale and the traps that motivated each rule are in [DESIGN_NOTES.md](./DESIGN_NOTES.md).

- **600px is the site-wide phone breakpoint.** It matches `isMobile()` in `src/lib/filters/position.ts` and the FilterBar bottom-sheet media query. Write new phone-tier media queries at 600px; do not introduce nearby breakpoints (640px was explicitly rejected). The home table additionally trims columns at 1104/880/720px (and drops the rank column inside the 600px phone tier); the timeline hides metric columns at 768px.
- **Tables stay tables; responsiveness is CSS-only.** All table interactivity (sorting, filtering, rank renumbering, selection) reads row `data-*` attributes — never visible cell content. That invariant is what makes `display: none` column tiers and the stacked timeline rows safe. Don't break it.
- **Never wrap a sticky-header table in `overflow-x: auto`.** Any non-visible overflow ancestor becomes the sticky element's scroll container and the header silently stops pinning at every width, including desktop. Guarded by a `test:mobile` desktop check. (Non-sticky inner tables, e.g. variants/benchmarks, do use scroll wrappers.)
- **Every keyboard shortcut's function must be reachable on touch** — by native tap where that suffices (row taps cover j/k/o/Enter; nav links cover the g-chords), by visible UI where the shortcut's surface disappears on phones (the timeline sort `<select>` covers `s` since the metric headers are hidden — all sort entry points sync through `sortRows()`, keep it the single sync point; the back-to-top button covers `gg`). Keyboard-only *chrome* (kbd badges, shortcut legends, the `?` hint) gets the global `.kbd-only` class, hidden on touch via `global.css`.
- **Text inputs get `font-size: 16px` under `@media (pointer: coarse)`.** iOS Safari auto-zooms on focusing any input below 16px, keyed on computed font-size — width-based queries miss landscape phones.
- **No autofocus on mobile panel-open.** Focusing an input pops the soft keyboard over the bottom sheet (and triggers the iOS zoom). Gate focus calls behind `!isMobile()` — see the existing pattern in `src/lib/filters/runtime.ts`.
- **Bottom sheets**: `max-height: 80dvh` (with `vh` fallback), `padding-bottom: max(env(safe-area-inset-bottom), …)` — `env()` only works because `viewport-fit=cover` is set in `Layout.astro`'s viewport meta. Body scroll-lock uses the `fb-sheet-open` class whose `overflow: hidden` lives *inside* the ≤600px media query, so desktop scroll-to-close keeps working.
- **Long unbroken tokens need `overflow-wrap: anywhere`; multi-item rows need `flex-wrap`.** Raw URLs, model/dataset IDs, and HF repo names set a container's min-content width and reintroduce phone overflow. Any new component rendering prose, notes, or value strings gets `overflow-wrap: anywhere` on those containers; title/header/link rows holding multiple items get `flex-wrap: wrap`.
- **Small controls get enlarged hit areas inside `@media (pointer: coarse)`** (see `.chip-x` in `FilterBar.astro`, the nav search button in `Layout.astro`). Caveat: a control at the container's right edge must not gain right padding that paints past the viewport.
- **Global key handlers must check `e.target`.** A document- or panel-level keydown handler that runs single-letter shortcuts without excluding input targets makes those letters untypeable (the filter typeahead once swallowed `a`/`n`/`i` — "anthropic" couldn't be typed).
- **Measure, don't estimate.** When planning layout changes, compute real widths in headless Chromium (Playwright is a devDependency) instead of arithmetic from the CSS — estimated column budgets were wrong twice during the mobile overhaul. `tests/mobile-smoke.mjs` shows the measurement pattern.

## Skills

Detailed step-by-step instructions for common tasks are available as agent skills in `.agents/skills/`. These follow the [Agent Skills open standard](https://agentskills.io) and work with Claude Code (`/add-lab`), Gemini CLI, GitHub Copilot, and other tools.

| Skill | Path | When to use |
|-------|------|-------------|
| **add-lab** | [`.agents/skills/add-lab/SKILL.md`](.agents/skills/add-lab/SKILL.md) | Adding a new AI research lab with profile, logo, outputs, and README update |
| **add-output** | [`.agents/skills/add-output/SKILL.md`](.agents/skills/add-output/SKILL.md) | Adding a research output (model, paper, library, dataset) to an existing lab |
| **add-person** | [`.agents/skills/add-person/SKILL.md`](.agents/skills/add-person/SKILL.md) | Adding a researcher or leader to a lab's people section |
| **add-news** | [`.agents/skills/add-news/SKILL.md`](.agents/skills/add-news/SKILL.md) | Adding a news article to a lab's news section |
| **ui-change** | [`.agents/skills/ui-change/SKILL.md`](.agents/skills/ui-change/SKILL.md) | Changing layout, components, or styles — conventions, measurement-first planning, and the verification loop |

## Important Notes

- **NEVER push to GitHub or deploy to Cloudflare Pages without explicit user approval.** Always ask first — even if the user just asked you to "commit", that does not mean push. Wait for a clear "push", "deploy", or "push and deploy" instruction.
- When adding a new lab, also create its output directory, logo, and update README.md
- When splitting grouped outputs, preserve all existing data (sources, descriptions, model details)
- Verify builds pass (`npm run build`) before committing
