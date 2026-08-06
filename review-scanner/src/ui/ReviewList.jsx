import { useState } from 'react';

const pct = (x) => `${(x * 100).toFixed(0)} %`;

/**
 * The evidence panel. Every percentage point in the headline must be
 * traceable to specific reviews and the specific signals that fired on them —
 * a score with no visible reasoning is an accusation, not an analysis.
 */
export function ReviewList({ reviews }) {
  const [limit, setLimit] = useState(15);
  const [onlyFlagged, setOnlyFlagged] = useState(true);

  const filtered = onlyFlagged ? reviews.filter((r) => r.score >= 0.25) : reviews;
  const shown = filtered.slice(0, limit);

  return (
    <section className="card">
      <div className="chart-head">
        <h2>Avis, du plus signalé au moins signalé</h2>
        <button className="toggle" onClick={() => setOnlyFlagged((v) => !v)}>
          {onlyFlagged ? 'Afficher tous les avis' : 'Afficher seulement les avis signalés'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Aucun avis au-dessus du seuil d'affichage.
        </p>
      ) : (
        <>
          {shown.map((review) => (
            <article className="review" key={review.id}>
              <div className="review-head">
                <span className="review-score">{pct(review.score)}</span>
                <span className="review-meta">
                  {review.rating}★ · {review.publishedAt.slice(0, 10)}
                  {review.authorReviewCount !== null
                    ? ` · compte à ${review.authorReviewCount} avis`
                    : ' · profil non résolu'}
                </span>
              </div>
              {review.text ? (
                <p className="review-text">
                  {review.text.length > 260 ? `${review.text.slice(0, 260)}…` : review.text}
                </p>
              ) : (
                <p className="review-text"><em>Note sans texte</em></p>
              )}
              <div className="chips">
                {review.contributions.map((c) => (
                  <span className="chip" key={c.key}>
                    {c.label} <span className="chip-weight">+{c.contribution.toFixed(2)}</span>
                  </span>
                ))}
              </div>
            </article>
          ))}

          {shown.length < filtered.length && (
            <button className="toggle" style={{ marginTop: 14 }} onClick={() => setLimit((v) => v + 25)}>
              Afficher 25 de plus ({filtered.length - shown.length} restants)
            </button>
          )}
        </>
      )}
    </section>
  );
}
