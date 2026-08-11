---
name: sweep-research
description: Sweep tracked AI labs for significant new or late-arriving research artifacts, including models, papers, libraries, datasets, evaluations, agent harnesses, technical reports, and HuggingFace-only releases. Use for periodic arXiv sweeps, lab-by-lab discovery, team-name or researcher searches, benchmark discovery, and turning a deduplicated candidate list into verified Lab Index outputs.
---

# Sweep Research

## 1. Load the sweep policy

Read [AGENTS.md → Periodic Arxiv Sweeps](../../../AGENTS.md#periodic-arxiv-sweeps) completely before searching. Treat it as the canonical source for:

- the current and previous month prefixes;
- internal team and collaboration mappings;
- HuggingFace API probes;
- researcher-name, evaluation, domain-expert, and agent-harness searches;
- late technical-report and Artificial Analysis worklists;
- inclusion and exclusion criteria.

Use [add-output](../add-output/SKILL.md) after discovery for representation, provenance, and filing details. Use [sync-artificial-analysis](../sync-artificial-analysis/SKILL.md) for bulk score maintenance.

## 2. Define the sweep scope

Record the labs, month prefixes, and artifact classes in scope. Unless the user narrows the task:

1. Cover at least the previous 4-6 weeks.
2. Search the lab name and every known internal team or collaboration name.
3. Probe the lab's research page, publications index, GitHub organizations, and recent HuggingFace model and dataset uploads.
4. Search prolific researchers when lab-name searches are incomplete.
5. Run independent searches for widely adopted evaluations, reasoning-process benchmarks, domain-expert benchmarks, and agent harnesses or execution stacks.
6. Generate the late technical-report and newly scored-model worklists specified in AGENTS.md.

Parallelize independent lab or search-family passes when supported and authorized. Keep a shared candidate list with the discovery URL and reason each item may qualify.

## 3. Qualify candidates

For each candidate:

1. Verify the artifact and release date from a primary source.
2. Read the paper title-page affiliations or acknowledgements before assigning a lab.
3. Apply the research-focus and exclusion criteria in AGENTS.md; do not turn a sweep into an exhaustive publication catalog.
4. Decide whether the artifact is a model, paper, eval, library, dataset, blog, or announcement.
5. Distinguish a new output from a late source or paper that belongs on an existing output.

Report rejected borderline candidates with a short reason when that helps the user audit the sweep.

## 4. Deduplicate before filing

Run the complete, untruncated dedup procedure in [add-output](../add-output/SKILL.md#before-filing-dedup-against-existing-outputs) for every candidate. Search the lab directory and name/version variants. If a near-match exists, enrich the incumbent entry instead of creating another file.

## 5. File verified findings

Follow [add-output](../add-output/SKILL.md) for every accepted artifact. In particular:

- trace structured model fields to primary sources;
- settle from-scratch versus derivative provenance whenever a model has an Intelligence score;
- attach a late technical report to the existing model rather than creating a duplicate output;
- add both news and output records when an announcement is also a canonical research artifact;
- preserve historical flagship markers.

Do not create or modify files when the user asked only for a sweep report.

## 6. Verify

After data changes, run:

```bash
npm run validate
npm run build
```

Summarize the search coverage, accepted outputs, updated existing entries, rejected candidates, and unresolved leads.
