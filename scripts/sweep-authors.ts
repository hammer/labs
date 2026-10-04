import { readFileSync } from 'fs';
import { basename } from 'path';
import { glob } from 'glob';
import { parse } from 'yaml';

// Candidate untracked arXiv papers for each lab, found by searching arXiv for
// the lab's own researchers rather than the lab's name.
//
// Why this exists: arXiv's searchable metadata is title, abstract, authors and
// comments. It has NO affiliation field — the affiliation lives only in the PDF
// or the HTML body. So `site:arxiv.org <lab name> <month>`, the sweep's primary
// probe, cannot find a paper whose only tie to the lab is its title-page
// affiliation. EMO (arXiv 2605.13247, MBZUAI-IFM + USC-ISI) is the case that
// motivated this: the abs page contains no "MBZUAI", no "IFM", no "Abu Dhabi",
// so no lab-name search would ever return it, and it sat unfiled for five
// months. An author search for Eric Xing — already a tracked person in
// data/labs/mbzuai.yaml — returns it on the first page.
//
// The artifact probes cannot cover for this either. sweep-orgs, the HF
// recent-uploads probe and the GitHub org probe all need a repo or an upload to
// find, and a methods paper often ships neither: 312 of our 506 `type: paper`
// outputs carry no GitHub or HuggingFace link at all. Author search is the only
// probe that reaches that class.
//
// The author index is already in the repo, so derive it instead of maintaining
// it: each lab file's `people:` block, plus whoever actually writes that lab's
// papers (`paper.authors` across its outputs), ranked so the most prolific go
// first.
//
// Output is a candidate list, not an assertion. A tracked researcher's listing
// also holds their university and prior-employer work, so expect entries that
// belong to another lab or to nobody we track — skim before filing, exactly as
// with sweep-orgs.
//
// Usage: npm run sweep-authors -- --since 2026-08 mbzuai     # probe one lab
//        npm run sweep-authors -- --plan                     # authors + URLs, no network
//        npm run sweep-authors -- --since 2026-09 --limit 3  # every lab, 3 authors each

const SEARCH = 'https://arxiv.org/search/';
const UA = 'labindex-sweep/1.0 (https://labindex.ai; periodic lab-research sweep)';

// arXiv asks callers to space requests; the sweep is never in a hurry.
const DELAY_MS = 3000;

export interface Entry {
  id: string;
  title: string;
  categories: string[];
  submitted: string;
}

export interface Author {
  name: string;
  /** How many of this lab's existing outputs list them as an author. */
  papers: number;
  /** Named in the lab file's `people:` block. */
  listed: boolean;
}

/** Every arXiv id mentioned anywhere in the given text, version suffix dropped. */
export function trackedArxivIds(texts: string[]): Set<string> {
  const ids = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(/(\d{4}\.\d{4,5})(?:v\d+)?/g)) ids.add(m[1]);
  }
  return ids;
}

function authorName(a: unknown): string | null {
  if (typeof a === 'string') return a.trim() || null;
  if (a && typeof a === 'object' && typeof (a as { name?: unknown }).name === 'string') {
    return (a as { name: string }).name.trim() || null;
  }
  return null;
}

/**
 * The authors worth probing for one lab: its `people:` block unioned with
 * whoever writes its papers, most prolific first. `people:` members sort ahead
 * of equally-prolific non-members because a lab's own page vouches for them.
 */
export function harvestAuthors(lab: unknown, outputs: unknown[], limit = 6): Author[] {
  const byName = new Map<string, Author>();
  const get = (name: string) => {
    if (!byName.has(name)) byName.set(name, { name, papers: 0, listed: false });
    return byName.get(name)!;
  };

  const people = (lab as { people?: unknown[] })?.people;
  if (Array.isArray(people)) {
    for (const p of people) {
      const name = authorName(p);
      if (name) get(name).listed = true;
    }
  }

  for (const out of outputs) {
    const authors = (out as { paper?: { authors?: unknown[] } })?.paper?.authors;
    if (!Array.isArray(authors)) continue;
    for (const a of authors) {
      const name = authorName(a);
      if (name) get(name).papers++;
    }
  }

  return [...byName.values()]
    .sort((a, b) =>
      b.papers - a.papers ||
      Number(b.listed) - Number(a.listed) ||
      a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function searchUrl(name: string): string {
  const q = new URLSearchParams({
    searchtype: 'author', query: name, start: '0', size: '50',
  });
  return `${SEARCH}?${q}`;
}

/** Parse one arXiv author-search results page. */
export function parseAuthorListing(html: string): Entry[] {
  const out: Entry[] = [];
  // Each hit is one <li class="arxiv-result">; split rather than match across
  // the whole page so a malformed block cannot swallow the next one's fields.
  for (const block of html.split('<li class="arxiv-result">').slice(1)) {
    const id = block.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/)?.[1];
    if (!id) continue;
    const rawTitle = block.match(/<p class="title is-5[^"]*">([\s\S]*?)<\/p>/)?.[1] ?? '';
    const title = rawTitle.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const categories = [...block.matchAll(/<span class="tag [^"]*"[^>]*>([^<]+)<\/span>/g)]
      .map((m) => m[1].trim())
      .filter((c) => /^[a-z-]+\.[A-Z]{2}$/.test(c));
    const submitted = block.match(/Submitted<\/span>\s*([^;<]+)/)?.[1].trim() ?? '';
    out.push({ id, title, categories, submitted });
  }
  return out;
}

/** arXiv ids are YYMM-prefixed, so a YYYY-MM floor is a numeric prefix compare. */
export function yymmFloor(since: string): number {
  const m = since.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error(`--since wants YYYY-MM, got "${since}"`);
  return Number(m[1].slice(2) + m[2]);
}

/**
 * Candidates, each tagged with the authors whose listing surfaced it. The
 * attribution is the triage handle: arXiv author search matches on name alone,
 * so a common name pulls in every namesake's work. A hit surfaced only by a
 * one-paper common name is usually noise; one surfaced by a `people:` member or
 * a frequent author of this lab's papers is worth reading.
 */
export function untracked(
  found: { author: string; entry: Entry }[], tracked: Set<string>, floor: number,
): (Entry & { via: string[] })[] {
  const byId = new Map<string, Entry & { via: string[] }>();
  for (const { author, entry } of found) {
    if (tracked.has(entry.id)) continue;
    if (Number(entry.id.slice(0, 4)) < floor) continue;
    const seen = byId.get(entry.id);
    if (seen) {
      if (!seen.via.includes(author)) seen.via.push(author);
    } else {
      byId.set(entry.id, { ...entry, via: [author] });
    }
  }
  return [...byId.values()];
}

async function fetchListing(name: string): Promise<Entry[]> {
  const res = await fetch(searchUrl(name), { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseAuthorListing(await res.text());
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f: string) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const plan = argv.includes('--plan');
  const since = flag('--since') ?? '2026-01';
  const limit = Number(flag('--limit') ?? 6);
  const floor = yymmFloor(since);
  const only = new Set(argv.filter((a) => !a.startsWith('--') && a !== since && a !== String(limit)));

  const tracked = trackedArxivIds(
    (await glob('data/**/*.yaml')).map((f) => readFileSync(f, 'utf-8')));
  console.log(`${tracked.size} arXiv ids already tracked; looking for papers since ${since}\n`);

  const labFiles = (await glob('data/labs/*.yaml')).sort();
  const plans: { slug: string; authors: Author[] }[] = [];

  for (const labFile of labFiles) {
    const slug = basename(labFile, '.yaml');
    if (only.size && !only.has(slug)) continue;
    const lab = parse(readFileSync(labFile, 'utf-8')) ?? {};
    const outputs = (await glob(`data/outputs/${slug}/*.yaml`))
      .map((f) => parse(readFileSync(f, 'utf-8')) ?? {});
    const authors = harvestAuthors(lab, outputs, limit);
    if (authors.length) plans.push({ slug, authors });
  }

  if (plan) {
    for (const { slug, authors } of plans) {
      console.log(slug);
      for (const a of authors) {
        const why = [a.listed ? 'people:' : null, a.papers ? `${a.papers} papers` : null]
          .filter(Boolean).join(', ');
        console.log(`  ${a.name.padEnd(28)} ${why}`);
        console.log(`    ${searchUrl(a.name)}`);
      }
    }
    const calls = plans.reduce((n, p) => n + p.authors.length, 0);
    console.log(`\n${plans.length} labs, ${calls} author probes. Drop --plan to run them.`);
    return;
  }

  // One author can appear under several labs; fetch each listing once.
  const listings = new Map<string, Entry[]>();
  const queue = [...new Set(plans.flatMap((p) => p.authors.map((a) => a.name)))];
  console.log(`probing ${queue.length} authors across ${plans.length} labs...\n`);

  for (const [i, name] of queue.entries()) {
    try {
      listings.set(name, await fetchListing(name));
    } catch (err) {
      console.error(`  ! ${name}: ${(err as Error).message}`);
      listings.set(name, []);
    }
    if (i < queue.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  let total = 0;
  for (const { slug, authors } of plans) {
    const strong = new Set(authors.filter((a) => a.listed || a.papers > 1).map((a) => a.name));
    const hits = untracked(
      authors.flatMap((a) => (listings.get(a.name) ?? []).map((entry) => ({ author: a.name, entry }))),
      tracked, floor);
    if (!hits.length) continue;
    total += hits.length;
    // Hits a vouched-for author surfaced come first; single-paper common names
    // are where the namesake noise lives, so they sort to the bottom.
    hits.sort((a, b) =>
      Number(b.via.some((v) => strong.has(v))) - Number(a.via.some((v) => strong.has(v))) ||
      b.id.localeCompare(a.id));
    console.log(`\n${slug}`);
    for (const h of hits) {
      const mark = h.via.some((v) => strong.has(v)) ? '*' : ' ';
      console.log(`${mark} ${h.id}  ${h.categories.join(',') || '—'}  ${h.submitted}  via ${h.via.join(', ')}`);
      console.log(`    ${h.title}`);
    }
  }

  console.log(`\n${total} untracked arXiv ids across ${plans.length} labs.`);
  console.log('Read the * rows first: those came from a people:-listed or frequent author.');
  console.log('High-recall by design, and arXiv author search matches on name alone, so a');
  console.log('common name drags in every namesake. Read the title-page affiliations before');
  console.log('assigning a lab, and apply the AGENTS.md exclusion criteria.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
