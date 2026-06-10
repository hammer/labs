import { readFileSync } from 'fs';
import { glob } from 'glob';
import { parse } from 'yaml';
import { LabSchema, OutputSchema, isGrouped } from './schema.js';
import { isUnparseableScale } from './lib/scale.js';

async function main() {
  let errors = 0;
  const labs = new Map<string, string>();
  const outputs = new Map<string, string>();

  // --- Validate labs ---
  const labFiles = (await glob('data/labs/*.yaml')).sort();
  for (const file of labFiles) {
    const raw = readFileSync(file, 'utf-8');
    const content = parse(raw);
    const result = LabSchema.safeParse(content);
    if (!result.success) {
      console.error(`\u274c ${file}:`);
      for (const issue of result.error.issues) {
        console.error(`   ${issue.path.join('.')}: ${issue.message}`);
      }
      errors++;
    } else {
      if (labs.has(result.data.slug)) {
        console.error(`\u274c ${file}: duplicate lab slug "${result.data.slug}" (also in ${labs.get(result.data.slug)})`);
        errors++;
      }
      labs.set(result.data.slug, file);
    }
  }

  // --- Validate outputs ---
  const outputFiles = (await glob('data/outputs/**/*.yaml')).sort();
  for (const file of outputFiles) {
    const raw = readFileSync(file, 'utf-8');
    const content = parse(raw);
    const result = OutputSchema.safeParse(content);
    if (!result.success) {
      console.error(`\u274c ${file}:`);
      for (const issue of result.error.issues) {
        console.error(`   ${issue.path.join('.')}: ${issue.message}`);
      }
      errors++;
    } else {
      if (outputs.has(result.data.slug)) {
        console.error(`\u274c ${file}: duplicate output slug "${result.data.slug}" (also in ${outputs.get(result.data.slug)})`);
        errors++;
      }
      outputs.set(result.data.slug, file);

      // Check lab references
      const labRefs = Array.isArray(result.data.lab) ? result.data.lab : [result.data.lab];
      for (const ref of labRefs) {
        if (!labs.has(ref)) {
          console.error(`\u274c ${file}: references unknown lab "${ref}"`);
          errors++;
        }
      }

      // Check base_model references in simple outputs
      if (!isGrouped(result.data) && result.data.model?.base_model) {
        // Defer check until all outputs are loaded
      }

      // Check base_model references in grouped sub-outputs
      if (isGrouped(result.data)) {
        for (const sub of result.data.outputs) {
          if (sub.model?.base_model) {
            // Defer check until all outputs are loaded
          }
        }
      }
    }
  }

  // Warn on intelligence_index without an AA model URL in sources — the
  // fetch-aa-openness backfill can't find the entry without it, and per
  // AGENTS.md it should always be linked.
  const warnings: string[] = [];
  function hasAaUrl(sources: Array<{ url?: string }> | undefined): boolean {
    return !!sources?.some(s => typeof s.url === 'string' && s.url.includes('artificialanalysis.ai'));
  }
  for (const file of outputFiles) {
    const content = parse(readFileSync(file, 'utf-8'));
    const hasIntel =
      content.model?.intelligence_index !== undefined ||
      (Array.isArray(content.outputs) && content.outputs.some((o: { model?: { intelligence_index?: number } }) => o.model?.intelligence_index !== undefined));
    if (hasIntel && !hasAaUrl(content.sources)) {
      warnings.push(`${file}: has intelligence_index but no artificialanalysis.ai source URL`);
    }

    // Asymmetric block/type check: a model: block on a non-model unit is
    // schema leakage (the unit invisibly escapes every model facet).
    // Companion paper:/library:/dataset: blocks on model units are the
    // established convention and intentionally not flagged.
    type Unit = { type?: string; model?: Record<string, unknown>; eval?: Record<string, unknown> };
    const units: Unit[] = Array.isArray(content.outputs) ? content.outputs : [content];
    for (const unit of units) {
      if (unit.model && unit.type !== 'model') {
        warnings.push(`${file}: model: block on a type:${unit.type} unit — model facets won't see it`);
      }
      if (unit.eval && unit.type !== 'eval') {
        warnings.push(`${file}: eval: block on a type:${unit.type} unit`);
      }
    }

    // Scale strings must stay machine-parseable — they feed the sortable
    // numeric row attributes on the timeline.
    type ScaleCarrier = { parameters?: string; active_parameters?: string; training_tokens?: string };
    const scaleCarriers: Array<[string, ScaleCarrier]> = [];
    for (const unit of units) {
      if (unit.model) {
        scaleCarriers.push(['model', unit.model as ScaleCarrier]);
        const variants = (unit.model as { variants?: ScaleCarrier[] }).variants ?? [];
        variants.forEach((v, i) => scaleCarriers.push([`model.variants[${i}]`, v]));
      }
    }
    for (const [where, c] of scaleCarriers) {
      for (const field of ['parameters', 'active_parameters', 'training_tokens'] as const) {
        if (isUnparseableScale(c[field])) {
          warnings.push(`${file}: ${where}.${field} "${c[field]}" doesn't parse as a scale value (expected e.g. "671B", "1.5T")`);
        }
      }
    }
  }

  // Check cross-references (related, base_model)
  for (const file of outputFiles) {
    const content = parse(readFileSync(file, 'utf-8'));
    if (content.related) {
      for (const ref of content.related) {
        if (!outputs.has(ref)) {
          console.error(`\u274c ${file}: related references unknown output "${ref}"`);
          errors++;
        }
      }
    }
    // Check base_model in simple outputs
    if (content.model?.base_model) {
      if (!outputs.has(content.model.base_model)) {
        console.error(`\u274c ${file}: base_model references unknown output "${content.model.base_model}"`);
        errors++;
      }
    }
    // Check base_model in grouped sub-outputs
    if (content.outputs) {
      for (const sub of content.outputs) {
        if (sub.model?.base_model) {
          if (!outputs.has(sub.model.base_model)) {
            console.error(`\u274c ${file}: sub-output base_model references unknown output "${sub.model.base_model}"`);
            errors++;
          }
        }
      }
    }
  }

  // --- Summary ---
  console.log(`\n${labs.size} labs, ${outputs.size} outputs validated`);
  if (warnings.length > 0) {
    console.warn(`\u26a0\ufe0f  ${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`   ${w}`);
  }
  if (errors > 0) {
    console.error(`\u274c ${errors} error(s) found`);
    process.exit(1);
  } else {
    console.log('\u2705 All valid!');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
