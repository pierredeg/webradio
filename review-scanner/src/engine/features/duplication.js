import { shingles, jaccard, words } from '../text.js';

/** Texts shorter than this are excluded: "Super, je recommande" is not plagiarism. */
const MIN_WORDS = 8;
const SHINGLE_K = 4;
const SIMILARITY_THRESHOLD = 0.6;

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/**
 * Near-duplicate detection over review text.
 *
 * Review farms work from templates. Two reviews written by two real customers
 * essentially never share 60% of their 4-word shingles.
 *
 * Candidate pairs come from an inverted shingle index rather than an O(n²)
 * sweep: only reviews that share at least two shingles are compared.
 */
export function detectDuplicates(reviews, { threshold = SIMILARITY_THRESHOLD } = {}) {
  const eligible = [];
  for (const r of reviews) {
    if (words(r.text).length >= MIN_WORDS) {
      eligible.push({ id: r.id, set: new Set(shingles(r.text, SHINGLE_K)) });
    }
  }

  const index = new Map();
  eligible.forEach((item, i) => {
    for (const s of item.set) {
      if (!index.has(s)) index.set(s, []);
      index.get(s).push(i);
    }
  });

  const sharedCount = new Map();
  for (const bucket of index.values()) {
    // A shingle shared by half the corpus carries no information (boilerplate
    // like "je recommande vivement cette entreprise"); skip those buckets.
    if (bucket.length > Math.max(3, eligible.length * 0.25)) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const key = `${bucket[i]}:${bucket[j]}`;
        sharedCount.set(key, (sharedCount.get(key) || 0) + 1);
      }
    }
  }

  const uf = new UnionFind(eligible.length);
  const pairs = [];
  for (const [key, shared] of sharedCount) {
    if (shared < 2) continue;
    const [a, b] = key.split(':').map(Number);
    const similarity = jaccard(eligible[a].set, eligible[b].set);
    if (similarity >= threshold) {
      uf.union(a, b);
      pairs.push({ a: eligible[a].id, b: eligible[b].id, similarity });
    }
  }

  const clusters = new Map();
  eligible.forEach((item, i) => {
    const root = uf.find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(item.id);
  });

  const scoreByReviewId = new Map();
  const clusterList = [];
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    clusterList.push(members);
    // Two near-identical reviews is already strong; larger clusters saturate.
    const score = Math.min(1, (members.length - 1) / 3);
    for (const id of members) scoreByReviewId.set(id, score);
  }

  return {
    clusters: clusterList,
    pairs: pairs.sort((x, y) => y.similarity - x.similarity),
    scoreByReviewId,
    comparedCount: eligible.length,
  };
}
