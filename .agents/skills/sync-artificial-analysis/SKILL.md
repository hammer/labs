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

Resolve every unexplained result. Then run the old-value grep described in the canonical AGENTS.md AAII guidance; the scanner has a coincidental-resolution blind spot. Exclude history entries and historical news titles as directed there.

Avoid adding live scores to prose. If a score is necessary for historical context, label its AA version or describe it explicitly as release-era.

## 5. Verify

Run:

```bash
npm run validate
npm run build
```

Review the diff for:

- accidental family-max anchoring;
- an AAII and AAOI pair taken from different checkpoints;
- missing Artificial Analysis source URLs;
- missing provenance on derivative models;
- overwritten rather than appended score history;
- stale prose that survived the structured-field refresh.

Report changed scores, discovered models, provenance decisions, unresolved mappings, and the AA versions applied.
