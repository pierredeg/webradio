import { clamp } from '../stats.js';

/**
 * Reference rating distributions.
 *
 * These are PRIORS, not measurements. Real Google distributions are already
 * strongly J-shaped, so comparing against a uniform distribution would flag
 * every honest business on earth. Replace these with empirical baselines
 * computed over a sample of the same category and city — that is the single
 * cheapest accuracy win available to this module.
 *
 * Keys are ratings 1..5, values sum to 1.
 */
export const REFERENCE_DISTRIBUTIONS = {
  default: { 1: 0.09, 2: 0.03, 3: 0.05, 4: 0.14, 5: 0.69 },
  // Trades/renovation: high-ticket, emotionally charged, genuinely bimodal.
  // A real 1-star tail is normal here; its ABSENCE is the anomaly.
  renovation: { 1: 0.14, 2: 0.04, 3: 0.05, 4: 0.12, 5: 0.65 },
  restaurant: { 1: 0.07, 2: 0.05, 3: 0.09, 4: 0.22, 5: 0.57 },
  hotel: { 1: 0.06, 2: 0.05, 3: 0.1, 4: 0.26, 5: 0.53 },
};

export function histogram(reviews) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const rating = Math.round(r.rating);
    if (rating >= 1 && rating <= 5) counts[rating]++;
  }
  const total = reviews.length || 1;
  const shares = {};
  for (let i = 1; i <= 5; i++) shares[i] = counts[i] / total;
  return { counts, shares, total: reviews.length };
}

/**
 * Compares the observed rating distribution to a category reference.
 *
 * Two things matter and they are not the same:
 *  - `middleDeficit`: bought reviews are 5 stars, never 4. A business with no
 *    2/3/4-star reviews at all has a distribution no real customer base
 *    produces.
 *  - `topExcess`: raw over-representation of 5 stars.
 *
 * Total variation distance summarises the overall gap. The result is a
 * PLACE-level prior shift, not a per-review verdict — you cannot tell which
 * individual 5-star review is the fake one from the shape of a histogram.
 */
export function analyzeDistribution(reviews, category = 'default') {
  const reference = REFERENCE_DISTRIBUTIONS[category] || REFERENCE_DISTRIBUTIONS.default;
  const { counts, shares, total } = histogram(reviews);

  let tv = 0;
  for (let i = 1; i <= 5; i++) tv += Math.abs(shares[i] - reference[i]);
  tv /= 2;

  const observedMiddle = shares[2] + shares[3] + shares[4];
  const referenceMiddle = reference[2] + reference[3] + reference[4];
  const middleDeficit = clamp((referenceMiddle - observedMiddle) / referenceMiddle);
  const topExcess = clamp((shares[5] - reference[5]) / (1 - reference[5]));

  // Chi-square statistic against the reference (df = 4). Reported for
  // transparency; deliberately NOT converted to a p-value, because the
  // reference itself is a prior and a p-value would overstate our certainty.
  let chiSquare = 0;
  if (total > 0) {
    for (let i = 1; i <= 5; i++) {
      const expected = reference[i] * total;
      chiSquare += ((counts[i] - expected) ** 2) / expected;
    }
  }

  // Under ~30 reviews the histogram is noise; damp the anomaly accordingly.
  const reliability = clamp(total / 30);
  const anomaly = clamp((0.55 * middleDeficit + 0.45 * topExcess) * reliability);

  return {
    category,
    reference,
    shares,
    counts,
    total,
    tvDistance: tv,
    middleDeficit,
    topExcess,
    chiSquare,
    reliability,
    anomaly,
  };
}
