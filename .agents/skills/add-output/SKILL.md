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
- Architecture: MoE, model merging, state space models (Mamba), GatedDeltaNets, Hyper-Connections
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
- **Artificial Analysis:** Search `site:artificialanalysis.ai [model name]`. Fetch the page and extract the Intelligence Index score. **Check for reasoning/adaptive variants** — many models have multiple AA entries (e.g., `model-name`, `model-name-reasoning`, `model-name-adaptive`). Use the **highest score** and link to that variant's page.
- **OpenRouter:** Search `site:openrouter.ai [model name]`. Add the canonical model URL (without date suffix).
- **HuggingFace model page:** Find model weights (e.g., `huggingface.co/org/model`)
- **HuggingFace blog:** Check for technical blog posts at `huggingface.co/blog/[org]/[post-slug]`. These often contain detailed benchmarks, architecture explanations, and usage guides not found in the model card. Search `site:huggingface.co/blog [model name]`.
- **GitHub:** Find code repo

### For Closed Models with Technical Reports

Some frontier models (GPT-4, Claude, Gemini) are closed-source but have published technical reports:
- Use `type: paper` (not `type: model`) since there are no downloadable weights
- Still include AA Intelligence Index and OpenRouter links if the model is accessible via API
- Focus the description on what the technical report reveals: architecture choices, training scale, benchmark results, novel techniques
- Note what is NOT disclosed (e.g., "parameter count undisclosed", "training data composition not published")

### For Foundational Technique Papers

Papers that introduced techniques now used industry-wide (e.g., "Attention Is All You Need", CLIP, InstructGPT/RLHF, Chain-of-Thought, DPO):
- Use `type: paper`
- The description should emphasize the technique's **lasting impact**, not just the original results
- Note which current models use the technique (e.g., "Transformers now underpin virtually all LLMs")
- Include citation count if exceptionally high (10K+) to signal importance

### For Papers, Libraries, Datasets

- Fetch the arxiv page for title, authors, date, description
- For libraries: find GitHub stars count, key features
- For datasets: find size, composition, intended use

### For Scientific Foundation Models

We track scientific models that demonstrate frontier-level capabilities in scientific domains:
- **Large-scale scientific foundation models** with evidence of transfer learning across tasks (e.g., protein structure, materials discovery, weather prediction, genomics)
- **Sci-LLMs** that augment general LLMs with domain-specific tokenizers (e.g., SMILES for chemistry, amino acid sequences), additional modalities (molecular graphs, crystal structures, genomic sequences), specialized scientific knowledge, scientific reasoning chains, or agentic scientific workflows
- Note the scientific domain, any specialized tokenization/encoding, training data sources (PubMed, patents, experimental data), and whether the model demonstrates transfer to new tasks
- Examples: PanGu-Weather (Huawei), Matlantis/PFP (PFN), EXAONE Path (LG), BioNeMo (NVIDIA), AlphaFold (DeepMind)

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

### Attribution — Verify the Lab Actually Created It

Before creating an output, confirm the lab **actually developed** the research. Common mistakes:
- A lab **uses** a tool/framework but didn't create it (e.g., OpenClaw is not a Z.ai product even though Z.ai models are optimized for it)
- A lab **fine-tuned** another lab's base model — attribute to the fine-tuner, not the base model creator
- A lab **contributed to** a paper but isn't the primary institution — check author affiliations

If unsure, check the GitHub repo owner, the first/corresponding author affiliations, and the HuggingFace model org.

### Derivative Models — From Scratch vs Fine-Tune

This distinction is **critical** because the home page "Scale" column shows the largest model each lab trained from scratch. Derivative models must NOT have `model.parameters` set — use `model.base_model` instead.

**How to tell if a model is trained from scratch:**
- Paper says "pre-trained from scratch" or describes full pretraining pipeline
- Training tokens are in the trillions (not hundreds of billions of continued training)
- Architecture is novel or custom (not "based on Llama/Qwen/Mistral")
- No mention of a base model or "adapted from" or "fine-tuned from" or "mid-trained on"

**How to tell if a model is derivative:**
- Description says "based on", "built on", "adapted from", "fine-tuned from", "mid-trained on"
- Model name includes another lab's model (e.g., "Llama-Nemotron", "A.X 4.0" based on Qwen)
- Training is continued pretraining, SFT, DPO, RLHF on an existing base
- Training tokens are small relative to the model size (e.g., 73B tokens for a 72B model)

**For derivative models:**
- Set `lab:` to the lab that fine-tuned/adapted, not the base model creator
- Set `model.base_model:` to identify the base (e.g., `base_model: qwen2.5`, `base_model: llama-3.1`)
- Do NOT set `model.parameters` — this prevents them from appearing in the Scale column
- Note the base model and parameter count in the `description` text instead
- Note the base in `model.variants[].notes` (e.g., "72B, mid-trained on Qwen2.5")

**Examples:**
- daVinci-Dev-72B → derivative (Qwen2.5 base, mid-training) → `base_model: qwen2.5`, no `parameters`
- daVinci-Agency-353B → derivative (GLM-4.6 fine-tune) → `base_model: glm-4.6`, no `parameters`
- daVinci-LLM-3B → from scratch (8T tokens, full pretraining) → `parameters: 3B` ✅
- Llama-Nemotron-Ultra-253B → derivative (Llama 3.1 405B via NAS) → `base_model: llama-3.1`, no `parameters`
- Nemotron-4-340B → from scratch (9T tokens) → `parameters: 340B` ✅
- A.X K1 (519B) → from scratch (10T tokens, consortium) → `parameters: 519B` ✅
- A.X 4.0 (72B) → derivative (Qwen2.5) → `base_model: qwen2.5`, no `parameters`

### Multi-Lab Outputs

Some research is a joint effort between multiple labs (e.g., PanGu-Weather by Huawei + PCL, JAIS by MBZUAI + G42/Inception + Cerebras). For these:

```yaml
lab:
  - huawei    # first lab listed = file directory
  - pcl
```

- Set `lab:` to an array of lab slugs
- Store the file in the **first lab's** output directory (e.g., `data/outputs/huawei/pangu-weather.yaml`)
- Pages are automatically generated for ALL lab slugs — the output is accessible at `/outputs/huawei/pangu-weather` AND `/outputs/pcl/pangu-weather`
- The output appears on both labs' pages via `getOutputsForLab()`
- List the primary/lead lab first in the array

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
6. License (Apache 2.0, CC-BY-NC, proprietary — this matters for adoption)

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

## 6. Exclusion Criteria

Before creating an output, verify it belongs. Do **not** create outputs for:
- **Business-specific applications** — delivery logistics, recommendation systems, e-commerce search, customer service tools, mobile infrastructure
- **Narrow benchmarks/datasets** — unless they became industry standards (MMLU, HumanEval, SWE-Bench)
- **Low-impact minor papers** — <500 GitHub stars and no notable citations, unless science-related or first-in-series

**When in doubt, check GitHub stars.** Outputs with 1K+ stars have demonstrated community adoption. First-in-series outputs (the original in a model lineage) and science-related outputs (biology, chemistry, physics, materials, protein design) get more leeway.

## 7. Checklist

- [ ] Technical report read (HTML version) if available; blog post checked if not
- [ ] **From scratch vs derivative determined** — only set `model.parameters` for from-scratch models; use `model.base_model` for derivatives
- [ ] Structured model fields: architecture, parameters (if from scratch), active_parameters, context_window
- [ ] Intelligence index from AA (fetched, not guessed)
- [ ] OpenRouter link added if available
- [ ] Description covers architecture, innovations, training, benchmarks with numbers
- [ ] Novel contributions and prior techniques identified
- [ ] License noted in description (Apache 2.0, CC-BY-NC, proprietary)
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
