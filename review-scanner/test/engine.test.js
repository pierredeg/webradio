import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { poissonSurvival, sigmoid, bootstrapMeanCI, median } from '../src/engine/stats.js';
import { normalizeText, shingles, jaccard } from '../src/engine/text.js';
import { detectBursts } from '../src/engine/features/bursts.js';
import { analyzeDistribution } from '../src/engine/features/distribution.js';
import { detectDuplicates } from '../src/engine/features/duplication.js';
import { analyzeText } from '../src/engine/features/textQuality.js';
import { analyzeAuthors } from '../src/engine/features/authors.js';
import { scoreReview } from '../src/engine/score.js';
import { normalizeDataset } from '../src/engine/normalize.js';
import { analyze } from '../src/engine/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(join(here, '..', 'src', 'fixtures', name), 'utf8'));

const DAY = 86400000;
function synth(count, { start = Date.parse('2024-01-01T00:00:00Z'), everyDays = 10, rating = 5, prefix = 'r' } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    rating,
    text: '',
    publishedAt: new Date(start + i * everyDays * DAY).toISOString(),
    author: { id: `a-${i}` },
  }));
}

// ---------------------------------------------------------------- stats ----

test('poissonSurvival is a valid upper tail', () => {
  assert.equal(poissonSurvival(0, 3), 1);
  assert.ok(poissonSurvival(3, 3) > poissonSurvival(10, 3));
  assert.ok(poissonSurvival(20, 1) < 1e-12);
  // Against a known value: P(X >= 1 | lambda=1) = 1 - e^-1
  assert.ok(Math.abs(poissonSurvival(1, 1) - (1 - Math.exp(-1))) < 1e-12);
});

test('sigmoid and median behave', () => {
  assert.equal(sigmoid(0), 0.5);
  assert.equal(median([3, 1, 2]), 2);
});

test('bootstrap CI is deterministic and brackets the mean', () => {
  const values = Array.from({ length: 100 }, (_, i) => i / 100);
  const a = bootstrapMeanCI(values, { seed: 1 });
  const b = bootstrapMeanCI(values, { seed: 1 });
  assert.deepEqual(a, b);
  assert.ok(a.low < 0.495 && a.high > 0.495);
});

// ----------------------------------------------------------------- text ----

test('normalizeText strips accents, case and punctuation', () => {
  assert.equal(normalizeText('Très Bien !! Génial...'), 'tres bien genial');
});

test('shingles and jaccard measure overlap', () => {
  const a = new Set(shingles('le chantier a ete propre et rapide du debut a la fin'));
  const b = new Set(shingles('le chantier a ete propre et rapide du debut a la fin'));
  assert.equal(jaccard(a, b), 1);
  const c = new Set(shingles('rien a voir avec le texte precedent absolument aucun rapport ici'));
  assert.ok(jaccard(a, c) < 0.1);
});

// --------------------------------------------------------------- bursts ----

test('regular arrivals produce no burst', () => {
  const result = detectBursts(synth(40, { everyDays: 9 }));
  assert.equal(result.applicable, true);
  assert.equal(result.windows.length, 0);
});

test('an injected pack is detected with the right dates', () => {
  const background = synth(30, { everyDays: 12, prefix: 'bg' });
  const packDay = Date.parse('2024-06-05T00:00:00Z');
  const pack = Array.from({ length: 12 }, (_, i) => ({
    id: `pack-${i}`,
    rating: 5,
    text: '',
    publishedAt: new Date(packDay + i * 3600000).toISOString(),
    author: { id: `pa-${i}` },
  }));
  const result = detectBursts([...background, ...pack]);
  assert.equal(result.windows.length, 1);
  const [w] = result.windows;
  assert.ok(w.count >= 12);
  assert.equal(w.dominantRating, 5);
  assert.ok(w.homogeneity > 0.9);
  assert.ok(w.startDate <= '2024-06-05' && w.endDate >= '2024-06-05');
  for (const r of pack) assert.ok(result.intensityByReviewId.get(r.id) > 0);
});

test('the baseline never collapses to zero on a sparse corpus', () => {
  // Sparse: 20 reviews over ~2 years. Most days are empty; a naive robust
  // estimator would return 0 and make every window infinitely significant.
  const result = detectBursts(synth(20, { everyDays: 35 }));
  assert.ok(result.baselineWeekly > 0);
  assert.equal(result.windows.length, 0);
});

test('too little history is reported rather than guessed at', () => {
  const result = detectBursts(synth(6, { everyDays: 1 }));
  assert.equal(result.applicable, false);
  assert.equal(result.reason, 'insufficient-history');
});

// --------------------------------------------------------- distribution ----

test('a distribution matching the reference has no anomaly', () => {
  const reviews = [];
  const ref = { 1: 14, 2: 4, 3: 5, 4: 12, 5: 65 };
  let id = 0;
  for (const [rating, count] of Object.entries(ref)) {
    for (let i = 0; i < count; i++) {
      reviews.push({ id: `d-${id++}`, rating: Number(rating), text: '', publishedAt: '2024-01-01T00:00:00Z', author: {} });
    }
  }
  const result = analyzeDistribution(reviews, 'renovation');
  assert.ok(result.anomaly < 0.02);
  assert.ok(result.tvDistance < 0.02);
});

test('an all-5-star corpus shows a middle deficit', () => {
  const reviews = synth(60, { rating: 5 });
  const result = analyzeDistribution(reviews, 'renovation');
  assert.equal(result.middleDeficit, 1);
  assert.ok(result.anomaly > 0.6);
});

test('a small corpus damps the anomaly rather than overclaiming', () => {
  const big = analyzeDistribution(synth(60, { rating: 5 }), 'renovation');
  const small = analyzeDistribution(synth(6, { rating: 5 }), 'renovation');
  assert.ok(small.anomaly < big.anomaly);
  assert.equal(small.reliability, 0.2);
});

// ---------------------------------------------------------- duplication ----

const LONG_A = 'Travaux de renovation parfaitement executes par une equipe serieuse et tres professionnelle du debut a la fin';
const LONG_B = 'Travaux de renovation parfaitement executes par une equipe serieuse et tres professionnelle du debut jusqu a la fin';

test('near-identical long texts cluster together', () => {
  const reviews = [
    { id: 'x', rating: 5, text: LONG_A, publishedAt: '2024-01-01T00:00:00Z', author: {} },
    { id: 'y', rating: 5, text: LONG_B, publishedAt: '2024-02-01T00:00:00Z', author: {} },
  ];
  const result = detectDuplicates(reviews);
  assert.equal(result.clusters.length, 1);
  assert.ok(result.scoreByReviewId.get('x') > 0);
  assert.ok(result.scoreByReviewId.get('y') > 0);
});

test('short generic praise is not treated as duplication', () => {
  const reviews = ['a', 'b', 'c', 'd'].map((id) => ({
    id, rating: 5, text: 'Super, je recommande !', publishedAt: '2024-01-01T00:00:00Z', author: {},
  }));
  const result = detectDuplicates(reviews);
  assert.equal(result.comparedCount, 0);
  assert.equal(result.clusters.length, 0);
});

test('unrelated long texts do not cluster', () => {
  const reviews = [
    { id: 'x', rating: 5, text: LONG_A, publishedAt: '2024-01-01T00:00:00Z', author: {} },
    { id: 'y', rating: 1, text: 'Le chantier a ete abandonne pendant trois semaines sans aucune explication de leur part', publishedAt: '2024-02-01T00:00:00Z', author: {} },
  ];
  assert.equal(detectDuplicates(reviews).clusters.length, 0);
});

// ---------------------------------------------------------- text quality ----

test('keyword stuffing fires on an SEO-shaped review, not on a real one', () => {
  const stuffed = analyzeText(
    { text: 'Super renovation appartement Paris, travaux au top, entreprise de renovation Paris a recommander !' },
    { placeName: 'Architoi', city: 'Paris' }
  );
  const organic = analyzeText(
    { text: "Chantier de quatre mois sur notre 62 m². Deux semaines de retard sur la pose du plan de travail, annoncees a l'avance." },
    { placeName: 'Architoi', city: 'Paris' }
  );
  assert.ok(stuffed.keywordStuffing > 0.4);
  assert.ok(organic.keywordStuffing < 0.2);
});

test('generic short praise is flagged, empty text is separate', () => {
  assert.equal(analyzeText({ text: 'Super, je recommande !' }).genericShort, 1);
  assert.equal(analyzeText({ text: '' }).emptyText, 1);
  assert.equal(analyzeText({ text: '' }).genericShort, 0);
});

// -------------------------------------------------------------- authors ----

test('accounts sharing several places light up the co-review signal', () => {
  const shared = ['p1', 'p2', 'p3', 'p4'];
  const reviews = [
    { id: 'r1', rating: 5, text: '', publishedAt: '2024-01-01T00:00:00Z', author: { id: 'a', reviewCount: 1, alsoReviewed: shared } },
    { id: 'r2', rating: 5, text: '', publishedAt: '2024-01-02T00:00:00Z', author: { id: 'b', reviewCount: 1, alsoReviewed: shared } },
    { id: 'r3', rating: 4, text: '', publishedAt: '2024-01-03T00:00:00Z', author: { id: 'c', reviewCount: 30, alsoReviewed: ['z1', 'z2'] } },
  ];
  const { perReview } = analyzeAuthors(reviews);
  assert.ok(perReview.get('r1').coReviewCommunity > 0);
  assert.equal(perReview.get('r3').coReviewCommunity, 0);
  assert.equal(perReview.get('r1').singleContribution, 1);
  assert.equal(perReview.get('r3').singleContribution, 0);
});

test('missing author data contributes nothing either way', () => {
  const reviews = [{ id: 'r1', rating: 5, text: '', publishedAt: '2024-01-01T00:00:00Z', author: { id: 'a' } }];
  const f = analyzeAuthors(reviews).perReview.get('r1');
  assert.equal(f.singleContribution, 0);
  assert.equal(f.lowContribution, 0);
  assert.equal(f.noPhoto, 0);
  assert.equal(f.authorDataAvailable, false);
});

// ---------------------------------------------------------------- score ----

test('contributions explain the logit exactly', () => {
  const features = { burstIntensity: 0.8, singleContribution: 1, keywordStuffing: 0.5 };
  const { logit, contributions } = scoreReview(features, { distributionAnomaly: 0.3 });
  const sum = contributions.reduce((s, c) => s + c.contribution, 0);
  assert.ok(Math.abs(logit - (-3.6 + 1.0 * 0.3 + sum)) < 1e-9);
  assert.equal(contributions[0].key, 'burstIntensity');
});

test('a featureless review scores near the base rate', () => {
  const { score } = scoreReview({});
  assert.ok(score < 0.03);
});

// ------------------------------------------------------------ normalize ----

test('malformed datasets are rejected loudly', () => {
  assert.throws(() => normalizeDataset({ reviews: [{ id: 'a', rating: 9, publishedAt: '2024-01-01' }] }), /rating/);
  assert.throws(() => normalizeDataset({ reviews: [{ id: 'a', rating: 5, publishedAt: 'nope' }] }), /publishedAt/);
  assert.throws(() => normalizeDataset({ reviews: [{ rating: 5, publishedAt: '2024-01-01' }] }), /missing "id"/);
  assert.throws(
    () => normalizeDataset({ reviews: [
      { id: 'a', rating: 5, publishedAt: '2024-01-01' },
      { id: 'a', rating: 4, publishedAt: '2024-01-02' },
    ] }),
    /duplicate review id/
  );
});

// ----------------------------------------------------------- end to end ----

test('the clean fixture stays quiet', () => {
  const report = analyze(load('clean.json'));
  assert.ok(report.summary.estimate < 0.15, `estimate was ${report.summary.estimate}`);
  assert.equal(report.summary.flaggedCount, 0);
  assert.equal(report.bursts.windows.length, 0);
  assert.ok(report.distribution.anomaly < 0.05);
});

test('the contaminated fixture recovers the planted packs and nothing else', () => {
  const report = analyze(load('contaminated.json'));
  assert.ok(report.summary.estimate > 0.35, `estimate was ${report.summary.estimate}`);
  assert.equal(report.bursts.windows.length, 3);

  // Every review scoring above 0.5 must be one of the planted pack reviews:
  // no organic review may be caught in the net.
  const flagged = report.reviews.filter((r) => r.score >= 0.5);
  assert.equal(flagged.length, 39);
  for (const r of flagged) assert.match(r.id, /^pack-/);

  // And every planted review must be caught.
  const plantedTotal = report.reviews.filter((r) => r.id.startsWith('pack-')).length;
  assert.equal(plantedTotal, 39);
});

test('reports are reproducible', () => {
  const a = analyze(load('contaminated.json'));
  const b = analyze(load('contaminated.json'));
  assert.equal(a.summary.estimate, b.summary.estimate);
  assert.deepEqual(a.summary, b.summary);
});
