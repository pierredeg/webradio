import { clamp } from '../stats.js';

/** Authors sharing at least this many places with another author look coordinated. */
const CO_REVIEW_OVERLAP = 3;

/**
 * Author-level signals.
 *
 * These are the strongest signals available, and the ones that cost the most
 * to collect: they require crawling each reviewer's profile, not just the
 * business page. Any field the source could not fill is `null` and
 * contributes nothing — never treat missing data as innocence OR as guilt.
 */
export function analyzeAuthors(reviews) {
  const perReview = new Map();

  // --- co-review graph -----------------------------------------------------
  // Bipartite authors × places, projected onto authors. A cluster of accounts
  // that reviewed the same unrelated businesses is the signature of a farm.
  const placesByAuthor = new Map();
  for (const r of reviews) {
    const also = r.author?.alsoReviewed;
    if (Array.isArray(also) && also.length > 0) {
      placesByAuthor.set(r.author.id, new Set(also));
    }
  }
  const authorIds = [...placesByAuthor.keys()];
  const accomplices = new Map();
  for (let i = 0; i < authorIds.length; i++) {
    for (let j = i + 1; j < authorIds.length; j++) {
      const a = placesByAuthor.get(authorIds[i]);
      const b = placesByAuthor.get(authorIds[j]);
      let overlap = 0;
      for (const p of a) if (b.has(p)) overlap++;
      if (overlap >= CO_REVIEW_OVERLAP) {
        accomplices.set(authorIds[i], (accomplices.get(authorIds[i]) || 0) + 1);
        accomplices.set(authorIds[j], (accomplices.get(authorIds[j]) || 0) + 1);
      }
    }
  }

  for (const r of reviews) {
    const a = r.author || {};
    const known = a.reviewCount !== null && a.reviewCount !== undefined;

    perReview.set(r.id, {
      singleContribution: known && a.reviewCount === 1 ? 1 : 0,
      lowContribution: known && a.reviewCount > 1 && a.reviewCount <= 3 ? 1 : 0,
      noPhoto: a.hasPhoto === false ? 1 : 0,
      coReviewCommunity: clamp((accomplices.get(a.id) || 0) / 2),
      authorDataAvailable: known,
    });
  }

  return {
    perReview,
    coReviewGraphAvailable: authorIds.length > 0,
    profilesResolved: reviews.filter(
      (r) => r.author?.reviewCount !== null && r.author?.reviewCount !== undefined
    ).length,
  };
}
