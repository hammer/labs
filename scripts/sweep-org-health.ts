/**
 * Check every lab's DECLARED HuggingFace org for staleness.
 *
 * The declared `huggingface:` field is what the org probe reads by default, so a
 * lab whose field points at a renamed or abandoned org is effectively unprobed —
 * it reads as a quiet lab rather than a broken pointer, and nothing in the sweep
 * surfaces the difference. That is not hypothetical: `meta.yaml` pointed at
 * `meta-llama`, whose newest upload was 2025-04-28, for about eighteen months
 * while the Muse line shipped from `meta-models`. Meta is one of the most
 * actively tracked labs in the index.
 *
 * Statuses, in order of severity:
 *
 *   DEAD     the org endpoint 404s — a typo, or an org that was deleted.
 *   RENAMED  the endpoint resolves but the org holds nothing. HuggingFace keeps
 *            a renamed org's old handle resolving, so this is what a rename
 *            looks like from outside: 200 with zero models and zero datasets.
 *            `CohereForAI` (now `CohereLabs`) behaves exactly this way.
 *   DORMANT  real artifacts, but nothing new in STALE_DAYS. Judge by newest
 *            `createdAt`, not `lastModified`: a lab re-tagging old repos is not
 *            shipping, and lastModified would hide that.
 *   OK       shipped something inside the window.
 *
 * A DORMANT verdict is a prompt to look, not a defect — some labs genuinely go
 * quiet, and a lab can be alive on GitHub or arXiv while its HF org sleeps. The
 * actionable case is DORMANT or RENAMED *while a secondary org this lab's own
 * outputs already link is more active*, which the report flags with `->`.
 * Secondary orgs come from our filed outputs, so they are evidence we collected
 * and then stopped pointing at.
 *
 * Read-only. Writes nothing; prints a report and exits non-zero if any lab needs
 * attention, so it can gate a sweep.
 *
 * Usage: npm run sweep-org-health              # every lab
 *        npm run sweep-org-health -- meta      # one or more lab slugs
 *        npm run sweep-org-health -- --days 540
 */
import { readFileSync } from 'fs';
import { basename } from 'path';
import { glob } from 'glob';
import { parse } from 'yaml';

const API = 'https://huggingface.co/api';
// Long enough that a lab between releases is not called stale — the sweep cares
// about pointers that rot, not about publication cadence. Meta's dead pointer
// was ~18 months old, Cohere's rename older still.
const STALE_DAYS = 365;
// HF is permissive but this is ~200 calls; stay polite rather than fast.
const DELAY_MS = 120;

export type Status = 'DEAD' | 'RENAMED' | 'DORMANT' | 'OK';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `https://huggingface.co/meta-llama` -> `meta-llama`. Tolerates trailing slash. */
export function orgFromUrl(url: string): string | null {
  const m = /huggingface\.co\/([^/\s]+)\/?$/.exec(url.trim());
  return m ? m[1] : null;
}

/**
 * Classify from what the probes returned. Pure, so the decision table is
 * testable without the network.
 */
export function classify(
  exists: boolean, newest: string | null, now: Date, staleDays = STALE_DAYS,
): Status {
  if (!exists) return 'DEAD';
  if (!newest) return 'RENAMED';
  const age = (now.getTime() - new Date(newest).getTime()) / 86_400_000;
  return age > staleDays ? 'DORMANT' : 'OK';
}

/** Days between an ISO timestamp and now, rounded — for the report column. */
export function ageDays(iso: string | null, now: Date): number | null {
  return iso === null ? null : Math.round((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

async function newestCreatedAt(org: string): Promise<string | null> {
  // Models and datasets both count as shipping: several orgs are dataset-only,
  // and judging on models alone would call them RENAMED.
  const stamps: string[] = [];
  for (const kind of ['models', 'datasets']) {
    try {
      const r = await fetch(
        `${API}/${kind}?author=${encodeURIComponent(org)}&sort=createdAt&direction=-1&limit=1`);
      if (!r.ok) continue;
      const rows = await r.json() as { createdAt?: string }[];
      if (rows[0]?.createdAt) stamps.push(rows[0].createdAt);
    } catch { /* treated as nothing found; the org-endpoint probe decides DEAD */ }
  }
  return stamps.sort().at(-1) ?? null;
}

/**
 * Does the org exist? Only asked when it holds nothing, to tell a deleted org
 * from a renamed one.
 *
 * Uses the public org PAGE, not `/api/organizations/<org>/overview`. That API
 * endpoint 404s for orgs that plainly exist — measured on the first run of this
 * script, it 404'd for `princeton-nlp` (which shipped a model on 2026-10-02),
 * `Agnes-AI` (2026-10-11), `PCLNLP` and `MLSpeech`. Trusting it produced five
 * DEAD verdicts of which four were wrong, and acting on them would have
 * "fixed" four orgs that were never broken. The page is the authority.
 */
async function orgExists(org: string): Promise<boolean> {
  try {
    const r = await fetch(`https://huggingface.co/${encodeURIComponent(org)}`);
    return r.status !== 404;
  } catch {
    return true; // a network blip must not be reported as a deleted org
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const di = argv.indexOf('--days');
  const staleDays = di >= 0 ? Number(argv[di + 1]) : STALE_DAYS;
  const only = new Set(argv.filter((a) => !a.startsWith('--') && a !== String(staleDays)));
  const now = new Date();

  const labFiles = (await glob('data/labs/*.yaml')).sort();
  const rows: { slug: string; org: string; status: Status; age: number | null;
                secondaries: string[] }[] = [];

  for (const file of labFiles) {
    const slug = basename(file, '.yaml');
    if (only.size && !only.has(slug)) continue;
    const lab = parse(readFileSync(file, 'utf-8')) ?? {};
    const org = typeof lab.huggingface === 'string' ? orgFromUrl(lab.huggingface) : null;
    if (!org) continue;

    const outputs = await glob(`data/outputs/${slug}/*.yaml`);
    const secondaries = [...new Set(outputs.flatMap((f) => [
      ...readFileSync(f, 'utf-8').matchAll(/huggingface\.co\/([A-Za-z0-9_-]+)/g),
    ].map((m) => m[1])))]
      // `datasets` and `collections` are URL path segments, not orgs.
      .filter((o) => o !== org && !['datasets', 'collections', 'spaces', 'papers'].includes(o));

    // Ask for artifacts first: anything returned proves the org exists, so the
    // page check is only needed to separate DEAD from RENAMED when it is empty.
    const newest = await newestCreatedAt(org);
    const exists = newest !== null || await orgExists(org);
    rows.push({ slug, org, status: classify(exists, newest, now, staleDays),
                age: ageDays(newest, now), secondaries });
    await sleep(DELAY_MS);
  }

  const rank: Record<Status, number> = { DEAD: 0, RENAMED: 1, DORMANT: 2, OK: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || (b.age ?? 0) - (a.age ?? 0));

  const bad = rows.filter((r) => r.status !== 'OK');
  for (const r of bad) {
    const age = r.age === null ? '—' : `${r.age}d`;
    console.log(`${r.status.padEnd(8)} ${r.slug.padEnd(24)} ${r.org.padEnd(28)} newest ${age}`);
    if (r.secondaries.length) {
      console.log(`         -> our outputs also link: ${r.secondaries.join(', ')}`);
    }
  }

  const counts = (['DEAD', 'RENAMED', 'DORMANT', 'OK'] as Status[])
    .map((s) => `${rows.filter((r) => r.status === s).length} ${s}`).join(', ');
  console.log(`\n${rows.length} labs with a declared HF org: ${counts}`);
  if (bad.length) {
    console.log('A declared org that is DEAD or RENAMED is probed by default and finds');
    console.log('nothing, so the lab reads as quiet rather than mispointed. Check the');
    console.log('`->` suggestions first: those are orgs our own outputs already cite.');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
