/**
 * Shared parser for Artificial Analysis leaderboard RSC payloads.
 *
 * The leaderboard page, fetched with the `RSC: 1` header, embeds every model
 * record in one React Server Component stream. Records are located by the
 * sentinel that opens each one; AA has changed that opener three times:
 *
 *   • pre-Sep-2026 : {"id":"<uuid>","name":"…","shortName"
 *   • 2026-09-11   : {"slug":"…","shortName"                 (id and name dropped)
 *   • 2026-09-17   : {"slug":"…","name":"…","shortName"      (name returned)
 *
 * Splitting on bare {"id":uuid,"name" also matches nested creator objects and
 * misattributes slugs to neighbouring records, so every accepted shape must
 * run through to "shortName", which creator objects lack. When the sync
 * reports "Parsed only N scored records", inspect the bytes before the first
 * "intelligenceIndex" in the payload, add the new opener here, and extend the
 * fixtures in tests/aa-payload-unit.ts.
 *
 * Two different failures produce a low record count, and they need opposite
 * responses — `checkAaRecordCount` tells them apart:
 *
 *   • sentinel drift : the count collapses to ~0–1. Fix the opener above.
 *   • payload shrink : AA prunes the leaderboard. On 2026-10-24 it went from
 *     ~500 records to 286 (274 scored, 266 unique slugs) with no index
 *     version change, every record still matching the sentinel, and the old
 *     300 floor refused to run. Nothing is broken: lower AA_MIN_SCORED_RECORDS
 *     to sit below the new size with headroom, and date the change here.
 *
 * Shrinks also mean a slug missing from the payload is even weaker evidence
 * of "unscored" than before — check the model page or /articles/.
 */

export const AA_RECORD_SENTINEL =
  /(?=\{"slug":"[^"]+",(?:"name":"[^"]*",)?"shortName"|\{"id":"[0-9a-f-]{36}","name":"[^"]*","shortName")/;

/** Split an RSC payload into per-record spans (the first span is the preamble). */
export function splitAaRecords(body: string): string[] {
  return body.split(AA_RECORD_SENTINEL);
}

/** slug → intelligenceIndex for every scored record; first occurrence wins. */
export function parseAaScores(body: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of splitAaRecords(body)) {
    const slug = r.match(/"slug":"([^"]+)"/)?.[1];
    const ii = r.match(/"intelligenceIndex":([\d.]+)/)?.[1];
    if (slug && ii && !map.has(slug)) map.set(slug, parseFloat(ii));
  }
  return map;
}

/**
 * Floor below which the scripts refuse to write. Sits under the current
 * payload size (266 unique scored slugs on 2026-10-24) and far above the ~1
 * that a sentinel drift produces. History: 300 (Sep 2026, ~500-record
 * payload) → 250 (2026-10-24 shrink).
 */
export const AA_MIN_SCORED_RECORDS = 250;

/** Below this, the parser is broken (sentinel drift), not the payload small. */
export const AA_DRIFT_CEILING = 10;

/**
 * Throw with a message that names the likely cause. `what` labels the count
 * ("scored records", "name→slug pairs").
 */
export function checkAaRecordCount(n: number, what = 'scored records', floor = AA_MIN_SCORED_RECORDS): void {
  if (n >= floor) return;
  if (n < AA_DRIFT_CEILING) {
    throw new Error(
      `Parsed only ${n} ${what} — sentinel drift: AA changed the record opener. ` +
      `Inspect the bytes before the first "intelligenceIndex", add the shape to ` +
      `scripts/aa-payload.ts and a fixture to tests/aa-payload-unit.ts. Refusing to write.`,
    );
  }
  throw new Error(
    `Parsed ${n} ${what}, below the floor of ${floor} — most likely AA pruned the ` +
    `payload (it did on 2026-10-24, ~500 → 286). Confirm the methodology version is ` +
    `unchanged and that every "intelligenceIndex" in the payload was parsed; if so, ` +
    `lower the floor in scripts/aa-payload.ts and date it. Refusing to write.`,
  );
}
