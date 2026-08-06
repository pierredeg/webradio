import { poissonSurvival, clamp } from '../stats.js';

const DAY_MS = 86400000;
const WINDOW_DAYS = 7;
/** A window needs at least this many reviews before it can be flagged at all. */
const MIN_WINDOW_COUNT = 4;
const BASE_ALPHA = 0.01;

function dayIndex(iso, originMs) {
  return Math.floor((Date.parse(iso) - originMs) / DAY_MS);
}

/** Sliding windows whose count is too high to be Poisson noise at `lambdaDaily`. */
function findWindows(counts, spanDays, windowDays, lambdaDaily, threshold) {
  const expected = lambdaDaily * windowDays;
  const out = [];
  let running = 0;
  for (let i = 0; i < windowDays && i < spanDays; i++) running += counts[i];
  for (let start = 0; start + windowDays <= spanDays; start++) {
    if (start > 0) running += counts[start + windowDays - 1] - counts[start - 1];
    if (running >= MIN_WINDOW_COUNT && poissonSurvival(running, expected) < threshold) {
      out.push({ start, end: start + windowDays - 1 });
    }
  }
  return out;
}

export function toDayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Temporal burst detection.
 *
 * Reviews arrive as a roughly Poisson process. Bought review packs do not:
 * they land in a few days. We compare each sliding 7-day window against a
 * baseline rate estimated with the top decile of days removed, so a burst
 * cannot inflate the very baseline it is tested against, and correct the
 * significance threshold for the number of windows tested (Bonferroni).
 *
 * Homogeneity of rating inside a window is the second half of the signal:
 * a genuine spike (press coverage, a viral post) is rating-mixed, a bought
 * pack is almost always uniformly 5 stars.
 */
export function detectBursts(reviews, { windowDays = WINDOW_DAYS, alpha = BASE_ALPHA } = {}) {
  const dated = reviews
    .filter((r) => r.publishedAt && !Number.isNaN(Date.parse(r.publishedAt)))
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));

  const empty = {
    applicable: false,
    reason: 'insufficient-history',
    baselineDaily: 0,
    windows: [],
    timeline: [],
    intensityByReviewId: new Map(),
  };
  if (dated.length < MIN_WINDOW_COUNT) return empty;

  const originMs = Date.parse(dated[0].publishedAt);
  const lastMs = Date.parse(dated[dated.length - 1].publishedAt);
  const spanDays = Math.floor((lastMs - originMs) / DAY_MS) + 1;
  if (spanDays < windowDays * 2) return empty;

  // Daily counts across the whole span, zeros included.
  const counts = new Array(spanDays).fill(0);
  const byDay = new Map();
  for (const r of dated) {
    const d = clamp(dayIndex(r.publishedAt, originMs), 0, spanDays - 1);
    counts[d]++;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(r);
  }

  const windowCount = Math.max(1, spanDays - windowDays + 1);
  const corrected = alpha / windowCount;

  // Two-pass baseline. Naively averaging daily counts is wrong twice over: the
  // burst inflates the mean it is tested against, and on a sparse corpus
  // (most days are 0) any robust statistic collapses to 0, which would make
  // every window infinitely significant. So: estimate the rate on the whole
  // span, find candidate bursts with it, then re-estimate on the days those
  // candidates did not touch, with a floor so the baseline can never vanish.
  const naiveDaily = dated.length / spanDays;
  const candidates = findWindows(counts, spanDays, windowDays, naiveDaily, corrected);
  const candidateDays = new Set();
  for (const w of candidates) for (let d = w.start; d <= w.end; d++) candidateDays.add(d);

  let quietCount = 0;
  let quietDays = 0;
  for (let d = 0; d < spanDays; d++) {
    if (candidateDays.has(d)) continue;
    quietCount += counts[d];
    quietDays++;
  }
  const baselineDaily = Math.max(
    quietDays > 0 ? quietCount / quietDays : naiveDaily,
    naiveDaily * 0.25,
    1 / spanDays
  );

  const flagged = findWindows(counts, spanDays, windowDays, baselineDaily, corrected);

  const merged = [];
  for (const w of flagged) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end + 1) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }

  const intensityByReviewId = new Map();
  const windows = merged.map((interval) => {
    const days = interval.end - interval.start + 1;
    const inWindow = [];
    for (let d = interval.start; d <= interval.end; d++) {
      const list = byDay.get(d);
      if (list) inWindow.push(...list);
    }
    const expected = baselineDaily * days;
    const pValue = poissonSurvival(inWindow.length, expected);

    // Rating homogeneity: share of the single most frequent rating.
    const tally = new Map();
    for (const r of inWindow) tally.set(r.rating, (tally.get(r.rating) || 0) + 1);
    let dominantRating = null;
    let dominantCount = 0;
    for (const [rating, count] of tally) {
      if (count > dominantCount) {
        dominantCount = count;
        dominantRating = rating;
      }
    }
    const homogeneity = inWindow.length ? dominantCount / inWindow.length : 0;

    // Excess ratio drives the magnitude; homogeneity modulates it.
    const ratio = expected > 0 ? inWindow.length / expected : inWindow.length;
    const magnitude = clamp(Math.log2(Math.max(ratio, 1)) / 4);
    const intensity = clamp(magnitude * (0.4 + 0.6 * homogeneity));
    for (const r of inWindow) {
      intensityByReviewId.set(r.id, Math.max(intensityByReviewId.get(r.id) || 0, intensity));
    }

    return {
      startDate: toDayKey(originMs + interval.start * DAY_MS),
      endDate: toDayKey(originMs + interval.end * DAY_MS),
      days,
      count: inWindow.length,
      expected,
      ratio,
      pValue,
      dominantRating,
      homogeneity,
      intensity,
      reviewIds: inWindow.map((r) => r.id),
    };
  });

  const flaggedDays = new Set();
  for (const w of merged) for (let d = w.start; d <= w.end; d++) flaggedDays.add(d);

  const timeline = [];
  for (let d = 0; d < spanDays; d++) {
    if (counts[d] === 0 && !flaggedDays.has(d)) continue;
    const list = byDay.get(d) || [];
    timeline.push({
      date: toDayKey(originMs + d * DAY_MS),
      count: counts[d],
      flagged: flaggedDays.has(d),
      meanRating: list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : null,
    });
  }

  return {
    applicable: true,
    reason: null,
    baselineDaily,
    baselineWeekly: baselineDaily * 7,
    spanDays,
    windowsTested: windowCount,
    correctedAlpha: corrected,
    windows,
    timeline,
    intensityByReviewId,
  };
}
