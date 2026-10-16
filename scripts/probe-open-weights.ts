/**
 * Settle `model.open_weights` for entries the file-only pass could not, by
 * asking HuggingFace whether the RELEASING LAB publishes weights for the model.
 *
 * `propose-open-weights` reads evidence already in the repo and abstains when
 * there is none; 187 units reached that state — no licence, no AAOI, no tag, no
 * link, and a description that says neither. This asks the authoritative
 * question instead of guessing from a stronger heuristic.
 *
 * The question is deliberately narrow: **is there a repo named like this model
 * under one of this lab's own orgs?** Scoping to the lab's orgs is what makes a
 * hit mean something — `nvidia/DeepSeek-V4.1-Flash-NVFP4` is NVIDIA
 * republishing DeepSeek's weights, and a community quant of a closed model
 * proves nothing about the lab. Orgs come from the lab file's declared
 * `huggingface:` plus every org that lab's own outputs already link, the same
 * set `sweep-orgs` reports.
 *
 * Three verdicts, and the asymmetry is on purpose:
 *
 *   open    a matching repo exists under one of the lab's orgs.
 *   closed  the lab HAS a populated HuggingFace presence and this model is not
 *           in it. A lab that publishes its open models and not this one is
 *           evidence about this one.
 *   unset   the lab has no HuggingFace presence at all, so absence says nothing
 *           — it is the lab that is absent, not the model.
 *
 * That last branch matters. Reading "not on HuggingFace" as closed for a lab
 * that never uses HuggingFace would mark its entire catalogue closed on no
 * evidence, and a wrong `false` silently removes a lab from the Intelligence
 * (open) column where a blank cell merely says "unknown".
 *
 * Usage: npm run probe-open-weights                        # report
 *        npm run probe-open-weights -- --write              # apply positives
 *        npm run probe-open-weights -- --assume-closed --write
 */
import { readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';
import { glob } from 'glob';
import { parse } from 'yaml';
import { applyToYaml } from './propose-open-weights';

// Raised from 140ms after a full run tripped HuggingFace's IP rate limit and
// every subsequent search returned 429. Unauthenticated search is the scarce
// resource here, not wall-clock.
const DELAY_MS = 450;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lowercase alphanumerics only, so `Qwen2.5-VL` and `qwen25vl` compare equal. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Does `repo` name the same model as `model`?
 *
 * Containment either way, because a lab's repo routinely carries a size or
 * stage suffix the entry omits (`Beam` -> `Beam-1.0-501B-A23B`) and sometimes
 * the entry is the longer one. A floor of 5 characters stops short names like
 * `Ring` or `Yi` matching half the hub.
 */
export function namesMatch(model: string, repo: string): boolean {
  const a = norm(model);
  const b = norm(repo);
  // Containment on normalised strings has no word boundaries, so a model name
  // can match inside an unrelated one: `Codex` matched
  // `Salesforce/codet5-base-codexglue-sum-python`, because "CodeXGLUE"
  // contains "codex". Require the match to sit at a boundary in the RAW repo
  // name — start, end, or next to a separator — which normalisation erases.
  if (a.length >= 5 && b.length >= 5) {
    if (a === b) return true;
    const ra = model.toLowerCase();
    const rb = repo.toLowerCase();
    const at = rb.indexOf(ra);
    if (at >= 0) {
      const before = at === 0 || /[-_. /]/.test(rb[at - 1]);
      const afterIdx = at + ra.length;
      // A version suffix may abut the name with no separator — `ghostnetv2`,
      // `qwen2` — so a digit, or `v` before a digit, also ends the token.
      const rest = rb.slice(afterIdx);
      const after = rest === '' || /^[-_. /]/.test(rest) || /^v?\d/.test(rest);
      if (before && after) return true;
    }
    // The entry name may be the longer of the two (`Qwen2.5-Coder` vs `coder`).
    return a.includes(b) && ra.includes(rb);
  }
  // Short names cannot use containment — `yi` would match half the hub. But
  // demanding exact equality fails every legitimately short name that ships
  // with a size suffix: `GLM-4` normalises to `glm4`, four characters, so it
  // never matched `zai-org/glm-4-9b` and GLM-4 was marked closed. Fall back to
  // a prefix test on the RAW name with a separator after it, which keeps the
  // boundary that normalisation destroys.
  const ra = model.toLowerCase();
  const rb = repo.toLowerCase();
  if (rb === ra) return true;
  return rb.startsWith(ra) && /^[-_. ]/.test(rb.slice(ra.length));
}

interface Hit { id: string; owner: string; likes: number; downloads: number }

/**
 * Engagement floor for accepting a repo under an org we do NOT already know
 * belongs to the lab. The premise is simple: you cannot upload weights you do
 * not have, so a tightly-name-matched repo that people actually use means the
 * weights are public. The floor exists only to exclude name-squatting and
 * empty stubs, not to measure importance.
 */
const MIN_LIKES = 5;

/**
 * Searches that failed rather than returned nothing. A throttled search looks
 * exactly like a model with no weights, and this script's whole closed verdict
 * rests on absence — so conflating the two turns a rate limit into a wall of
 * false `closed`. It already did: a run that hit HTTP 429 on every call
 * reported "open 0 | closed 159" and wrote all 159 before the 429 was noticed.
 * Same failure as a throttled author probe reading as clean coverage.
 */
let failedSearches = 0;

async function hfSearch(q: string): Promise<Hit[] | null> {
  try {
    const r = await fetch(
      `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&limit=25`);
    if (r.status === 429) { failedSearches++; return null; }
    if (!r.ok) { failedSearches++; return null; }
    const rows = await r.json() as { id: string; likes?: number; downloads?: number }[];
    return rows.map((m) => ({
      id: m.id, owner: m.id.split('/')[0],
      likes: m.likes ?? 0, downloads: m.downloads ?? 0 }));
  } catch { failedSearches++; return null; }
}

async function orgIsPopulated(org: string): Promise<boolean> {
  try {
    const r = await fetch(
      `https://huggingface.co/api/models?author=${encodeURIComponent(org)}&limit=1`);
    if (!r.ok) return false;
    return ((await r.json()) as unknown[]).length > 0;
  } catch { return false; }
}

async function main() {
  const write = process.argv.includes('--write');
  // Absence is only evidence when the search was capable of finding the thing.
  // With a GLOBAL search and tight name matching, a model with no matching repo
  // anywhere — on top of having no licence, no AAOI, no tag, no link and no
  // decisive prose, which is how it reached this script — is very likely not
  // downloadable. `--assume-closed` acts on that conjunction. It is a flag and
  // not the default because the inference is weaker than a positive hit, and
  // because a lab publishing only to ModelScope would be wrongly closed by it.
  const assumeClosed = process.argv.includes('--assume-closed');
  const labFiles = await glob('data/labs/*.yaml');
  const outFiles = (await glob('data/outputs/*/*.yaml')).sort();

  // Per-lab org set: the declared org plus every org its own outputs link.
  const orgs = new Map<string, Set<string>>();
  for (const f of labFiles) {
    const slug = basename(f, '.yaml');
    const lab = parse(readFileSync(f, 'utf-8')) ?? {};
    const set = new Set<string>();
    const declared = /huggingface\.co\/([^/\s]+)/.exec(String(lab.huggingface ?? ''));
    if (declared) set.add(declared[1]);
    orgs.set(slug, set);
  }
  for (const f of outFiles) {
    const slug = f.split('/')[2];
    const set = orgs.get(slug);
    if (!set) continue;
    for (const m of readFileSync(f, 'utf-8').matchAll(/huggingface\.co\/([A-Za-z0-9][\w.-]*)\//g)) {
      if (!['datasets', 'collections', 'spaces', 'papers'].includes(m[1])) set.add(m[1]);
    }
  }

  // Which labs have any HuggingFace presence at all — the gate on verdict
  // `closed`, since absence only means something for a lab that is present.
  const populated = new Map<string, boolean>();
  for (const [slug, set] of orgs) {
    let any = false;
    for (const o of set) { if (await orgIsPopulated(o)) { any = true; break; } }
    populated.set(slug, any);
    if (set.size) await sleep(DELAY_MS);
  }

  let open = 0, closed = 0, skipped = 0, applied = 0;
  for (const file of outFiles) {
    const text = readFileSync(file, 'utf-8');
    const doc = parse(text) ?? {};
    const labSlug = file.split('/')[2];
    const set = orgs.get(labSlug) ?? new Set<string>();
    const units: { name: string; sub?: string; model?: Record<string, unknown> }[] =
      Array.isArray(doc.outputs) && doc.outputs.length
        ? doc.outputs.filter((s: Record<string, unknown>) => s?.type === 'model')
            .map((s: Record<string, unknown>) => ({
              name: String(s.name), sub: String(s.name),
              model: s.model as Record<string, unknown> }))
        : doc.type === 'model'
          ? [{ name: String(doc.name), model: doc.model as Record<string, unknown> }]
          : [];

    for (const u of units) {
      if (u.model?.open_weights !== undefined) continue;
      const hits = await hfSearch(u.name);
      await sleep(DELAY_MS);
      if (hits === null) {
        // Never a verdict from a failed search.
        console.log(`  SKIP  ${labSlug}/${u.name.slice(0, 38)} — search failed`);
        skipped++;
        continue;
      }
      const matched = hits.filter((h) => namesMatch(u.name, h.id.split('/')[1]));
      // The lab's own org is the strongest hit, but it is not the only valid
      // one. The first version required it and was wrong 153 times: OFA ships
      // under `OFA-Sys`, InternVL under `OpenGVLab`, and neither org is in the
      // lab's set BECAUSE these are exactly the entries with no HF link. The
      // org set is systematically incomplete for the population being probed,
      // which made the circularity invisible until the verdicts were audited.
      const own = matched.find((h) => set.has(h.owner));
      const anywhere = matched.find((h) => h.likes >= MIN_LIKES);
      let verdict: boolean | null;
      let why: string;
      if (own) { verdict = true; why = `found ${own.id} (lab org)`; }
      else if (anywhere) { verdict = true; why = `found ${anywhere.id} (${anywhere.likes}♥)`; }
      else if (assumeClosed) {
        verdict = false; why = 'no matching weights anywhere on HuggingFace';
      } else { verdict = null; why = 'no matching weights on HuggingFace'; }

      if (verdict === true) open++; else if (verdict === false) closed++; else skipped++;
      console.log(`  ${String(verdict).padEnd(5)} ${labSlug}/${u.name.slice(0, 38).padEnd(38)} ${why}`);

      if (write && verdict !== null) {
        const out = applyToYaml(readFileSync(file, 'utf-8'), verdict, u.sub);
        if (out) { writeFileSync(file, out); applied++; }
        else console.log(`    ! could not write ${file}`);
      }
    }
  }
  console.log(`\n  open ${open} | closed ${closed} | still unset ${skipped}` +
    (write ? ` | applied ${applied}` : ' | report only, re-run with --write'));
  if (failedSearches) {
    console.log(`\n  ${failedSearches} SEARCH(ES) FAILED — probably HTTP 429.`);
    console.log('  Those units were skipped, not judged. Re-run once the limit');
    console.log('  clears; a throttled search is indistinguishable from a model');
    console.log('  with no weights, and this script\'s closed verdict is absence.');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
