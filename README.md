# AI Lab Tracker

A comprehensive tracker of China's leading AI research labs, their flagship models, and research outputs.

**Live site: https://ai-lab-tracker.netlify.app**

## Features

- Profiles of **21 AI labs** with founding history, key people, and strategic funding details
- **560+ research outputs** (models, papers, datasets, libraries) with chronological timeline
- **Global Search**: Unified dropdown search for labs and outputs from any page (`/` shortcut)
- **Keyboard-Driven**: Full navigation using `j`/`k`, `ArrowKeys`, `g`+`h`/`t`, and `Enter`
- **Impact Metrics**: GitHub stars, HuggingFace downloads, and OpenAlex/Semantic Scholar citations
- **Flagship Highlights**: Filtering for major foundational releases across the ecosystem

## Development

```bash
npm install
npm run dev          # Start dev server at localhost:4321
npm run build        # Build static site
npm run validate     # Validate all YAML data
npm run fetch-metrics # Fetch impact metrics from APIs
```

## Data

- `data/labs/*.yaml` — Lab profiles
- `data/outputs/**/*.yaml` — Research outputs
- `data/metrics.json` — Impact metrics (auto-generated)
