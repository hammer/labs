---
name: sweep-research
description: Sweep tracked AI labs for new or late-arriving artifacts that advance frontier foundation model building in language and science — models, training methods, infrastructure, pretraining-scale datasets, and industry-standard evaluations. Use for periodic arXiv sweeps, lab-by-lab discovery, team-name or researcher searches, benchmark discovery, agent-harness cluster updates, and turning a deduplicated candidate list into verified Lab Index outputs. Applies an inclusion gate that rejects applications of frontier models.
---

# Sweep Research

## 1. Load the sweep policy

Read [AGENTS.md → Periodic Arxiv Sweeps](../../../AGENTS.md#periodic-arxiv-sweeps) completely before searching. Treat it as the canonical source for:

- the current and previous month prefixes;
- internal team and collaboration mappings;
- secondary-org discovery (`npm run sweep-orgs`) and HuggingFace API probes;
- author-keyed arXiv discovery (`npm run sweep-authors`), the only probe that reaches affiliation-only papers;
- the **inclusion gate** and the exclusion criteria — read these before searching, not after;
- the standing pretraining/training-methods pass, and which family searches are triggered rather than standing;
- **method-family caps**, including harnesses as cluster-entries-only;
- late technical-report, never-filed-paper, and Artificial Analysis worklists.

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
3. Probe the lab's research page, publications index, GitHub organizations, and recent HuggingFace model and dataset uploads. Run **`npm run sweep-org-health`** periodically to catch labs whose declared `huggingface:` org has been renamed or abandoned — a dead pointer makes a lab read as quiet rather than unprobed, which is how Meta went eighteen months without its primary model org being probed. Run `npm run sweep-orgs` first and probe **every** org it lists for a lab, not just the one in the lab file's `huggingface:` / `github:` fields — labs publish from several orgs, and the declared field alone has missed whole launches (Moonshot's AgentENV under `kvcache-ai`, LG's EXAONE weights under `LG-AI-Research`, Apple's LensVLM under `apple-aiml-research`). **A news index is not a release list** — see AGENTS.md step 2b for the site-root and RSS surfaces (Claude Haiku 5.5 was missed on 2026-10-10 that way), and step 3 for Apple's publications HTML, the Google org split, and the forward-looking-prose grep that resolves "due in the coming weeks" promises already sitting in `data/`.
4. **Run `npm run sweep-authors -- --since <month>` every cycle, not only when lab-name searches look thin.** It derives each lab's author index from the `people:` block and its outputs' `paper.authors`, then diffs each researcher's arXiv listing against every arXiv id in `data/`. This is the only probe that reaches a paper tied to its lab solely by the title page; read the `*` rows first and verify affiliations before assigning a lab. See AGENTS.md step 4.
5. **Run one dedicated family pass every cycle: pretraining / training-methods papers.** Expert-pool scheduling and upcycling, sparsity-aware scaling laws and token-budget allocation, optimizers, numerics and training stability, data curricula. That class ships no weights, no repo and no benchmark win, names a technique rather than a model, and had no dedicated pass until EMO was missed — and it sits squarely inside the gate's clause (2). See the dedicated sweeps in AGENTS.md.

   **The other family passes are triggered, not standing.** Evaluations, reasoning-process and domain-expert benchmarks, RL-scaling and RL-readiness (`rl-scaling`), agent harnesses and execution stacks: search these when something specific prompts it — a lab announces one, a candidate cites one, or the user asks. Running all of them every cycle is how entries per month went 36 → 182, with 54 of September's 182 in the harness family alone. Each pass is tuned for recall, and six recall-tuned passes against one qualification gate produce a method survey. Harnesses in particular are now **cluster-entries-only** (AGENTS.md → Research Focus), so a harness pass mostly generates prose for an existing entry, not new files — which is a reason to run it deliberately rather than by default.
6. Generate the late technical-report, never-filed-paper (step 8c), and newly scored-model worklists specified in AGENTS.md. Note that steps 7 and 8 only enrich **existing** entries — reaching back for artifacts never filed is step 8c's job, via the author probe with an older `--since`.
7. Quarterly, or whenever the user asks for a valuation sweep: refresh every listed parent's market cap in one commit and re-check each private lab's last closed round, per AGENTS.md → Valuations (last realized priced post-money; talks, secondaries, and IPO targets become `news`; reconcile description prose that quotes the old figure). Research private marks by region in parallel agents, then re-verify every changed mark at the reporting outlet before writing it.

Parallelize independent lab or search-family passes when supported and authorized. Keep a shared candidate list with the discovery URL and reason each item may qualify.

### Fanning out without destroying the arXiv quota

arXiv rate-limits per caller and the quota is shared by every process on the box, so parallel agents do not divide it — they exhaust it. On 2026-10-10 five discovery subagents were each told to use the Atom API while `sweep-authors` ran: **all 55 author probes answered HTTP 429**, and the one probe that reaches affiliation-only papers produced nothing. When you fan out:

1. Run `npm run sweep-authors` **alone**, before or after the fan-out — never beside it. It is the most throttle-sensitive step in the sweep, and the breaker now aborts it after five consecutive failures rather than grinding for ~100 minutes.
2. Tell every subagent **not** to call `export.arxiv.org/api/query`. Hand them surfaces with their own quotas: lab blog/publications HTML, `huggingface.co/api/{models,datasets}`, `gh api "orgs/<org>/repos?sort=created&direction=desc"`, and `curl https://arxiv.org/abs/<id>` for one paper's title/date/authors — which works even while the API is 429ing.
3. Treat a run reporting `FAILED` or `NEVER ATTEMPTED` probes as **not swept**. Report the hole; do not let it read as clean coverage.
4. The same serialize-a-shared-quota rule already applies to `mum search` on this VM.

### Do not arm wait loops on background jobs

`run_in_background` notifies you when a job exits. An extra `until grep -q <sentinel> log; do sleep; done` on top of that is redundant and strands the shell if the job dies before writing the sentinel — on 2026-10-10 two such loops span for 33 hours because `pkill` took out the subshell that would have written `EXIT=`. If a wait loop is genuinely needed, give it a liveness escape and write the sentinel from a `trap` so it survives every exit path. `sweep-authors` prints `SWEEP-AUTHORS-END:` as its last line on both the clean and aborted paths; its **absence** from a log means the run was killed.

## 3. Qualify candidates

For each candidate:

1. **Apply the gate first, before spending any verification effort.** AGENTS.md → Research Focus: *would a frontier lab build its next foundation model differently because of this?* It must be a frontier foundation model in language or science, a change to how one is built (at ≥7B or on a shipped model), the infrastructure or pretraining-scale data behind one, or an evaluation in a major composite index. **Work that merely uses a frontier model is out.** Most candidates fail here, so gating first is also the cheapest order — do not verify affiliations on a paper that is out of scope regardless of who wrote it.
2. Verify the artifact and release date from a primary source.
3. Read the paper title-page affiliations or acknowledgements before assigning a lab. An author tie is not a scope tie: a tracked lab's staff publish robotics, security, signal-processing and domain-science work that the gate excludes.
4. **Check whether it belongs to a capped method family** (AGENTS.md → Method families). If the family already has three entries, add it to the cluster entry's prose with an arXiv link instead of filing. Harness technique papers are always this case.
5. Decide whether the artifact is a model, paper, eval, library, dataset, blog, or announcement.
6. Distinguish a new output from a late source or paper that belongs on an existing output.

Report rejected borderline candidates with a short reason when that helps the user audit the sweep. A sweep whose accepted count runs past ~40 for a single month should say so and re-read the gate rather than keep filing.

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
