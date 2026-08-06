/**
 * Generates the two synthetic fixtures used by the tests and the UI demo.
 *
 * THESE ARE SYNTHETIC. They are modelled on the shape of a Paris renovation
 * business's review corpus because that is the category the tool was built
 * for, but no real business's reviews are reproduced here, and no real
 * business is being characterised by them. They exist to exercise the
 * extractors: one corpus with nothing wrong, one with three bought packs.
 *
 * Run: node scripts/generate-fixtures.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../src/engine/stats.js';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'fixtures');
mkdirSync(outDir, { recursive: true });

const FIRST = ['Camille', 'Julien', 'Sophie', 'Marc', 'Léa', 'Thomas', 'Inès', 'Nicolas',
  'Claire', 'Antoine', 'Émilie', 'Paul', 'Chloé', 'Maxime', 'Sarah', 'Vincent',
  'Manon', 'Olivier', 'Alice', 'Damien', 'Nadia', 'Pierre', 'Hélène', 'Karim'];
const LAST = ['D.', 'M.', 'Lefèvre', 'B.', 'Moreau', 'Girard', 'L.', 'Petit',
  'Roussel', 'C.', 'Fontaine', 'Bertrand', 'N.', 'Marchand', 'Dubois'];

/**
 * Real reviews are combinatorially varied: everyone describes a different
 * flat, a different trade, a different annoyance. The organic corpus is
 * therefore ASSEMBLED from clause pools rather than picked from a list of
 * canned paragraphs — otherwise the fixture would hand the duplication
 * detector artificial near-duplicates and the "clean" baseline would be
 * meaningless.
 */
const OPENINGS = [
  'Rénovation complète de notre {surface} m² dans le {arr}e',
  'Nous avons confié la réfection de {piece} à cette équipe',
  'Projet de {duree} mois sur un appartement du {arr}e',
  'Refonte de {piece} après achat, dans le {arr}e',
  'Chantier de {duree} mois pour un {surface} m² à rénover entièrement',
  'Nous cherchions un interlocuteur unique pour {piece}',
];
const GOOD_POINTS = [
  'les plans 3D nous ont vraiment aidés à trancher sur les volumes',
  'le conducteur de travaux répondait dans la journée',
  'le budget a été tenu à {pct}% près, ce qui est rare',
  'la {corps} a été impeccable, rien à redire',
  'le chantier était nettoyé tous les soirs, les voisins ont apprécié',
  'les réserves ont été levées en une semaine',
  'le devis détaillait chaque poste, sans zone grise',
  'la coordination entre les corps de métier était réelle',
];
const CAVEATS = [
  "il a fallu relancer deux fois pour les finitions de {corps}",
  'la livraison du plan de travail a décalé la fin de {duree} semaines',
  "quelques suppléments non anticipés sur l'électricité",
  'la communication est perfectible en milieu de chantier',
  'le planning initial était optimiste de {duree} semaines',
  'la {corps} a dû être reprise une fois',
];
const CLOSINGS = [
  'Globalement satisfaits.',
  'Nous referions appel à eux.',
  'Bon rapport qualité-prix pour Paris.',
  'À voir dans la durée mais bon bilan.',
  'Prestation conforme à ce qui était vendu.',
];
const PIECES = ['la cuisine', 'la salle de bain', 'le séjour', "l'entrée et le couloir", 'deux chambres'];
const CORPS = ['peinture', 'menuiserie', 'plomberie', 'électricité', 'pose du carrelage'];

/** The unhappy tail: short, specific, never templated. */
const ORGANIC_MIXED = [
  "Le résultat est là mais le chantier a pris deux mois de retard sans explication claire. Communication à améliorer.",
  "Travail de qualité sur la partie menuiserie, beaucoup moins sur la peinture qu'il a fallu reprendre. Le SAV a fini par intervenir.",
  "Devis compétitif mais plusieurs suppléments en cours de route qu'on n'avait pas anticipés. Lisez bien les postes exclus.",
  "Correct sans plus. L'équipe est sympathique, le suivi administratif est perfectible.",
];

const ORGANIC_NEGATIVE = [
  "Trois mois de retard, des finitions à reprendre, et un solde réclamé avant la levée des réserves. Je ne recommande pas en l'état.",
  "Beaucoup de promesses à la signature, beaucoup moins de réactivité une fois l'acompte versé. Dossier toujours en cours de résolution.",
  "Le chantier a été abandonné trois semaines sans prévenir. Il a fallu passer par un courrier recommandé pour obtenir une reprise.",
];

/** Template-generated, interchangeable, keyword-loaded — what a pack looks like. */
const PACK_TEMPLATES = [
  "Super entreprise de rénovation à Paris ! Travaux impeccables, équipe très professionnelle. Je recommande vivement !",
  "Excellente agence d'architecture, rénovation appartement Paris parfaite. Très professionnel, je recommande !",
  "Super rénovation de mon appartement à Paris, travaux au top et équipe très pro. Je recommande vivement cette entreprise !",
  "Parfait du début à la fin, une équipe à l'écoute et un travail soigné. Que demander de plus ? Je recommande !",
  "Très professionnel, travaux de rénovation impeccables à Paris. Rien à dire, je recommande vivement !",
  "Nickel ! Rénovation appartement Paris réussie, entreprise sérieuse et très professionnelle. À recommander !",
];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function isoAt(ms) {
  return new Date(ms).toISOString();
}

function makeAuthor(rng, i, { thin = false } = {}) {
  const name = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
  if (thin) {
    return { id: `a-thin-${i}`, name, reviewCount: 1, hasPhoto: false, isLocalGuide: false };
  }
  const reviewCount = 1 + Math.floor(rng() ** 2 * 90);
  return {
    id: `a-${i}`,
    name,
    reviewCount,
    hasPhoto: rng() > 0.35,
    isLocalGuide: reviewCount > 20 && rng() > 0.5,
  };
}

/** Draws a rating from a category-like distribution. */
function drawRating(rng) {
  const u = rng();
  if (u < 0.65) return 5;
  if (u < 0.77) return 4;
  if (u < 0.82) return 3;
  if (u < 0.86) return 2;
  return 1;
}

function fill(rng, template) {
  return template
    .replace('{surface}', String(28 + Math.floor(rng() * 90)))
    .replace('{arr}', String(1 + Math.floor(rng() * 20)))
    .replace('{duree}', String(2 + Math.floor(rng() * 7)))
    .replace('{pct}', String(1 + Math.floor(rng() * 8)))
    .replace('{piece}', pick(rng, PIECES))
    .replace(/\{corps\}/g, pick(rng, CORPS));
}

/** Assembles a unique organic review from the clause pools. */
function composeOrganic(rng, rating) {
  const opening = fill(rng, pick(rng, OPENINGS));
  const goods = shuffled(rng, GOOD_POINTS).slice(0, rating >= 4 ? 2 : 1).map((c) => fill(rng, c));
  const parts = [`${opening} : ${goods.join(', et ')}.`];
  if (rating <= 4 || rng() > 0.6) parts.push(`Bémol : ${fill(rng, pick(rng, CAVEATS))}.`);
  parts.push(pick(rng, CLOSINGS));
  return parts.join(' ');
}

function shuffled(rng, arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function organicText(rng, rating) {
  if (rating >= 3) return composeOrganic(rng, rating);
  // The unhappy tail: short, specific, and never templated.
  return rating === 2 ? pick(rng, ORGANIC_MIXED) : pick(rng, ORGANIC_NEGATIVE);
}

function buildClean() {
  const rng = mulberry32(7);
  const start = Date.parse('2023-01-10T09:00:00Z');
  const reviews = [];
  let cursor = start;
  for (let i = 0; i < 82; i++) {
    // Exponential inter-arrival ~ every 13 days.
    cursor += Math.max(1, Math.round(-Math.log(1 - rng()) * 13 * 86400000));
    const rating = drawRating(rng);
    reviews.push({
      id: `clean-${i}`,
      rating,
      text: rng() > 0.12 ? organicText(rng, rating) : '',
      publishedAt: isoAt(cursor),
      language: 'fr',
      author: makeAuthor(rng, i),
    });
  }
  return {
    source: 'synthetic',
    collectedAt: isoAt(Date.parse('2026-08-01T00:00:00Z')),
    place: {
      id: 'synthetic-clean',
      name: 'Atelier Rénovation Nord (fictif)',
      category: 'renovation',
      city: 'Paris',
      rating: 4.3,
      reviewCount: reviews.length,
    },
    reviews,
  };
}

function buildContaminated() {
  const rng = mulberry32(19);
  const start = Date.parse('2023-02-02T09:00:00Z');
  const reviews = [];
  let cursor = start;

  // Organic backbone.
  for (let i = 0; i < 58; i++) {
    cursor += Math.max(1, Math.round(-Math.log(1 - rng()) * 15 * 86400000));
    const rating = drawRating(rng);
    reviews.push({
      id: `org-${i}`,
      rating,
      text: rng() > 0.15 ? organicText(rng, rating) : '',
      publishedAt: isoAt(cursor),
      language: 'fr',
      author: makeAuthor(rng, i),
    });
  }

  // Three bought packs. Same shared pool of "other places reviewed", which is
  // what makes the co-review graph light up.
  const farmPlaces = ['p-farm-1', 'p-farm-2', 'p-farm-3', 'p-farm-4', 'p-farm-5', 'p-farm-6'];
  const packDates = ['2024-03-11', '2025-01-20', '2026-05-04'];
  packDates.forEach((day, packIndex) => {
    const base = Date.parse(`${day}T08:00:00Z`);
    for (let j = 0; j < 13; j++) {
      const author = makeAuthor(rng, `${packIndex}-${j}`, { thin: true });
      author.alsoReviewed = farmPlaces.filter(() => rng() > 0.25);
      reviews.push({
        id: `pack-${packIndex}-${j}`,
        rating: 5,
        // Packs reuse a small template pool with light shuffling.
        text: pick(rng, PACK_TEMPLATES),
        publishedAt: isoAt(base + Math.floor(rng() * 4 * 86400000) + j * 3600000),
        language: 'fr',
        author,
      });
    }
  });

  reviews.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  return {
    source: 'synthetic',
    collectedAt: isoAt(Date.parse('2026-08-01T00:00:00Z')),
    place: {
      id: 'synthetic-contaminated',
      name: 'Rénovation Prestige Capitale (fictif)',
      category: 'renovation',
      city: 'Paris',
      rating: 4.8,
      reviewCount: reviews.length,
    },
    reviews,
  };
}

const clean = buildClean();
const contaminated = buildContaminated();
writeFileSync(join(outDir, 'clean.json'), JSON.stringify(clean, null, 2) + '\n');
writeFileSync(join(outDir, 'contaminated.json'), JSON.stringify(contaminated, null, 2) + '\n');
console.log(`clean.json         ${clean.reviews.length} reviews`);
console.log(`contaminated.json  ${contaminated.reviews.length} reviews`);
