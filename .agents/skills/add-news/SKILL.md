---
name: add-news
description: Add, update, translate, or correct a lab news item in Lab Index. Use for major model announcements, funding, leadership changes, partnerships, policy news, and non-English article summaries, including checking whether the news also requires a structured research output.
---

# Add a News Item to a Lab

Follow these steps to add a news article to a lab's `news` section.

## 1. Prepare the Entry

Each news item requires:
- **title:** Article headline (in English, even for non-English sources)
- **url:** Link to the article
- **source:** Publication name (e.g., Bloomberg, SCMP, The Information)
- **date:** Publication date in `YYYY-MM-DD` format

## 2. Add to Lab YAML

Edit `data/labs/{slug}.yaml` and add to the `news` array:

```yaml
news:
  - title: "Article Headline Here"
    url: https://www.example.com/article
    source: Publication Name
    date: 2026-04-02
```

### Ordering
Add new items in **reverse chronological order** (newest first).

## 3. Non-English Articles

For articles in Chinese or other non-English languages:

1. Create an English summary as a rendered Astro page at `src/pages/articles/{slug}.astro`
2. Use the site Layout component and HTML for proper rendering
3. Include a link to the original article at the top of the summary
4. Add a single news entry pointing to the English summary:

```yaml
  - title: "Article Title (English summary)"
    url: /articles/summary-slug
    source: Original Publication
    date: 2026-03-28
```

News URLs can be:
- Absolute URLs (`https://...`) for external articles
- Relative paths (`/articles/...`) for locally hosted summaries

## 4. When to Add News

Add news items for:
- Major model releases or announcements
- Organizational changes (restructuring, key hires/departures)
- Funding rounds or IPO filings
- Strategic partnerships or policy changes
- Significant press coverage that provides context about the lab

Do NOT add news for:
- Routine paper publications (these are outputs, not news)
- Minor product updates
- Social media posts

### News + output: when the news references a research artifact, file BOTH

A press release announcing a model, dataset, or library is *also* a flag that an output entry should exist. Filing only the news leaves the canonical artifact untracked (no `intelligence_index`, no `openness_index`, no listing on the lab's outputs surface). Real misses caught by this rule:

- **TII Falcon Perception** — news entry filed April 1 from the TII launch post; the companion arXiv 2603.27365 paper, HuggingFace models (Falcon-Perception, Falcon-Perception-300M, Falcon-OCR), and PBench benchmark sat untracked for ~2 months because we never ran the output-probe path on the same announcement.

Whenever the news headline contains words like *"launches,"* *"releases,"* *"unveils,"* *"announces,"* or names a specific model / paper / dataset, run the same external-link probes the `add-output` skill specifies:

1. Search arXiv for a companion paper from the same lab within **±14 days** of the news date.
2. Hit the lab's HuggingFace org via `curl -sL 'https://huggingface.co/api/models?author=<org>&sort=lastModified&direction=-1&limit=30'` (plus the parallel `/api/datasets` query) and look for uploads matching the announcement.
3. Check the lab's GitHub for a companion repo (often named after the model).
4. Check the lab's own blog and HuggingFace blog for a technical post with benchmarks.

If any of those turn up an artifact, add an output entry per `.agents/skills/add-output/SKILL.md` in the same pass. The news entry stays as-is (it's the human-context wrapper); the output is the structured artifact record that lets the rest of the index work (intelligence_index, openness_index, benchmarks, model details, AAII/AAOI fetch scripts, etc.).

## 5. Finding News — Priority Sources

When searching for news about a lab, check sources in this order. Prefer higher-tier sources when multiple outlets cover the same story.

**Tier 1 — Check first (highest signal):**
1. **Lab's own blog/newsroom** — always the first and most authoritative source
2. **Bloomberg** — funding rounds, valuations, strategic pivots, China AI
3. **TechCrunch** — startup fundraising and product launches
4. **CNBC** — major corporate AI milestones
5. **The Information** — exclusive scoops on strategy, unreported fundraising

**Tier 2 — Check for regional/specialist coverage:**
6. **ChinaTalk** — deep analysis of Chinese labs
7. **SCMP** — broadest English-language Chinese tech/AI
8. **VentureBeat** — enterprise AI, open-weight model launches
9. **Caixin** — Chinese business investigative journalism
10. **LatePost (晚点)** — Chinese investigative tech (often breaks stories first)
11. **Reuters** — global AI corporate news, regulation
12. **36Kr (36氪)** — premier Chinese startup news
13. **QbitAI (量子位)** — leading Chinese AI news aggregator at [qbitai.com](https://www.qbitai.com/); dense daily coverage of Chinese-lab model releases, funding, and papers. Aggregator — cross-check upstream before citing. Translate via `src/pages/articles/` (see step 3) when adding as a news entry.

**Tier 3 — Region or event-triggered:**
13. **Nikkei Asia** — Japan/Korea lab coverage
14. **Korea Times** — Korean labs (Kakao, Naver, SKT, LG, Upstage)
15. **GeekWire** — Pacific NW (AI2, Amazon)
16. **Calcalist** — Israeli tech (AI21)
17. **Pandaily** — China AI in English
18. **Wired / Ars Technica / The Verge** — major launch coverage, longer analysis
19. **Latent Space / Interconnects** — community deep-dives, technical context

## 6. Validate

```bash
npm run validate
npm run build
```
