// Extraction d'accords depuis un texte libre (réponse d'un moteur de
// recherche, page de tablature, notes…) et recherche par titre via Claude.

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

// Suffixes reconnus, du plus long au plus court → qualité interne.
const SUFFIXES = [
  ['maj7#11', 'maj7s11'], ['maj9', 'maj9'], ['maj7', 'maj7'], ['M7', 'maj7'], ['Δ7', 'maj7'], ['Δ', 'maj7'],
  ['m7b5', 'm7b5'], ['ø7', 'm7b5'], ['ø', 'm7b5'],
  ['m(maj7)', 'mmaj7'], ['mmaj7', 'mmaj7'], ['m(add9)', 'madd9'], ['madd9', 'madd9'],
  ['min7', 'm7'], ['m11', 'm11'], ['m9', 'm9'], ['m7', 'm7'], ['m6', 'm6'], ['min', 'm'], ['-7', 'm7'], ['m', 'm'],
  ['dim7', 'dim7'], ['°7', 'dim7'], ['dim', 'dim'], ['°', 'dim'], ['aug', 'aug'], ['+', 'aug'],
  ['7sus4', '7sus4'], ['7sus', '7sus4'], ['sus2', 'sus2'], ['sus4', 'sus4'], ['sus', 'sus4'],
  ['add9', 'add9'], ['add2', 'add9'], ['6/9', '69'], ['69', '69'],
  ['7b9', '7b9'], ['7#9', '7s9'], ['13', '13'], ['11', '7sus4'], ['9', '9'], ['7', '7'], ['6', '6'], ['5', 'maj'],
  ['maj', 'maj'], ['', 'maj'],
]

const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const SUFFIX_RE = SUFFIXES.map(([s]) => esc(s)).filter(Boolean).join('|')
// Un accord isolé : pas collé à une lettre ou un chiffre (évite « Eh », « Amazing »…).
const CHORD_RE = new RegExp(
  `(?<![A-Za-z0-9#♯♭])([A-G])([#b]?)(${SUFFIX_RE})?(?:/([A-G])([#b]?))?(?![A-Za-z0-9#])`,
  'g',
)

export function normalizeText(text) {
  return text
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\\\(\s*([A-G])\s*\\flat\s*\\\)/g, '$1b')
    .replace(/\\\(\s*([A-G])\s*\\sharp\s*\\\)/g, '$1#')
    .replace(/\\flat/g, 'b').replace(/\\sharp/g, '#').replace(/\\[()]/g, '')
    .replace(/♭/g, 'b').replace(/♯/g, '#')
    .replace(/\[\[?\d+\]?\]?\(?\)?/g, ' ') // renvois de notes « [[1](…)] »
}

const toChord = (m) => {
  const [, letter, acc, suffix = ''] = m
  const root = (LETTER_PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12
  const quality = (SUFFIXES.find(([s]) => s === suffix) || ['', 'maj'])[1]
  return { root, quality, symbol: m[0] }
}

// Accord unique (« C#m7 ») → { root, quality } ou null.
export function parseChordSymbol(str) {
  const s = normalizeText(String(str)).trim()
  const m = chordRe().exec(s)
  return m && m.index === 0 && m[0].length === s.length ? toChord(m) : null
}

// Copie neuve à chaque usage : une regex /g garde sa position entre deux appels.
const chordRe = () => new RegExp(CHORD_RE.source, 'g')

// Suites d'accords collés, séparés seulement par des tirets, virgules, barres…
const GLUE = /^[\s–—\-,|/→>.·*]*$/
function chordRuns(line) {
  const runs = []
  let run = []
  let end = 0
  for (const m of line.matchAll(chordRe())) {
    if (run.length && !GLUE.test(line.slice(end, m.index))) {
      runs.push(run)
      run = []
    }
    run.push(toChord(m))
    end = m.index + m[0].length
  }
  if (run.length) runs.push(run)
  return runs.filter(r => r.length >= 2)
}

const titleOf = line => {
  const m = line.match(/["“«]\s*([^"”»]+?)\s*["”»]\s*[—–-]\s*(.+)$/)
  return m ? `${m[1]} — ${m[2].replace(/\s*\(.*?\)\s*/g, ' ').trim()}` : null
}

// Renvoie les grilles trouvées : [{ title, chords: [{root, quality, symbol}], total }]
export function extractProgressions(text, max = 5) {
  const lines = normalizeText(text).split(/\r?\n/)
  const out = []
  let title = null
  let column = [] // un accord par ligne (« * E (paroles…) »)

  const push = chords => {
    if (chords.length < 2) return
    const key = chords.map(c => c.root + c.quality).join(' ')
    if (out.some(p => p.key === key)) return
    out.push({ key, title, chords: chords.slice(0, max), total: chords.length })
  }
  const flushColumn = () => {
    push(column)
    column = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const t = titleOf(line)
    if (t) {
      flushColumn()
      title = t
      continue
    }
    // grille verticale : la ligne commence par un accord suivi d'un espace ou « ( »
    const lead = line.replace(/^[\s*•\-–\d.)]+/, '')
    const first = chordRe().exec(lead)
    if (first && first.index === 0 && /^(\s|\(|$)/.test(lead.slice(first[0].length))) {
      column.push(toChord(first))
    } else {
      flushColumn()
    }
    // grilles en ligne, éventuellement plusieurs (« E – C#m – B – A (ou G – D – A) »)
    for (const run of chordRuns(line)) push(run)
  }
  flushColumn()
  return out.map(({ key: _key, ...p }) => p)
}

// Recherche par titre : Claude répond de mémoire (pas d'accès au web).
export async function askClaudeForChords(query) {
  const sample = await window.claude?.use?.('sample')
  if (!sample) throw Object.assign(new Error('unavailable'), { code: 'not_granted' })
  const prompt = `You help a keyboard player find the chords of songs.
Give the chord progressions most commonly used for the song below. If several well-known songs share this title, cover each one (at most 3).
Use standard chord symbols (examples: E, C#m, Bb, Ebmaj7, F#m7, Dsus2, G7).
Each progression has 2 to 5 chords, in playing order. At most 3 progressions per song (verse, chorus, bridge…).
If you do not know the song, return {"songs": []}. Do not invent.
Reply with JSON only:
{"songs":[{"title":"","artist":"","key":"","progressions":[{"section":"","chords":["E","C#m","B","A"]}]}]}

Song: ${query}`
  const data = await sample.json(prompt, { modelTier: 'default' })
  const out = []
  for (const song of data?.songs || []) {
    for (const prog of song.progressions || []) {
      const chords = (prog.chords || []).map(parseChordSymbol).filter(Boolean)
      if (chords.length < 2) continue
      const name = [song.title, song.artist].filter(Boolean).join(' — ')
      out.push({ title: prog.section ? `${name} · ${prog.section}` : name, chords: chords.slice(0, 5), total: chords.length })
    }
  }
  return out
}
