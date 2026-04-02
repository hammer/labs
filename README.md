# AI Lab Tracker

A data-driven tracker of Asia's AI research ecosystem: labs, models, papers, and benchmarks.

**Live site: [ai-lab-tracker.netlify.app](https://ai-lab-tracker.netlify.app)**

## Overview

Tracks **24 AI labs** and **650+ research outputs** across the Asian AI landscape, from trillion-parameter frontier models to influential open-source libraries. Each lab has a profile page with description, key people, news, and a chronological list of outputs. Each output page links to papers, code, HuggingFace models, and external benchmarks.

The home page provides a sortable table with columns for region (country flag), lab type, founding year, IPO status, valuation, largest model scale (by parameter count), top intelligence score ([Artificial Analysis Index](https://artificialanalysis.ai/)), and total output count.

## Labs Tracked

**China (22):** Alibaba, Ant Group, BAAI, Baichuan, Baidu, ByteDance Seed, DeepSeek, Huawei, IDEA Lab, Inspur, Kuaishou, Meituan, MiniMax, Moonshot AI, OpenBMB, PCL, SenseTime, Shanghai AI Lab, StepFun, Tencent, Xiaomi, Z.ai

**Korea (2):** LG, SK Telecom

## Features

- **Sortable home page** with region, scale, intelligence, valuation, and output columns
- **Lab profiles** with HTML descriptions, people (with Scholar/OpenReview links), and news
- **Output pages** with structured model details (architecture, parameters, active parameters, intelligence index), paper metadata (arXiv, venue), and related outputs
- **Timeline** view of all outputs in reverse chronological order
- **Global search** from any page (`/` shortcut)
- **Keyboard navigation**: `j`/`k` to move, `Enter` to open, `g g` for top, `g h` for home, `g t` for timeline, `?` for help
- **Impact metrics**: GitHub stars/forks, HuggingFace downloads/likes, citation counts
- **Zod-validated YAML** schema with `npm run validate` for data integrity

## Development

```bash
npm install
npm run dev            # Dev server at localhost:4321
npm run build          # Build static site (Astro SSG)
npm run validate       # Validate all YAML against Zod schemas
npm run fetch-metrics  # Fetch GitHub/HF/citation metrics
```

Built with [Astro](https://astro.build/) (static output), [Zod](https://zod.dev/) for schema validation, and deployed on [Netlify](https://www.netlify.com/).

## Data Structure

```
data/
  labs/*.yaml           # Lab profiles (24 files)
  outputs/{lab}/*.yaml  # Research outputs (~650 files, one dir per lab)
  metrics.json          # Impact metrics cache (auto-generated)
src/
  schema.ts             # Zod schemas for Lab and Output types
  data/loader.ts        # Data loading, caching, and query functions
  pages/                # Astro pages (index, timeline, lab, output)
  components/           # Reusable Astro components
```

### Lab Schema

Each lab YAML includes: name, slug, URL, region (china/korea), founded date, type (corporate/startup/nonprofit/academic), valuation, HTML description, people (with roles and profile links), news items, and tags.

### Output Schema

Each output YAML includes: name, slug, lab reference, type (model/paper/library/dataset/blog/announcement), date, sources (labeled links), description, tags, and optional structured data for models (`architecture`, `parameters`, `active_parameters`, `intelligence_index`, `context_window`, `variants`), papers (`arxiv`, `venue`), and libraries (`github`). Grouped outputs contain an `outputs` array of sub-entries for model families with multiple releases.
