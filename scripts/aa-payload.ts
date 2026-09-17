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
