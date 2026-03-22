# Design Notes

## Canonical Identifiers

We should collect canonical identifiers across APIs for models, datasets, libraries, and papers. This enables automated metrics gathering, cross-referencing, and deduplication.

### Models
- **Hugging Face**: model ID (e.g. `BAAI/bge-m3`, `deepseek-ai/DeepSeek-V3`)
- **Artificial Analysis**: provider/model slug (e.g. `deepseek/deepseek-v3`)
- **OpenRouter**: model ID
- **Together AI**: model ID

### Papers
- **arXiv**: paper ID (e.g. `2412.19437`)
- **Hugging Face Papers**: slug (e.g. `2412.19437`)
- **Semantic Scholar**: corpus ID or arXiv-based lookup
- **Google Scholar**: cluster ID

### Datasets
- **Hugging Face Datasets**: dataset ID (e.g. `BAAI/ToucHD-Force`)
- **Papers With Code**: dataset slug

### Libraries
- **GitHub**: `owner/repo` (e.g. `FlagOpen/FlagEmbedding`)
- **PyPI**: package name
- **npm**: package name
