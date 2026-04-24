import { z } from 'zod';

// --- Lab schema ---

export const LabSchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  url: z.string().url().optional(),
  wikipedia: z.string().url().optional(),
  huggingface: z.string().url().optional(),
  github: z.string().url().optional(),
  youtube: z.string().url().optional(),
  artificialanalysis: z.string().url().optional(),
  openrouter: z.string().url().optional(),
  region: z.string(),
  founded: z.string().regex(/^\d{4}(-\d{2})?$/, 'Founded must be YYYY or YYYY-MM').optional(),
  type: z.enum(['corporate', 'startup', 'nonprofit', 'academic']).optional(),
  parent: z.string().optional(),
  formerly: z.array(z.string()).optional(),
  ipo: z.object({
    year: z.number(),
    exchange: z.string(),
    ticker: z.string(),
  }).optional(),
  valuation: z.object({
    amount: z.string(),
    type: z.enum(['market-cap', 'private', 'revenue']),
    ticker: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}$/, 'Date must be YYYY-MM'),
  }).optional(),
  description: z.string().optional(),
  people: z.array(z.object({
    name: z.string(),
    slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
    url: z.string().url().optional(),
    urls: z.array(z.object({
      label: z.string(),
      url: z.string().url(),
    })).optional(),
    role: z.string().optional(),
    formerly: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  news: z.array(z.object({
    title: z.string(),
    url: z.string(),
    source: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  })).optional(),
  notes: z.string().optional(),
});

// --- Output schema ---

const LinkSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

const BenchmarkScoreSchema = z.object({
  benchmark: z.string(),
  score: z.string(),
  mode: z.string().optional(),
});

const ModelVariantSchema = z.object({
  name: z.string(),
  parameters: z.string().optional(),
  active_parameters: z.string().optional(),
  notes: z.string().optional(),
});

const ModelDetailsSchema = z.object({
  architecture: z.enum(['dense', 'moe']).optional(),
  parameters: z.string().optional(),
  active_parameters: z.string().optional(),
  context_window: z.number().optional(),
  languages: z.number().optional(),
  intelligence_index: z.number().optional(),
  training_tokens: z.string().optional(),
  base_model: z.string().optional(),
  variants: z.array(ModelVariantSchema).optional(),
  // Enhanced fields
  training_hardware: z.string().optional(),
  training_cost: z.string().optional(),
  training_time: z.string().optional(),
  optimizer: z.string().optional(),
  license: z.string().optional(),
  num_experts: z.number().optional(),
  top_k: z.number().optional(),
  benchmark_scores: z.array(BenchmarkScoreSchema).optional(),
});

const PaperDetailsSchema = z.object({
  arxiv: z.string().optional(),
  venue: z.string().optional(),
  // Enhanced fields
  authors: z.array(z.string()).optional(),
  pdf_url: z.string().url().optional(),
  code_url: z.string().url().optional(),
  huggingface_url: z.string().url().optional(),
  presentation: z.enum(['oral', 'spotlight', 'poster', 'best-paper']).optional(),
  year: z.number().optional(),
});

const EvalDetailsSchema = z.object({
  num_tasks: z.number().optional(),
  num_questions: z.number().optional(),
  domains: z.array(z.string()).optional(),
  scoring_method: z.string().optional(),
  used_in: z.array(z.string()).optional(),
  leaderboard_url: z.string().url().optional(),
  saturation: z.string().optional(),
  top_scores: z.array(z.object({
    model: z.string(),
    score: z.string(),
    date: z.string().optional(),
  })).optional(),
  human_baseline: z.string().optional(),
  random_baseline: z.string().optional(),
});

const LibraryDetailsSchema = z.object({
  github: z.string().url(),
  // Enhanced fields
  language: z.string().optional(),
  framework: z.string().optional(),
  license: z.string().optional(),
  pip_package: z.string().optional(),
});

const DatasetDetailsSchema = z.object({
  github: z.string().url().optional(),
  url: z.string().url().optional(),
  // Enhanced fields
  size: z.string().optional(),
  format: z.string().optional(),
  languages: z.array(z.string()).optional(),
  license: z.string().optional(),
  huggingface_url: z.string().url().optional(),
});

const outputTypes = ['model', 'paper', 'blog', 'library', 'dataset', 'eval', 'announcement'] as const;

// A sub-output within a grouped entry
const SubOutputSchema = z.object({
  name: z.string(),
  type: z.enum(outputTypes),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  sources: z.array(LinkSchema).optional(),
  description: z.string().optional(),
  model: ModelDetailsSchema.optional(),
  paper: PaperDetailsSchema.optional(),
  eval: EvalDetailsSchema.optional(),
  library: LibraryDetailsSchema.optional(),
  dataset: DatasetDetailsSchema.optional(),
  notes: z.string().optional(),
});

// Simple output: has `type`, no `outputs`
const SimpleOutputSchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9._-]+$/, 'Slug must be lowercase alphanumeric with hyphens, dots, underscores'),
  lab: z.union([z.string(), z.array(z.string())]),
  type: z.enum(outputTypes),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  sources: z.array(LinkSchema).min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  flagship: z.boolean().optional(),
  model: ModelDetailsSchema.optional(),
  paper: PaperDetailsSchema.optional(),
  eval: EvalDetailsSchema.optional(),
  library: LibraryDetailsSchema.optional(),
  dataset: DatasetDetailsSchema.optional(),
  related: z.array(z.string()).optional(),
  links: z.array(LinkSchema).optional(),
  notes: z.string().optional(),
});

// Grouped output: has `outputs`, no `type`
const GroupedOutputSchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9._-]+$/, 'Slug must be lowercase alphanumeric with hyphens, dots, underscores'),
  lab: z.union([z.string(), z.array(z.string())]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  sources: z.array(LinkSchema).min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  flagship: z.boolean().optional(),
  outputs: z.array(SubOutputSchema).min(1),
  related: z.array(z.string()).optional(),
  links: z.array(LinkSchema).optional(),
  notes: z.string().optional(),
});

export const OutputSchema = z.union([SimpleOutputSchema, GroupedOutputSchema]);

export type Lab = z.infer<typeof LabSchema>;
export type SimpleOutput = z.infer<typeof SimpleOutputSchema>;
export type GroupedOutput = z.infer<typeof GroupedOutputSchema>;
export type SubOutput = z.infer<typeof SubOutputSchema>;
export type Output = z.infer<typeof OutputSchema>;

// --- Metrics ---

export interface MetricsEntry {
  github_stars?: number;
  github_forks?: number;
  hf_downloads?: number;
  hf_likes?: number;
  citations?: number;
  fetched_at: string;
}

// Type guards and helpers
export function isGrouped(output: Output): output is GroupedOutput {
  return 'outputs' in output && Array.isArray(output.outputs);
}

export function getOutputTypes(output: Output): string[] {
  if (isGrouped(output)) {
    return [...new Set(output.outputs.map(o => o.type))];
  }
  return [output.type];
}
