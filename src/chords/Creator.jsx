import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Keyboard from './Keyboard.jsx'
import {
  QUALITIES, QUALITY, MODES, MAX_NOTES, IDEAL_NOTES,
  chordName, noteName, spelling, rootName, numeralOf, rangeOf, makeChord, voiceChord,
  cycleVoicing, shiftOctave, detectChord, suggestNext,
} from './theory.js'
import { playChord, playSequence, onMidi } from './audio.js'

// Identité stable d'un accord pour l'affichage (suit l'objet quand on réordonne).
const chordKeys = new WeakMap()
let nextChordKey = 1
const keyOf = c => {
  if (!chordKeys.has(c)) chordKeys.set(c, nextChordKey++)
  return chordKeys.get(c)
}

const MIN_CHORDS = 2
const MAX_CHORDS = 5

const GROUPS = [
  ['Triades', ['maj', 'm', 'dim', 'aug', 'sus2', 'sus4']],
  ['4 sons', ['maj7', 'm7', '7', 'm7b5', 'dim7', 'mmaj7', '6', 'm6', 'add9', 'madd9', '7sus4']],
  ['Couleurs (4 notes)', ['maj9', 'm9', '9', '69', 'm11', '13', 'maj7s11', '7b9', '7s9']],
  ['5 notes', ['maj9full', 'm9full', '9full']],
]

const isMinorish = q => /^m(?!aj)|dim|m7b5/.test(q || '')

const EMOJIS = [
  '🙂', '😌', '🥲', '😢', '😍', '🤩', '😎', '🌙', '☀️', '🌅', '🌊', '🌧️',
  '🔥', '❄️', '🍋', '🍊', '🍒', '🌸', '🌿', '🍂', '✨', '💫', '🌈', '⚡',
  '🎹', '🎸', '🎷', '🎺', '🥁', '🎧', '🎬', '🕺', '💜', '💙', '🖤', '❤️',
]

function EmojiPicker({ value, onPick, onClose }) {
  const [custom, setCustom] = useState('')
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="emoji-pop" role="dialog" aria-label="Choisir un emoji">
      <div className="emoji-grid">
        {EMOJIS.map(e => (
          <button key={e} className={`emoji-cell ${e === value ? 'is-on' : ''}`} onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
      <form
        className="emoji-custom"
        onSubmit={ev => {
          ev.preventDefault()
          const first = [...new Intl.Segmenter().segment(custom.trim())][0]?.segment
          if (first) onPick(first)
        }}
      >
        <input id="emoji-custom" placeholder="Autre emoji…" value={custom} onChange={e => setCustom(e.target.value)} />
        <button className="btn" type="submit" disabled={!custom.trim()}>OK</button>
      </form>
      {value && <button className="btn-ghost" onClick={() => onPick('')}>Retirer l’emoji</button>}
    </div>
  )
}

export function NoteCount({ count }) {
  if (!count) return null
  const cls = count <= IDEAL_NOTES ? 'pill-ok' : count === MAX_NOTES ? 'pill-warn' : 'pill-bad'
  const hint = count <= IDEAL_NOTES ? '' : count === MAX_NOTES ? ' · au-delà des 4 voix du JU-06A' : ' · trop de notes'
  return <span className={`pill ${cls}`}>{count} note{count > 1 ? 's' : ''}{hint}</span>
}

export default function Creator({ initial, settings, setSettings, onSave, onClose, onSettings }) {
  const range = rangeOf(settings)
  const [id, setId] = useState(initial?.id)
  const [name, setName] = useState(initial?.name || '')
  const [emoji, setEmoji] = useState(initial?.emoji || '')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [key, setKey] = useState(initial?.key || { tonic: 0, mode: 'major' })
  const n = spelling(settings.notation, key)
  const [keyLocked, setKeyLocked] = useState(!!initial)
  const [chords, setChords] = useState(initial?.chords || [])
  const [sel, setSel] = useState(0)
  const [tab, setTab] = useState('suggest')
  const [pickRoot, setPickRoot] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('')
  const [confirm, setConfirm] = useState(null) // 'leave'
  const [playStep, setPlayStep] = useState(-1)
  const [loop, setLoop] = useState(false)
  const [capture, setCapture] = useState(false)
  const [preview, setPreview] = useState(null) // accord écouté, pas encore ajouté
  const lastTap = useRef({ key: null, t: 0 })
  const stop = useRef(null)
  const stageRef = useRef(null)
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
    setPreview(null)
    playChord(chord.notes)
  }

  const voiced = (root, quality) => makeChord(root, quality, { prev: prev?.notes, bass: current?.bass || false, range })
  const pick = (root, quality) => place(voiced(root, quality))

  // Clic : écouter (aperçu sur le clavier). Double-clic : ajouter.
  const tap = (key, single, double) => {
    const now = performance.now()
    if (lastTap.current.key === key && now - lastTap.current.t < 400) {
      lastTap.current = { key: null, t: 0 }
      double()
    } else {
      lastTap.current = { key, t: now }
      single()
    }
  }
  const listen = (root, quality) => {
    const c = voiced(root, quality)
    setPreview(c)
    playChord(c.notes)
  }
  const chordTap = (root, quality) => tap(root + quality, () => listen(root, quality), () => pick(root, quality))
  const isPreview = (root, quality) => preview && preview.root === root && preview.quality === quality

  const editCurrent = patch => {
    if (!current) return
    const c = { ...current, ...patch }
    update(chords.map((x, i) => (i === sel ? c : x)))
    playChord(c.notes, 0.8)
  }

  // Clic sur une touche : ajoute / retire la note, l'accord est reconnu.
  const toggleKey = m => {
    setPreview(null)
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

  // Ouvre l'édition d'un accord déjà placé et amène le panneau à l'écran.
  const editSlot = i => {
    if (performance.now() - dragEndAt.current < 300) return // fin d'un glisser, pas un clic
    setSel(i)
    setPreview(null)
    playChord(chords[i].notes, 0.8)
    const el = stageRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      if (r.top < 0 || r.top > window.innerHeight * 0.5) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const removeAt = i => {
    const next = chords.filter((_, k) => k !== i)
    update(next)
    setSel(Math.min(i, next.length))
  }

  // Déplace l'accord `from` à la place `to` ; la sélection suit son accord.
  const moveChord = (from, to) => {
    if (from === to || to < 0 || to >= chords.length) return
    const next = [...chords]
    const [c] = next.splice(from, 1)
    next.splice(to, 0, c)
    update(next)
    setSel(s =>
      s === from ? to : from < s && s <= to ? s - 1 : to <= s && s < from ? s + 1 : s,
    )
  }
  const move = dir => current && moveChord(sel, sel + dir)

  // Glisser-déposer des cases (souris et doigt) : la carte tenue suit le
  // pointeur, les autres glissent à leur nouvelle place (animation FLIP).
  const slotsRef = useRef(null)
  const drag = useRef(null)
  const dragEndAt = useRef(0)
  const [dragKey, setDragKey] = useState(null)
  const lastLeft = useRef(new Map()) // clé -> position de la case au dernier rendu

  const slotEls = () => [...(slotsRef.current?.querySelectorAll('.slot-wrap[data-key]') || [])]

  const placeDragged = () => {
    const d = drag.current
    const el = d?.active && slotEls().find(x => x.dataset.key === String(d.key))
    if (!el) return
    const dx = d.x - d.grab - el.offsetLeft
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px, -6px) scale(1.06) rotate(-2deg)`
  }

  const onSlotDown = (e, i, key) => {
    if (e.button > 0 || e.target.closest('.slot-del, .slot-edit')) return
    const ol = slotsRef.current.getBoundingClientRect()
    drag.current = {
      idx: i, key, x0: e.clientX, y0: e.clientY, x: e.clientX - ol.left,
      grab: e.clientX - ol.left - e.currentTarget.offsetLeft, active: false,
    }
  }
  const onSlotMove = e => {
    const d = drag.current
    if (!d) return
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return
      d.active = true
      e.currentTarget.setPointerCapture?.(e.pointerId)
      setDragKey(d.key)
    }
    d.x = e.clientX - slotsRef.current.getBoundingClientRect().left
    // case visée : d'après les positions de mise en page (sans les animations)
    const target = slotEls().findIndex(el => d.x >= el.offsetLeft && d.x <= el.offsetLeft + el.offsetWidth)
    if (target >= 0 && target !== d.idx) {
      moveChord(d.idx, target)
      d.idx = target
    }
    placeDragged()
  }
  const onSlotUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.active) return
    dragEndAt.current = performance.now()
    const el = slotEls().find(x => x.dataset.key === String(d.key))
    if (el) {
      el.style.transition = 'transform 220ms ease-in-out'
      el.style.transform = ''
    }
    setDragKey(null)
  }

  // Après chaque réordonnancement : les cases qui ont bougé partent de leur
  // ancienne position et glissent vers la nouvelle.
  useLayoutEffect(() => {
    const els = slotEls()
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    for (const el of els) {
      const key = el.dataset.key
      const before = lastLeft.current.get(key)
      const now = el.offsetLeft
      if (before != null && before !== now && key !== String(drag.current?.active && drag.current.key) && !reduce) {
        el.style.transition = 'none'
        el.style.transform = `translateX(${before - now}px)`
        void el.offsetWidth
        el.style.transition = 'transform 240ms ease-in-out'
        el.style.transform = ''
      }
    }
    lastLeft.current = new Map(els.map(el => [el.dataset.key, el.offsetLeft]))
    placeDragged()
  })

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

  const togglePlay = (list = chords) => {
    stop.current?.()
    if (playStep >= 0 && list === chords) {
      stop.current = null
      setPlayStep(-1)
      return
    }
    if (!list.length) return
    stop.current = playSequence(list, { loop, onStep: setPlayStep })
  }

  // Touche Suppr ou Retour arrière : supprime l'accord sélectionné
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return
      if (sel < chords.length) {
        e.preventDefault()
        removeAt(sel)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
      const saved = await onSave({ id, name: finalName, emoji, key, chords, createdAt: meta.current.createdAt })
      setId(saved.id)
      meta.current.createdAt = saved.createdAt
      setName(finalName)
      setDirty(false)
      setStatus(saved.synced ? 'Enregistré dans ton carnet.' : 'Enregistré dans ce navigateur.')
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
    <button
      key={s.kind + i + s.root + s.quality}
      className={`chip chip-${s.kind} ${isPreview(s.root, s.quality) ? 'is-preview' : ''}`}
      onClick={() => chordTap(s.root, s.quality)}
    >
      <span className="chip-name">{rootName(s.root, n) + QUALITY[s.quality].symbol}</span>
      {s.numeral && <span className="chip-num">{s.numeral}</span>}
    </button>
  )

  const rootForPicker = pickRoot ?? current?.root ?? key.tonic

  return (
    <main className="creator">
      <header className="cr-head">
        <button className="btn-ghost btn-back" onClick={leave}>← Carnet</button>
        <div className="emoji-wrap">
          <button
            className={`emoji-btn ${emoji ? '' : 'is-empty'}`}
            onClick={() => setEmojiOpen(!emojiOpen)}
            aria-label={emoji ? `Emoji : ${emoji}, changer` : 'Ajouter un emoji'}
            aria-expanded={emojiOpen}
          >
            {emoji || '☺︎+'}
          </button>
          {emojiOpen && (
            <EmojiPicker
              value={emoji}
              onPick={e => {
                setEmoji(e)
                setDirty(true)
                setEmojiOpen(false)
              }}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>
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
                <option key={i} value={i}>{rootName(i, settings.notation)}</option>
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

      <ol className="slots" ref={slotsRef}>
        {chords.map((c, i) => (
          <li
            key={keyOf(c)}
            data-key={keyOf(c)}
            className={`slot-wrap ${keyOf(c) === dragKey ? 'is-dragging' : ''}`}
            onPointerDown={e => onSlotDown(e, i, keyOf(c))}
            onPointerMove={onSlotMove}
            onPointerUp={onSlotUp}
            onPointerCancel={onSlotUp}
          >
            <button
              className={`slot ${i === sel ? 'is-sel' : ''} ${i === playStep ? 'is-playing' : ''}`}
              onClick={() => editSlot(i)}
            >
              <span className="slot-n">{i + 1}</span>
              <span className="slot-name">{chordName(c, n)}</span>
              <span className="slot-num">{numeralOf(c, key) || ' '}</span>
              <Keyboard low={settings.lowKey} notes={c.notes} mini labels={false} />
            </button>
            <button className="slot-edit" onClick={() => editSlot(i)} aria-label={`Modifier ${chordName(c, n)}`} title="Modifier cet accord">
              ✎
            </button>
            <button className="slot-del" onClick={() => removeAt(i)} aria-label={`Supprimer ${chordName(c, n)}`} title="Supprimer cet accord">
              ×
            </button>
          </li>
        ))}
        {chords.length < MAX_CHORDS && (
          <li>
            <button className={`slot slot-add ${isAddSlot ? 'is-sel' : ''}`} onClick={() => {
                setSel(chords.length)
                setPreview(null)
              }}>
              <span className="slot-num">{chords.length < MIN_CHORDS ? `accord ${chords.length + 1}` : 'ajouter'}</span>
            </button>
          </li>
        )}
      </ol>

      <section ref={stageRef} className={`stage ${preview ? 'is-preview' : current ? 'is-editing' : ''}`}>
        {/* hauteur constante : l'aperçu ne doit pas décaler la liste (double-clic) */}
        <p className="stage-eyebrow">
          {preview
            ? isAddSlot ? 'Aperçu, pas encore ajouté' : `Aperçu, pas encore à la place de l’accord ${sel + 1}`
            : current ? `Modification de l’accord ${sel + 1}` : `Nouvel accord ${sel + 1}`}
        </p>
        <div className="stage-head">
          {preview ? (
            <>
              <div>
                <h2 className="stage-name">{chordName(preview, n)}</h2>
                <p className="stage-sub">
                  {numeralOf(preview, key) && <b>{numeralOf(preview, key)} · </b>}
                  {QUALITY[preview.quality].label}
                </p>
              </div>
              <div className="preview-actions">
                <button className="btn-primary" disabled={isAddSlot && chords.length >= MAX_CHORDS} onClick={() => place(preview)}>
                  {isAddSlot ? 'Ajouter' : `Remplacer l’accord ${sel + 1}`}
                </button>
                <button className="btn-ghost" onClick={() => setPreview(null)}>Fermer l’aperçu</button>
              </div>
            </>
          ) : current ? (
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
              <p className="stage-sub">Clique une suggestion pour l’écouter, ou tape les notes sur le clavier.</p>
            </div>
          )}
        </div>

        <Keyboard
          low={settings.lowKey}
          notes={preview ? preview.notes : current?.notes || []}
          notation={n}
          onKey={toggleKey}
          className={preview ? 'kb-preview' : ''}
        />

        <p className="notes-line">
          {(preview || current)?.notes.map(m => noteName(m, n)).join('  ·  ') || '\u00a0'}
        </p>

        {current && (
          <div className="voicing" style={preview ? { visibility: 'hidden' } : undefined}>
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
            <button className="btn btn-del" onClick={() => removeAt(sel)}>× Supprimer l’accord</button>
          </div>
        )}
        {status && <p className="status">{status}</p>}
      </section>

      <section className="picker">
        <div className="tabs" role="tablist">
          {[['suggest', 'Suggestions'], ['all', 'Tous les accords']].map(([t, label]) => (
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

        <p className="hint">Clic : écouter · double-clic : {isAddSlot ? 'ajouter' : `remplacer l’accord ${sel + 1}`}</p>

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
                    <button
                      key={qid}
                      className={`chip ${isPreview(rootForPicker, qid) ? 'is-preview' : ''}`}
                      onClick={() => chordTap(rootForPicker, qid)}
                      title={QUALITY[qid].label}
                    >
                      <span className="chip-name">{rootName(rootForPicker, n) + QUALITY[qid].symbol}</span>
                      <span className="chip-num">{QUALITY[qid].intervals.length}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </section>
      <p className="cr-foot">{QUALITIES.length} types d’accords · clavier {noteName(range.lo)}–{noteName(range.hi)}</p>
    </main>
  )
}
