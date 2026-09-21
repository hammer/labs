/**
 * Pure helpers for the AAII prose sweep (see scan-aaii-mentions.ts for the CLI).
 *
 * Two lessons are encoded here:
 *   1. Mentions come in more shapes than "Intelligence Index v4.3: 34". The
 *      2026-09-21 audit found "On the Artificial Analysis Intelligence Index
 *      v4.3 it scores 34" — a number the scanner never extracted, so a
 *      rescore (34 → 31 on 2026-09-17) left the prose stale for four days.
 *   2. A number that equals an OLD score in the same file's
 *      `intelligence_index_history` is stale until proven otherwise. The
 *      live-leaderboard match used by the scanner can pass such a number by
 *      coincidence (some sibling slug happens to read the old value), so the
 *      history check runs first and its verdict is never hidden.
 */

export const PATTERNS: RegExp[] = [
  /(?:AA )?Intelligence Index(?:\s*v4\.\d+)?[:\s]*(?:<\/?strong>)?\s*(?:<strong>)?(\d{1,2})\b/g,
  /AA(?:II)? [Ii]ndex(?:\s*v4\.\d+)?[:\s]*(?:<strong>)?(\d{1,2})\b/g,
  /\(AA(?: index)?:? (\d{1,2})\)/g,
  /AA [Ii]ntelligence[:\s]+(\d{1,2})\b/g,
  /AAII[:\s]+(\d{1,2})\b/g,
  // "…Intelligence Index v4.3</strong> it scores <strong>34</strong>", "…v4.3 it stands at 19",
  // "the 20B scores 9". A verb within 90 chars of an AA anchor introduces the number.
  /(?:Artificial Analysis|Intelligence Index|AAII)[\s\S]{0,90}?\b(?:scores?|reads?|stands at|sits at|scored)\s*(?:<strong>)?(\d{1,2})\b/g,
  // "…scores 9 on AA's Intelligence Index"
  /\b(?:scores?|reads?|scored)\s*(?:<strong>)?(\d{1,2})\b(?:<\/strong>)?\s+on (?:the )?(?:AA|Artificial Analysis|Intelligence Index)/g,
  // "…on the current <strong>v4.3 it stands at 19</strong>": a version tag followed by a verb.
  /v4\.\d(?:<\/strong>)?[^.]{0,30}?\b(?:scores?|reads?|stands at|sits at)\s*(?:<strong>)?(\d{1,2})\b/g,
];

/** Anchors that name a different AA index; a number after one of these is not an AAII score. */
const OTHER_INDEX = /Speech-to-Speech|Coding Index|Openness Index|Agentic Index|Omniscience|Video|Image|Text-to-Speech|Transcription/;

export const HISTORICAL = /pre-recalibration|v3\.\d|\bv4\.[0-2](?:\.\d)?(?![\d.])|release-era|at release|at launch|debuted|era claims|until \d{4}|when v4\.\d launched/i;

export interface RawMention {
  index: number;
  n: number;
  ctx: string;
  /** the text that can legitimately era-mark THIS number (see eraWindow) */
  near: string;
}

/**
 * The stretch of text whose era markers belong to the number at `idx`: up to
 * 16 chars before and 40 after, cut at the previous/next score-like integer
 * (a 1-2 digit number not part of a version tag). Without the cut, the marker
 * for a neighbouring number leaks: in "it scores 34 (38 on v4.2; 47 on v4.1.1
 * at release)" the "v4.2" belongs to 38, and 34 must stay unmarked.
 */
export function eraWindow(text: string, idx: number): string {
  const numLen = (text.slice(idx).match(/^\d{1,2}/)?.[0] ?? '').length;
  const before = text.slice(Math.max(0, idx - 16), idx);
  const after = text.slice(idx + numLen, idx + numLen + 40);
  const scoreLike = /(?<![v\d.])\d{1,2}(?![\d.])/g;
  let b = before;
  for (const m of before.matchAll(scoreLike)) b = before.slice((m.index ?? 0) + m[0].length);
  const cut = after.search(scoreLike);
  const a = cut >= 0 ? after.slice(0, cut) : after;
  return b + text.slice(idx, idx + numLen) + a;
}

/** Every AAII score quoted in `text`, deduplicated by position. */
export function findMentions(text: string): RawMention[] {
  const out: RawMention[] = [];
  const seen = new Set<number>();
  for (const pat of PATTERNS) {
    for (const m of text.matchAll(pat)) {
      if (m.index === undefined) continue;
      // position of the captured number, so two patterns hitting one number dedupe
      const numIdx = m.index + m[0].lastIndexOf(m[1]);
      if (seen.has(numIdx)) continue;
      if (OTHER_INDEX.test(m[0])) continue;
      seen.add(numIdx);
      out.push({
        index: numIdx,
        n: parseInt(m[1], 10),
        ctx: text.slice(Math.max(0, numIdx - 110), numIdx + 80).replace(/\s+/g, ' '),
        near: eraWindow(text, numIdx),
      });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

export type MentionClass = 'structured' | 'tracked' | 'aa-current' | 'historical' | 'STALE' | 'CHECK' | 'UNRESOLVED';

export interface ClassifyInput {
  n: number;
  near: string;
  ctx: string;
  /** current structured scores in the file (top-level and sub-outputs) */
  current: number[];
  /** old scores from intelligence_index_history → the versions they carried */
  history: Map<number, string[]>;
  currentVersion: string;
  /** a tracked output named in context carries this score */
  trackedHit?: string;
  /** a live AA slug related to the file/variant, or named in context, reads this score */
  liveHit?: string;
}

/**
 * Classify one mention. Order matters: the file's own history outranks a live
 * match, because a live match can be coincidental (the blind spot documented
 * in AGENTS.md) while "equals the score we replaced" is direct evidence.
 */
export function classifyMention(i: ClassifyInput): { cls: MentionClass; note?: string } {
  if (i.current.includes(i.n)) return { cls: 'structured' };
  const oldVersions = i.history.get(i.n);
  if (oldVersions) {
    // "38 on v4.2" — an old version string right next to the number is an era marker.
    const versioned = oldVersions.some((v) => v !== i.currentVersion && i.near.includes(v.replace(/^AA /, '')));
    if (versioned || HISTORICAL.test(i.near)) return { cls: 'historical', note: `old ${oldVersions.join('/')}` };
    // Old score, no marker: stale unless a live sibling/variant genuinely reads it — and
    // even then the human decides, so it is CHECK, never silently resolved.
    if (i.liveHit || i.trackedHit) return { cls: 'CHECK', note: `equals old ${oldVersions.join('/')} score; live ${i.liveHit ?? i.trackedHit}` };
    return { cls: 'STALE', note: `equals old ${oldVersions.join('/')} score; current ${i.current.join('/')}` };
  }
  if (i.trackedHit) return { cls: 'tracked', note: i.trackedHit };
  if (i.liveHit) return { cls: 'aa-current', note: i.liveHit };
  if (HISTORICAL.test(i.near) || HISTORICAL.test(i.ctx)) return { cls: 'historical' };
  return { cls: 'UNRESOLVED' };
}

/** "23 points above K2 Think V2's 11" — a difference derived from two scores; re-check after any rescore. */
export const POINT_DIFF = /\b(\d{1,2}) points (?:above|below|ahead of|behind|clear of|higher|lower)\b/g;

/** Build the history map (old score → versions) for one model block. */
export function historyMap(blocks: Array<{ intelligence_index?: number; intelligence_index_history?: Array<{ score: number; version?: string }> }>): { current: number[]; history: Map<number, string[]> } {
  const current = blocks.filter((b) => b.intelligence_index != null).map((b) => Math.round(b.intelligence_index as number));
  const history = new Map<number, string[]>();
  for (const b of blocks) {
    for (const h of b.intelligence_index_history ?? []) {
      const s = Math.round(h.score);
      if (current.includes(s)) continue;
      const v = h.version ?? '?';
      if (!history.has(s)) history.set(s, []);
      if (!history.get(s)!.includes(v)) history.get(s)!.push(v);
    }
  }
  return { current, history };
}
