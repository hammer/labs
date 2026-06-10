// Range/cell value formatting, shared by the filter runtime (dim summaries,
// chips), page frontmatter (server-rendered table cells), and page scripts.
// Dimension config crosses the SSR→client boundary as JSON, so formats are
// tokens (types.ts FormatToken) resolved here rather than functions.

import type { FormatToken } from './types.js';

function trimNum(n: number): string {
  return String(Number(n.toFixed(2)));
}

export function formatValue(token: FormatToken | undefined, n: number): string {
  switch (token) {
    case 'paramsB':
      if (n >= 1000) return `${trimNum(n / 1000)}T`;
      if (n > 0 && n < 1) return `${trimNum(n * 1000)}M`;
      return `${trimNum(n)}B`;
    case 'tokensT':
      if (n > 0 && n < 1) return `${trimNum(n * 1000)}B`;
      return `${trimNum(n)}T`;
    case 'usdB':
      return `$${trimNum(n)}B`;
    case 'score100':
      return `${Math.round(n)}/100`;
    case 'compact':
      if (n >= 1_000_000) return `${trimNum(n / 1_000_000)}M`;
      if (n >= 1_000) return `${trimNum(n / 1_000)}K`;
      return trimNum(n);
    default:
      return String(n);
  }
}
