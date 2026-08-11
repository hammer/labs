# Artificial Analysis scoring

Use this reference when adding or updating one model. Use [sync-artificial-analysis](../../sync-artificial-analysis/SKILL.md) for bulk refreshes, version migrations, discovery, and stale-prose audits. Read the canonical [AGENTS.md AAII/AAOI policy](../../../../AGENTS.md#artificial-analysis-intelligence-index) when a decision is ambiguous.

## Anchor the exact model

1. Find every Artificial Analysis entry for the model, including reasoning, adaptive, and effort variants.
2. For one checkpoint, use its highest-scoring supported mode. For a file that covers a family, anchor the top-level score to the model named by the file slug—not the family's highest-scoring sibling.
3. Verify that the model name, output slug, score, and AA source URL all identify the same checkpoint and mode.
4. Add the served canonical URL to `sources` with label `Artificial Analysis`.

## Record complete structured data

When AAII is available, set both:

```yaml
model:
  intelligence_index: 44
  intelligence_index_version: "<current version from the sync script/live data>"
```

Do not guess or copy the version from an older output. If AA has not scored the model, leave the fields unset; later discovery belongs to the standing sync workflow.

When AAOI is available, record `openness_index` and `openness_index_version` from the exact same AA checkpoint used for AAII. Do not substitute a more open family variant.

## Settle provenance

Whenever `intelligence_index` is set, determine whether the lab pretrained the model from scratch:

- use `base_model` for a derivative of a tracked external model;
- use `pretrained_from_scratch: false` when the external base is untracked, undisclosed, multiple, or hidden behind a same-lab derivative;
- omit those markers only when primary-source evidence supports from-scratch pretraining.

This controls whether the model contributes to the lab's home-page Intelligence ranking.

## Keep history and prose honest

Bulk sync appends genuine superseded readings to `intelligence_index_history`; do not edit that trail manually except to remove an internal anchoring mistake. Quote current scores in prose sparingly because structured sync cannot safely rewrite narrative text. When a number is necessary, attach its AA version or an explicit historical era marker.
