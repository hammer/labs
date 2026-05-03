import { execFileSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';

// ─── Types ───────────────────────────────────────────────────────────

export type EventKind = 'added' | 'changed' | 'removed' | 'renamed' | 'schema' | 'bulk';

export interface FieldChange {
  path: string;
  before?: string;
  after?: string;
  op: 'added' | 'changed' | 'removed';
}

export interface ChangeEvent {
  kind: EventKind;
  date: string;           // YYYY-MM-DD UTC, for grouping
  timestamp: string;      // ISO 8601, for sort
  commitSha: string;
  commitSubject: string;
  subject: string;        // displayed primary subject
  href?: string;          // /labs/x or /outputs/lab/slug
  fields?: FieldChange[];
  bulkItems?: string[];   // for kind='bulk': list of collapsed items
  schemaCount?: number;   // for kind='schema': how many entities affected
  fromName?: string;      // for kind='renamed'
}

// ─── Git helpers ─────────────────────────────────────────────────────

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
}

function gitOrNull(...args: string[]): string | null {
  try { return git(...args); } catch { return null; }
}

// One-shot batched blob fetch. Spawns a single `git cat-file --batch`
// process and reads N blobs in one round-trip instead of N processes.
function batchFetchBlobs(refs: string[]): Map<string, string | null> {
  const result = new Map<string, string | null>();
  if (refs.length === 0) return result;
  const input = Buffer.from(refs.join('\n') + '\n');
  const out = spawnSync('git', ['cat-file', '--batch'], {
    input,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (out.status !== 0 && !out.stdout) {
    return result;
  }
  const buf: Buffer = out.stdout;
  let pos = 0;
  for (const ref of refs) {
    if (pos >= buf.length) { result.set(ref, null); continue; }
    // Find end of header line.
    const nl = buf.indexOf(0x0a, pos);
    if (nl < 0) { result.set(ref, null); break; }
    const header = buf.slice(pos, nl).toString('utf-8');
    pos = nl + 1;
    // Header format: "<sha> <type> <size>" or "<ref> missing"
    if (header.endsWith(' missing')) {
      result.set(ref, null);
      continue;
    }
    const parts = header.split(' ');
    const size = parseInt(parts[parts.length - 1]!, 10);
    if (Number.isNaN(size)) { result.set(ref, null); continue; }
    const content = buf.slice(pos, pos + size).toString('utf-8');
    pos += size;
    // Skip trailing newline after the blob.
    if (buf[pos] === 0x0a) pos += 1;
    result.set(ref, content);
  }
  return result;
}

// Module-level blob cache populated up-front before diff processing.
const blobCache = new Map<string, string | null>();
function cachedBlob(ref: string): string | null {
  return blobCache.has(ref) ? blobCache.get(ref)! : null;
}
const yamlCache = new Map<string, unknown>();
function parseYamlCached(ref: string): unknown {
  if (yamlCache.has(ref)) return yamlCache.get(ref);
  const raw = cachedBlob(ref);
  if (raw == null) { yamlCache.set(ref, null); return null; }
  try {
    const v = parseYaml(raw);
    yamlCache.set(ref, v);
    return v;
  } catch {
    yamlCache.set(ref, null);
    return null;
  }
}

interface CommitMeta {
  sha: string;
  parent: string | null;
  isoDate: string;
  utcDate: string;
  subject: string;
}

function listCommits(since: string): CommitMeta[] {
  const out = git('log', `--since=${since}`, '--pretty=format:%H%x01%P%x01%cI%x01%s', '--', 'data/');
  if (!out.trim()) return [];
  return out.trim().split('\n').map(line => {
    const [sha, parents, isoDate, ...subjectParts] = line.split('\x01');
    const subject = subjectParts.join('\x01');
    const parentList = (parents ?? '').trim().split(/\s+/).filter(Boolean);
    const utcDate = new Date(isoDate).toISOString().slice(0, 10);
    return {
      sha,
      parent: parentList[0] ?? null,  // first-parent only; merges are treated as a single edge
      isoDate,
      utcDate,
      subject,
    };
  });
}

interface FileChange {
  status: string;   // A | M | D | R<score>
  path: string;     // current/post-rename path
  oldPath?: string; // for renames
}

function listFileChanges(sha: string): FileChange[] {
  const out = gitOrNull('show', '--name-status', '--find-renames', '--pretty=format:', '-m', '--first-parent', sha, '--', 'data/');
  if (!out) return [];
  const changes: FileChange[] = [];
  for (const line of out.trim().split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0]!;
    if (status.startsWith('R')) {
      changes.push({ status: 'R', oldPath: parts[1], path: parts[2] });
    } else {
      changes.push({ status: status[0]!, path: parts[1]! });
    }
  }
  return changes;
}

function getFileAt(sha: string, path: string): unknown | null {
  return parseYamlCached(`${sha}:${path}`);
}

// ─── Substantive-only filter rules ───────────────────────────────────

// Top-level lab fields whose value changes are surfaced.
const LAB_FIELD_ALLOWLIST = new Set([
  'region', 'founded', 'type', 'parent',
  'ipo', 'valuation',
]);

// Top-level output / sub-output fields whose value changes are surfaced.
const OUTPUT_FIELD_ALLOWLIST = new Set([
  'flagship', 'date',
  'paper', 'eval', 'library', 'dataset',
]);

// Model spec fields surfaced at any depth (for grouped + simple outputs).
const MODEL_FIELD_ALLOWLIST = new Set([
  'parameters', 'parameters_estimated', 'active_parameters',
  'architecture', 'context_window', 'intelligence_index',
  'training_tokens', 'training_hardware', 'training_cost', 'license',
  'num_experts', 'top_k',
]);

// Always suppress these paths regardless of context.
const ALWAYS_SUPPRESS = new Set([
  'description', 'notes', 'url', 'wikipedia', 'huggingface', 'github',
  'youtube', 'artificialanalysis', 'openrouter', 'sources', 'links',
  'related', 'formerly',
]);

// Excluded paths entirely (auto-fetched).
const EXCLUDED_PATHS = ['data/metrics.json'];

function isExcluded(path: string): boolean {
  return EXCLUDED_PATHS.includes(path);
}

// ─── Diffing ─────────────────────────────────────────────────────────

function jsonHash(v: unknown): string {
  // Stable enough for identity matching of array elements.
  return JSON.stringify(v, Object.keys(v && typeof v === 'object' ? (v as object) : {}).sort());
}

// Pick an identity key for an array element so we can match before/after
// elements even when array order changes.
function elementId(elem: unknown, idx: number): string {
  if (typeof elem !== 'object' || elem == null) {
    return `v:${jsonHash(elem)}`;
  }
  const o = elem as Record<string, unknown>;
  if (typeof o.slug === 'string') return `slug:${o.slug}`;
  if (typeof o.name === 'string') return `name:${o.name}`;
  if (typeof o.title === 'string') return `title:${o.title}`;
  return `i:${idx}:${jsonHash(o)}`;
}

function fmtValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.value === 'string') return String(o.value);
    if (typeof o.year === 'number') return String(o.year);
    if (typeof o.amount === 'string') return o.amount;
    if (typeof o.name === 'string') return o.name;
    return '{…}';
  }
  return String(v);
}

// Decide whether a leaf change at `path` should surface, based on file class.
function isSurfacedField(path: string, fileKind: 'lab' | 'output'): boolean {
  const segments = path.split('.');
  // Suppress anything inside an always-suppress path.
  for (const seg of segments) {
    const bare = seg.replace(/\[.*?\]$/, '');
    if (ALWAYS_SUPPRESS.has(bare)) return false;
  }
  // Surface model.* fields by their leaf key.
  if (path.startsWith('model.') || /\.model\./.test(path)) {
    const leaf = segments.at(-1)!.replace(/\[.*?\]$/, '');
    return MODEL_FIELD_ALLOWLIST.has(leaf) || MODEL_FIELD_ALLOWLIST.has(segments.at(-2) ?? '');
  }
  // Top-level / nested allowlist.
  const root = segments[0]!.replace(/\[.*?\]$/, '');
  if (fileKind === 'lab') {
    if (LAB_FIELD_ALLOWLIST.has(root)) return true;
    // people / news handled at array-membership level (added/removed entries)
    if (root === 'people' || root === 'news' || root === 'tags') return true;
    return false;
  }
  // output
  if (OUTPUT_FIELD_ALLOWLIST.has(root)) return true;
  if (root === 'tags' || root === 'outputs') return true;
  return false;
}

function diffNodes(
  before: unknown, after: unknown,
  path: string,
  fileKind: 'lab' | 'output',
  out: FieldChange[],
): void {
  if (jsonHash(before) === jsonHash(after)) return;

  // Both arrays: identity-based diff.
  if (Array.isArray(before) && Array.isArray(after)) {
    diffArrays(before, after, path, fileKind, out);
    return;
  }

  // Both plain objects: recurse into keys (union).
  if (
    before && after && typeof before === 'object' && typeof after === 'object' &&
    !Array.isArray(before) && !Array.isArray(after)
  ) {
    const keys = new Set([...Object.keys(before as object), ...Object.keys(after as object)]);
    for (const k of keys) {
      const childPath = path ? `${path}.${k}` : k;
      diffNodes(
        (before as Record<string, unknown>)[k],
        (after as Record<string, unknown>)[k],
        childPath, fileKind, out,
      );
    }
    return;
  }

  // Leaf change.
  if (!isSurfacedField(path, fileKind)) return;
  let op: FieldChange['op'] = 'changed';
  if (before === undefined) op = 'added';
  else if (after === undefined) op = 'removed';
  out.push({ path, before: fmtValue(before), after: fmtValue(after), op });
}

function diffArrays(
  before: unknown[], after: unknown[],
  path: string, fileKind: 'lab' | 'output',
  out: FieldChange[],
): void {
  // Build identity → element maps.
  const beforeMap = new Map<string, unknown>();
  before.forEach((e, i) => beforeMap.set(elementId(e, i), e));
  const afterMap = new Map<string, unknown>();
  after.forEach((e, i) => afterMap.set(elementId(e, i), e));

  const root = path.split('.')[0];

  // For tags: surface as set diff.
  if (root === 'tags') {
    if (!isSurfacedField(path, fileKind)) return;
    const setBefore = new Set(before as string[]);
    const setAfter = new Set(after as string[]);
    const added = [...setAfter].filter(t => !setBefore.has(t));
    const removed = [...setBefore].filter(t => !setAfter.has(t));
    if (added.length === 0 && removed.length === 0) return;
    if (added.length) out.push({ path: `${path}`, after: added.join(', '), op: 'added' });
    if (removed.length) out.push({ path: `${path}`, before: removed.join(', '), op: 'removed' });
    return;
  }

  // Added / removed elements first.
  for (const [id, elem] of afterMap.entries()) {
    if (!beforeMap.has(id)) {
      if (!isSurfacedField(path, fileKind)) continue;
      out.push({ path, after: fmtValue(elem), op: 'added' });
    }
  }
  for (const [id, elem] of beforeMap.entries()) {
    if (!afterMap.has(id)) {
      if (!isSurfacedField(path, fileKind)) continue;
      out.push({ path, before: fmtValue(elem), op: 'removed' });
    }
  }

  // For elements present in both: recurse into named-subpath form.
  for (const [id, elemAfter] of afterMap.entries()) {
    if (!beforeMap.has(id)) continue;
    const elemBefore = beforeMap.get(id);
    let subKey = id;
    // Friendlier: use the visible name for the path prefix.
    if (subKey.startsWith('slug:')) subKey = subKey.slice(5);
    else if (subKey.startsWith('name:')) subKey = subKey.slice(5);
    else if (subKey.startsWith('title:')) subKey = subKey.slice(6);
    else continue;  // hash-identity, skip recursion (treat as opaque value)
    diffNodes(elemBefore, elemAfter, `${path}[${subKey}]`, fileKind, out);
  }
}

// ─── Schema-migration / bulk-onboarding detection ────────────────────

function isSchemaCommit(subject: string): boolean {
  // Tightened: only commits whose subject explicitly signals a migration.
  return /^Schema:/i.test(subject)
    || /\bRename .* values\b/i.test(subject)
    || /\bMigrate .* schema\b/i.test(subject)
    || /\bReplace lab type\b/i.test(subject);   // matches our recent migration
}

function bulkLabFromOutputs(addedOutputPaths: string[]): string | null {
  if (addedOutputPaths.length < 5) return null;
  const labs = new Set(addedOutputPaths.map(p => p.split('/')[2]));
  return labs.size === 1 ? [...labs][0]! : null;
}

// ─── Subject / link helpers ──────────────────────────────────────────

function fileKindOf(path: string): 'lab' | 'output' | null {
  if (path.startsWith('data/labs/') && path.endsWith('.yaml')) return 'lab';
  if (path.startsWith('data/outputs/') && path.endsWith('.yaml')) return 'output';
  return null;
}

function pathToHrefAndName(path: string, yaml: any): { href: string; name: string } | null {
  if (path.startsWith('data/labs/') && yaml && typeof yaml === 'object') {
    const slug = (yaml as { slug?: string }).slug
      ?? path.slice('data/labs/'.length, -'.yaml'.length);
    const name = (yaml as { name?: string }).name ?? slug;
    return { href: `/labs/${slug}`, name };
  }
  if (path.startsWith('data/outputs/')) {
    const parts = path.split('/');
    const labSlug = parts[2]!;
    const outputSlug = (yaml as { slug?: string })?.slug
      ?? parts.at(-1)!.replace(/\.yaml$/, '');
    const name = (yaml as { name?: string })?.name ?? outputSlug;
    return { href: `/outputs/${labSlug}/${outputSlug}`, name };
  }
  return null;
}

// ─── Main: build event list ──────────────────────────────────────────

interface BuildOptions {
  since?: string;       // git --since spec
  monthsToShow?: number;
}

export function getChangelog(opts: BuildOptions = {}): ChangeEvent[] {
  if (!existsSync('.git')) {
    console.warn('[changelog] .git directory not found; whats-new will be empty');
    return [];
  }

  const since = opts.since ?? '13 months ago';
  const commits = listCommits(since);
  const events: ChangeEvent[] = [];

  // Pre-pass: gather every blob ref we'll need so we can batch-fetch them
  // in a single `git cat-file --batch` invocation. Without this, the script
  // makes one git process per (sha, path) tuple and dominates build time.
  const allFileChanges = new Map<string, FileChange[]>();
  const refsNeeded = new Set<string>();
  for (const commit of commits) {
    const fcs = listFileChanges(commit.sha)
      .filter(f => !isExcluded(f.path) && !isExcluded(f.oldPath ?? ''));
    if (fcs.length === 0) continue;
    allFileChanges.set(commit.sha, fcs);
    for (const fc of fcs) {
      const fileKind = fileKindOf(fc.path);
      if (!fileKind) continue;
      // Always need the post-state for the new path (except plain deletes).
      if (fc.status !== 'D') refsNeeded.add(`${commit.sha}:${fc.path}`);
      // For modifications and renames, also need the parent's pre-state.
      if (commit.parent && (fc.status === 'M' || fc.status === 'R')) {
        const oldPath = fc.oldPath ?? fc.path;
        refsNeeded.add(`${commit.parent}:${oldPath}`);
      }
      // For deletes, pre-state for friendly naming.
      if (fc.status === 'D' && commit.parent) {
        refsNeeded.add(`${commit.parent}:${fc.path}`);
      }
    }
  }
  const fetched = batchFetchBlobs([...refsNeeded]);
  for (const [k, v] of fetched) blobCache.set(k, v);

  for (const commit of commits) {
    if (!allFileChanges.has(commit.sha)) continue;
    const fileChanges = allFileChanges.get(commit.sha)!;

    // Schema migration short-circuit.
    if (isSchemaCommit(commit.subject)) {
      const trackedFiles = fileChanges.filter(f => fileKindOf(f.path) != null);
      events.push({
        kind: 'schema',
        date: commit.utcDate,
        timestamp: commit.isoDate,
        commitSha: commit.sha,
        commitSubject: commit.subject,
        subject: commit.subject.replace(/^Schema:\s*/i, ''),
        schemaCount: trackedFiles.length,
      });
      continue;
    }

    // Bulk-onboarding short-circuit (≥5 added outputs under one lab).
    const addedOutputs = fileChanges.filter(f => f.status === 'A' && fileKindOf(f.path) === 'output').map(f => f.path);
    const bulkLab = bulkLabFromOutputs(addedOutputs);
    if (bulkLab) {
      const items: string[] = [];
      for (const p of addedOutputs) {
        const yaml = getFileAt(commit.sha, p) as { name?: string } | null;
        items.push(yaml?.name ?? p.split('/').at(-1)!.replace(/\.yaml$/, ''));
      }
      events.push({
        kind: 'bulk',
        date: commit.utcDate,
        timestamp: commit.isoDate,
        commitSha: commit.sha,
        commitSubject: commit.subject,
        subject: `Added ${addedOutputs.length} outputs for ${bulkLab}`,
        href: `/labs/${bulkLab}`,
        bulkItems: items,
      });
      // Process the rest of the commit's non-bulk changes normally.
      const remaining = fileChanges.filter(f => !addedOutputs.includes(f.path));
      processFileChanges(remaining, commit, events);
      continue;
    }

    processFileChanges(fileChanges, commit, events);
  }

  // Sort newest first.
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return events;
}

function processFileChanges(fileChanges: FileChange[], commit: CommitMeta, events: ChangeEvent[]): void {
  for (const fc of fileChanges) {
    const fileKind = fileKindOf(fc.path);
    if (!fileKind) continue;

    if (fc.status === 'A') {
      const yaml = getFileAt(commit.sha, fc.path);
      const ref = pathToHrefAndName(fc.path, yaml);
      if (!ref) continue;
      events.push({
        kind: 'added',
        date: commit.utcDate, timestamp: commit.isoDate,
        commitSha: commit.sha, commitSubject: commit.subject,
        subject: fileKind === 'lab' ? `New lab: ${ref.name}` : `New output: ${ref.name}`,
        href: ref.href,
      });
      continue;
    }

    if (fc.status === 'D') {
      const yaml = commit.parent ? getFileAt(commit.parent, fc.path) : null;
      const ref = pathToHrefAndName(fc.path, yaml ?? {});
      events.push({
        kind: 'removed',
        date: commit.utcDate, timestamp: commit.isoDate,
        commitSha: commit.sha, commitSubject: commit.subject,
        subject: fileKind === 'lab' ? `Removed lab: ${ref?.name ?? fc.path}` : `Removed output: ${ref?.name ?? fc.path}`,
      });
      continue;
    }

    if (fc.status === 'R' && fc.oldPath) {
      const yamlAfter = getFileAt(commit.sha, fc.path);
      const yamlBefore = commit.parent ? getFileAt(commit.parent, fc.oldPath) : null;
      const refAfter = pathToHrefAndName(fc.path, yamlAfter ?? {});
      const refBefore = pathToHrefAndName(fc.oldPath, yamlBefore ?? {});
      events.push({
        kind: 'renamed',
        date: commit.utcDate, timestamp: commit.isoDate,
        commitSha: commit.sha, commitSubject: commit.subject,
        subject: `Renamed ${refBefore?.name ?? fc.oldPath} → ${refAfter?.name ?? fc.path}`,
        href: refAfter?.href,
        fromName: refBefore?.name,
      });
      // also fall through to diff body (renames may carry edits)
      if (!commit.parent) continue;
      const fields: FieldChange[] = [];
      diffNodes(yamlBefore, yamlAfter, '', fileKind, fields);
      if (fields.length > 0) {
        events.push({
          kind: 'changed',
          date: commit.utcDate, timestamp: commit.isoDate,
          commitSha: commit.sha, commitSubject: commit.subject,
          subject: `Updated ${refAfter?.name ?? fc.path}`,
          href: refAfter?.href,
          fields,
        });
      }
      continue;
    }

    // Modification.
    if (!commit.parent) continue;
    const yamlBefore = getFileAt(commit.parent, fc.path);
    const yamlAfter = getFileAt(commit.sha, fc.path);
    const ref = pathToHrefAndName(fc.path, yamlAfter ?? yamlBefore ?? {});
    if (!ref) continue;
    const fields: FieldChange[] = [];
    diffNodes(yamlBefore, yamlAfter, '', fileKind, fields);
    if (fields.length === 0) continue;
    events.push({
      kind: 'changed',
      date: commit.utcDate, timestamp: commit.isoDate,
      commitSha: commit.sha, commitSubject: commit.subject,
      subject: `Updated ${ref.name}`,
      href: ref.href,
      fields,
    });
  }
}
