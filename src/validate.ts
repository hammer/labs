import { readFileSync } from 'fs';
import { glob } from 'glob';
import { parse } from 'yaml';
import { LabSchema, OutputSchema, isGrouped } from './schema.js';

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

  // Check lab relationship references
  for (const file of labFiles) {
    const content = parse(readFileSync(file, 'utf-8'));
    if (content.relationships) {
      for (const rel of content.relationships) {
        if (!labs.has(rel.lab)) {
          console.error(`\u274c ${file}: relationship references unknown lab "${rel.lab}"`);
          errors++;
        }
      }
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
