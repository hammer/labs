---
name: add-person
description: Add a researcher or leader to a lab's people section with verified profile links
---

# Add a Person to a Lab

Follow these steps to add a researcher or leader to a lab's `people` section.

## 1. Research and Verify

Before adding, verify the person's current role and affiliation:

- Search the web for their name + lab name to confirm current employment
- Find their **Google Scholar** profile (search: `"Name" Google Scholar`)
- Find their **OpenReview** profile (search: `"Name" OpenReview`)
- Find their personal/academic website
- Check LinkedIn for current role title
- Note any "formerly" affiliations (previous companies, universities)

**Important:** If someone has departed, update their role to reflect this (e.g., "Former Core Researcher (departed early 2026)") rather than removing them.

## 2. Add to Lab YAML

Edit `data/labs/{slug}.yaml` and add to the `people` array:

```yaml
people:
  - name: Full Name
    url: https://personal-website.com/        # Personal/academic page
    role: Current Role Title
    formerly: Previous Company (Role); PhD University
    urls:
      - label: Google Scholar
        url: https://scholar.google.com/citations?user=XXXXXXXXX
      - label: OpenReview
        url: https://openreview.net/profile?id=~First_Last1
      - label: GitHub
        url: https://github.com/username
```

## 3. Field Guidelines

### `name`
- Use the name as commonly published (English transliteration for non-Latin names)
- Include Chinese/Korean characters in parentheses if commonly used: `Zehuan Yuan (袁泽寰)`

### `url`
- Prefer personal academic website over LinkedIn
- Use Google Scholar if no personal site exists

### `role`
- Be specific: "Head, Superintelligence Lab" not just "Researcher"
- For departed members: "Former Tech Lead (departed Mar 2026)"
- For dual roles: "Chief Scientist & EVP"

### `formerly`
- Format: `Company (Role); PhD University`
- Include notable prior affiliations that establish credibility

### `urls`
- **Google Scholar:** Always include if available (most important academic link). Note citation count in the research phase to help prioritize who to include (e.g., 60K+ citations = top-tier researcher)
- **OpenReview:** Include for ML researchers (establishes conference reviewing history)
- **GitHub:** Include for engineers/developers with significant open-source work
- **Wikipedia:** Include for founders/CEOs who have Wikipedia pages
- Only include links you have verified are correct for THIS person (common names can lead to wrong profiles)

### Who to Include
- **Always include:** Founders, CEO, CTO, Chief Scientist
- **Include if significant:** Team leads, lead authors on flagship model papers, researchers with very high citation counts (10K+)
- **Skip:** Junior researchers, interns, people with only one co-authored paper
- Aim for 3-7 people per lab. Quality over quantity.

## 4. Ordering

Add new people in a logical order within the `people` array:
1. CEO / Founder / Head of lab
2. Chief Scientist / CTO
3. Division/team leads
4. Core researchers
5. Former members (at the end)

## 5. Updating Existing People

- **Departures:** Change `role` to "Former [Role] (departed [date/destination])" — do not remove the person
- **Role changes:** Update `role` and add previous role to `formerly`
- **Adding links:** If a person exists but is missing Scholar/OpenReview links, search and add them
- **Correcting info:** Verify against primary sources (personal website, LinkedIn) before changing

## 6. Validate

```bash
npm run build   # Verify no schema errors
```
