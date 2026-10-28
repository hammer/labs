/**
 * Promotion candidates: sibling checkpoints scored on the current AA
 * Intelligence Index version while the file's own anchor is not.
 *
 * The anchoring rule keeps a file's top-level score on the AA page of the
 * model the file names; other checkpoints AA scores separately (a dated
 * snapshot, an API build, a smaller sibling) live in variant notes. That is
 * fine within one index version, but during a version rollout it hides the
 * newer-version score from the home table, which ranks by version tier first
 * and only reads top-level blocks. At v5.0's launch Alibaba and Ant Group sat
 * at v4 tier (sorted below labs scoring 14 on v5) while Qwen3.8 Max 0902 (34),
 * Qwen3.8 27B (20) and Ling-3.1-flash-1019 (29) had v5 scores in notes.
 *
 * Rule (AGENTS.md): when AA scores a distinct sibling checkpoint on the
 * current version and the file's anchor is not yet, promote the sibling to
 * its own file. Mode siblings of the anchor (…-high, …-non-reasoning) are the
 * same checkpoint and are the mode audit's business, not this one's.
 */

// AA slug suffixes that name a reasoning mode or effort level rather than a
// different model. Stripping them leaves the checkpoint "root". Anything else
// in the suffix — a date (0925), a size (mini), a checkpoint name (terminus,
// preview), a version digit (5-6-sol) — means a different model.
export const MODE_TOKENS = new Set(['thinking', 'reasoning', 'non', 'adaptive', 'xhigh', 'high', 'medium', 'low', 'max', 'minimal', 'effort', 'fallback', 'default']);
export function modeRoot(slug: string): string {
  const t = slug.split('-');
  while (t.length > 1 && MODE_TOKENS.has(t[t.length - 1])) t.pop();
  return t.join('-');
}

const AA_URL = /artificialanalysis\.ai\/models\/([a-zA-Z0-9._-]+)/g;

export interface PromotionCandidate {
  file: string;
  anchor: string;
  sibling: string;
  score: number;
}

/**
 * @param files   every output file with a single intelligence_index block
 * @param scored  slug → raw score, for slugs scored on the current version
 */
export function findPromotionCandidates(
  files: Array<{ file: string; content: string }>,
  scored: Map<string, number>,
): PromotionCandidate[] {
  const anchorOf = (content: string) => content.match(/artificialanalysis\.ai\/models\/([a-zA-Z0-9._-]+)/)?.[1];
  // A slug some file already anchors on has a home; mentioning it elsewhere
  // (a parent pointing at its promoted child) is not a candidate.
  const anchored = new Set(files.map(f => anchorOf(f.content)).filter((s): s is string => !!s));
  const out: PromotionCandidate[] = [];
  for (const { file, content } of files) {
    const anchor = anchorOf(content);
    if (!anchor || scored.has(anchor)) continue;
    const seen = new Set<string>();
    for (const m of content.matchAll(AA_URL)) {
      const slug = m[1];
      if (slug === anchor || seen.has(slug)) continue;
      seen.add(slug);
      if (anchored.has(slug) || modeRoot(slug) === modeRoot(anchor)) continue;
      const score = scored.get(slug);
      if (score !== undefined) out.push({ file, anchor, sibling: slug, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
