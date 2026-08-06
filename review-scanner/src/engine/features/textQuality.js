import { normalizeText, words, countMatches } from '../text.js';
import {
  GENERIC_PRAISE,
  SERVICE_KEYWORDS,
  GEO_KEYWORDS,
  LLM_MARKERS,
  SUPERLATIVES,
} from '../lexicon.js';
import { clamp } from '../stats.js';

/**
 * Per-review text signals.
 *
 * Every one of these has a real false-positive rate on honest reviews. They
 * are deliberately low-weighted individually; what carries information is
 * several of them landing on the same review, or one landing on every review
 * inside a burst window.
 */
export function analyzeText(review, { placeName = '', city = '' } = {}) {
  const raw = review.text || '';
  const normalized = normalizeText(raw);
  const w = words(raw);
  const wordCount = w.length;

  const emptyText = wordCount === 0 ? 1 : 0;

  // Short AND generic. Length alone is not suspicious — plenty of real
  // reviews are three words long.
  const praiseHits = countMatches(normalized, GENERIC_PRAISE);
  const genericShort = wordCount > 0 && wordCount <= 6 && praiseHits > 0 ? 1 : 0;

  // Keyword stuffing: the business name repeated, or trade + geo vocabulary
  // packed into a short text the way an SEO brief asks for.
  const nameHits = placeName ? countMatches(normalized, [placeName]) : 0;
  const serviceHits = countMatches(normalized, SERVICE_KEYWORDS);
  const geoHits = countMatches(normalized, [...GEO_KEYWORDS, city].filter(Boolean));
  const density = wordCount > 0 ? (serviceHits + geoHits) / wordCount : 0;
  const keywordStuffing = clamp(
    (nameHits >= 2 ? 0.5 : 0) + (serviceHits >= 2 && geoHits >= 1 ? 0.4 : 0) + clamp(density * 3) * 0.4
  );

  const superlativeHits = countMatches(normalized, SUPERLATIVES);
  const exclamations = (raw.match(/!/g) || []).length;
  const excessivePraise = clamp(
    (wordCount > 0 ? superlativeHits / Math.max(wordCount / 12, 1) : 0) * 0.5 +
      clamp(exclamations / 4) * 0.5
  );

  // Weak signal, and honest about it: fluent writing is not evidence of
  // fraud. Only fires on multiple stock phrases in a long text.
  const llmHits = countMatches(normalized, LLM_MARKERS);
  const llmish = wordCount >= 25 ? clamp(llmHits / 2) : 0;

  return {
    wordCount,
    emptyText,
    genericShort,
    keywordStuffing,
    excessivePraise,
    llmish,
    evidence: {
      praiseHits,
      nameHits,
      serviceHits,
      geoHits,
      superlativeHits,
      exclamations,
      llmHits,
    },
  };
}

/**
 * Language mismatch: a French renovation business in Paris reviewed in a
 * language no plausible local customer writes in. Only meaningful when the
 * source actually reports a language, so it returns 0 when unknown.
 */
export function languageMismatch(review, expectedLanguages = ['fr']) {
  if (!review.language) return 0;
  return expectedLanguages.includes(review.language.slice(0, 2).toLowerCase()) ? 0 : 1;
}
