import { normalizeDataset, coverage } from './normalize.js';
import { detectBursts } from './features/bursts.js';
import { analyzeDistribution } from './features/distribution.js';
import { detectDuplicates } from './features/duplication.js';
import { analyzeText, languageMismatch } from './features/textQuality.js';
import { analyzeAuthors } from './features/authors.js';
import { scoreReview, aggregate } from './score.js';

export { MIN_REVIEWS_FOR_ESTIMATE } from './score.js';
export { REFERENCE_DISTRIBUTIONS } from './features/distribution.js';

/**
 * Runs the full analysis over one place's reviews.
 *
 * Every extractor is independent and side-effect free; the only thing this
 * function does is fan out, then combine. Adding a signal means adding an
 * extractor and a weight, nothing else.
 *
 * @param {object} raw dataset in the shape documented in normalize.js
 * @param {object} [options]
 * @param {string[]} [options.expectedLanguages]
 * @param {number} [options.seed] bootstrap seed, for reproducible intervals
 */
export function analyze(raw, options = {}) {
  const { place, reviews, collectedAt, source, datePrecision } = normalizeDataset(raw);
  const expectedLanguages = options.expectedLanguages || ['fr'];

  const distribution = analyzeDistribution(reviews, place.category);

  // Burst detection needs day-level resolution. Google's public UI only shows
  // relative dates ("il y a 3 mois"), so a browser-scraped corpus cannot
  // support it: running it anyway would manufacture bursts out of rounding.
  const bursts =
    datePrecision === 'approximate'
      ? {
          applicable: false,
          reason: 'approximate-dates',
          windows: [],
          timeline: [],
          intensityByReviewId: new Map(),
        }
      : detectBursts(reviews);
  const duplicates = detectDuplicates(reviews);
  const authors = analyzeAuthors(reviews);

  const scored = reviews.map((review) => {
    const text = analyzeText(review, { placeName: place.name, city: place.city });
    const authorFeatures = authors.perReview.get(review.id) || {};

    const features = {
      burstIntensity: bursts.intensityByReviewId.get(review.id) || 0,
      nearDuplicate: duplicates.scoreByReviewId.get(review.id) || 0,
      keywordStuffing: text.keywordStuffing,
      genericShort: text.genericShort,
      excessivePraise: text.excessivePraise,
      llmish: text.llmish,
      emptyText: text.emptyText,
      languageMismatch: languageMismatch(review, expectedLanguages),
      singleContribution: authorFeatures.singleContribution || 0,
      lowContribution: authorFeatures.lowContribution || 0,
      noPhoto: authorFeatures.noPhoto || 0,
      coReviewCommunity: authorFeatures.coReviewCommunity || 0,
    };

    const { score, logit, contributions } = scoreReview(features, {
      distributionAnomaly: distribution.anomaly,
    });

    return {
      id: review.id,
      rating: review.rating,
      publishedAt: review.publishedAt,
      text: review.text,
      authorName: review.author.name,
      authorReviewCount: review.author.reviewCount,
      wordCount: text.wordCount,
      score,
      logit,
      contributions,
      features,
    };
  });

  const summary = aggregate(scored.map((r) => r.score), { seed: options.seed ?? 42 });

  return {
    place,
    source,
    collectedAt,
    datePrecision,
    coverage: coverage(place, reviews),
    summary,
    distribution,
    bursts: {
      applicable: bursts.applicable,
      reason: bursts.reason,
      baselineWeekly: bursts.baselineWeekly ?? 0,
      spanDays: bursts.spanDays ?? 0,
      windowsTested: bursts.windowsTested ?? 0,
      windows: bursts.windows,
      timeline: bursts.timeline,
    },
    duplication: {
      clusters: duplicates.clusters,
      topPairs: duplicates.pairs.slice(0, 20),
      comparedCount: duplicates.comparedCount,
    },
    authorData: {
      coReviewGraphAvailable: authors.coReviewGraphAvailable,
      profilesResolved: authors.profilesResolved,
      total: reviews.length,
    },
    reviews: scored.sort((a, b) => b.score - a.score),
  };
}
