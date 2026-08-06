import { sigmoid, mean, bootstrapMeanCI } from './stats.js';
import { WEIGHTS, DISTRIBUTION_PRIOR_WEIGHT, SIGNAL_LABELS } from './weights.js';

/** Below this many reviews the aggregate is noise and we say so instead of printing a number. */
export const MIN_REVIEWS_FOR_ESTIMATE = 30;

/**
 * Combines a review's features into a suspicion score via a logistic model.
 * Returns the score plus the per-signal contributions, so the UI can always
 * answer "why is this review flagged" with numbers rather than vibes.
 */
export function scoreReview(features, { distributionAnomaly = 0 } = {}) {
  let logit = WEIGHTS.intercept + DISTRIBUTION_PRIOR_WEIGHT * distributionAnomaly;
  const contributions = [];

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    if (key === 'intercept') continue;
    const value = features[key] || 0;
    if (value === 0) continue;
    const contribution = weight * value;
    logit += contribution;
    contributions.push({
      key,
      label: SIGNAL_LABELS[key] || key,
      value,
      contribution,
    });
  }

  contributions.sort((a, b) => b.contribution - a.contribution);
  return { score: sigmoid(logit), logit, contributions };
}

/**
 * Aggregates per-review scores into the headline figure.
 *
 * The estimate is the MEAN of the scores, i.e. the expected share of reviews
 * carrying signals — not the share above an arbitrary threshold, which would
 * throw away all the information in the middle of the distribution.
 *
 * The interval is a bootstrap over reviews: it answers "how much would this
 * number move if we had seen a different sample of the same business" and
 * nothing else. Model uncertainty (see weights.js) is larger and not
 * quantified here.
 */
export function aggregate(scores, { seed = 42 } = {}) {
  const n = scores.length;
  const estimate = mean(scores);
  const { low, high } = bootstrapMeanCI(scores, { seed });
  const flaggedCount = scores.filter((s) => s >= 0.5).length;

  return {
    estimate,
    low,
    high,
    flaggedCount,
    reviewCount: n,
    sufficientData: n >= MIN_REVIEWS_FOR_ESTIMATE,
    interpretation: interpret(estimate, n),
  };
}

function interpret(estimate, n) {
  if (n < MIN_REVIEWS_FOR_ESTIMATE) {
    return {
      level: 'unknown',
      text: `Trop peu d'avis (${n}) pour une estimation. Il en faut au moins ${MIN_REVIEWS_FOR_ESTIMATE}.`,
    };
  }
  if (estimate < 0.1) {
    return { level: 'good', text: "Aucun signal collectif notable. Profil d'avis ordinaire." };
  }
  if (estimate < 0.25) {
    return { level: 'warning', text: 'Quelques avis isolés portent des signaux. Rien de systématique.' };
  }
  if (estimate < 0.45) {
    return { level: 'serious', text: 'Une part notable des avis porte des signaux convergents.' };
  }
  return {
    level: 'critical',
    text: 'Signaux massifs et convergents sur une large part des avis.',
  };
}
