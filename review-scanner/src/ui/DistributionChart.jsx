import { useState } from 'react';
import { useTooltip } from './Tooltip.jsx';

const ROW_HEIGHT = 30;
const BAR_HEIGHT = 18;
const PAD = { top: 8, right: 56, bottom: 24, left: 34 };
const WIDTH = 560;

const pct = (x) => `${(x * 100).toFixed(1)} %`;

/**
 * Observed rating shares as bars, with the category reference as a tick mark.
 * One data series plus a reference — the reference is chrome, not a second
 * series, so it is drawn in axis gray rather than a categorical hue.
 */
export function DistributionChart({ distribution }) {
  const [showTable, setShowTable] = useState(false);
  const { show, hide, element } = useTooltip();

  const ratings = [5, 4, 3, 2, 1];
  const max = Math.max(...ratings.map((r) => Math.max(distribution.shares[r], distribution.reference[r])), 0.1);
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const height = ratings.length * ROW_HEIGHT + PAD.top + PAD.bottom;
  const x = (share) => (share / max) * plotWidth;

  return (
    <section className="card">
      <div className="chart-head">
        <h2>Distribution des notes</h2>
        <button className="toggle" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Voir le graphique' : 'Voir les données'}
        </button>
      </div>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--series-1)' }} />
          Observé
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--text-secondary)', width: 3, height: 12 }} />
          Référence « {distribution.category} »
        </span>
      </div>

      {showTable ? (
        <table>
          <thead>
            <tr>
              <th>Note</th>
              <th className="num">Avis</th>
              <th className="num">Part</th>
              <th className="num">Référence</th>
            </tr>
          </thead>
          <tbody>
            {ratings.map((r) => (
              <tr key={r}>
                <td>{r} étoiles</td>
                <td className="num">{distribution.counts[r]}</td>
                <td className="num">{pct(distribution.shares[r])}</td>
                <td className="num">{pct(distribution.reference[r])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-scroll">
          <svg width={WIDTH} height={height} role="img" aria-label="Répartition des notes comparée à la référence de catégorie">
            {ratings.map((rating, i) => {
              const yTop = PAD.top + i * ROW_HEIGHT;
              const barWidth = Math.max(1, x(distribution.shares[rating]));
              const refX = PAD.left + x(distribution.reference[rating]);
              // Clear the reference tick as well as the bar end, or the value
              // reads as "10|3 %" whenever the two land close together.
              const labelX = Math.max(PAD.left + barWidth, refX) + 10;
              return (
                <g key={rating}>
                  <text className="axis-label" x={PAD.left - 8} y={yTop + BAR_HEIGHT - 4} textAnchor="end">
                    {rating}★
                  </text>
                  <rect
                    x={PAD.left}
                    y={yTop}
                    width={barWidth}
                    height={BAR_HEIGHT}
                    rx="4"
                    fill="var(--series-1)"
                    onMouseMove={(e) =>
                      show(e, (
                        <>
                          <strong>{rating} étoiles</strong>
                          {distribution.counts[rating]} avis · {pct(distribution.shares[rating])}
                          <div style={{ marginTop: 4, color: 'var(--text-secondary)' }}>
                            référence : {pct(distribution.reference[rating])}
                          </div>
                        </>
                      ))
                    }
                    onMouseLeave={hide}
                  />
                  {/* Reference tick. The surface-coloured under-stroke is the
                      2px ring that keeps it legible where it crosses the bar. */}
                  <line
                    x1={refX}
                    x2={refX}
                    y1={yTop - 4}
                    y2={yTop + BAR_HEIGHT + 4}
                    stroke="var(--surface-1)"
                    strokeWidth="6"
                  />
                  <line
                    x1={refX}
                    x2={refX}
                    y1={yTop - 4}
                    y2={yTop + BAR_HEIGHT + 4}
                    stroke="var(--text-secondary)"
                    strokeWidth="2"
                  />
                  <text className="value-label" x={labelX} y={yTop + BAR_HEIGHT - 4}>
                    {pct(distribution.shares[rating])}
                  </text>
                </g>
              );
            })}
            <line
              x1={PAD.left}
              x2={PAD.left}
              y1={PAD.top}
              y2={PAD.top + ratings.length * ROW_HEIGHT}
              stroke="var(--axis)"
              strokeWidth="1"
            />
          </svg>
        </div>
      )}

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 0 }}>
        Déficit des notes intermédiaires : <strong>{pct(distribution.middleDeficit)}</strong> ·
        excès de 5 étoiles : <strong>{pct(distribution.topExcess)}</strong>.{' '}
        {distribution.reliability < 1
          ? "Atténué : l'échantillon est trop petit pour que la forme de l'histogramme soit fiable."
          : "La référence est un a priori de catégorie, pas une mesure — voir la méthodologie."}
      </p>
      {element}
    </section>
  );
}
