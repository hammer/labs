# AI Lab Tracker

A comprehensive tracker of China's leading AI research labs, their flagship models, and research outputs.

**Live site: https://ai-lab-tracker.netlify.app**

## Features

- Profiles of 20 AI labs with founding history, key people, and partnerships
- 490+ research outputs (models, papers, datasets, libraries) with timeline view
- Flagship release filtering across labs and timeline
- Impact metrics: GitHub stars, HuggingFace downloads, Semantic Scholar citations
- Sortable columns and keyboard-driven navigation

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
