---
name: add-lab
description: Add a new AI research lab to the tracker with profile, logo, outputs, and README update
---

# Add a New Lab

## 1. Deep Research

Conduct thorough research **before creating any files**. Launch 2-3 research agents in parallel for speed:
- Agent 1: Corporate details, URLs, people profiles, news
- Agent 2: All models and papers (chronological), arxiv/HuggingFace/GitHub

Use this prompt template, adapting for the specific lab:

> Tell me everything you can about [LAB NAME] research. What is their flagship model family, how many releases have they done, what is the best intelligence score they have achieved on Artificial Analysis, when were they founded, how much funding have they raised (or what is their current market cap if public), what other important papers, code, or datasets have they released, who are the 3-5 most significant people who lead or contribute to their AI research (with Google Scholar and OpenReview links), what are their GitHub and HuggingFace organizations, and what is their OpenRouter provider page? Do extensive research, double check all of your assertions, then produce a report with no preamble.

### Required Information

**Corporate & Financial:**
- Official name and common short name (for `name` field)
- Founding year (company, not just the AI lab)
- Region/country
- Type: `corporate`, `startup`, `nonprofit`, `academic`
- For public companies: stock exchange, ticker, IPO year, current market cap
- For startups: latest valuation, funding total, key investors

**URLs (verify each exists):**
- Official website, Wikipedia page
- GitHub org(s) — some labs have multiple (e.g., Naver: `naver`, `naver-ai`, `clovaai`)
- HuggingFace org(s)
- Artificial Analysis provider page: search `site:artificialanalysis.ai [lab name]`
- OpenRouter provider page: search `site:openrouter.ai [lab name]`

**Research Outputs (search all three):**
- arxiv: `site:arxiv.org [lab name]` and search for specific model names
- HuggingFace: `site:huggingface.co [lab org name]`
- GitHub: check repos in their org(s)

**For each model found:** total/active parameters, architecture (dense/MoE), context window, training tokens, benchmark scores, AA intelligence score, OpenRouter availability

**People (3-5 key figures):** name, role, Google Scholar URL, OpenReview URL, personal website, former affiliations. Verify it's the right person (common names are tricky).

### Research Verification

- Cross-reference parameter counts between arxiv papers, HuggingFace model cards, and press
- Verify market cap/valuation against financial data sources
- Confirm people are currently at the lab (check dates)
- Distinguish published (arxiv) vs reported (press) parameter counts

## 2. Download Logo

**Best source for AI companies: LobeHub icons.** This works more reliably than Wikipedia for newer companies:

```bash
curl -sL "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/{name}-color.png" -o public/logos/{slug}.png
file public/logos/{slug}.png   # Must say "PNG image data", not "HTML document"
```

Common names to try: `mistral`, `deepseek`, `upstage`, `zhipu`. Check the [LobeHub repo](https://github.com/lobehub/lobe-icons/tree/master/packages/static-png/dark) if unsure of the filename.

**Fallback: Wikimedia Commons.**
1. Find the logo on the lab's Wikipedia page, click through to the file page
2. Note the path (e.g., `/wikipedia/commons/2/2d/SK_Telecom_Logo.svg`)
3. Construct: `https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/SK_Telecom_Logo.svg/500px-SK_Telecom_Logo.svg.png`
4. Try `/wikipedia/commons/` first, then `/wikipedia/en/`
5. Do NOT add a User-Agent header

**Always verify and resize:**
```bash
file public/logos/{slug}.png          # Must be "PNG image data"
convert public/logos/{slug}.png -resize 200x200 -gravity center -background white -extent 200x200 public/logos/{slug}.png
```

**Last resort — ask the user** for a logo URL, or create a placeholder:
```bash
convert -size 200x200 xc:'#brand-color' -gravity center -pointsize 28 -fill white -annotate 0 'Name' public/logos/{slug}.png
```

## 3. Create Lab YAML

Create `data/labs/{slug}.yaml`. Reference similar labs (e.g., `mistral.yaml` for European startups, `deepseek.yaml` for Chinese startups, `lg-ai-research.yaml` for Korean corporates).

```yaml
name: Lab Name
slug: lab-slug
url: https://...
wikipedia: https://en.wikipedia.org/wiki/...
huggingface: https://huggingface.co/...
github: https://github.com/...
artificialanalysis: https://artificialanalysis.ai/providers/...
openrouter: https://openrouter.ai/provider-slug
region: country                  # china, korea, france, usa, etc.
founded: "YYYY"
type: startup                    # corporate, startup, nonprofit, academic
valuation:
  amount: "$14B"
  type: private                  # market-cap, private, or revenue
  date: "2025-09"
description: >
  <p>Paragraph 1: identity, founding, backing, scale (funding, revenue, team size).</p>
  <p>Paragraph 2: flagship model evolution (chronological, with links and numbers).</p>
  <p>Paragraph 3: other notable research, products, and what makes this lab distinctive.</p>
people:
  - name: Person Name
    url: https://personal-site.com/
    role: Current Role
    formerly: Previous Company (Role); PhD University
    urls:
      - label: Google Scholar
        url: https://scholar.google.com/citations?user=XXXXX
      - label: OpenReview
        url: https://openreview.net/profile?id=~Name1
news:
  - title: "News Headline"
    url: https://...
    source: Publication
    date: YYYY-MM-DD
tags:
  - relevant-tags
```

### New Region Check

If this is the first lab from a new country, add the country's flag emoji to the `regionFlags` map in `src/pages/index.astro`:
```typescript
const regionFlags: Record<string, string> = {
  china: '\u{1F1E8}\u{1F1F3}',
  korea: '\u{1F1F0}\u{1F1F7}',
  france: '\u{1F1EB}\u{1F1F7}',
  // add new country here
};
```

### Description Guidelines
- Write in HTML using `<p>`, `<strong>`, `<a>`, `&mdash;` within YAML `>` blocks
- Link to arxiv papers, GitHub repos, and other lab pages (`<a href="/labs/deepseek">`)
- Include concrete numbers: parameter counts, training tokens, benchmark scores, funding
- Tell a story — what makes this lab distinctive?

## 4. Create Outputs

```bash
mkdir -p data/outputs/{slug}
```

See `/add-output` for detailed format. Key decisions:

### What Gets Its Own Output Page

**Create an output for:**
- Each major model family or version (Mistral 7B, Mixtral 8x7B, Mistral Large 2, Mistral Large 3)
- Each distinct product line (Codestral, Pixtral, Voxtral, Magistral)
- Papers with arxiv IDs
- Widely-used open-source tools/libraries

**Do NOT create separate outputs for:**
- Point releases within the same version (v0.1, v0.2, v0.3 of the same model)
- Size variants of the same version (use `model.variants` instead)
- Instruct/Chat fine-tunes of a base model (note in the base model's description)
- Deprecated models superseded by a direct successor

### Flagship Criteria

Mark `flagship: true` only for models that represent a **step change** for the lab:
- New architecture or scale milestone (first MoE, first 100B+, etc.)
- New capability (first multimodal, first reasoning, first code model)
- Current best model in a product line

Do NOT mark as flagship: minor updates, size variants, specialized fine-tunes.

### Proprietary Models with Undisclosed Details

Some models are API-only with no published parameter counts:
- Note "undisclosed" in the description if parameters are unknown
- Do not guess — only include structured `model.parameters` if confirmed
- Still include `model.intelligence_index` if AA has scored the model
- Still include OpenRouter links

## 5. Add OpenRouter Links

Fetch the provider page (e.g., `openrouter.ai/mistralai`) and map models to outputs.

- Add `openrouter:` to the lab YAML
- For each output with a corresponding OpenRouter model, add an OpenRouter source link
- OpenRouter often has many more models than we have outputs (e.g., 42 vs 16 for Mistral). This is expected — we don't need an output for every OpenRouter variant.

## 6. Update README.md

- Increment the lab count
- Add the lab name to the appropriate country (alphabetical)
- If first lab from a new country, add a new country section
- Update the description if it says "Asian" and the lab is not from Asia

## 7. Validate and Build

```bash
npm run build        # Verify page count increased and no errors
```

Restart dev server: `pkill -f "astro dev"; npm run dev`

## 8. Checklist

- [ ] Deep research completed with parallel agents
- [ ] Logo verified as PNG and resized to 200x200
- [ ] Lab YAML with all fields, 2-3 paragraph HTML description
- [ ] People with Scholar/OpenReview links
- [ ] News items for major recent events
- [ ] Outputs created for major models/papers (not every minor variant)
- [ ] `flagship: true` only for genuine milestones
- [ ] Structured model fields (architecture, parameters, context_window) where confirmed
- [ ] AA intelligence scores where available
- [ ] OpenRouter links at lab and model level
- [ ] Region flag exists in `index.astro` for this country
- [ ] README.md updated
- [ ] `npm run build` passes

## Updating an Existing Lab

1. **Read the current file first** — don't overwrite existing content
2. **Enrich, don't replace** — weave new info into existing paragraphs
3. **Verify claims** — search the web to confirm new facts
4. **Valuation updates** — update both `amount` and `date`
5. **Slug/name renames** — high-impact: requires renaming YAML, output dir, all `lab:` refs, logo, metrics.json, and cross-references
