/**
 * Small statistical helpers. No dependencies so the engine stays runnable
 * in Node (tests, CLI) and in the browser (UI) without a build step.
 */

/** Deterministic PRNG so bootstrap intervals and fixtures are reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** log(Γ(x)) via the Lanczos approximation. */
export function logGamma(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** P(X = k) for X ~ Poisson(lambda), computed in log space. */
export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - logGamma(k + 1));
}

/**
 * P(X >= k) for X ~ Poisson(lambda) — the upper tail, i.e. "how surprising is
 * it to see k or more reviews in this window if nothing unusual happened".
 */
export function poissonSurvival(k, lambda) {
  if (k <= 0) return 1;
  if (lambda <= 0) return 0;
  // Normal approximation past the point where the exact sum gets slow/unstable.
  if (lambda > 500 || k > 500) {
    const z = (k - 0.5 - lambda) / Math.sqrt(lambda);
    return 0.5 * erfc(z / Math.SQRT2);
  }
  let cdf = 0;
  for (let i = 0; i < k; i++) cdf += poissonPmf(i, lambda);
  return Math.max(0, Math.min(1, 1 - cdf));
}

/** Complementary error function (Abramowitz & Stegun 7.1.26). */
export function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
        t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
          t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
}

export function mean(values) {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Linear-interpolated quantile of an already-sorted ascending array. */
export function quantileSorted(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values) {
  return quantileSorted([...values].sort((a, b) => a - b), 0.5);
}

/**
 * Percentile bootstrap confidence interval for the mean.
 *
 * This captures sampling variance ONLY — the uncertainty from having observed
 * n reviews rather than infinitely many. It does not capture model
 * uncertainty, which is far larger here because the weights are expert priors
 * rather than fitted values. Report it as such.
 */
export function bootstrapMeanCI(values, { iterations = 2000, alpha = 0.05, seed = 42 } = {}) {
  const n = values.length;
  if (n === 0) return { low: 0, high: 0 };
  const random = mulberry32(seed);
  const means = new Array(iterations);
  for (let it = 0; it < iterations; it++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += values[(random() * n) | 0];
    means[it] = sum / n;
  }
  means.sort((a, b) => a - b);
  return {
    low: quantileSorted(means, alpha / 2),
    high: quantileSorted(means, 1 - alpha / 2),
  };
}

export function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

export function clamp(x, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, x));
}
