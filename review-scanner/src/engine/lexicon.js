/**
 * French-first lexicons. The tool was built against a Paris renovation
 * business, so the trade vocabulary is FR; English entries are kept because
 * Google Maps mixes languages on any business with foreign customers.
 *
 * These lists are heuristics with real false-positive rates: plenty of honest
 * customers write "super, je recommande". A lexicon hit is worth a nudge, not
 * a verdict — see weights.js.
 */

/** Praise so generic it carries no information about an actual experience. */
export const GENERIC_PRAISE = [
  'super', 'parfait', 'excellent', 'nickel', 'top', 'impeccable', 'genial',
  'tres bien', 'tres bon', 'rien a dire', 'que du bonheur', 'au top',
  'je recommande', 'je recommande vivement', 'a recommander', 'sans hesiter',
  'tres professionnel', 'tres pro', 'tres satisfait', 'ravie', 'ravi',
  'great', 'amazing', 'perfect', 'highly recommend', 'best', 'awesome',
];

/** Commercial vocabulary typical of SEO-stuffed reviews in the trades. */
export const SERVICE_KEYWORDS = [
  'renovation', 'travaux', 'architecte', 'architecture', 'chantier',
  'appartement', 'maison', 'cuisine', 'salle de bain', 'devis', 'artisan',
  'entreprise', 'decoration', 'amenagement', 'peinture', 'plomberie',
  'electricite', 'menuiserie', 'maitre d oeuvre', 'cle en main',
];

/** Geographic tokens that indicate keyword stuffing when combined with the above. */
export const GEO_KEYWORDS = [
  'paris', 'ile de france', 'idf', 'hauts de seine', 'boulogne', 'neuilly',
  'levallois', 'puteaux', '75', '92', 'arrondissement',
];

/**
 * Turns of phrase over-represented in LLM-written reviews. Weak signal, and
 * getting weaker every year as models get better — weighted accordingly.
 */
export const LLM_MARKERS = [
  'n hesitez pas', 'que demander de plus', 'a la hauteur de mes attentes',
  'du debut a la fin', 'tout au long du processus', 'une equipe a l ecoute',
  'un travail soigne', 'je suis pleinement satisfait', 'sans aucune reserve',
  'je tiens a souligner', 'force est de constater', 'en resume',
  'from start to finish', 'exceeded my expectations', 'attention to detail',
  'i cannot recommend', 'truly exceptional',
];

/** Superlatives whose density flags overwrought praise. */
export const SUPERLATIVES = [
  'meilleur', 'incroyable', 'exceptionnel', 'extraordinaire', 'parfait',
  'magnifique', 'formidable', 'fantastique', 'irreprochable', 'sublime',
];
