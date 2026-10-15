import { useEffect, useId, useRef, useState } from 'react'
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

  // Taille des étiquettes : jamais moins de 12px à l'écran. Si la touche
  // noire est trop étroite pour 12px, son étiquette est masquée (les notes
  // sont listées sous le clavier).
  const svgRef = useRef(null)
  const gradId = 'kg' + useId().replace(/:/g, '')
  const isPreview = className.includes('kb-preview') // l'aperçu garde sa couleur ambre
  const [pxPerUnit, setPxPerUnit] = useState(2)
  useEffect(() => {
    const el = svgRef.current
    if (!el || mini || !labels) return
    const measure = () => el.clientWidth && setPxPerUnit(el.clientWidth / (width + 2))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, mini, labels])
  const minUnits = 12 / pxPerUnit
  const fsWhite = Math.max(9, minUnits)
  const fsC = Math.max(7, minUnits)
  const fsBlack = Math.max(7.5, minUnits)
  const showBlack = fsBlack <= BW - 2
  const height = mini ? 64 : H + 2
  const bh = mini ? 40 : BH
  const wh = mini ? 62 : H
  const press = m => onKey && onKey(m)

  return (
    <svg
      ref={svgRef}
      className={`kb ${mini ? 'kb-mini' : ''} ${onKey ? 'kb-interactive' : ''} ${className}`}
      viewBox={`-1 -1 ${width + 2} ${height}`}
      role="img"
      aria-label={notes.map(n => noteName(n, notation)).join(' ')}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e75713" />
          <stop offset=".01%" stopColor="#f5610d" />
          <stop offset="100%" stopColor="#ef350c" />
        </linearGradient>
      </defs>
      {whites.map(({ m, x }) => (
        <g key={m} onClick={() => press(m)}>
          <rect x={x} y={0} width={W} height={wh} rx={mini ? 1.5 : 3} className={on.has(m) ? 'kw on' : 'kw'} style={on.has(m) && !isPreview ? { fill: `url(#${gradId})` } : undefined} />
          {labels && on.has(m) && (
            <text x={x + W / 2} y={wh - 8} className="kl kl-w" style={{ fontSize: fsWhite }}>
              {noteName(m, notation, false)}
            </text>
          )}
          {labels && !on.has(m) && m % 12 === 0 && (
            <text x={x + W / 2} y={wh - 6} className="kl kl-c" style={{ fontSize: fsC }}>
              {noteName(m, notation)}
            </text>
          )}
        </g>
      ))}
      {blacks.map(({ m, x }) => (
        <g key={m} onClick={() => press(m)}>
          <rect x={x} y={0} width={BW} height={bh} rx={mini ? 1 : 2} className={on.has(m) ? 'kbk on' : 'kbk'} style={on.has(m) && !isPreview ? { fill: `url(#${gradId})` } : undefined} />
          {labels && showBlack && on.has(m) && (
            <text x={x + BW / 2} y={bh - 6} className="kl kl-b" style={{ fontSize: fsBlack }}>
              {noteName(m, notation, false).replace(/[♭♯]/, '')}
              <tspan className="kl-acc">{noteName(m, notation, false).match(/[♭♯]/)?.[0]}</tspan>
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
