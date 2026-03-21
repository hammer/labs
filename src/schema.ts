import { z } from 'zod';

// --- Lab schema ---

export const LabSchema = z.object({
  name: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  url: z.string().url().optional(),
  wikipedia: z.string().url().optional(),
  huggingface: z.string().url().optional(),
  github: z.string().url().optional(),
  region: z.string(),
  founded: z.string().regex(/^\d{4}(-\d{2})?$/, 'Founded must be YYYY or YYYY-MM').optional(),
  type: z.enum(['corporate', 'startup', 'nonprofit', 'academic']).optional(),
  parent: z.string().optional(),
  formerly: z.array(z.string()).optional(),
  description: z.string().optional(),
  people: z.array(z.object({
    name: z.string(),
    role: z.string().optional(),
    formerly: z.string().optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  relationships: z.array(z.object({
    lab: z.string(),
    type: z.string(),
    note: z.string().optional(),
  })).optional(),
  notes: z.string().optional(),
});

// --- Output schema ---

const LinkSchema = z.object({
  label: z.string(),
  url: z.string().url(),
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
  base_model: z.string().optional(),
  variants: z.array(ModelVariantSchema).optional(),
});

const PaperDetailsSchema = z.object({
  arxiv: z.string().optional(),
  venue: z.string().optional(),
});

const LibraryDetailsSchema = z.object({
  github: z.string().url(),
});

const DatasetDetailsSchema = z.object({
  github: z.string().url().optional(),
  url: z.string().url().optional(),
});

const outputTypes = ['model', 'paper', 'blog', 'library', 'dataset', 'announcement'] as const;

// A sub-output within a grouped entry
const SubOutputSchema = z.object({
  name: z.string(),
  type: z.enum(outputTypes),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  sources: z.array(LinkSchema).optional(),
  description: z.string().optional(),
  model: ModelDetailsSchema.optional(),
  paper: PaperDetailsSchema.optional(),
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
  model: ModelDetailsSchema.optional(),
  paper: PaperDetailsSchema.optional(),
  library: LibraryDetailsSchema.optional(),
  dataset: DatasetDetailsSchema.optional(),
  related: z.array(z.string()).optional(),
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
  outputs: z.array(SubOutputSchema).min(1),
  related: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const OutputSchema = z.union([SimpleOutputSchema, GroupedOutputSchema]);

export type Lab = z.infer<typeof LabSchema>;
export type SimpleOutput = z.infer<typeof SimpleOutputSchema>;
export type GroupedOutput = z.infer<typeof GroupedOutputSchema>;
export type SubOutput = z.infer<typeof SubOutputSchema>;
export type Output = z.infer<typeof OutputSchema>;

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
