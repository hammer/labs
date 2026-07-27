// Tag helpers shared by the API route and client UI (issue #21 step 3).
// Tags follow a `prefix:value` convention (e.g. status:reading, topic:agents),
// but the prefix is parsed on read — there is no separate prefix column.

// Normalize a raw tag before storage / the UNIQUE(user_id,target,tag) check.
// Rules: NFC + collapse whitespace + trim; reject commas (the filter serializer
// is comma-delimited); split on the FIRST colon; lowercase the prefix/facet but
// preserve value case (so `rating:A`, model names survive); cap length.
export function normalizeTag(raw: string): string | null {
  let s = (raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!s || s.includes(',')) return null;
  s = s.slice(0, 80);
  const c = s.indexOf(':');
  if (c === 0) return null; // empty prefix ':foo'
  if (c > 0) {
    const prefix = s.slice(0, c).toLowerCase().trim();
    const value = s.slice(c + 1).trim();
    if (!prefix || !value) return null;
    return `${prefix}:${value}`;
  }
  return s; // bare tag, case preserved
}

export function tagPrefix(tag: string): string | null {
  const c = tag.indexOf(':');
  return c > 0 ? tag.slice(0, c) : null;
}

export function tagValue(tag: string): string {
  const c = tag.indexOf(':');
  return c > 0 ? tag.slice(c + 1) : tag;
}

// Valid target key: 'output:<labSlug>/<slug>' or 'lab:<slug>'. Each segment
// needs at least one alphanumeric — dot-only segments ('output:../..') would
// otherwise pass and render as path-traversal-looking links on shared pages.
const SEG = '[a-z0-9._-]*[a-z0-9][a-z0-9._-]*';
const TARGET_RE = new RegExp(`^(output:${SEG}/${SEG}|lab:${SEG})$`);
export function isValidTarget(target: string): boolean {
  return TARGET_RE.test(target);
}

// Notes may also target a collection.
export function isValidNoteTarget(target: string): boolean {
  return isValidTarget(target) || /^collection:\d+$/.test(target);
}
