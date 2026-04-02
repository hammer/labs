---
name: add-lab
description: Add a new AI research lab to the tracker with profile, logo, outputs, and README update
---

# Add a New Lab

Follow these steps to add a new AI research lab to the tracker.

## 1. Deep Research

Before creating any files, conduct thorough research using multiple sources. Use this prompt template as a starting point, adapting it for the specific lab:

> Tell me everything you can about [LAB NAME] research. What is their flagship model family, how many releases have they done, what is the best intelligence score they have achieved on Artificial Analysis, when were they founded, how much funding have they raised (or what is their current market cap if public), what other important papers, code, or datasets have they released, who are the 3-5 most significant people who lead or contribute to their AI research (with Google Scholar and OpenReview links), what are their GitHub and HuggingFace organizations, and what is their OpenRouter provider page? Do extensive research, double check all of your assertions, then produce a report with no preamble.

### Required Information

Gather and **verify** all of the following before creating files:

**Corporate & Financial:**
- Official name and common short name (for `name` field)
- Founding year (company, not just the AI lab)
- Region/country
- Type: `corporate`, `startup`, `nonprofit`, `academic`
- For public companies: stock exchange, ticker, IPO year, current market cap
- For startups: latest valuation, funding total, key investors

**URLs (verify each exists):**
- Official website
- Wikipedia page
- GitHub organization(s) — note: some labs have multiple (e.g., Naver has `naver`, `naver-ai`, `clovaai`)
- HuggingFace organization(s)
- Artificial Analysis provider page: search `site:artificialanalysis.ai [lab name]`
- OpenRouter provider page: search `site:openrouter.ai [lab name]`

**Research Outputs (search all three):**
- arxiv: `site:arxiv.org [lab name]` and search for specific model/paper names
- HuggingFace: `site:huggingface.co [lab org name]`
- GitHub: check starred repos in their org

**For each model found:**
- Total parameters and active parameters (for MoE)
- Architecture: dense or MoE (number of experts, top-k routing)
- Training tokens
- Context window
- Benchmark scores (especially MMLU, HumanEval, MATH, AIME)
- Artificial Analysis Intelligence Index score (fetch the model's AA page)
- OpenRouter availability

**People (3-5 key figures):**
- Full name and current role
- Google Scholar URL (verify it's the right person — common names are tricky)
- OpenReview URL
- Personal/academic website
- Notable former affiliations

**Description material:**
- Lab founding story and mission
- Flagship model evolution (chronological)
- Strategic direction and what makes them distinctive
- Other notable research beyond LLMs

### Research Verification

- Cross-reference parameter counts between arxiv papers, HuggingFace model cards, and press reports
- Verify market cap/valuation against financial data sources, not just press articles
- Confirm people are currently at the lab (check LinkedIn dates)
- Distinguish between published (arxiv) and reported (press) parameter counts

## 2. Download Logo

Do this early — logo issues have been a recurring problem.

**Best source: Wikimedia Commons.** Find the logo SVG on Wikipedia and construct the thumbnail URL:

```bash
# Pattern: /wikipedia/commons/thumb/{hash}/{filename}.svg/{width}px-{filename}.svg.png
# Example:
curl -sL "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/SK_Telecom_Logo.svg/500px-SK_Telecom_Logo.svg.png" -o public/logos/{slug}.png
```

**Finding the right URL:**
1. Go to the lab's Wikipedia page
2. Find the logo image, click through to the file page (e.g., `File:Company_Logo.svg`)
3. The URL in the browser will show the path like `/wikipedia/commons/a/af/Company_Logo.svg`
4. Construct thumbnail: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Company_Logo.svg/500px-Company_Logo.svg.png`

**Important notes:**
- Try `/wikipedia/commons/` first, then `/wikipedia/en/` (some logos are only in one)
- Do NOT add a `User-Agent` header — it doesn't help and sometimes hurts
- Download at 500px width, then resize down (better quality than downloading at 200px)
- Always verify with `file public/logos/{slug}.png` — if it says "HTML document" the download failed

**Alternative sources (in order of reliability):**
- `raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/{name}-color.png` — good for AI companies
- Ask the user if they can provide a URL

**Resize to 200x200:**
```bash
convert public/logos/{slug}.png -resize 200x200 -gravity center -background white -extent 200x200 public/logos/{slug}.png
```

**Last resort — placeholder:**
```bash
convert -size 200x200 xc:'#brand-color' -gravity center -pointsize 28 -fill white -annotate 0 'Name' public/logos/{slug}.png
```

## 3. Create Lab YAML

Create `data/labs/{slug}.yaml`. Use an existing lab as a reference (e.g., `data/labs/lg-ai-research.yaml` for Korean corporate labs, `data/labs/upstage.yaml` for Korean startups, `data/labs/deepseek.yaml` for Chinese startups).

```yaml
name: Lab Name
slug: lab-slug
url: https://...
wikipedia: https://en.wikipedia.org/wiki/...
huggingface: https://huggingface.co/...
github: https://github.com/...
artificialanalysis: https://artificialanalysis.ai/providers/...
openrouter: https://openrouter.ai/provider-slug
region: country
founded: "YYYY"
type: corporate
parent: Parent Company           # if applicable
ipo:                             # for public companies
  year: 2002
  exchange: KRX
  ticker: "035420"
valuation:
  amount: "$19B"
  type: market-cap               # market-cap or private or revenue
  ticker: "KRX: 035420"          # for market-cap type
  date: "2026-04"
description: >
  <p>First paragraph: identity, founding, backing, scale.</p>
  <p>Second paragraph: flagship model evolution.</p>
  <p>Third paragraph: other notable research and distinctive focus.</p>
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
tags:
  - open-weight
  - relevant-tags
```

### Description Guidelines
- Write in HTML using `<p>`, `<strong>`, `<a>`, `&mdash;` within YAML `>` blocks
- 2-3 paragraphs, each focused: (1) lab identity, (2) model evolution, (3) other research
- Link to arxiv papers, GitHub repos, and other lab pages (`<a href="/labs/deepseek">`)
- Include concrete numbers: parameter counts, training tokens, benchmark scores, funding amounts
- Tell a story, not just list facts — what makes this lab distinctive?

## 4. Create Outputs

```bash
mkdir -p data/outputs/{slug}
```

Create one YAML file per significant research output. See `/add-output` for the detailed format.

**Prioritize:**
- Flagship models (mark with `flagship: true`) — every major model version
- Papers with arxiv IDs and significant citation counts
- Widely-used open-source tools/libraries (high GitHub stars)
- Important datasets and benchmarks

**For each model output, include structured fields:**
- `model.architecture`: `dense` or `moe`
- `model.parameters`: total (e.g., `671B`)
- `model.active_parameters`: for MoE models
- `model.context_window`: in tokens
- `model.intelligence_index`: Artificial Analysis score
- Add `flagship: true` for major model releases

## 5. Add OpenRouter Links

OpenRouter is a key distribution channel. Check if the lab has models on OpenRouter and add links at both levels.

**Find the provider page:**
- Fetch `https://openrouter.ai/{provider-slug}` (e.g., `openrouter.ai/z-ai`, `openrouter.ai/deepseek`)
- Search: `site:openrouter.ai [lab name]`
- If a provider page exists, add `openrouter: https://openrouter.ai/{provider-slug}` to the lab YAML

**Find individual model pages:**
- The provider page lists all available models with their slugs
- Fetch the provider page and extract all model URLs
- For each model that has a corresponding output file, add an OpenRouter source link:
  ```yaml
  sources:
    - label: OpenRouter
      url: https://openrouter.ai/{provider}/{model-slug}
  ```
- If OpenRouter has a model that doesn't have its own output file, create one (see `/add-output`)

**Important:** OpenRouter model slugs often differ from our output slugs. Double-check you're linking the right model to the right output page (e.g., `z-ai/glm-4.7` maps to our `glm-4.7.yaml`, not `glm-4.yaml`).

## 6. Update README.md

- Increment the lab count in the Overview section
- Add the lab name to the appropriate country list (alphabetical order within country)
- If this is the first lab from a new country, add a new country section

## 7. Validate and Build

```bash
npm run validate     # Check YAML schema validity
npm run build        # Verify site builds and page count increased
```

Restart the dev server for the user to review: `pkill -f "astro dev"; npm run dev`

## 8. Checklist

- [ ] Deep research completed and verified
- [ ] Logo downloaded and verified as PNG (`file` command), resized to 200x200
- [ ] Lab YAML with all available fields populated
- [ ] Description is 2-3 informative HTML paragraphs
- [ ] People section with Scholar/OpenReview links where available
- [ ] Output directory created with research outputs
- [ ] All flagship models marked with `flagship: true`
- [ ] Model parameters (total/active) in structured fields where known
- [ ] Artificial Analysis intelligence scores added where available
- [ ] OpenRouter links added where available
- [ ] README.md updated with new lab count and name
- [ ] `npm run build` passes
- [ ] Dev server restarted for user review

## Updating an Existing Lab

When updating a lab profile (description, valuation, people, links):

1. **Read the current file first** — understand what's already there before editing
2. **Enrich, don't replace** — add new information alongside existing content
3. **Verify claims** — search the web to confirm any new facts (valuations, roles, departures)
4. **Description edits** — preserve the existing narrative structure; weave new information into existing paragraphs rather than appending disconnected new ones
5. **Valuation updates** — update both `amount` and `date` fields
6. **Slug/name renames** — require renaming the YAML file, output directory, all `lab:` references in output files, logo file, metrics.json entries, and cross-references from other labs. This is a high-impact change.
