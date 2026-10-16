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
/**
 * Tags that assert downloadable weights. Anchored, because `open-vocabulary` is
 * a computer-vision term with nothing to do with weights and an unanchored
 * /open/ matches it — 3 entries carry it.
 */
const OPEN_TAG = /^open[- ](weight|weights|source|model)s?$/i;
const CLOSED_TAG = /^(proprietary|closed[- ]?source|api[- ]only)$/i;

/**
 * An entry's OWN description saying the weights are not public. Only consulted
 * for the unit's own prose — never a parent's — and only in the closed
 * direction: "weights released" is ambiguous in an entry that also discusses
 * siblings, whereas "did not release weights" is not.
 */
const CLOSED_PROSE = /did not release weights|no weights (were |are )?released|hosted(-| )only|available (only )?(via|through) (the )?API|API[- ]only|closed[- ]weights|not open[- ]sourc|weights (were |are )?not released|\bproprietary\b/i;

export interface Ctx {
  /** Entry-level tags. Only trustworthy when the entry holds ONE model. */
  tags?: string[];
  /** True for a sub-output of a grouped entry, where tags are the parent's. */
  grouped?: boolean;
  /**
   * True when the entry holds exactly ONE model unit. The parent tag is then
   * unambiguous even on a grouped entry: there is no sibling it could be
   * describing instead. `vig.yaml` is tagged `open-source` and holds one model
   * plus one paper, and ViG's weights ship from GitHub rather than
   * HuggingFace — so without this it was marked closed by a HuggingFace probe
   * in a file that says open on its face. 15 entries were in that state.
   */
  soleModel?: boolean;
  /** This unit's own source URLs — for a grouped sub-output, only its own. */
  urls?: string;
  /** This unit's own description, never a parent's. */
  desc?: string;
}

export function propose(
  text: string, model: Record<string, unknown> | undefined, ctx: Ctx = {},
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

  // Entry tags, but ONLY for a flat entry, where the tags describe the one
  // model in the file. On a grouped entry they belong to the parent and are
  // routinely wrong for individual members: `qwen3.yaml` is tagged
  // `open-weight` for its open siblings while holding Qwen3-Max, Qwen3-Plus and
  // other API-only tiers, and `qwen-image.yaml` is tagged open while
  // Qwen-Image-3.0 is hosted-only. 60 sub-outputs would have inherited a tag
  // this way, most of them Alibaba's closed Max/Plus line.
  const tags = (ctx.tags ?? []).map(String);
  const tagApplies = !ctx.grouped || ctx.soleModel === true;
  if (tagApplies && tags.some((t) => CLOSED_TAG.test(t))) {
    return { value: false, why: 'entry tagged proprietary' };
  }
  if (tagApplies && tags.some((t) => OPEN_TAG.test(t))) {
    return { value: true, why: `entry tagged ${tags.find((t) => OPEN_TAG.test(t))}` };
  }

  // The unit's own prose, in the closed direction only. Qwen-Image-3.0 says
  // outright "Alibaba did not release weights or disclose scale" — an entry
  // that answers the question in its own description should not need a probe.
  if (ctx.desc && CLOSED_PROSE.test(ctx.desc)) {
    return { value: false, why: `description: "${(CLOSED_PROSE.exec(ctx.desc) ?? [''])[0]}"` };
  }

  // A grouped sub-output that links its OWN HuggingFace repo. Scoped to this
  // member's sources, so a sibling's weights never vouch for it.
  if (ctx.grouped && ctx.urls &&
      /huggingface\.co\/[A-Za-z0-9][\w.-]*\/[\w.-]+/.test(ctx.urls)) {
    return { value: true, why: 'sub-output links its own HuggingFace repo' };
  }

  // Circumstantial, and last: a HuggingFace *model* repo URL (owner/name, so a
  // bare org link does not count). Checked against the closed frontier — the
  // Claude, GPT and Gemini entries link no HuggingFace repo at all — but a lab
  // can still link one for a tokenizer or a third party's quant, which is why
  // this ranks below every explicit signal.
  //
  // NEVER for a grouped sub-output: `text` is the whole file, so a sibling's
  // weights would vouch for it. That is not hypothetical — this rule marked
  // Qwen-Image-3.0 open off Qwen-Image-2.1's link, in a file whose own
  // description says "Alibaba did not release weights or disclose scale". A
  // sub-output gets the scoped check above and nothing else.
  if (!ctx.grouped && /huggingface\.co\/[A-Za-z0-9][\w.-]*\/[\w.-]+/.test(text)) {
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
    // An empty inline map (`model: {}`) counts as an existing block and must be
    // expanded, not treated as absent. Matching only `^model:\n` skipped it and
    // sent those files down the create path, which wrote a SECOND `model:` key
    // and produced a DUPLICATE_KEY parse error in six files.
    const empty = /^model:[ \t]*\{\}[ \t]*$/m.exec(text);
    if (empty) {
      return `${text.slice(0, empty.index)}model:\n  open_weights: ${value}` +
        `${text.slice(empty.index + empty[0].length)}`;
    }
    const m = /^model:\n/m.exec(text);
    if (m) {
      const at = m.index + m[0].length;
      return `${text.slice(0, at)}  open_weights: ${value}\n${text.slice(at)}`;
    }
    // 201 entries are `type: model` with no `model:` block at all — the block
    // is optional and only appears once someone records a structured fact. So
    // create it rather than skipping, or those entries can never carry
    // open_weights. Placed before `paper:`/`related:` to match the key order
    // every other file uses, and appended when neither is present.
    const anchor = /^(paper|related):/m.exec(text);
    const block = `model:\n  open_weights: ${value}\n`;
    if (anchor) {
      return `${text.slice(0, anchor.index)}${block}${text.slice(anchor.index)}`;
    }
    return `${text.replace(/\n*$/, '\n')}${block}`;
  }

  // Grouped: find this sub-output, then the `model:` key inside it. Bound the
  // search to the sub-output's own span so a later sibling never gets the edit.
  // Two things make locating a sub-output harder than it looks. The name may be
  // a quoted scalar — it has to be when it contains a colon, as
  // `GLM-5: From Vibe Coding to Agentic Engineering` does. And `name:` is not
  // always the list item's FIRST key: a dozen Huawei entries order it
  // `- type: paper` then `  name: ...`, so anchoring on `- name:` skipped them
  // all. Match the name line at either indent, then walk back to the `- ` that
  // opens the item so the span still starts at the item boundary.
  const esc = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = new RegExp(`^(?: {2}- | {4})name: ["']?${esc}["']?\\s*$`, 'm').exec(text);
  if (!head) return null;
  const itemOpen = text.lastIndexOf('\n  - ', head.index);
  const start = head[0].startsWith('  - ') || itemOpen < 0 ? head.index : itemOpen + 1;
  // A sub-output ends at the next sibling OR at the next top-level key, and the
  // second bound is the one that matters for the LAST member: without it the
  // span runs to end-of-file and swallows the trailing `related:` block, so an
  // appended `model:` lands inside that list and the file stops parsing.
  // Any list item, not just one that leads with `name:`. Sub-outputs order
  // their keys freely — `- type: model` then `  name: ViG` is common — so
  // searching for `- name:` missed the boundary entirely and let one member's
  // span swallow the next, which appended ViG's model block inside the paper
  // unit that followed it.
  const nextSibling = text.indexOf('\n  - ', start + 1);
  const nextTopKey = /\n[a-z_]+:/.exec(text.slice(start + 1));
  const bounds = [
    nextSibling < 0 ? text.length : nextSibling,
    nextTopKey ? start + 1 + nextTopKey.index : text.length,
  ];
  const end = Math.min(...bounds);
  const span = text.slice(start, end);

  if (/^\s{6}open_weights:/m.test(span)) {
    return text.slice(0, start) +
      span.replace(/^\s{6}open_weights:.*$/m, `      open_weights: ${value}`) +
      text.slice(end);
  }
  const emptySub = /^ {4}model:[ \t]*\{\}[ \t]*$/m.exec(span);
  if (emptySub) {
    return text.slice(0, start) +
      `${span.slice(0, emptySub.index)}    model:\n      open_weights: ${value}` +
      span.slice(emptySub.index + emptySub[0].length) + text.slice(end);
  }
  const m = /^ {4}model:\n/m.exec(span);
  if (m) {
    const at = m.index + m[0].length;
    return text.slice(0, start) +
      `${span.slice(0, at)}      open_weights: ${value}\n${span.slice(at)}` +
      text.slice(end);
  }
  // Sub-output with no `model:` block — same optional-block case as a flat
  // entry. Append one at the end of this member's span, which keeps it inside
  // the right list item and ahead of the next sibling.
  const tail = span.replace(/\n*$/, '\n');
  return `${text.slice(0, start)}${tail}    model:\n      open_weights: ${value}\n${text.slice(end)}`;
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
    const units: { name: string; sub?: string; model?: Record<string, unknown>;
                   grouped?: boolean; urls?: string; desc?: string;
                   soleModel?: boolean }[] =
      Array.isArray(doc.outputs) && doc.outputs.length
        ? (() => {
            const models = doc.outputs.filter(
              (s: Record<string, unknown>) => s?.type === 'model');
            return models.map((s: Record<string, unknown>) => ({
              soleModel: models.length === 1,
              name: `${doc.name} :: ${s.name}`, sub: s.name as string,
              model: s.model as Record<string, unknown> | undefined,
              grouped: true,
              urls: ((s.sources ?? []) as { url?: string }[])
                .map((x) => x?.url ?? '').join(' '),
              desc: String(s.description ?? '') })); })()
        : doc.type === 'model'
          ? [{ name: doc.name ?? file, model: doc.model as Record<string, unknown> }]
          : [];

    for (const u of units) {
      const scored = typeof u.model?.intelligence_index === 'number';
      if (scoredOnly && !scored) continue;
      rows.push({ file, name: u.name, sub: u.sub, scored,
        v: propose(text, u.model, {
          tags: (doc.tags ?? []) as string[], grouped: u.grouped, urls: u.urls,
          desc: u.desc, soleModel: u.soleModel }) });
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
