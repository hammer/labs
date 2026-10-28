---
name: sync-artificial-analysis
description: Refresh, discover, audit, or correct Artificial Analysis Intelligence Index and Openness Index data in Lab Index. Use for AAII or AAOI version migrations, leaderboard rescoring, newly scored model discovery, score-history updates, checkpoint or mode anchoring, provenance backfills, and stale Intelligence-score prose cleanup.
---

# Sync Artificial Analysis

## 1. Load the canonical rules

Read [AGENTS.md → Artificial Analysis Intelligence Index](../../../AGENTS.md#artificial-analysis-intelligence-index) through the end of the AAII/AAOI guidance before making changes. Use the version constants in the repository scripts and the live AA data as authoritative; do not copy a version number from an old output or this skill.

For a single new model being filed, also follow [add-output's scoring reference](../add-output/references/artificial-analysis.md). For broad artifact discovery, use [sweep-research](../sweep-research/SKILL.md).

## 2. Choose the operation

- **Dry audit:** run the fetchers in dry-run or discovery mode where supported and report candidates without changing YAML.
- **Score refresh:** update already anchored AA model URLs to the current AAII version and preserve genuine superseded readings in history.
- **Discovery:** find tracked models that AA began scoring after filing; manually verify the checkpoint and mode before adding an AA URL or score.
- **AAOI refresh:** update openness data for the same checkpoint used for AAII.
- **Prose audit:** find structured/prose mismatches after a rescore.

Do not let a bulk script make new checkpoint-anchoring decisions. New AA URLs require human verification because family and mode slugs often differ.

## 3. Run the maintenance workflow

1. Inspect the current version constants and command options in `scripts/fetch-aa-intelligence.ts` and `scripts/fetch-aa-openness.ts`.
2. Run `npm run fetch-aa-intelligence -- --dry-run` before a broad rewrite when supported.
3. Run `npm run fetch-aa-intelligence` to refresh already anchored scores.
   Its "slug not on leaderboard" list is not a delisting list. The payload covers only the top ~270 models since AA's 2026-10-24 prune, so roughly 110 tracked files sit outside it. Check `artificialanalysis.ai/models/<slug>` before applying a delisted tag (AGENTS.md → AAII audit pattern, step 2–3), and never apply it in bulk.
4. Run `npm run fetch-aa-intelligence -- --discover` and manually review each unclaimed scored slug.
5. Run `npm run fetch-aa-openness` for AAOI coverage.
6. For every newly anchored score, verify that the output slug, named model/checkpoint, selected AA mode, source URL, and top-level score refer to the same model.
7. Set `base_model` or `pretrained_from_scratch: false` for external-base derivatives so the home Intelligence column does not misattribute upstream pretraining.
8. Preserve `intelligence_index_history` for real AA rescores; remove history only when the old value was an internal anchoring error.

## 4. Audit stale prose

Run:

```bash
npm run scan-aaii-mentions
```

Work the printed list: STALE numbers get the current score (or an era marker if the sentence is about a past reading), CHECK items are confirmed against the named live slug, UNRESOLVED items are verified by hand, and POINT-DIFF statements ("N points above X") are re-derived from both current scores. Then run the old-value grep described in the canonical AGENTS.md AAII guidance for comparators quoted in other files. Exclude history entries and historical news titles as directed there.

Avoid adding live scores to prose. If a score is necessary for historical context, label its AA version or describe it explicitly as release-era.

## 5. Verify

Run:

```bash
npm run test:aa          # parser fixtures for every AA payload shape; run first when a sync reports "Parsed only N scored records"
npm run test:aaii        # prose-scanner fixtures: the "it scores N" phrasing and the stale-history classification order
npm run validate
npm run build
```

Two failures look alike and need opposite fixes; `checkAaRecordCount` in `scripts/aa-payload.ts` names which one it saw:

- **A prune** — hundreds of records, just under the floor. AA shrank the payload on 2026-10-24 (~500 → 286 records, 266 unique scored slugs) with no version change. Confirm the methodology page still shows the same version and that the parsed count matches the payload's numeric `"intelligenceIndex"` values, then lower `AA_MIN_SCORED_RECORDS` with a dated note and update the floor fixture in `tests/aa-payload-unit.ts`. A prune also inflates the "slug not on leaderboard" list and `scan-aaii-mentions`' UNRESOLVED count: those slugs left the payload, not the index. Verify on the model page before tagging anything delisted.
- **Sentinel drift** — a handful of records. If `test:aa` passes but the live sync still parses a handful of records, AA changed the record opener again: inspect the bytes before the first `"intelligenceIndex"` in the RSC payload, add the shape to `AA_RECORD_SENTINEL` in `scripts/aa-payload.ts`, add a fixture to `tests/aa-payload-unit.ts`, and only then rerun the sync. Never hand-enter scores to work around it.

- **A version rollout** — the sync prints "Version rollout: N of M listed models scored". AA lists every model on a new version's launch day but scores only those it has re-run (v5.0, 2026-10-27: 272 listed, 76 scored). Nothing is broken: sync what is scored, leave the rest on the old tag (the site's version-tier ranking marks them), and re-run every few days. A scored count under `AA_DRIFT_CEILING` with hundreds listed is still drift.

Review the diff for:

- accidental family-max anchoring;
- an AAII and AAOI pair taken from different checkpoints;
- missing Artificial Analysis source URLs;
- missing provenance on derivative models;
- overwritten rather than appended score history;
- stale prose that survived the structured-field refresh.

Report changed scores, discovered models, provenance decisions, unresolved mappings, and the AA versions applied.
