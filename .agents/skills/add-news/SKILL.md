---
name: add-news
description: Add a news article to a lab's news section
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
npm run build   # Verify no schema errors
```
