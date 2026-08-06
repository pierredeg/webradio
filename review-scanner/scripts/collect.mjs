#!/usr/bin/env node
/**
 * Collects a place's reviews into the canonical dataset format.
 *
 * Two sources, and the choice matters more than anything else in this project:
 *
 *   --source api      A third-party Maps API (Outscraper by default). Returns
 *                     every review with EXACT timestamps and author review
 *                     counts. Costs money. This is the recommended path: exact
 *                     dates are what make burst detection possible at all.
 *
 *   --source browser  Playwright against the public page. Free, but Google's
 *                     UI only shows RELATIVE dates ("il y a 3 mois"), so the
 *                     dataset is marked datePrecision:"approximate" and the
 *                     engine refuses to run burst detection on it. Scraping
 *                     Google Maps is contrary to Google's terms of service —
 *                     that is your call to make, not this script's.
 *
 * Usage:
 *   OUTSCRAPER_API_KEY=... node scripts/collect.mjs --source api \
 *     --query "Architoi, 173 boulevard Pereire, Paris" --limit 500 --out data/architoi.json
 *
 *   node scripts/collect.mjs --source browser \
 *     --url "https://maps.app.goo.gl/..." --out data/architoi.json
 *
 * NOTE ON VERIFICATION: the browser path could not be exercised where this was
 * written (no outbound network), and Google's DOM class names are obfuscated
 * and rotate. Expect to repair SELECTORS below on first run; they are all in
 * one object for exactly that reason.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = parseArgs(process.argv.slice(2));

if (!args.out) fail('missing --out <file.json>');
const source = args.source || 'api';

if (source === 'api') {
  const dataset = await collectViaApi(args);
  write(args.out, dataset);
} else if (source === 'browser') {
  const dataset = await collectViaBrowser(args);
  write(args.out, dataset);
} else {
  fail(`unknown --source "${source}" (expected "api" or "browser")`);
}

// ---------------------------------------------------------------- api ------

async function collectViaApi({ query, placeId, limit = 500, category = 'default', city = '' }) {
  const key = process.env.OUTSCRAPER_API_KEY;
  if (!key) fail('OUTSCRAPER_API_KEY is not set');
  const target = placeId || query;
  if (!target) fail('missing --query "<name, address>" or --place-id');

  const url = new URL('https://api.outscraper.cloud/maps/reviews-v3');
  url.searchParams.set('query', target);
  url.searchParams.set('reviewsLimit', String(limit));
  url.searchParams.set('sort', 'newest');
  url.searchParams.set('async', 'false');

  const response = await fetch(url, { headers: { 'X-API-KEY': key } });
  if (!response.ok) fail(`API returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const place = body.data?.[0];
  if (!place) fail('API returned no place');

  const reviews = (place.reviews_data || []).map((r, i) => ({
    id: r.review_id || `api-${i}`,
    rating: r.review_rating,
    text: r.review_text || '',
    // Exact UTC timestamp — the whole reason to pay for this path.
    publishedAt: new Date((r.review_datetime_utc ? Date.parse(r.review_datetime_utc) : Date.now())).toISOString(),
    language: r.review_questions?.language || null,
    hasOwnerResponse: Boolean(r.owner_answer),
    photoCount: r.review_photos?.length ?? null,
    author: {
      id: r.author_id || `author-${i}`,
      name: r.author_title || '',
      reviewCount: r.author_reviews_count ?? null,
      hasPhoto: r.author_image ? !String(r.author_image).includes('default') : null,
      isLocalGuide: r.author_local_guide_level ? true : null,
      // Populated only if you run a second pass over author profiles; without
      // it the co-review graph — the strongest signal — stays dark.
      alsoReviewed: undefined,
    },
  }));

  return {
    source: 'outscraper',
    datePrecision: 'exact',
    collectedAt: new Date().toISOString(),
    place: {
      id: place.place_id || target,
      name: place.name || target,
      category,
      city: city || place.city || '',
      rating: place.rating ?? null,
      reviewCount: place.reviews ?? reviews.length,
    },
    reviews,
  };
}

// ------------------------------------------------------------ browser ------

/**
 * Google's markup is obfuscated and rotates. Every selector lives here so a
 * break is a one-file repair rather than an archaeology session.
 */
const SELECTORS = {
  consentButton: 'button[aria-label*="Tout accepter"], button[aria-label*="Accept all"], form[action*="consent"] button',
  reviewsTab: 'button[role="tab"][aria-label*="Avis"], button[role="tab"][aria-label*="Reviews"]',
  sortButton: 'button[aria-label*="Trier"], button[aria-label*="Sort"]',
  sortNewest: 'div[role="menuitemradio"]:nth-child(2)',
  feed: 'div[role="feed"], div[aria-label*="Avis"][tabindex="-1"]',
  card: 'div[data-review-id]',
  authorName: '.d4r55',
  authorMeta: '.RfnDt',
  stars: '.kvMYJc',
  relativeDate: '.rsqaWe',
  text: '.wiI7pd',
  expandButton: 'button[aria-label*="Voir plus"], button[aria-label*="See more"]',
  placeTitle: 'h1',
  placeRating: 'div.F7nice span[aria-hidden="true"]',
  placeReviewCount: 'div.F7nice span[aria-label*="avis"], div.F7nice span[aria-label*="reviews"]',
};

async function collectViaBrowser({ url, out, category = 'default', city = 'Paris', maxScrolls = 60 }) {
  if (!url) fail('missing --url "<google maps url>"');
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    fail('playwright is not installed — run: npm i -D playwright && npx playwright install chromium');
  }

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ locale: 'fr-FR' });
  console.error(`opening ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await click(page, SELECTORS.consentButton, 3000);
  await click(page, SELECTORS.reviewsTab, 8000);
  // Sorting by newest makes the scroll deterministic and the corpus complete
  // from the top rather than from Google's "most relevant" ordering.
  if (await click(page, SELECTORS.sortButton, 5000)) {
    await click(page, SELECTORS.sortNewest, 3000);
  }
  await page.waitForSelector(SELECTORS.card, { timeout: 20000 });

  // Scroll the feed until the card count stops growing.
  let previous = 0;
  for (let i = 0; i < maxScrolls; i++) {
    await page.evaluate((sel) => {
      const feed = document.querySelector(sel);
      if (feed) feed.scrollTop = feed.scrollHeight;
    }, SELECTORS.feed);
    await page.waitForTimeout(1200);
    const count = await page.locator(SELECTORS.card).count();
    console.error(`  ${count} avis chargés`);
    if (count === previous) break;
    previous = count;
  }

  for (const button of await page.locator(SELECTORS.expandButton).all()) {
    await button.click({ timeout: 1000 }).catch(() => {});
  }

  const scraped = await page.evaluate((sel) => {
    const text = (root, s) => root.querySelector(s)?.textContent?.trim() || '';
    return [...document.querySelectorAll(sel.card)].map((card) => ({
      id: card.getAttribute('data-review-id'),
      authorName: text(card, sel.authorName),
      authorMeta: text(card, sel.authorMeta),
      starsLabel: card.querySelector(sel.stars)?.getAttribute('aria-label') || '',
      relativeDate: text(card, sel.relativeDate),
      body: text(card, sel.text),
      hasPhoto: !card.querySelector('img[src*="default_user"]'),
    }));
  }, SELECTORS);

  const placeName = await page.locator(SELECTORS.placeTitle).first().textContent().catch(() => null);
  await browser.close();

  const now = Date.now();
  const reviews = scraped
    .filter((r) => r.id)
    .map((r, i) => ({
      id: r.id,
      rating: parseStars(r.starsLabel),
      text: r.body,
      publishedAt: new Date(parseRelativeDate(r.relativeDate, now)).toISOString(),
      language: null,
      author: {
        id: `browser-${i}`,
        name: r.authorName,
        reviewCount: parseAuthorCount(r.authorMeta),
        hasPhoto: r.hasPhoto,
        isLocalGuide: /local guide/i.test(r.authorMeta) || null,
      },
    }))
    .filter((r) => r.rating >= 1 && r.rating <= 5);

  return {
    source: 'browser',
    // The load-bearing field: relative dates cannot support burst detection,
    // and the engine will refuse rather than invent windows.
    datePrecision: 'approximate',
    collectedAt: new Date().toISOString(),
    place: {
      id: url,
      name: (placeName || '').trim() || 'Établissement',
      category,
      city,
      rating: null,
      reviewCount: reviews.length,
    },
    reviews,
  };
}

async function click(page, selector, timeout) {
  try {
    await page.locator(selector).first().click({ timeout });
    await page.waitForTimeout(600);
    return true;
  } catch {
    return false;
  }
}

function parseStars(label) {
  const match = label.match(/(\d)/);
  return match ? Number(match[1]) : 0;
}

function parseAuthorCount(meta) {
  const match = meta.replace(/[\u00a0\u202f]/g, ' ').match(/(\d[\d\s]*)\s*(avis|reviews)/i);
  return match ? Number(match[1].replace(/\s/g, '')) : null;
}

const UNITS_MS = {
  seconde: 1000, second: 1000,
  minute: 60000,
  heure: 3600000, hour: 3600000,
  jour: 86400000, day: 86400000,
  semaine: 604800000, week: 604800000,
  mois: 2629800000, month: 2629800000,
  an: 31557600000, annee: 31557600000, year: 31557600000,
};

/**
 * Turns "il y a 3 mois" into a timestamp. The result is approximate BY
 * CONSTRUCTION — "3 mois" covers a 30-day window — which is exactly why the
 * dataset is flagged and burst detection is disabled downstream.
 */
export function parseRelativeDate(label, now = Date.now()) {
  const normalized = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const match = normalized.match(/(\d+)?\s*(seconde|minute|heure|jour|semaine|mois|annee|an|second|minute|hour|day|week|month|year)/);
  if (!match) return now;
  const amount = match[1] ? Number(match[1]) : 1;
  const unit = UNITS_MS[match[2]] || UNITS_MS[`${match[2]}`.replace(/s$/, '')];
  return unit ? now - amount * unit : now;
}

// --------------------------------------------------------------- utils -----

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = /^\d+$/.test(next) ? Number(next) : next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function write(file, dataset) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(dataset, null, 2) + '\n');
  console.error(`\nwrote ${file} — ${dataset.reviews.length} reviews, dates: ${dataset.datePrecision}`);
  if (dataset.datePrecision === 'approximate') {
    console.error('burst detection will be disabled on this dataset (relative dates)');
  }
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}
