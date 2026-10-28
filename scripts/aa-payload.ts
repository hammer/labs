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
 *   • version rollout : AA launches a new index version and lists most models
 *     with "intelligenceIndex":null until it re-runs them (v5.0, 2026-10-27:
 *     272 listed, 76 scored). The floor applies to listed records
 *     (listAaSlugs); a low scored count is expected and only the rescored
 *     models sync. The rest keep their old score and old version tag.
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

/**
 * Every slug the payload lists, scored or not. During a version rollout AA
 * lists models with `"intelligenceIndex":null` until it re-runs them on the
 * new suite (v5.0 launch, 2026-10-27: 272 listed, 76 scored), so the size
 * floor is checked against this count, not the scored one.
 */
export function listAaSlugs(body: string): Set<string> {
  const out = new Set<string>();
  for (const r of splitAaRecords(body)) {
    if (!/"intelligenceIndex"/.test(r)) continue;
    const slug = r.match(/"slug":"([^"]+)"/)?.[1];
    if (slug) out.add(slug);
  }
  return out;
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

/**
 * The size check both leaderboard scripts run. The floor applies to every
 * listed record (a version rollout lists models with "intelligenceIndex":null
 * until AA re-runs them); sentinel drift still shows as a near-zero scored
 * count. Returns the listed slugs and whether a rollout is in progress
 * (fewer than half the listed models scored).
 */
export function checkAaPayload(body: string, scored: Map<string, number>): { listed: Set<string>; rollout: boolean } {
  const listed = listAaSlugs(body);
  checkAaRecordCount(listed.size, 'listed records');
  if (scored.size < AA_DRIFT_CEILING) checkAaRecordCount(scored.size, 'scored records', AA_DRIFT_CEILING);
  return { listed, rollout: scored.size < listed.size / 2 };
}
