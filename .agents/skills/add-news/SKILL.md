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

## 5. Validate

```bash
npm run build   # Verify no schema errors
```
