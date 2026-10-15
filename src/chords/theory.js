// Moteur harmonique : accords, voicings, voice leading, suggestions.
// Les notes sont des numéros MIDI (60 = C4 = Do central).

export const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
export const NOTE_NAMES_FR = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si']
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const SHARP_NAMES_FR = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si']

// Orthographe : `notation` est 'en' / 'fr', ou { lang, sharps } pour écrire
// les altérations selon la tonalité (C♯ en la majeur, D♭ en la bémol majeur).
export function spelling(lang, key) {
  const sharpKeys = key?.mode === 'minor' ? [4, 11, 6, 1, 8] : [7, 2, 9, 4, 11, 6]
  return { lang, sharps: !!key && sharpKeys.includes(key.tonic) }
}
function namesFor(notation) {
  const lang = typeof notation === 'object' ? notation.lang : notation
  const sharps = typeof notation === 'object' && notation.sharps
  if (lang === 'fr') return sharps ? SHARP_NAMES_FR : NOTE_NAMES_FR
  return sharps ? SHARP_NAMES : NOTE_NAMES
}

export const MAX_NOTES = 5
export const IDEAL_NOTES = 4 // polyphonie du JU-06A

// intervals : demi-tons depuis la fondamentale, dans l'ordre d'empilement
// de la position fondamentale (les extensions > 12 restent au-dessus).
export const QUALITIES = [
  { id: 'maj', symbol: '', label: 'major', intervals: [0, 4, 7] },
  { id: 'm', symbol: 'm', label: 'minor', intervals: [0, 3, 7] },
  { id: 'dim', symbol: '°', label: 'diminished', intervals: [0, 3, 6] },
  { id: 'aug', symbol: '+', label: 'augmented', intervals: [0, 4, 8] },
  { id: 'sus2', symbol: 'sus2', label: 'sus2', intervals: [0, 2, 7] },
  { id: 'sus4', symbol: 'sus4', label: 'sus4', intervals: [0, 5, 7] },
  { id: 'maj7', symbol: 'maj7', label: 'major 7th', intervals: [0, 4, 7, 11] },
  { id: 'm7', symbol: 'm7', label: 'minor 7th', intervals: [0, 3, 7, 10] },
  { id: '7', symbol: '7', label: 'dominant 7th', intervals: [0, 4, 7, 10] },
  { id: 'm7b5', symbol: 'm7♭5', label: 'half-diminished', intervals: [0, 3, 6, 10] },
  { id: 'dim7', symbol: '°7', label: 'diminished 7th', intervals: [0, 3, 6, 9] },
  { id: 'mmaj7', symbol: 'm(maj7)', label: 'minor major 7th', intervals: [0, 3, 7, 11] },
  { id: '6', symbol: '6', label: 'sixth', intervals: [0, 4, 7, 9] },
  { id: 'm6', symbol: 'm6', label: 'minor sixth', intervals: [0, 3, 7, 9] },
  { id: 'add9', symbol: 'add9', label: 'add9', intervals: [0, 4, 7, 14] },
  { id: 'madd9', symbol: 'm(add9)', label: 'minor add9', intervals: [0, 3, 7, 14] },
  { id: '7sus4', symbol: '7sus4', label: '7 sus4', intervals: [0, 5, 7, 10] },
  { id: 'maj9', symbol: 'maj9', label: 'maj9 (no 5th)', intervals: [0, 4, 11, 14] },
  { id: 'm9', symbol: 'm9', label: 'm9 (no 5th)', intervals: [0, 3, 10, 14] },
  { id: '9', symbol: '9', label: '9 (no 5th)', intervals: [0, 4, 10, 14] },
  { id: '69', symbol: '6/9', label: '6/9 (no 5th)', intervals: [0, 4, 9, 14] },
  { id: 'm11', symbol: 'm11', label: 'm11 (no 5th)', intervals: [0, 3, 10, 17] },
  { id: '13', symbol: '13', label: '13 (no 5th)', intervals: [0, 4, 10, 21] },
  { id: 'maj7s11', symbol: 'maj7♯11', label: 'lydian', intervals: [0, 4, 11, 18] },
  { id: '7b9', symbol: '7♭9', label: '7♭9 (no 5th)', intervals: [0, 4, 10, 13] },
  { id: '7s9', symbol: '7♯9', label: '7♯9 (no 5th)', intervals: [0, 4, 10, 15] },
  { id: 'maj9full', symbol: 'maj9', label: 'maj9 full (5 notes)', intervals: [0, 4, 7, 11, 14] },
  { id: 'm9full', symbol: 'm9', label: 'm9 full (5 notes)', intervals: [0, 3, 7, 10, 14] },
  { id: '9full', symbol: '9', label: '9 full (5 notes)', intervals: [0, 4, 7, 10, 14] },
]

export const QUALITY = Object.fromEntries(QUALITIES.map(q => [q.id, q]))

const mod12 = n => ((n % 12) + 12) % 12
const pcSet = notes => [...new Set(notes.map(mod12))]

export function noteName(midi, notation = 'en', withOctave = true) {
  const names = namesFor(notation)
  const oct = Math.floor(midi / 12) - 1
  return names[mod12(midi)] + (withOctave ? oct : '')
}

export function rootName(pc, notation = 'en') {
  return namesFor(notation)[mod12(pc)]
}

// Nom affiché, avec basse si renversé (ex : C/E).
export function chordName(chord, notation = 'en') {
  if (!chord) return ''
  if (chord.root == null || !QUALITY[chord.quality]) {
    return chord.notes.length ? '?' : '—'
  }
  let name = rootName(chord.root, notation) + QUALITY[chord.quality].symbol
  if (chord.notes.length) {
    const bass = mod12(Math.min(...chord.notes))
    if (bass !== mod12(chord.root)) name += '/' + rootName(bass, notation)
  }
  return name
}

// ---------- Voicings ----------

// Empile les classes de hauteur dans l'ordre : chaque note est la plus
// proche au-dessus de la précédente.
function stack(pcs) {
  const out = [pcs[0]]
  for (let i = 1; i < pcs.length; i++) {
    let n = pcs[i]
    while (n <= out[i - 1]) n += 12
    out.push(n)
  }
  return out
}

const normalize = v => {
  const s = [...v].sort((a, b) => a - b)
  const shift = Math.floor(s[0] / 12) * 12
  return s.map(n => n - shift)
}

// Formes de voicings possibles (indépendantes de l'octave) :
// renversements dans l'ordre d'empilement, positions serrées, drop 2.
export function voicingShapes(root, quality) {
  const q = QUALITY[quality]
  if (!q) return []
  const order = q.intervals.map(i => mod12(root + i))
  const closed = [...order].sort((a, b) => mod12(a - root) - mod12(b - root))
  const shapes = []
  const rotations = list => list.map((_, k) => list.slice(k).concat(list.slice(0, k)))
  for (const r of rotations(order)) shapes.push(stack(r))
  for (const r of rotations(closed)) shapes.push(stack(r))
  if (order.length === 4) {
    for (const r of rotations(closed)) {
      const v = stack(r)
      shapes.push([v[2] - 12, v[0], v[1], v[3]]) // drop 2
    }
  }
  const seen = new Set()
  const res = []
  for (const s of shapes) {
    const n = normalize(s)
    const key = n.join(',')
    if (!seen.has(key) && n[n.length - 1] - n[0] <= 24) {
      seen.add(key)
      res.push(n)
    }
  }
  return res
}

// Toutes les transpositions par octave d'une forme qui tiennent dans [lo, hi].
function placements(shape, lo, hi) {
  const out = []
  for (let k = -2; k <= 9; k++) {
    const v = shape.map(n => n + 12 * k)
    if (v[0] >= lo && v[v.length - 1] <= hi) out.push(v)
  }
  return out
}

const mean = v => v.reduce((a, b) => a + b, 0) / v.length

function movement(prev, next) {
  if (prev.length === next.length) {
    const a = [...prev].sort((x, y) => x - y)
    const b = [...next].sort((x, y) => x - y)
    return a.reduce((s, n, i) => s + Math.abs(n - b[i]), 0)
  }
  const near = (n, set) => Math.min(...set.map(m => Math.abs(m - n)))
  return next.reduce((s, n) => s + near(n, prev), 0) + prev.reduce((s, n) => s + near(n, next), 0)
}

// Pénalise les secondes mineures entre voix voisines et les intervalles
// serrés dans le grave (son boueux).
function muddiness(v) {
  let p = 0
  for (let i = 1; i < v.length; i++) {
    const gap = v[i] - v[i - 1]
    if (gap === 1) p += 4
    if (v[i - 1] < 55 && gap < 5) p += 1
  }
  return p
}

// Basse doublée (fondamentale sous l'accord).
function withBass(notes, root, lo) {
  const min = Math.min(...notes)
  let b = min - (mod12(min - root) || 12)
  if (min - b < 5) b -= 12
  if (b < lo) return notes
  return [b, ...notes]
}

export function rangeOf(settings) {
  const lo = settings?.lowKey ?? 48
  return { lo, hi: lo + 36, center: lo + 14 }
}

// Choisit le voicing : le plus proche du précédent (voice leading),
// sinon une position fondamentale au centre du clavier.
export function voiceChord(root, quality, { prev = null, bass = false, range }) {
  const { lo, hi, center } = range
  const shapes = voicingShapes(root, quality)
  if (!shapes.length) return []
  const upperLo = bass ? lo + 7 : lo
  let best = null
  let bestCost = Infinity
  shapes.forEach((shape, idx) => {
    for (const v of placements(shape, upperLo, hi)) {
      const span = v[v.length - 1] - v[0]
      let cost
      if (prev && prev.length) {
        const prevUpper = prev.length > v.length && bass ? prev.slice(1) : prev
        cost = movement(prevUpper, v) + 0.2 * Math.abs(mean(v) - center)
        if (mod12(v[0]) !== mod12(root)) cost += 1.5
      } else {
        // sans contexte : position fondamentale, centrée
        cost = Math.abs(mean(v) - center) + idx * 3
      }
      if (span > 19) cost += (span - 19) * 0.6
      cost += muddiness(v)
      if (cost < bestCost) {
        bestCost = cost
        best = v
      }
    }
  })
  if (!best) best = shapes[0].map(n => n + Math.floor((center - 6) / 12) * 12)
  return bass ? withBass(best, root, lo) : best
}

// Voicing suivant / précédent dans la liste des formes, à la même hauteur.
export function cycleVoicing(chord, dir, range) {
  const shapes = voicingShapes(chord.root, chord.quality)
  if (!shapes.length) return chord.notes
  const upper = chord.bass ? chord.notes.slice(1) : chord.notes
  const cur = upper.length ? normalize(upper).join(',') : ''
  let idx = shapes.findIndex(s => s.join(',') === cur)
  idx = idx < 0 ? 0 : (idx + dir + shapes.length) % shapes.length
  // on reste dans la même zone d'octave pour ne pas dériver vers l'aigu
  const zone = upper.length ? Math.round((mean(upper) - range.center) / 12) : 0
  const target = range.center + 12 * zone
  const upperLo = chord.bass ? range.lo + 7 : range.lo
  const options = placements(shapes[idx], upperLo, range.hi)
  if (!options.length) return chord.notes
  const v = options.reduce((a, b) => (Math.abs(mean(a) - target) <= Math.abs(mean(b) - target) ? a : b))
  return chord.bass ? withBass(v, chord.root, range.lo) : v
}

export function shiftOctave(notes, dir, range) {
  const v = notes.map(n => n + 12 * dir)
  return v.every(n => n >= range.lo && n <= range.hi) ? v : notes
}

// Reconnaît un accord à partir de notes jouées / cliquées.
export function detectChord(notes) {
  if (!notes.length) return { root: null, quality: null }
  const pcs = pcSet(notes)
  const bass = mod12(Math.min(...notes))
  const roots = [bass, ...pcs.filter(p => p !== bass)]
  const same = (a, b) => a.length === b.length && a.every(x => b.includes(x))
  for (const r of roots) {
    for (const q of QUALITIES) {
      if (same(pcs, pcSet(q.intervals.map(i => r + i)))) return { root: r, quality: q.id }
    }
  }
  return { root: null, quality: null }
}

export function makeChord(root, quality, opts) {
  return { root, quality, bass: !!opts.bass, notes: voiceChord(root, quality, opts) }
}

// ---------- Tonalité & suggestions ----------

export const MODES = {
  major: {
    label: 'major',
    steps: [0, 2, 4, 5, 7, 9, 11],
    triads: ['maj', 'm', 'm', 'maj', 'maj', 'm', 'dim'],
    sevenths: ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'],
    numerals: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'],
    // poids des enchaînements usuels : degré -> { degré suivant: poids }
    moves: {
      start: { 0: 4, 5: 3, 3: 3, 1: 2 },
      0: { 3: 3, 4: 3, 5: 3, 1: 2, 2: 1 },
      1: { 4: 4, 6: 1, 3: 1, 0: 1 },
      2: { 5: 3, 3: 2, 1: 1 },
      3: { 4: 3, 0: 3, 1: 2, 5: 1 },
      4: { 0: 4, 5: 3, 3: 1 },
      5: { 3: 3, 1: 3, 4: 2, 2: 1 },
      6: { 0: 4, 2: 1 },
    },
    // emprunts & dominantes secondaires : [demi-tons, triade, 4 sons, chiffrage]
    colors: [
      [5, 'm', 'm6', 'iv'],
      [10, 'maj', '7', '♭VII'],
      [8, 'maj', 'maj7', '♭VI'],
      [3, 'maj', 'maj7', '♭III'],
      [2, '7', '7', 'V/V'],
      [4, '7', '7', 'V/vi'],
      [9, '7', '7', 'V/ii'],
      [0, '7', '7', 'V/IV'],
    ],
  },
  minor: {
    label: 'minor',
    steps: [0, 2, 3, 5, 7, 8, 10],
    triads: ['m', 'dim', 'maj', 'm', 'm', 'maj', 'maj'],
    sevenths: ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7'],
    numerals: ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII'],
    moves: {
      start: { 0: 4, 5: 3, 3: 2, 6: 1 },
      0: { 3: 3, 5: 3, 6: 3, 4: 2, 2: 2, 1: 1 },
      1: { 4: 4, 0: 1 },
      2: { 5: 3, 6: 2, 3: 2 },
      3: { 4: 3, 0: 3, 6: 2 },
      4: { 0: 4, 5: 2 },
      5: { 6: 3, 2: 2, 3: 2, 4: 1 },
      6: { 0: 3, 2: 3, 5: 1 },
    },
    colors: [
      [7, 'maj', '7', 'V'],
      [5, 'maj', '7', 'IV (dorian)'],
      [1, 'maj', 'maj7', '♭II'],
      [11, 'dim', 'dim7', 'vii°7'],
      [2, 'm', 'm7', 'ii (dorian)'],
      [0, 'maj', 'maj7', 'I (Picardy)'],
    ],
  },
}

export function degreeOf(root, key) {
  const m = MODES[key.mode]
  const d = m.steps.findIndex(s => mod12(key.tonic + s) === mod12(root))
  return d < 0 ? null : d
}

export function numeralOf(chord, key) {
  if (!chord || chord.root == null) return ''
  const m = MODES[key.mode]
  const d = degreeOf(chord.root, key)
  if (d != null) {
    const diatonic = [m.triads[d], m.sevenths[d]]
    const minorish = /^m(?!aj)|dim|m7b5/.test(chord.quality)
    const expected = /^m(?!aj)|dim|m7b5/.test(m.triads[d])
    if (diatonic.includes(chord.quality) || minorish === expected) return m.numerals[d]
  }
  const rel = mod12(chord.root - key.tonic)
  const color = m.colors.find(c => c[0] === rel && (c[1] === chord.quality || c[2] === chord.quality))
  return color ? color[3] : ''
}

const commonTones = (a, b) => {
  const pa = pcSet(a)
  return pcSet(b).filter(p => pa.includes(p)).length
}

// Suggestions pour l'accord qui suit `prev` dans la tonalité `key`.
export function suggestNext(prev, key, { sevenths = true } = {}) {
  const m = MODES[key.mode]
  const quality = d => (sevenths ? m.sevenths[d] : m.triads[d])
  const chordPcs = (root, q) => QUALITY[q].intervals.map(i => root + i)
  const out = []

  let weights = m.moves.start
  if (prev && prev.root != null) {
    const d = degreeOf(prev.root, key)
    const rel = mod12(prev.root - key.tonic)
    if (prev.quality === '7' && d !== 4 && !(key.mode === 'minor' && d === 6)) {
      // dominante secondaire : on résout une quinte en dessous
      const target = degreeOf(prev.root + 5, key)
      weights = target != null ? { [target]: 5 } : m.moves[0]
    } else if (d != null) {
      weights = m.moves[d]
    } else {
      weights = m.moves[rel === 5 && key.mode === 'major' ? 3 : 0]
    }
  }

  m.steps.forEach((s, d) => {
    const root = mod12(key.tonic + s)
    const q = quality(d)
    let score = (weights[d] || 0) * 2
    if (prev && prev.notes?.length) score += 0.4 * commonTones(prev.notes, chordPcs(root, q))
    if (prev && prev.root === root && prev.quality === q) score -= 10
    out.push({ root, quality: q, numeral: m.numerals[d], score, kind: 'diatonic' })
  })
  out.sort((a, b) => b.score - a.score)

  const colors = m.colors.map(([rel, q3, q4, numeral]) => ({
    root: mod12(key.tonic + rel),
    quality: sevenths ? q4 : q3,
    numeral,
    kind: 'color',
  }))

  // Variantes de couleur de l'accord précédent (même fondamentale)
  const variants = []
  if (prev && prev.root != null) {
    const fam = /^m(?!aj)/.test(prev.quality) ? ['m7', 'm9', 'm6', 'madd9', 'm11'] :
      prev.quality === '7' || prev.quality.startsWith('9') ? ['7sus4', '9', '13', '7b9'] :
      ['maj7', 'add9', '6', 'maj9', '69', 'sus2', 'sus4']
    for (const q of fam) if (q !== prev.quality) variants.push({ root: prev.root, quality: q, kind: 'variant' })
  }

  return { next: out, colors, variants }
}
