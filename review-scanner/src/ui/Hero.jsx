const pct = (x) => `${(x * 100).toFixed(1)} %`;

/**
 * The headline figure. Deliberately worded as "reviews carrying signals",
 * never "fake reviews" — the tool measures signals, and the difference is
 * both scientific and legal.
 */
export function Hero({ report }) {
  const { summary, coverage, place } = report;
  const level = summary.interpretation.level;

  return (
    <section className="card">
      <div className="hero">
        <div>
          <div className="hero-figure">
            {summary.sufficientData ? pct(summary.estimate) : '—'}
          </div>
          <div className="hero-range">
            {summary.sufficientData
              ? `intervalle ${pct(summary.low)} – ${pct(summary.high)}`
              : `${summary.reviewCount} avis analysés`}
          </div>
        </div>

        <div className="hero-meta">
          <div className="verdict">
            <span className={`verdict-dot verdict-${level}`} aria-hidden="true" />
            <span>{summary.interpretation.text}</span>
          </div>

          <div className="stat-row">
            <div className="stat">
              <div className="stat-label">Avis analysés</div>
              <div className="stat-value">{summary.reviewCount}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Au-dessus de 0,5</div>
              <div className="stat-value">{summary.flaggedCount}</div>
            </div>
            {coverage.ratio !== null && (
              <div className="stat">
                <div className="stat-label">Couverture</div>
                <div className="stat-value">{pct(coverage.ratio)}</div>
              </div>
            )}
            {place.rating !== null && (
              <div className="stat">
                <div className="stat-label">Note affichée</div>
                <div className="stat-value">{place.rating}</div>
              </div>
            )}
          </div>

          <p className="caveat">
            Ce chiffre est la part des avis <strong>portant des signaux d'inauthenticité</strong>,
            pas une part d'avis prouvés faux. Les poids du modèle sont des a priori d'expert,
            non calibrés sur des données étiquetées : le <em>classement</em> des avis est
            informatif, la valeur absolue est un indice.
            {coverage.ratio !== null && coverage.ratio < 0.8 && (
              <> Seuls {coverage.held} avis sur {coverage.total} ont été collectés — l'échantillon
              n'est pas forcément représentatif.</>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
