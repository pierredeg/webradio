/**
 * ============================================================================
 *  THESE WEIGHTS ARE NOT CALIBRATED.
 * ============================================================================
 *
 * They are expert priors: numbers chosen so that the signals rank in the order
 * a fraud analyst would rank them, on a logit scale. They are NOT fitted to
 * labelled data, because no public labelled data exists.
 *
 * What that means concretely: the ORDERING of reviews by score is meaningful
 * (the top of the list really is more suspicious than the bottom). The
 * ABSOLUTE percentage is not a probability — it is an index. Do not present it
 * as "37% of reviews are fake". Present it as "37% of reviews carry
 * inauthenticity signals, by this method".
 *
 * To turn the index into a real probability, see docs/calibration.md — the
 * procedure uses reviews that Google itself later deletes as weak labels.
 *
 * The intercept sets the base rate: with every feature at zero a review scores
 * sigmoid(-3.6) ≈ 2.7%, i.e. "nothing here, and we are not going to pretend
 * otherwise".
 */
export const WEIGHTS = {
  intercept: -3.6,

  // --- author signals: strongest, and the most expensive to collect ---------
  coReviewCommunity: 2.9,
  singleContribution: 1.7,
  lowContribution: 0.7,
  noPhoto: 0.35,

  // --- structural signals --------------------------------------------------
  burstIntensity: 2.6,
  nearDuplicate: 2.4,

  // --- text signals: individually weak, meaningful in combination ----------
  keywordStuffing: 1.4,
  genericShort: 0.85,
  excessivePraise: 0.5,
  llmish: 0.55,
  languageMismatch: 0.45,
  emptyText: 0.25,
};

/**
 * Place-level distribution anomaly shifts the prior for every review at the
 * business, because it is evidence about the population, not the individual.
 * Kept deliberately small: a J-shaped histogram is suggestive, never probative.
 */
export const DISTRIBUTION_PRIOR_WEIGHT = 1.0;

/** Human-readable labels for the UI. */
export const SIGNAL_LABELS = {
  coReviewCommunity: 'Compte lié à un groupe coordonné',
  singleContribution: 'Compte à contribution unique',
  lowContribution: 'Compte à très peu de contributions',
  noPhoto: 'Profil sans photo',
  burstIntensity: 'Publié dans une rafale anormale',
  nearDuplicate: 'Texte quasi identique à un autre avis',
  keywordStuffing: 'Bourrage de mots-clés',
  genericShort: 'Éloge court et générique',
  excessivePraise: 'Superlatifs excessifs',
  llmish: 'Tournures typiques de texte généré',
  languageMismatch: 'Langue inattendue',
  emptyText: 'Note sans texte',
};
