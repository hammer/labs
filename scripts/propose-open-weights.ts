/**
 * Propose `model.open_weights` for every tracked model, from evidence already
 * in the file. Reports by default; `--write` applies only what it is confident
 * about, and never overwrites a value a human already set.
 *
 * Open means DOWNLOADABLE, whatever the licence — see the field's comment in
 * src/schema.ts. So the question this answers is "did the releasing lab publish
 * fetchable weights", not "is the licence permissive".
 *
 * Confidence matters more than coverage here, because an unset field reads as
 * *unknown* and costs only a blank cell, while a wrong `false` silently removes
 * a lab's best open model from the Intelligence (open) column and nothing looks
 * wrong. So every rule below is one-directional and the ambiguous case abstains.
 *
 * Usage: npm run propose-open-weights                 # report
 *        npm run propose-open-weights -- --write      # apply confident rows
 *        npm run propose-open-weights -- --scored     # only AAII-scored models
 */
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';
import { parse } from 'yaml';

export type Verdict = { value: boolean | null; why: string };

/**
 * AAOI bands. Set from the gap in the live distribution: of 138 scored models
 * 34 sit below 15 and 102 at or above 25, with just 2 in between. Widen these
 * only against a fresh histogram — they are empirical, not principled.
 */
export const AAOI_CLOSED = 15;
export const AAOI_OPEN = 25;

/** Licences that are themselves proof of a public download. */
const OPEN_LICENCE = /apache|mit\b|bsd|openmdw|cc[- ]by|llama|gemma|qwen|community licen|open model licen|openrail|model licen|non[- ]?commercial|academic/i;
/** Licence strings that assert the opposite. */
const CLOSED_LICENCE = /^proprietary|closed|api only|api-only/i;
/**
 * Prose that promises weights rather than shipping them. Deliberately narrow:
 * it must be a *future* promise, since "open weights released" is the opposite
 * claim and shares most of its vocabulary.
 */
const PROMISED = /(promised|coming|planned|will be released|not yet released|expected)[^.]{0,80}(weights|release)|weights[^.]{0,60}(promised|not yet released|coming)/i;

/**
 * One model's verdict from its own file.
 *
 * Order is deliberate: the explicit signals (licence, a promise of weights)
 * outrank the circumstantial one (a HuggingFace link), because a lab's entry
 * can link HuggingFace for a demo, a dataset or a third-party quant.
 */
export function propose(
  text: string, model: Record<string, unknown> | undefined,
): Verdict {
  if (model && typeof model.open_weights === 'boolean') {
    return { value: model.open_weights, why: 'already set' };
  }
  const licence = typeof model?.license === 'string' ? model.license : '';

  // A promise of future weights is closed *today*, and says so in the licence
  // slot often enough that it has to be checked before the licence patterns.
  if (PROMISED.test(licence)) return { value: false, why: 'weights promised, not released' };
  if (CLOSED_LICENCE.test(licence.trim())) return { value: false, why: `licence: ${licence}` };
  if (OPEN_LICENCE.test(licence)) return { value: true, why: `licence: ${licence}` };

  // AAOI by VALUE, never by presence. Artificial Analysis scores openness for
  // every model it covers, including the fully closed ones — Claude Opus 5
  // reads 11.1 and GPT-5.5 and Gemini 3.1 Pro both read 5.6 — so treating a
  // score as evidence of open weights marks the entire frontier open. That is
  // exactly what the first version of this script did.
  //
  // The distribution is bimodal and the thresholds sit in its gap: across 138
  // scored models, 34 fall in 0-15, only 2 in 15-25, and 102 at 25+. Weights
  // you can download cannot score in the low band, and weights you cannot
  // download cannot score in the high one. The 2 in between abstain.
  const aaoi = model && typeof model.openness_index === 'number'
    ? model.openness_index : null;
  if (aaoi !== null && aaoi < AAOI_CLOSED) {
    return { value: false, why: `AAOI ${aaoi} — below the closed band` };
  }
  if (aaoi !== null && aaoi >= AAOI_OPEN) {
    return { value: true, why: `AAOI ${aaoi} — in the open band` };
  }

  // Circumstantial, and last: a HuggingFace *model* repo URL (owner/name, so a
  // bare org link does not count). Checked against the closed frontier — the
  // Claude, GPT and Gemini entries link no HuggingFace repo at all — but a lab
  // can still link one for a tokenizer or a third party's quant, which is why
  // this ranks below every explicit signal.
  if (/huggingface\.co\/[A-Za-z0-9][\w.-]*\/[\w.-]+/.test(text)) {
    return { value: true, why: 'links a HuggingFace model repo' };
  }

  return { value: null, why: 'no evidence either way — leave unset' };
}

/**
 * Set or replace `open_weights:` in a model block, editing the text rather than
 * re-serialising so comments and formatting survive.
 *
 * `sub` names a sub-output inside a grouped entry's `outputs:` array. Those are
 * a second file shape and they are easy to miss: a grouped file has no
 * top-level `type: model` at all, so a loop that filters on `doc.type` skips it
 * silently. 193 of our files are grouped, holding 210 model sub-outputs of
 * which 32 carry an AAII score — all of which reach the home table through
 * getTopIntelligence, and all of which the first version of this script ignored.
 */
export function applyToYaml(text: string, value: boolean, sub?: string): string | null {
  if (!sub) {
    if (/^\s{2}open_weights:/m.test(text)) {
      return text.replace(/^\s{2}open_weights:.*$/m, `  open_weights: ${value}`);
    }
    const m = /^model:\n/m.exec(text);
    if (!m) return null;
    const at = m.index + m[0].length;
    return `${text.slice(0, at)}  open_weights: ${value}\n${text.slice(at)}`;
  }

  // Grouped: find this sub-output, then the `model:` key inside it. Bound the
  // search to the sub-output's own span so a later sibling never gets the edit.
  // The name may be a quoted scalar — it has to be when it contains a colon,
  // as `GLM-5: From Vibe Coding to Agentic Engineering` does. Matching only the
  // bare form silently skipped that sub-output.
  const esc = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = new RegExp(`^ {2}- name: ["']?${esc}["']?\\s*$`, 'm').exec(text);
  if (!head) return null;
  const start = head.index;
  const nextSibling = text.indexOf('\n  - name: ', start + 1);
  const end = nextSibling < 0 ? text.length : nextSibling;
  const span = text.slice(start, end);

  if (/^\s{6}open_weights:/m.test(span)) {
    return text.slice(0, start) +
      span.replace(/^\s{6}open_weights:.*$/m, `      open_weights: ${value}`) +
      text.slice(end);
  }
  const m = /^ {4}model:\n/m.exec(span);
  if (!m) return null;
  const at = m.index + m[0].length;
  return text.slice(0, start) +
    `${span.slice(0, at)}      open_weights: ${value}\n${span.slice(at)}` +
    text.slice(end);
}

async function main() {
  const argv = process.argv.slice(2);
  const write = argv.includes('--write');
  const scoredOnly = argv.includes('--scored');

  const files = (await glob('data/outputs/*/*.yaml')).sort();
  const rows: { file: string; name: string; sub?: string; scored: boolean; v: Verdict }[] = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const doc = parse(text) ?? {};
    // Two file shapes. A flat entry is `type: model` with one `model:` block; a
    // grouped entry has no top-level type at all and carries an `outputs:`
    // array of sub-outputs that each have their own. Both reach the home table.
    const units: { name: string; sub?: string; model?: Record<string, unknown> }[] =
      Array.isArray(doc.outputs) && doc.outputs.length
        ? doc.outputs
            .filter((s: Record<string, unknown>) => s?.type === 'model')
            .map((s: Record<string, unknown>) => ({
              name: `${doc.name} :: ${s.name}`, sub: s.name as string,
              model: s.model as Record<string, unknown> | undefined }))
        : doc.type === 'model'
          ? [{ name: doc.name ?? file, model: doc.model as Record<string, unknown> }]
          : [];

    for (const u of units) {
      const scored = typeof u.model?.intelligence_index === 'number';
      if (scoredOnly && !scored) continue;
      rows.push({ file, name: u.name, sub: u.sub, scored, v: propose(text, u.model) });
    }
  }

  const fresh = rows.filter((r) => r.v.why !== 'already set');
  const open = fresh.filter((r) => r.v.value === true);
  const closed = fresh.filter((r) => r.v.value === false);
  const unknown = fresh.filter((r) => r.v.value === null);

  console.log(`${rows.length} model entries` + (scoredOnly ? ' with an AAII score' : '') +
    `; ${rows.length - fresh.length} already set\n`);
  console.log(`  proposed open    ${open.length}`);
  console.log(`  proposed closed  ${closed.length}`);
  console.log(`  no evidence      ${unknown.length}  (left unset — unset means unknown)\n`);

  if (!write) {
    for (const r of [...closed, ...unknown]) {
      console.log(`  ${String(r.v.value).padEnd(5)} ${r.scored ? '★' : ' '} ` +
        `${r.name.slice(0, 40).padEnd(40)} ${r.v.why}`);
    }
    console.log('\n★ = has an AAII score, so it can reach the Intelligence (open) column.');
    console.log('Re-run with --write to apply the confident rows (unknowns stay unset).');
    return;
  }

  let applied = 0;
  for (const r of [...open, ...closed]) {
    const out = applyToYaml(readFileSync(r.file, 'utf-8'), r.v.value as boolean, r.sub);
    if (out === null) { console.log(`  ! ${r.file}: no model: block to write into`); continue; }
    writeFileSync(r.file, out);
    applied++;
  }
  console.log(`applied ${applied}; ${unknown.length} left unset.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
