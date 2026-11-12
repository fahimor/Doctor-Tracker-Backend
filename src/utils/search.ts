/**
 * Prefix search on a multikey index
 * ---------------------------------
 * A case-insensitive "contains" regex (/john/i) cannot use an index, so MongoDB
 * has to scan every document. Instead, each document stores `searchTokens`:
 * the lower-cased words of its searchable fields. A query term becomes an
 * anchored, case-sensitive regex (/^joh/), which MongoDB turns into a tight
 * index range scan on the `{ searchTokens: 1 }` multikey index.
 *
 * "dr rahim card" -> { searchTokens: { $all: [/^dr/, /^rahim/, /^card/] } }
 * i.e. every typed word must be the start of some word in the document.
 */

const SPLIT = /[^\p{L}\p{N}]+/u;
const MAX_TERMS = 6;

export function tokenize(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .normalize('NFKC')
    .split(SPLIT)
    .filter(Boolean);
}

/** Build the de-duplicated token list stored on a document. */
export function buildSearchTokens(...values: Array<string | null | undefined>): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const token of tokenize(value)) {
      tokens.add(token);
      // Bangladeshi numbers: "+8801712..." should also match "01712..."
      if (/^880\d{8,}$/.test(token)) tokens.add(token.slice(2));
    }
  }
  return [...tokens];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Turn free text into an index-friendly MongoDB filter (or `{}` when empty). */
export function buildSearchFilter(query: string | undefined): Record<string, unknown> {
  const terms = [...new Set(tokenize(query))].slice(0, MAX_TERMS);
  if (terms.length === 0) return {};
  // Longest term first: the planner uses the first $all element for index bounds,
  // and a longer prefix is more selective.
  terms.sort((a, b) => b.length - a.length);
  return { searchTokens: { $all: terms.map((t) => new RegExp(`^${escapeRegex(t)}`)) } };
}
