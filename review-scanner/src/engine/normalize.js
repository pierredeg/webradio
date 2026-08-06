/**
 * The canonical shapes every source adapter must produce.
 *
 * @typedef {Object} Author
 * @property {string} id            stable id, or a hash of the display name
 * @property {string} name          display name (personal data — see README)
 * @property {number|null} reviewCount  total contributions, null if unknown
 * @property {boolean|null} hasPhoto
 * @property {boolean|null} isLocalGuide
 * @property {string[]} [alsoReviewed]  other place ids, only if profiles were crawled
 *
 * @typedef {Object} Review
 * @property {string} id
 * @property {number} rating        1..5
 * @property {string} text          may be empty
 * @property {string} publishedAt   ISO 8601
 * @property {Author} author
 * @property {boolean} [hasOwnerResponse]
 * @property {number} [photoCount]
 * @property {string} [language]    BCP-47, null if the source does not report it
 *
 * @typedef {Object} Place
 * @property {string} id
 * @property {string} name
 * @property {string} [category]    key into REFERENCE_DISTRIBUTIONS
 * @property {string} [city]
 * @property {number} [rating]      the rating Google displays
 * @property {number} [reviewCount] the TOTAL on Google, which may exceed reviews.length
 */

const REQUIRED = ['id', 'rating', 'publishedAt'];

/**
 * Validates and fills in a raw dataset. Throws on structural problems rather
 * than silently scoring garbage — a scanner that quietly analyses malformed
 * input is worse than one that refuses.
 */
export function normalizeDataset(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('dataset must be an object');
  if (!Array.isArray(raw.reviews)) throw new Error('dataset.reviews must be an array');

  const place = {
    id: raw.place?.id || 'unknown',
    name: raw.place?.name || 'Établissement inconnu',
    category: raw.place?.category || 'default',
    city: raw.place?.city || '',
    rating: raw.place?.rating ?? null,
    reviewCount: raw.place?.reviewCount ?? null,
  };

  const seen = new Set();
  const reviews = raw.reviews.map((r, i) => {
    for (const field of REQUIRED) {
      if (r[field] === undefined || r[field] === null) {
        throw new Error(`review[${i}] is missing "${field}"`);
      }
    }
    if (seen.has(r.id)) throw new Error(`duplicate review id "${r.id}"`);
    seen.add(r.id);

    const rating = Number(r.rating);
    if (!(rating >= 1 && rating <= 5)) {
      throw new Error(`review[${i}] has rating ${r.rating}, expected 1..5`);
    }
    if (Number.isNaN(Date.parse(r.publishedAt))) {
      throw new Error(`review[${i}] has unparseable publishedAt "${r.publishedAt}"`);
    }

    const author = r.author || {};
    return {
      id: String(r.id),
      rating,
      text: r.text || '',
      publishedAt: r.publishedAt,
      language: r.language || null,
      hasOwnerResponse: r.hasOwnerResponse ?? null,
      photoCount: r.photoCount ?? null,
      author: {
        id: String(author.id || `anon-${i}`),
        name: author.name || '',
        reviewCount: author.reviewCount ?? null,
        hasPhoto: author.hasPhoto ?? null,
        isLocalGuide: author.isLocalGuide ?? null,
        alsoReviewed: Array.isArray(author.alsoReviewed) ? author.alsoReviewed : undefined,
      },
    };
  });

  // 'exact' when the source gives real timestamps, 'approximate' when dates
  // were reconstructed from Google's relative labels ("il y a 3 mois"). The
  // difference decides whether burst detection can run at all.
  const datePrecision = raw.datePrecision === 'approximate' ? 'approximate' : 'exact';

  return {
    place,
    reviews,
    datePrecision,
    collectedAt: raw.collectedAt || null,
    source: raw.source || 'unknown',
  };
}

/**
 * How much of the business's review corpus we actually hold. A scan of 5
 * reviews out of 200 says nothing about the business, and the report must
 * carry that fact rather than bury it.
 */
export function coverage(place, reviews) {
  if (!place.reviewCount) return { ratio: null, held: reviews.length, total: null };
  return {
    ratio: reviews.length / place.reviewCount,
    held: reviews.length,
    total: place.reviewCount,
  };
}
