---
name: add-output
description: Add a new research output (model, paper, library, dataset) to a lab's output directory
---

# Add a New Research Output

## 1. Research

### For Models: Read the Technical Report

If an arxiv paper exists, **read the HTML version** (`arxiv.org/html/{id}v1`) and extract all of the following:

**Architecture:**
- Dense or MoE (sparse)
- Total parameters
- Active parameters per token (MoE only)
- Number of experts and top-k routing (MoE only)
- Layer count, hidden dimension, attention heads, KV heads
- Vocabulary size
- Context window (input and output limits)

**Training:**
- Total training tokens
- Training data composition (languages, code %, synthetic %)
- Hardware: chip type (GPU/TPU model), cluster size (number of chips)
- Training cost in USD (if disclosed)
- Training FLOPs (if disclosed)
- Optimizer, learning rate schedule, batch size schedule, warmup steps
- Precision (FP8, bfloat16, mixed)
- Training framework (Megatron, TorchTitan, DeepSpeed, etc.)

**Novel contributions** — identify any new techniques introduced:
- Architecture innovations (e.g., Multi-Latent Attention, Peri-LN Transformer)
- Training methods (e.g., GRPO, SnapPO, sDPO, RLVR)
- Efficiency techniques (e.g., Layer-Adaptive Expert Pruning, Multi-Token Prediction)
- Data methods (e.g., curriculum training, synthetic data pipelines)

**Prior innovations used** — note which established techniques the model builds on:
- Attention: sliding window, sparse attention (NSA/DSA), GQA, MLA, FlashAttention
- Architecture: MoE, state space models (Mamba), GatedDeltaNets, Hyper-Connections
- Training: WSD/midtraining, muP scaling, DUS (Depth Up-Scaling), FIM
- RL: GRPO, DPO, RLHF, RLVR, process reward models
- Efficiency: FP8 quantization, speculative decoding, knowledge distillation

**Benchmarks** — extract exact scores for:
- General: MMLU, MMLU-Pro, Arena Hard
- Math: MATH-500, GSM8K, AIME 2024/2025
- Code: HumanEval, MBPP, SWE-Bench, LiveCodeBench
- Reasoning: GPQA-Diamond, ARC
- Domain-specific benchmarks (Korean: KMMLU; agent: tau-squared-Bench)

### External Links

For every model output, check:
- **Artificial Analysis:** Search `site:artificialanalysis.ai [model name]`. Fetch the page and extract the Intelligence Index score.
- **OpenRouter:** Search `site:openrouter.ai [model name]`. Add if available.
- **HuggingFace:** Find model weights or paper page
- **GitHub:** Find code repo

### For Papers, Libraries, Datasets

- Fetch the arxiv page for title, authors, date, description
- For libraries: find GitHub stars count, key features
- For datasets: find size, composition, intended use

## 2. Create Output YAML

Create `data/outputs/{lab-slug}/{output-slug}.yaml`:

```yaml
name: Model Name
slug: output-slug
lab: lab-slug
type: model                    # model | paper | library | dataset | blog | announcement
date: YYYY-MM-DD
flagship: true                 # for major model releases
sources:                       # ordered by importance
  - label: Announcement
    url: https://...
  - label: Paper (arXiv)
    url: https://arxiv.org/abs/XXXX.XXXXX
  - label: GitHub
    url: https://github.com/org/repo
  - label: HuggingFace
    url: https://huggingface.co/org/model
  - label: Artificial Analysis
    url: https://artificialanalysis.ai/models/slug
  - label: OpenRouter
    url: https://openrouter.ai/provider/model
description: >
  <p>First paragraph: what the model is, scale, architecture, key innovation.
  Include concrete numbers.</p>

  <p>Second paragraph: training details, benchmark results, comparisons
  to other models.</p>
tags:
  - relevant-tags
model:
  architecture: moe            # dense or moe
  parameters: 671B
  active_parameters: 37B       # MoE only
  context_window: 128000
  intelligence_index: 32       # from Artificial Analysis
  variants:                    # size variants released together
    - name: Model-7B
      parameters: 7B
    - name: Model-72B
      parameters: 72B
paper:
  arxiv: "XXXX.XXXXX"
  venue: NeurIPS 2024
library:
  github: https://github.com/org/repo
related:
  - other-output-slug
```

## 3. Description Writing

Write descriptions that a researcher would find useful. Use HTML for multi-paragraph descriptions.

**For models, cover:**
1. Architecture and scale (parameters, MoE details, context window)
2. Key innovations introduced by this model
3. Training details (tokens, hardware, curriculum)
4. Benchmark results with specific numbers
5. Comparisons to prior models or competitors

**For papers:** Explain the core problem, the proposed solution, why it matters, and key results.

**Style:** Use `<strong>` for key terms, `<a href>` for links to related outputs or labs. Include concrete numbers — never just "achieves strong performance."

## 4. Grouping Rules

Grouping controls whether multiple sub-entries share a single output page.

**Group into one file** (using `outputs` array) when:
- A model and its paper are released together (same version, same date)
- Size variants of the same version (e.g., 7B, 32B, 72B of Qwen3)
- A model and its benchmark dataset released together

**Always use separate files** when:
- Different version numbers (v1 vs v2, 3.0 vs 3.5, EXAONE 3.0 vs EXAONE 4.0)
- Release dates more than ~3 months apart
- Distinct architectural changes (even if same brand name)

**Rule of thumb:** Grouping applies within a version number only. When in doubt, use separate files — they're easier to manage than splitting grouped outputs later.

## 5. Validate

```bash
npm run build   # Verify page count increased and no errors
```

## 6. Checklist

- [ ] Read the technical report (HTML version) if available
- [ ] All structured model fields populated: architecture, parameters, active_parameters, context_window
- [ ] Intelligence index from Artificial Analysis (fetch the model page)
- [ ] OpenRouter link added if model is available
- [ ] Description covers architecture, innovations, training, and benchmarks
- [ ] Novel contributions and prior techniques identified in description
- [ ] Sources include announcement, paper, GitHub, HuggingFace, AA, OpenRouter as available
- [ ] Flagship models marked with `flagship: true`
- [ ] Related outputs linked
- [ ] `npm run build` passes

## Updating an Existing Output

1. **Read the current file first** — don't overwrite existing data
2. **Backfill structured fields** — if parameters or architecture appear only in description text, add them as `model:` fields
3. **Add missing links** — check Artificial Analysis and OpenRouter for pages created since the output was added
4. **Enrich descriptions** — when you've read the actual paper, replace brief descriptions with detailed ones
5. **Split grouped outputs** — if sub-entries have different version numbers or dates >3 months apart, split into separate files (preserve all data)
6. **Fix incorrect data** — verify against primary sources (arxiv paper, HuggingFace model card) before changing
