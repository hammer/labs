// Shared parsing for human-readable scale strings ("671B", "1.5T", "117M").
// Used by the data loader, page frontmatter (row data-* attributes), and
// validate.ts. Returns 0 for missing/unparseable values — 0 is the
// site-wide "missing" sentinel for numeric row attributes.

const SCALE_RE = /^~?([\d.,]+)\s*([MBT])\+?$/i;

/** Parse a scale string into billions. "671B" → 671, "1.5T" → 1500, "350M" → 0.35. */
export function parseScaleToBillions(s?: string): number {
  // Raw YAML can hand us a number (e.g. `parameters: 380`, quotes forgotten) —
  // the validator must warn on that, not crash.
  if (!s || typeof s !== 'string') return 0;
  const m = s.trim().match(SCALE_RE);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  const unit = m[2].toUpperCase();
  if (unit === 'T') return n * 1000;
  if (unit === 'M') return n / 1000;
  return n;
}

/** Parse a scale string into trillions. "15T" → 15, "560B" → 0.56. */
export function parseScaleToTrillions(s?: string): number {
  return parseScaleToBillions(s) / 1000;
}

/** True if the value is present but doesn't parse as a scale value. */
export function isUnparseableScale(s?: unknown): boolean {
  return s !== undefined && s !== null && s !== '' && parseScaleToBillions(s as string) === 0;
}
