/**
 * EPC-aware tie-break for ranked product lists.
 *
 * The "Compared" ranking thesis (docs/COMPAREAI-STRATEGY-BACKLOG.md, T-03) is
 * merit-first: tools are ordered by their editorial/quality `score`, and
 * earnings-per-click (EPC) influences order ONLY as a tie-break between tools
 * that sit within scoring noise of one another. EPC must never override
 * merit — that is what keeps the "no pay-for-rank" promise honest while still
 * steering equally-good options toward the links that actually pay.
 *
 * This module is pure and deterministic: no I/O, no Supabase client. EPC values
 * are fetched separately (see `getEpcByProductIds` in lib/dal/commissions.ts)
 * and are used only to reorder the list server-side — they are never returned
 * to the browser.
 */

export interface ScoredRankable {
  id: string;
  /** Editorial / quality score (0–10 "Compared Score" scale). `null` = unrated. */
  score: number | null;
}

export interface EpcTieBreakOptions {
  /**
   * Two scores no more than this far apart are treated as "tied" and ordered by
   * EPC. On the 0–10 scale, 0.5 means half a point of scoring noise.
   */
  scoreBand?: number;
}

/** Half a point on the 0–10 Compared Score scale. */
export const DEFAULT_SCORE_BAND = 0.5;

/**
 * Re-order an already score-desc-sorted list so that, within each band of
 * near-equal scores, the higher-EPC item ranks first.
 *
 * Properties:
 * - **Merit-first across bands.** An item is never moved out of its score band,
 *   so a meaningfully lower-scored tool can never be promoted above a better one.
 * - **Stable within a band.** Items with equal EPC keep their original order.
 * - **Deterministic.** Bands are anchored on the highest score they contain
 *   (the band leader), which prevents EPC from "drifting" a low-score item
 *   upward through a chain of near-neighbours.
 *
 * @param items   Items pre-sorted by score descending (nulls last).
 * @param epcById Map of item id → EPC (e.g. best `epc_30d` across networks).
 *                Ids absent from the map are treated as EPC 0.
 * @param options `scoreBand` (default {@link DEFAULT_SCORE_BAND}).
 * @returns A new array; the input is not mutated.
 */
export function applyEpcTieBreak<T extends ScoredRankable>(
  items: readonly T[],
  epcById: ReadonlyMap<string, number>,
  options: EpcTieBreakOptions = {},
): T[] {
  const band = options.scoreBand ?? DEFAULT_SCORE_BAND;
  if (items.length < 2 || band <= 0) {
    return items.slice();
  }

  const result: T[] = [];
  let i = 0;
  while (i < items.length) {
    // Open a band anchored on its highest score. Because the list is sorted
    // score-descending, that anchor is the first item of the band.
    const anchorScore = items[i]!.score;
    let j = i + 1;
    while (j < items.length && withinBand(anchorScore, items[j]!.score, band)) {
      j++;
    }

    if (j - i === 1) {
      // Singleton band — nothing to tie-break.
      result.push(items[i]!);
    } else {
      // Stable-sort the band by EPC descending, preserving original order on ties.
      const ordered = items
        .slice(i, j)
        .map((item, idx) => ({ item, idx, epc: epcById.get(item.id) ?? 0 }))
        .sort((a, b) => b.epc - a.epc || a.idx - b.idx)
        .map((entry) => entry.item);
      result.push(...ordered);
    }
    i = j;
  }
  return result;
}

/**
 * Two scores are "within band" when both are numbers no more than `band` apart.
 * A `null` score (unrated) bands only with another `null`, so an unrated tool is
 * never EPC-promoted next to a rated one.
 */
function withinBand(a: number | null, b: number | null, band: number): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= band;
}
