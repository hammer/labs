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
    slug: optional-explicit-slug    # Only if name collision. Usually omit.
    url: https://personal-website.com/        # Personal/academic page
    role: Current Role Title
    formerly: Previous Company (Role); PhD University
    description: >                  # Optional HTML bio for person page
      <p>Rich biography...</p>
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
- **Always include:** Founders, CEO, CTO, Chief Scientist — even if they have no academic profile. A co-founder with no Google Scholar still gets a people entry (just omit the `urls` section).
- **Include if significant:** Team leads, lead authors on flagship model papers, researchers with very high citation counts (10K+)
- **Include departed leaders if they shaped the lab:** e.g., Sara Hooker founded Cohere Labs before departing — her entry tells the lab's story
- **Skip:** Junior researchers, interns, people with only one co-authored paper
- Aim for 3-7 people per lab. Quality over quantity.

## 4. Person Page Slugs

Every person entry generates a page at `/people/[slug]`. Slugs are auto-derived from names by lowercasing and hyphenating (e.g., "Daya Guo" → `daya-guo`).

**When to set an explicit `slug`:**
- **Name collisions:** If two different people would generate the same slug (e.g., two "Wei Zhang"s at different labs), set explicit slugs like `wei-zhang-deepseek` and `wei-zhang-baai`
- **Non-Latin name disambiguation:** If transliteration produces ambiguous slugs, use the most common published romanization
- **Do NOT set slug for normal cases** — let auto-derivation handle it

## 5. Person Descriptions (Rich Bios)

The optional `description` field adds an HTML bio rendered on the person page. Not every person needs one — prioritize:

1. Lab founders and chief scientists
2. Researchers whose career trajectory spans multiple tracked labs
3. People from Chinese academic labs (BAAI, Shanghai AI Lab, PCL, SII, OpenBMB) whose work is less well-documented in English
4. Creators of foundational techniques (LoRA, GRPO, MLA, etc.)

**Format:**
```yaml
  - name: Pengfei Liu
    description: >
      <p>First paragraph: current role, what they lead, key numbers.</p>
      <p>Second paragraph: career trajectory with dates and key stops.</p>
      <p>Third paragraph: most important research contributions.</p>
```

**Style:** Third person, HTML in YAML `>` blocks, link to outputs (`<a href="/outputs/sii/torl">ToRL</a>`) and labs (`<a href="/labs/deepseek">DeepSeek</a>`). Include native name characters. Use concrete numbers (citations, scores).

## 6. Cross-Lab People

When someone moves between tracked labs, they should appear in BOTH labs' `people` sections with consistent data:

- **Use the same name spelling** (slugs auto-derive from names, so matching names = matching slugs)
- **Origin lab:** Mark as "Former [Role] (departed [date]; now at [Lab])"
- **Destination lab:** Include full current role and `formerly` with prior lab

The person page automatically merges both entries, showing the full career trajectory.

## 7. Ordering

Add new people in a logical order within the `people` array:
1. CEO / Founder / Head of lab
2. Chief Scientist / CTO
3. Division/team leads
4. Core researchers
5. Former members (at the end)

## 8. Updating Existing People

- **Departures:** Change `role` to "Former [Role] (departed [date/destination])" — do not remove the person
- **Role changes:** Update `role` and add previous role to `formerly`
- **Adding links:** If a person exists but is missing Scholar/OpenReview links, search and add them
- **Correcting info:** Verify against primary sources (personal website, LinkedIn) before changing

## 9. Validate

```bash
npm run build   # Verify no schema errors
```
