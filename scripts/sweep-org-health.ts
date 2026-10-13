/**
 * Check every lab's DECLARED HuggingFace and GitHub orgs for staleness.
 *
 * The declared `huggingface:` and `github:` fields are what the org probe reads
 * by default, so a lab whose field points at a renamed or abandoned org is
 * effectively unprobed —
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
 *   DORMANT  real artifacts, but no activity in STALE_DAYS.
 *   OK       active inside the window.
 *
 * The two hosts need different liveness signals, and swapping them gives wrong
 * answers in both directions. On HuggingFace, shipping means a NEW repo, so the
 * arm reads newest `createdAt` — not `lastModified`, which a lab re-tagging old
 * weights would keep fresh without releasing anything. On GitHub, a lab can go
 * years without creating a repo while pushing to its existing ones daily, so
 * that arm reads the newest `pushed_at`. `thu-ml` demonstrates both at once: its
 * HuggingFace org has shipped nothing in 593 days while its GitHub org was
 * pushed four days ago.
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
 * Usage: npm run sweep-org-health              # both hosts, every lab
 *        npm run sweep-org-health -- --github  # one host only (or --hf)
 *        npm run sweep-org-health -- meta      # one or more lab slugs
 *        npm run sweep-org-health -- --days 540
 */
import { readFileSync } from 'fs';
import { basename } from 'path';
import { execSync } from 'child_process';
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

// ----------------------------------------------------------------- GitHub

/** `https://github.com/facebookresearch` -> `facebookresearch`. */
export function ghNameFromUrl(url: string): string | null {
  const m = /github\.com\/([^/\s]+)\/?$/.exec(url.trim());
  return m ? m[1] : null;
}

let ghToken: string | null | undefined;
function ghHeaders(): Record<string, string> {
  if (ghToken === undefined) {
    try {
      ghToken = execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim() || null;
    } catch { ghToken = null; }
  }
  // Unauthenticated GitHub allows 60 calls/hour, which cannot cover ~110 labs.
  // With a token it is 5000, so an unauthenticated run would report a wall of
  // false DEADs once the quota ran out — hence the explicit check in main().
  return ghToken ? { Authorization: `Bearer ${ghToken}` } : {};
}

/**
 * Newest push across the account's repos, or null if it has none.
 *
 * `pushed_at`, not `created_at`: a lab can go years without creating a repo
 * while pushing to its existing ones daily. `thu-ml` had been pushed four days
 * before this was written and its newest *created* repo was five months old —
 * judging on creation would have called an active org dormant. (That is the
 * opposite of the HuggingFace arm, where new repos are how artifacts ship.)
 *
 * Takes the max over a page rather than element 0: `sort=pushed` has been
 * unreliable at small page sizes, and a max is correct whatever the sort does.
 */
async function ghNewestPush(name: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.github.com/users/${encodeURIComponent(name)}` +
      `/repos?sort=pushed&direction=desc&per_page=30`, { headers: ghHeaders() });
    if (!r.ok) return null;
    const repos = await r.json() as { pushed_at?: string }[];
    const stamps = repos.map((x) => x.pushed_at).filter((s): s is string => !!s);
    return stamps.sort().at(-1) ?? null;
  } catch { return null; }
}

/**
 * Does this GitHub account exist?
 *
 * Deliberately `/users/<name>` and never `/orgs/<name>`, for both kinds. Several
 * labs legitimately declare a *user* account rather than an organization —
 * `MBZUAI`, `PCLNLP-group` and `Yuan-lab-LLM` are all type User — and
 * `/orgs/<name>` 404s for every one of them, which would report them DEAD. The
 * same mistake the HuggingFace arm made once with `/api/organizations`.
 *
 * `/users/<name>` answers for organizations too (it returns
 * `type: "Organization"` for `facebookresearch`), so one endpoint covers both
 * and there is no fallback chain to get wrong.
 */
async function ghExists(name: string): Promise<boolean> {
  try {
    const r = await fetch(
      `https://api.github.com/users/${encodeURIComponent(name)}`, { headers: ghHeaders() });
    return r.ok;
  } catch {
    return true; // network blip: assume it exists rather than cry DEAD
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const di = argv.indexOf('--days');
  const staleDays = di >= 0 ? Number(argv[di + 1]) : STALE_DAYS;
  const only = new Set(argv.filter((a) => !a.startsWith('--') && a !== String(staleDays)));
  const now = new Date();

  const hosts = argv.includes('--hf') ? ['hf']
    : argv.includes('--github') ? ['github'] : ['hf', 'github'];
  if (hosts.includes('github') && !ghHeaders().Authorization) {
    console.error('No GitHub token (`gh auth login`). Unauthenticated GitHub allows 60');
    console.error('calls/hour, far short of ~110 labs, and the overflow would report as');
    console.error('false DEADs. Run with --hf to skip the GitHub arm.');
    process.exitCode = 1;
    return;
  }

  const labFiles = (await glob('data/labs/*.yaml')).sort();
  const rows: { slug: string; host: string; org: string; status: Status;
                age: number | null; secondaries: string[] }[] = [];

  for (const file of labFiles) {
    const slug = basename(file, '.yaml');
    if (only.size && !only.has(slug)) continue;
    const lab = parse(readFileSync(file, 'utf-8')) ?? {};
    const outputs = await glob(`data/outputs/${slug}/*.yaml`);
    const texts = outputs.map((f) => readFileSync(f, 'utf-8'));

    for (const host of hosts) {
      const field = host === 'hf' ? lab.huggingface : lab.github;
      const org = typeof field === 'string'
        ? (host === 'hf' ? orgFromUrl(field) : ghNameFromUrl(field)) : null;
      if (!org) continue;

      const re = host === 'hf'
        ? /huggingface\.co\/([A-Za-z0-9_-]+)/g : /github\.com\/([A-Za-z0-9_.-]+)/g;
      const secondaries = [...new Set(texts.flatMap(
        (t) => [...t.matchAll(re)].map((m) => m[1])))]
        // URL path segments, not accounts.
        .filter((o) => o !== org &&
          !['datasets', 'collections', 'spaces', 'papers', 'blog'].includes(o));

      let newest: string | null;
      let exists: boolean;
      if (host === 'hf') {
        // Ask for artifacts first: anything returned proves the org exists, so
        // the page check is only needed to split DEAD from RENAMED when empty.
        newest = await newestCreatedAt(org);
        exists = newest !== null || await orgExists(org);
      } else {
        // Same order as the HF arm: a push proves the account exists, so the
        // existence call is only needed when nothing came back.
        newest = await ghNewestPush(org);
        exists = newest !== null || await ghExists(org);
      }
      rows.push({ slug, host, org, status: classify(exists, newest, now, staleDays),
                  age: ageDays(newest, now), secondaries });
      await sleep(DELAY_MS);
    }
  }

  const rank: Record<Status, number> = { DEAD: 0, RENAMED: 1, DORMANT: 2, OK: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] ||
    a.host.localeCompare(b.host) || (b.age ?? 0) - (a.age ?? 0));

  const bad = rows.filter((r) => r.status !== 'OK');
  for (const r of bad) {
    const age = r.age === null ? '—' : `${r.age}d`;
    const what = r.host === 'hf' ? 'newest' : 'last push';
    console.log(`${r.status.padEnd(8)} ${r.host.padEnd(7)} ${r.slug.padEnd(22)} ` +
      `${r.org.padEnd(26)} ${what} ${age}`);
    if (r.secondaries.length) {
      console.log(`         -> our outputs also link: ${r.secondaries.join(', ')}`);
    }
  }

  for (const host of hosts) {
    const hr = rows.filter((r) => r.host === host);
    const counts = (['DEAD', 'RENAMED', 'DORMANT', 'OK'] as Status[])
      .map((s) => `${hr.filter((r) => r.status === s).length} ${s}`).join(', ');
    const label = host === 'hf' ? 'HuggingFace' : 'GitHub';
    console.log(`\n${hr.length} labs with a declared ${label} org: ${counts}`);
  }
  if (bad.length) {
    console.log('A declared org that is DEAD or RENAMED is probed by default and finds');
    console.log('nothing, so the lab reads as quiet rather than mispointed. Check the');
    console.log('`->` suggestions first: those are orgs our own outputs already cite.');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
