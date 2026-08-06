/** Text normalisation and shingling, shared by the duplication and text-quality extractors. */

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalizeText(input) {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(input) {
  const n = normalizeText(input);
  return n.length === 0 ? [] : n.split(' ');
}

/**
 * Word-level k-gram shingles. Texts shorter than k words yield a single
 * shingle so they still participate in exact-duplicate detection.
 */
export function shingles(input, k = 4) {
  const w = words(input);
  if (w.length === 0) return [];
  if (w.length <= k) return [w.join(' ')];
  const out = [];
  for (let i = 0; i + k <= w.length; i++) out.push(w.slice(i, i + k).join(' '));
  return out;
}

export function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const item of small) if (large.has(item)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

/** Counts how many times any of `needles` appears in the normalised text. */
export function countMatches(normalized, needles) {
  let count = 0;
  for (const needle of needles) {
    const n = normalizeText(needle);
    if (n.length === 0) continue;
    let from = 0;
    for (;;) {
      const at = normalized.indexOf(n, from);
      if (at === -1) break;
      count++;
      from = at + n.length;
    }
  }
  return count;
}
