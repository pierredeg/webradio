import { useEffect, useMemo, useRef, useState } from 'react'
import Keyboard from './Keyboard.jsx'
import {
  QUALITIES, QUALITY, MODES, TEMPLATES, MAX_NOTES, IDEAL_NOTES,
  chordName, noteName, rootName, numeralOf, rangeOf, makeChord, voiceChord,
  cycleVoicing, shiftOctave, detectChord, suggestNext, buildTemplate,
} from './theory.js'
import { playChord, playSequence, onMidi } from './audio.js'

const MIN_CHORDS = 2
const MAX_CHORDS = 5

const GROUPS = [
  ['Triades', ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4']],
  ['4 sons', ['maj7', 'm7', '7', 'm7b5', 'dim7', 'mmaj7', '6', 'm6', 'add9', 'madd9', '7sus4']],
  ['Couleurs (4 notes)', ['maj9', 'm9', '9', '69', 'm11', '13', 'maj7s11', '7b9', '7s9']],
  ['5 notes', ['maj9full', 'm9full', '9full']],
]

const isMinorish = q => /^m(?!aj)|dim|m7b5/.test(q || '')

export function NoteCount({ count }) {
  if (!count) return null
  const cls = count <= IDEAL_NOTES ? 'pill-ok' : count === MAX_NOTES ? 'pill-warn' : 'pill-bad'
  const hint = count <= IDEAL_NOTES ? '' : count === MAX_NOTES ? ' · au-delà des 4 voix du JU-06A' : ' · trop de notes'
  return <span className={`pill ${cls}`}>{count} note{count > 1 ? 's' : ''}{hint}</span>
}

export default function Creator({ initial, settings, setSettings, onSave, onClose, onSettings }) {
  const range = rangeOf(settings)
  const n = settings.notation
  const [id, setId] = useState(initial?.id)
  const [name, setName] = useState(initial?.name || '')
  const [key, setKey] = useState(initial?.key || { tonic: 0, mode: 'major' })
  const [keyLocked, setKeyLocked] = useState(!!initial)
  const [chords, setChords] = useState(initial?.chords || [])
  const [sel, setSel] = useState(0)
  const [bpm, setBpm] = useState(initial?.bpm || settings.bpm)
  const [tab, setTab] = useState('suggest')
  const [pickRoot, setPickRoot] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [confirm, setConfirm] = useState(null) // 'leave' | template name
  const [playStep, setPlayStep] = useState(-1)
  const [loop, setLoop] = useState(false)
  const [capture, setCapture] = useState(false)
  const stop = useRef(null)
  const meta = useRef({ createdAt: initial?.createdAt })

  useEffect(() => () => stop.current?.(), [])

  const current = chords[sel] || null
  const prev = sel > 0 ? chords[sel - 1] : null
  const isAddSlot = sel >= chords.length

  const update = next => {
    setChords(next)
    setDirty(true)
    setStatus('')
  }

  // Place un accord dans la case sélectionnée (remplace ou ajoute).
  const place = chord => {
    const next = [...chords]
    if (isAddSlot) {
      if (chords.length >= MAX_CHORDS) return
      next.push(chord)
      setSel(next.length < MAX_CHORDS ? next.length : MAX_CHORDS - 1)
    } else {
      next[sel] = chord
    }
    if (!keyLocked && chords.length === 0 && chord.root != null) {
      setKey({ tonic: chord.root, mode: isMinorish(chord.quality) ? 'minor' : 'major' })
    }
    update(next)
    playChord(chord.notes)
  }

  const pick = (root, quality) =>
    place(makeChord(root, quality, { prev: prev?.notes, bass: current?.bass || false, range }))

  const editCurrent = patch => {
    if (!current) return
    const c = { ...current, ...patch }
    update(chords.map((x, i) => (i === sel ? c : x)))
    playChord(c.notes, 1.2)
  }

  // Clic sur une touche : ajoute / retire la note, l'accord est reconnu.
  const toggleKey = m => {
    const notes = current ? [...current.notes] : []
    const i = notes.indexOf(m)
    if (i >= 0) notes.splice(i, 1)
    else if (notes.length >= MAX_NOTES) {
      setStatus(`${MAX_NOTES} notes maximum : retire d’abord une note.`)
      return
    } else notes.push(m)
    notes.sort((a, b) => a - b)
    playChord([m], 0.5)
    if (!notes.length) {
      if (current) removeAt(sel)
      return
    }
    const chord = { ...detectChord(notes), bass: false, notes }
    if (current) update(chords.map((x, k) => (k === sel ? chord : x)))
    else {
      if (chords.length >= MAX_CHORDS) return
      update([...chords, chord])
    }
  }

  const removeAt = i => {
    const next = chords.filter((_, k) => k !== i)
    update(next)
    setSel(Math.min(i, next.length))
  }

  const move = dir => {
    const j = sel + dir
    if (!current || j < 0 || j >= chords.length) return
    const next = [...chords]
    ;[next[sel], next[j]] = [next[j], next[sel]]
    update(next)
    setSel(j)
  }

  // Revoice tout l'enchaînement pour que les mains bougent le moins possible.
  const smoothAll = () => {
    let p = null
    const next = chords.map(c => {
      if (c.root == null) {
        p = c.notes
        return c
      }
      const notes = voiceChord(c.root, c.quality, { prev: p, bass: c.bass, range })
      p = notes
      return { ...c, notes }
    })
    update(next)
    setStatus('Voicings lissés : chaque accord reste proche du précédent.')
  }

  const applyTemplate = tpl => {
    const tonic = key.tonic
    setKey({ tonic, mode: tpl.mode })
    setKeyLocked(true)
    const next = buildTemplate(tpl, tonic, { sevenths: settings.sevenths, range })
    update(next)
    setSel(next.length < MAX_CHORDS ? next.length : 0)
    if (!name) setName(tpl.name)
    setConfirm(null)
    togglePlay(next)
  }

  const togglePlay = (list = chords) => {
    stop.current?.()
    if (playStep >= 0 && list === chords) {
      stop.current = null
      setPlayStep(-1)
      return
    }
    if (!list.length) return
    stop.current = playSequence(list, { bpm, loop, onStep: setPlayStep })
  }

  const placeRef = useRef(place)
  placeRef.current = place

  // Capture MIDI : joue un accord sur ton clavier, il est noté au relâché.
  useEffect(() => {
    if (!capture) return
    const held = new Set()
    let peak = []
    return onMidi(e => {
      if (e.type === 'on') {
        held.add(e.note)
        if (held.size >= peak.length) peak = [...held].sort((a, b) => a - b)
      } else if (e.type === 'off') {
        held.delete(e.note)
        if (held.size === 0 && peak.length) {
          const notes = peak.slice(0, MAX_NOTES)
          peak = []
          placeRef.current({ ...detectChord(notes), bass: false, notes })
        }
      }
    })
  }, [capture])

  const suggestions = useMemo(
    () => suggestNext(prev, key, { sevenths: settings.sevenths }),
    [prev, key, settings.sevenths],
  )

  const save = async () => {
    if (chords.length < MIN_CHORDS) return
    const finalName = name.trim() || chords.map(c => chordName(c, n)).join(' → ')
    try {
      const saved = await onSave({ id, name: finalName, key, bpm, chords, createdAt: meta.current.createdAt })
      setId(saved.id)
      meta.current.createdAt = saved.createdAt
      setName(finalName)
      setDirty(false)
      setStatus('Enregistré dans ton carnet.')
    } catch {
      // message affiché par l'app
    }
  }

  const leave = () => {
    if (dirty && confirm !== 'leave') {
      setConfirm('leave')
      return
    }
    onClose()
  }

  const chip = (s, i) => (
    <button key={s.kind + i + s.root + s.quality} className={`chip chip-${s.kind}`} onClick={() => pick(s.root, s.quality)}>
      <span className="chip-name">{rootName(s.root, n) + QUALITY[s.quality].symbol}</span>
      {s.numeral && <span className="chip-num">{s.numeral}</span>}
    </button>
  )

  const rootForPicker = pickRoot ?? current?.root ?? key.tonic

  return (
    <main className="creator">
      <header className="cr-head">
        <button className="btn-ghost btn-back" onClick={leave}>← Carnet</button>
        <input
          id="prog-name"
          className="cr-name"
          placeholder="Nom de l’enchaînement"
          value={name}
          onChange={e => {
            setName(e.target.value)
            setDirty(true)
          }}
        />
        <button className="btn-primary" disabled={chords.length < MIN_CHORDS || !dirty} onClick={save}>
          Enregistrer
        </button>
      </header>

      {confirm === 'leave' && (
        <div className="banner">
          Tu as des modifications non enregistrées.
          <button className="btn-danger" onClick={onClose}>Quitter sans enregistrer</button>
          <button className="btn" onClick={() => setConfirm(null)}>Rester</button>
        </div>
      )}

      <section className="cr-bar">
        <label className="field">
          <span>Tonalité</span>
          <span className="field-row">
            <select
              id="key-tonic"
              value={key.tonic}
              onChange={e => {
                setKey({ ...key, tonic: +e.target.value })
                setKeyLocked(true)
              }}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>{rootName(i, n)}</option>
              ))}
            </select>
            <select
              id="key-mode"
              value={key.mode}
              onChange={e => {
                setKey({ ...key, mode: e.target.value })
                setKeyLocked(true)
              }}
            >
              <option value="major">majeur</option>
              <option value="minor">mineur</option>
            </select>
          </span>
        </label>
        <label className="field">
          <span>Tempo</span>
          <span className="field-row">
            <input
              id="bpm"
              type="number"
              min="40"
              max="200"
              value={bpm}
              onChange={e => {
                setBpm(+e.target.value || 72)
                setDirty(true)
              }}
            />
            <span className="unit">BPM</span>
          </span>
        </label>
        <div className="cr-transport">
          <button className={`btn-round ${playStep >= 0 ? 'is-on' : ''}`} onClick={() => togglePlay()} disabled={!chords.length} aria-label="Écouter l’enchaînement">
            {playStep >= 0 ? '■' : '▶'}
          </button>
          <label className="check">
            <input id="loop" type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> en boucle
          </label>
          <button className="btn-ghost" onClick={smoothAll} disabled={chords.length < 2}>Lisser les voicings</button>
        </div>
      </section>

      <ol className="slots">
        {chords.map((c, i) => (
          <li key={i}>
            <button
              className={`slot ${i === sel ? 'is-sel' : ''} ${i === playStep ? 'is-playing' : ''}`}
              onClick={() => {
                setSel(i)
                playChord(c.notes, 1.2)
              }}
            >
              <span className="slot-n">{i + 1}</span>
              <span className="slot-name">{chordName(c, n)}</span>
              <span className="slot-num">{numeralOf(c, key) || ' '}</span>
              <Keyboard low={settings.lowKey} notes={c.notes} mini labels={false} />
            </button>
          </li>
        ))}
        {chords.length < MAX_CHORDS && (
          <li>
            <button className={`slot slot-add ${isAddSlot ? 'is-sel' : ''}`} onClick={() => setSel(chords.length)}>
              <span className="slot-plus">+</span>
              <span className="slot-num">{chords.length < MIN_CHORDS ? `accord ${chords.length + 1}` : 'ajouter'}</span>
            </button>
          </li>
        )}
      </ol>

      <section className="stage">
        <div className="stage-head">
          {current ? (
            <>
              <div>
                <h2 className="stage-name">{chordName(current, n)}</h2>
                <p className="stage-sub">
                  {numeralOf(current, key) && <b>{numeralOf(current, key)} · </b>}
                  {current.root != null ? QUALITY[current.quality].label : 'accord libre (non reconnu)'}
                </p>
              </div>
              <NoteCount count={current.notes.length} />
            </>
          ) : (
            <div>
              <h2 className="stage-name stage-empty">Accord {sel + 1}</h2>
              <p className="stage-sub">Choisis un accord dans les suggestions, ou tape ses notes sur le clavier.</p>
            </div>
          )}
        </div>

        <Keyboard low={settings.lowKey} notes={current?.notes || []} notation={n} onKey={toggleKey} />

        {current && (
          <p className="notes-line">
            {current.notes.map(m => noteName(m, n)).join('  ·  ')}
          </p>
        )}

        {current && (
          <div className="voicing">
            <div className="seg">
              <button className="btn" disabled={current.root == null} onClick={() => editCurrent({ notes: cycleVoicing(current, -1, range) })} aria-label="Renversement précédent">◀</button>
              <span className="seg-label">Renversement</span>
              <button className="btn" disabled={current.root == null} onClick={() => editCurrent({ notes: cycleVoicing(current, 1, range) })} aria-label="Renversement suivant">▶</button>
            </div>
            <div className="seg">
              <button className="btn" onClick={() => editCurrent({ notes: shiftOctave(current.notes, -1, range) })} aria-label="Octave plus bas">−</button>
              <span className="seg-label">Octave</span>
              <button className="btn" onClick={() => editCurrent({ notes: shiftOctave(current.notes, 1, range) })} aria-label="Octave plus haut">+</button>
            </div>
            <button
              className={`btn ${current.bass ? 'is-on' : ''}`}
              disabled={current.root == null || (!current.bass && current.notes.length >= MAX_NOTES)}
              onClick={() => {
                const bass = !current.bass
                editCurrent({ bass, notes: voiceChord(current.root, current.quality, { prev: prev?.notes, bass, range }) })
              }}
            >
              Basse doublée
            </button>
            <button
              className="btn"
              disabled={current.root == null || !prev}
              onClick={() => editCurrent({ notes: voiceChord(current.root, current.quality, { prev: prev?.notes, bass: current.bass, range }) })}
            >
              Rapprocher du précédent
            </button>
            <span className="seg-spacer" />
            <button className="btn-ghost" disabled={sel === 0} onClick={() => move(-1)} aria-label="Déplacer à gauche">←</button>
            <button className="btn-ghost" disabled={sel >= chords.length - 1} onClick={() => move(1)} aria-label="Déplacer à droite">→</button>
            <button className="btn-ghost btn-quiet-danger" onClick={() => removeAt(sel)}>Retirer</button>
          </div>
        )}
        {status && <p className="status">{status}</p>}
      </section>

      <section className="picker">
        <div className="tabs" role="tablist">
          {[['suggest', 'Suggestions'], ['all', 'Tous les accords'], ['templates', 'Modèles']].map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'is-on' : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
          <span className="tabs-spacer" />
          <label className="check">
            <input id="sevenths" type="checkbox" checked={settings.sevenths} onChange={e => setSettings({ sevenths: e.target.checked })} /> 4 sons
          </label>
          <button className={`btn-ghost ${capture ? 'is-on' : ''}`} onClick={() => (settings.midiIn ? setCapture(!capture) : onSettings())} title="Joue l’accord sur ton clavier MIDI : il est noté dans la case sélectionnée">
            {capture ? '● Capture MIDI' : 'Capture MIDI'}
          </button>
        </div>

        {tab === 'suggest' && (
          <div className="sugg">
            <h3>{prev ? `Après ${chordName(prev, n)}` : `Pour commencer en ${rootName(key.tonic, n)} ${MODES[key.mode].label}`}</h3>
            <div className="chips">{suggestions.next.slice(0, 7).map(chip)}</div>
            <h3>Emprunts et dominantes secondaires</h3>
            <div className="chips">{suggestions.colors.map(chip)}</div>
            {suggestions.variants.length > 0 && (
              <>
                <h3>Variantes de {chordName(prev, n)}</h3>
                <div className="chips">{suggestions.variants.map(chip)}</div>
              </>
            )}
          </div>
        )}

        {tab === 'all' && (
          <div className="all">
            <div className="roots">
              {Array.from({ length: 12 }, (_, i) => (
                <button key={i} className={`root ${rootForPicker === i ? 'is-on' : ''}`} onClick={() => setPickRoot(i)}>
                  {rootName(i, n)}
                </button>
              ))}
            </div>
            {GROUPS.map(([label, ids]) => (
              <div key={label}>
                <h3>{label}</h3>
                <div className="chips">
                  {ids.map(qid => (
                    <button key={qid} className="chip" onClick={() => pick(rootForPicker, qid)} title={QUALITY[qid].label}>
                      <span className="chip-name">{rootName(rootForPicker, n) + QUALITY[qid].symbol}</span>
                      <span className="chip-num">{QUALITY[qid].intervals.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'templates' && (
          <ul className="tpls">
            {TEMPLATES.map(t => {
              const preview = buildTemplate(t, key.tonic, { sevenths: settings.sevenths, range })
              return (
                <li key={t.name}>
                  <button
                    className="tpl"
                    onClick={() => (chords.length && confirm !== t.name ? setConfirm(t.name) : applyTemplate(t))}
                  >
                    <span className="tpl-name">{t.name}</span>
                    <span className="tpl-num">{t.numerals}</span>
                    <span className="tpl-chords">{preview.map(c => chordName(c, n)).join('  ')}</span>
                    {confirm === t.name && <span className="tpl-confirm">Remplacer les accords actuels ? Touche à nouveau pour confirmer.</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <p className="cr-foot">{QUALITIES.length} types d’accords · clavier {noteName(range.lo)}–{noteName(range.hi)}</p>
    </main>
  )
}
