---
name: add-output
description: Add a new research output (model, paper, library, dataset) to a lab's output directory
---

# Add a New Research Output

## 1. Research

### For Models with Technical Reports

If an arxiv paper exists, **read the HTML version** (`arxiv.org/html/{id}v1`) and extract:

**Architecture:**
- Dense or MoE (sparse)
- Total parameters and active parameters per token (MoE)
- Number of experts and top-k routing (MoE)
- Layer count, hidden dimension, attention heads, KV heads, vocabulary size
- Context window (input and output limits)

**Training:**
- Total training tokens and data composition (languages, code %, synthetic %)
- Hardware: chip type (H100, B200, Ascend 910B, etc.), cluster size
- Training cost in USD (if disclosed), training FLOPs (if disclosed)
- Optimizer, learning rate schedule, batch size, warmup steps
- Precision (FP8, bfloat16, mixed), framework (Megatron, TorchTitan, etc.)

**Novel contributions** — new techniques introduced by this model:
- Architecture: Multi-Latent Attention, Peri-LN Transformer, Sliding Window Attention
- Training: GRPO, SnapPO, sDPO, RLVR, cascade distillation
- Efficiency: Layer-Adaptive Expert Pruning, Multi-Token Prediction
- Data: curriculum training, synthetic data pipelines

**Prior innovations used** — established techniques the model builds on:
- Attention: GQA, MLA, FlashAttention, sparse attention (NSA/DSA)
- Architecture: MoE, state space models (Mamba), GatedDeltaNets, Hyper-Connections
- Training: WSD/midtraining, muP scaling, DUS, FIM
- RL: GRPO, DPO, RLHF, RLVR, process reward models
- Efficiency: FP8 quantization, speculative decoding, knowledge distillation

**Benchmarks** — extract exact scores:
- General: MMLU, MMLU-Pro, Arena Hard
- Math: MATH-500, GSM8K, AIME 2024/2025
- Code: HumanEval, MBPP, SWE-Bench, LiveCodeBench
- Reasoning: GPQA-Diamond, ARC
- Domain-specific: KMMLU, tau-squared-Bench, etc.

### For Models Without Papers (Blog/API-Only)

Many models (especially proprietary ones) are announced via blog posts without arxiv papers. In this case:
- Check the official blog post, announcement page, or API docs for specs
- Check HuggingFace model cards for architecture details
- Note "undisclosed" in description for unknown parameter counts
- Do NOT guess parameters — only include `model.parameters` if confirmed by a primary source
- Still check AA and OpenRouter for available data

### External Links

For **every** model output, check:
- **Artificial Analysis:** Search `site:artificialanalysis.ai [model name]`. Fetch the page and extract the Intelligence Index score.
- **OpenRouter:** Search `site:openrouter.ai [model name]`. Add the canonical model URL (without date suffix).
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
flagship: true                 # see Flagship Criteria below
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
  <p>What it is, scale, architecture, key innovation. Concrete numbers.</p>

  <p>Training details, benchmarks, comparisons. More concrete numbers.</p>
tags:
  - relevant-tags
model:
  architecture: moe            # dense or moe
  parameters: 675B
  active_parameters: 41B       # MoE only
  context_window: 256000
  intelligence_index: 23       # from Artificial Analysis
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

### Flagship Criteria

Mark `flagship: true` only for models representing a **step change**:
- New architecture or scale milestone (first MoE, first 100B+)
- New capability (first multimodal, first reasoning, first code model)
- Current best model in a product line

Do NOT mark as flagship: minor updates, size variants, specialized fine-tunes, deprecated models.

### Derivative Models

Some models are derived from another lab's base model (e.g., Llama-Nemotron from Meta's Llama, A.X 4.0 from Alibaba's Qwen). For these:
- Set `lab:` to the lab that fine-tuned/adapted the model, not the base model creator
- Note the base model in the description (e.g., "derived from Llama 3.1 405B via NAS")
- Do not set `model.base_model` to a cross-lab slug (it's for within-lab references)

### Shared Papers

When one arxiv paper covers multiple distinct models that deserve separate output pages (e.g., Nemotron 3 Nano and Super share arxiv 2512.20856):
- Create separate output files for each model
- Both can reference the same arxiv paper in their `sources` and `paper.arxiv`
- Each output's description should focus on its specific model, not the full paper

## 3. Description Writing

Write descriptions a researcher would find useful. Use HTML for multi-paragraph descriptions.

**For models with papers, cover:**
1. Architecture and scale (parameters, MoE details, context window)
2. Novel contributions introduced by this model
3. Prior techniques used (with terminology)
4. Training details (tokens, hardware, curriculum)
5. Benchmark results with specific numbers and comparisons

**For models without papers:** Cover what's known from blog posts/API docs. Note what's undisclosed.

**For papers:** Core problem, proposed solution, why it matters, key results.

**Style:** `<strong>` for key terms, `<a href>` for links. Concrete numbers always — never "achieves strong performance."

## 4. Grouping Rules

**Group into one file** (using `outputs` array) when:
- A model and its paper are released together (same version, same date)
- Size variants of the same version (e.g., 3B, 8B, 14B of Ministral 3)
- A model and its benchmark dataset released together

**Always use separate files** when:
- Different version numbers (v1 vs v2, Large 2 vs Large 3)
- Release dates more than ~3 months apart
- Distinct architectural changes (even if same brand name)
- Different product lines (Codestral vs Pixtral vs Mistral)

**Rule of thumb:** Grouping applies within a version number only. When in doubt, separate — it's easier than splitting later.

## 5. Validate

```bash
npm run build   # Verify page count increased and no errors
```

## 6. Checklist

- [ ] Technical report read (HTML version) if available; blog post checked if not
- [ ] Structured model fields: architecture, parameters, active_parameters, context_window
- [ ] Intelligence index from AA (fetched, not guessed)
- [ ] OpenRouter link added if available
- [ ] Description covers architecture, innovations, training, benchmarks with numbers
- [ ] Novel contributions and prior techniques identified
- [ ] Flagship only for genuine step changes
- [ ] Sources ordered: announcement, paper, GitHub, HF, AA, OpenRouter
- [ ] Related outputs linked
- [ ] `npm run build` passes

## Updating an Existing Output

1. **Read the current file first** — don't overwrite existing data
2. **Backfill structured fields** — move data from description text to `model:` fields
3. **Add missing links** — check AA and OpenRouter for pages created since output was added
4. **Enrich descriptions** — replace brief descriptions with detailed ones after reading the paper
5. **Split grouped outputs** — if sub-entries have different version numbers or dates >3 months apart
6. **Fix incorrect data** — verify against primary sources before changing
