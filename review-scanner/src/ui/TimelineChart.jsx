import { useMemo, useState } from 'react';
import { useTooltip } from './Tooltip.jsx';

const DAY = 86400000;
const BAR_MAX = 24;
const GAP = 2;
const PAD = { top: 12, right: 16, bottom: 28, left: 40 };
const HEIGHT = 200;

const REASONS = {
  'insufficient-history': "Historique trop court pour une analyse temporelle : il faut au moins deux semaines d'écart entre le premier et le dernier avis.",
  'approximate-dates': "Analyse impossible : les dates sont approximatives. Google n'affiche que des dates relatives (« il y a 3 mois ») ; la détection de rafales exige des horodatages exacts, que seule une source API fournit.",
  default: "Analyse temporelle indisponible sur ce jeu de données.",
};

/** Groups the daily timeline into weekly buckets so a multi-year span stays readable. */
function toWeeks(timeline) {
  if (timeline.length === 0) return [];
  const origin = Date.parse(timeline[0].date);
  const buckets = new Map();
  for (const day of timeline) {
    const index = Math.floor((Date.parse(day.date) - origin) / (7 * DAY));
    if (!buckets.has(index)) {
      buckets.set(index, { index, count: 0, flagged: false, ratingSum: 0, rated: 0 });
    }
    const bucket = buckets.get(index);
    bucket.count += day.count;
    bucket.flagged = bucket.flagged || day.flagged;
    if (day.meanRating !== null) {
      bucket.ratingSum += day.meanRating * day.count;
      bucket.rated += day.count;
    }
  }
  const maxIndex = Math.max(...buckets.keys());
  const out = [];
  for (let i = 0; i <= maxIndex; i++) {
    const bucket = buckets.get(i) || { index: i, count: 0, flagged: false, ratingSum: 0, rated: 0 };
    out.push({
      ...bucket,
      startDate: new Date(origin + i * 7 * DAY).toISOString().slice(0, 10),
      meanRating: bucket.rated ? bucket.ratingSum / bucket.rated : null,
    });
  }
  return out;
}

function niceTicks(max) {
  if (max <= 4) return [0, Math.max(1, max)];
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const unit = max / step > 5 ? step * 2 : max / step > 2 ? step : step / 2;
  const ticks = [];
  for (let v = 0; v <= max; v += unit) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + unit);
  return ticks;
}

export function TimelineChart({ bursts }) {
  const [showTable, setShowTable] = useState(false);
  const { show, hide, element } = useTooltip();
  const weeks = useMemo(() => toWeeks(bursts.timeline || []), [bursts.timeline]);

  if (!bursts.applicable || weeks.length === 0) {
    return (
      <section className="card">
        <h2>Rythme de publication</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: 0 }}>
          {REASONS[bursts.reason] || REASONS.default}
        </p>
      </section>
    );
  }

  // Never go below 6px: at 3px a burst week reads as a stray axis line rather
  // than a mark. Wide charts scroll inside their own container instead.
  const barWidth = Math.min(BAR_MAX, Math.max(6, Math.floor(900 / weeks.length) - GAP));
  const plotWidth = weeks.length * (barWidth + GAP);
  const width = plotWidth + PAD.left + PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const maxCount = Math.max(...weeks.map((w) => w.count), 1);
  const ticks = niceTicks(maxCount);
  const scaleMax = ticks[ticks.length - 1];
  const y = (v) => PAD.top + plotHeight - (v / scaleMax) * plotHeight;

  // Year boundaries, so a multi-year span is readable without labelling every week.
  const yearMarks = [];
  let lastYear = null;
  weeks.forEach((w, i) => {
    const year = w.startDate.slice(0, 4);
    if (year !== lastYear) {
      yearMarks.push({ x: PAD.left + i * (barWidth + GAP), label: year });
      lastYear = year;
    }
  });

  return (
    <section className="card">
      <div className="chart-head">
        <h2>Rythme de publication (par semaine)</h2>
        <button className="toggle" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Voir le graphique' : 'Voir les données'}
        </button>
      </div>

      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--series-1)' }} />
          Avis publiés
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--status-critical)' }} />
          Fenêtre de rafale détectée
        </span>
      </div>

      {showTable ? (
        <div className="chart-scroll">
          <table>
            <thead>
              <tr>
                <th>Semaine du</th>
                <th className="num">Avis</th>
                <th className="num">Note moyenne</th>
                <th>Rafale</th>
              </tr>
            </thead>
            <tbody>
              {weeks.filter((w) => w.count > 0).map((w) => (
                <tr key={w.index}>
                  <td>{w.startDate}</td>
                  <td className="num">{w.count}</td>
                  <td className="num">{w.meanRating ? w.meanRating.toFixed(1) : '—'}</td>
                  <td>{w.flagged ? 'oui' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-scroll">
          <svg width={width} height={HEIGHT} role="img" aria-label="Nombre d'avis publiés par semaine">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth="1" />
                <text className="axis-label" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{t}</text>
              </g>
            ))}

            {yearMarks.map((m) => (
              <text key={m.label} className="axis-label" x={m.x} y={HEIGHT - 8}>{m.label}</text>
            ))}

            {weeks.map((w, i) => {
              if (w.count === 0) return null;
              const height = Math.max(2, (w.count / scaleMax) * plotHeight);
              const x = PAD.left + i * (barWidth + GAP);
              return (
                <rect
                  key={w.index}
                  x={x}
                  y={PAD.top + plotHeight - height}
                  width={barWidth}
                  height={height}
                  rx={Math.min(4, barWidth / 2)}
                  fill={w.flagged ? 'var(--status-critical)' : 'var(--series-1)'}
                  onMouseMove={(e) =>
                    show(e, (
                      <>
                        <strong>Semaine du {w.startDate}</strong>
                        {w.count} avis{w.meanRating ? ` · note moyenne ${w.meanRating.toFixed(1)}` : ''}
                        {w.flagged ? <div style={{ marginTop: 4 }}>⚠ dans une fenêtre de rafale</div> : null}
                      </>
                    ))
                  }
                  onMouseLeave={hide}
                />
              );
            })}

            <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top + plotHeight} y2={PAD.top + plotHeight} stroke="var(--axis)" strokeWidth="1" />
          </svg>
        </div>
      )}

      {bursts.windows.length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 0 }}>
          Base : {bursts.baselineWeekly.toFixed(2)} avis/semaine hors rafales.{' '}
          {bursts.windows.length} fenêtre{bursts.windows.length > 1 ? 's' : ''} au-dessus du seuil,{' '}
          sur {bursts.windowsTested} testées.
        </p>
      )}
      {element}
    </section>
  );
}
