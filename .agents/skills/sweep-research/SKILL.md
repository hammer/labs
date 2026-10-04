---
name: sweep-research
description: Sweep tracked AI labs for significant new or late-arriving research artifacts, including models, papers, libraries, datasets, evaluations, agent harnesses, technical reports, and HuggingFace-only releases. Use for periodic arXiv sweeps, lab-by-lab discovery, team-name or researcher searches, benchmark discovery, and turning a deduplicated candidate list into verified Lab Index outputs.
---

# Sweep Research

## 1. Load the sweep policy

Read [AGENTS.md → Periodic Arxiv Sweeps](../../../AGENTS.md#periodic-arxiv-sweeps) completely before searching. Treat it as the canonical source for:

- the current and previous month prefixes;
- internal team and collaboration mappings;
- secondary-org discovery (`npm run sweep-orgs`) and HuggingFace API probes;
- author-keyed arXiv discovery (`npm run sweep-authors`), the only probe that reaches affiliation-only papers;
- evaluation, domain-expert, RL-scaling, agent-harness, and pretraining/training-methods searches;
- late technical-report, never-filed-paper, and Artificial Analysis worklists;
- inclusion and exclusion criteria.

**Know the shape of what each probe can see.** The sweep's probes split into three kinds, and a candidate invisible to one kind is not rescued by running another harder:

| probe | finds | blind to |
|---|---|---|
| lab-name / keyword arXiv search | papers naming the lab or technique in title/abstract | **affiliation-only papers — arXiv has no affiliation field** |
| artifact probes (`sweep-orgs`, HF uploads, GitHub orgs) | anything with a repo or an upload | paper-only work: **312 of 506 `type: paper` outputs have no GitHub/HF link** |
| author probe (`sweep-authors`) | a tracked researcher's output wherever it lands | people we don't track; noisy on common names |
| backfill steps 7–8 | missing reports/scores on **tracked** entries | anything never filed (step 8c) |

EMO (arXiv 2605.13247, MBZUAI-IFM) was missed for five months because it was invisible to the first two rows at once — no "MBZUAI" in its arXiv metadata and no code release — and the author probe was written as optional.

Use [add-output](../add-output/SKILL.md) after discovery for representation, provenance, and filing details. Use [sync-artificial-analysis](../sync-artificial-analysis/SKILL.md) for bulk score maintenance.

## 2. Define the sweep scope

Record the labs, month prefixes, and artifact classes in scope. Unless the user narrows the task:

1. Cover at least the previous 4-6 weeks.
2. Search the lab name and every known internal team or collaboration name.
3. Probe the lab's research page, publications index, GitHub organizations, and recent HuggingFace model and dataset uploads. Run `npm run sweep-orgs` first and probe **every** org it lists for a lab, not just the one in the lab file's `huggingface:` / `github:` fields — labs publish from several orgs, and the declared field alone has missed whole launches (Moonshot's AgentENV under `kvcache-ai`, LG's EXAONE weights under `LG-AI-Research`, Apple's LensVLM under `apple-aiml-research`). See AGENTS.md step 3.
4. **Run `npm run sweep-authors -- --since <month>` every cycle, not only when lab-name searches look thin.** It derives each lab's author index from the `people:` block and its outputs' `paper.authors`, then diffs each researcher's arXiv listing against every arXiv id in `data/`. This is the only probe that reaches a paper tied to its lab solely by the title page; read the `*` rows first and verify affiliations before assigning a lab. See AGENTS.md step 4.
5. Run independent searches for widely adopted evaluations, reasoning-process benchmarks, domain-expert benchmarks, agent harnesses or execution stacks, RL-scaling papers — including RL-readiness / stage-aware post-training work that optimizes SFT or checkpoint selection for downstream RL (the `rl-scaling` tag family) — and **pretraining / training-methods papers**: expert-pool scheduling and upcycling, sparsity-aware scaling laws and token-budget allocation, optimizers, numerics and training stability, and data curricula. That class ships no weights, no repo and no benchmark win, names a technique rather than a model, and had no dedicated pass until EMO was missed. See the dedicated sweeps in AGENTS.md.
6. Generate the late technical-report, never-filed-paper (step 8c), and newly scored-model worklists specified in AGENTS.md. Note that steps 7 and 8 only enrich **existing** entries — reaching back for artifacts never filed is step 8c's job, via the author probe with an older `--since`.
7. Quarterly, or whenever the user asks for a valuation sweep: refresh every listed parent's market cap in one commit and re-check each private lab's last closed round, per AGENTS.md → Valuations (last realized priced post-money; talks, secondaries, and IPO targets become `news`; reconcile description prose that quotes the old figure). Research private marks by region in parallel agents, then re-verify every changed mark at the reporting outlet before writing it.

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
npm run test:aa             # AA payload parser fixtures (three sentinel shapes); a 1-record sync means a new shape — see scripts/aa-payload.ts
npm run test:changelog      # renders the real /whats-new diff for recent commits; fails on any "{…}" / [object Object]
npm run test:sweep-orgs     # org-probe URL shapes
npm run test:sweep-authors  # author index, listing parser, tracked-id scan, date floor
npm run build               # AFTER the commit — /whats-new is built from git log
```

Summarize the search coverage, accepted outputs, updated existing entries, rejected candidates, and unresolved leads.
