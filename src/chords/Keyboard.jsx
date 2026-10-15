import { noteName } from './theory.js'

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const W = 20
const H = 96
const BW = 12
const BH = 60

// Clavier 37 touches (C à C, 3 octaves). `notes` = notes MIDI allumées.
export default function Keyboard({ low = 48, keys = 37, notes = [], onKey, labels = true, notation = 'en', mini = false, className = '' }) {
  const whites = []
  const blacks = []
  let wi = 0
  for (let m = low; m < low + keys; m++) {
    if (WHITE_PCS.includes(m % 12)) whites.push({ m, x: wi++ * W })
    else blacks.push({ m, x: wi * W - BW / 2 })
  }
  const on = new Set(notes)
  const width = wi * W
  const height = mini ? 64 : H + 2
  const bh = mini ? 40 : BH
  const wh = mini ? 62 : H
  const press = m => onKey && onKey(m)

  return (
    <svg
      className={`kb ${mini ? 'kb-mini' : ''} ${onKey ? 'kb-interactive' : ''} ${className}`}
      viewBox={`-1 -1 ${width + 2} ${height}`}
      role="img"
      aria-label={notes.map(n => noteName(n, notation)).join(' ')}
    >
      {whites.map(({ m, x }) => (
        <g key={m} onClick={() => press(m)}>
          <rect x={x} y={0} width={W} height={wh} rx={mini ? 1.5 : 3} className={on.has(m) ? 'kw on' : 'kw'} />
          {labels && on.has(m) && (
            <text x={x + W / 2} y={wh - 10} className="kl kl-w">
              {noteName(m, notation, false)}
            </text>
          )}
          {labels && !on.has(m) && m % 12 === 0 && (
            <text x={x + W / 2} y={wh - 8} className="kl kl-c">
              {noteName(m, notation)}
            </text>
          )}
        </g>
      ))}
      {blacks.map(({ m, x }) => (
        <g key={m} onClick={() => press(m)}>
          <rect x={x} y={0} width={BW} height={bh} rx={mini ? 1 : 2} className={on.has(m) ? 'kbk on' : 'kbk'} />
          {labels && on.has(m) && (
            <text x={x + BW / 2} y={bh - 8} className="kl kl-b">
              {noteName(m, notation, false).replace(/[♭♯]/, '')}
              <tspan className="kl-acc">{noteName(m, notation, false).match(/[♭♯]/)?.[0]}</tspan>
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
