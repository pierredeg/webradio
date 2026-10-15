import { useEffect, useRef, useState } from 'react'
import Keyboard from './Keyboard.jsx'
import { NoteCount } from './Creator.jsx'
import { chordName, noteName, spelling, numeralOf, QUALITY, rootName, MODES } from './theory.js'
import { playChord, playSequence } from './audio.js'

// Vue « jouer » : un accord à la fois, en grand, pour le refaire sur le clavier.
export default function Player({ progression: p, settings, onClose, onEdit }) {
  const [i, setI] = useState(0)
  const [auto, setAuto] = useState(false)
  const stop = useRef(null)
  const key = p.key || { tonic: 0, mode: 'major' }
  const n = spelling(settings.notation, key)
  const c = p.chords[Math.min(i, p.chords.length - 1)]

  const go = j => {
    const k = (j + p.chords.length) % p.chords.length
    setI(k)
    playChord(p.chords[k].notes)
  }

  const toggleAuto = () => {
    stop.current?.()
    if (auto) {
      setAuto(false)
      return
    }
    setAuto(true)
    stop.current = playSequence(p.chords, {
      loop: true,
      onStep: s => s >= 0 && setI(s),
    })
  }

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'ArrowRight') go(i + 1)
      else if (e.key === 'ArrowLeft') go(i - 1)
      else if (e.key === ' ') {
        e.preventDefault()
        playChord(c.notes)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => () => stop.current?.(), [])

  return (
    <main className="player">
      <header className="cr-head">
        <button className="btn-ghost btn-back" onClick={onClose}>← Notebook</button>
        <div className="pl-title">
          <h1>{p.emoji && <span className="emoji">{p.emoji}</span>}{p.name}</h1>
          <span className="card-key">{rootName(key.tonic, n)} {MODES[key.mode].label}</span>
        </div>
        <button className="btn-ghost" onClick={onEdit}>Edit</button>
      </header>

      <ol className="pl-steps">
        {p.chords.map((x, k) => (
          <li key={k}>
            <button className={`pl-step ${k === i ? 'is-sel' : ''}`} onClick={() => go(k)}>
              <span className="slot-n">{k + 1}</span>
              {chordName(x, n)}
            </button>
          </li>
        ))}
      </ol>

      <section className="stage stage-big">
        <div className="stage-head">
          <div>
            <h2 className="stage-name">{chordName(c, n)}</h2>
            <p className="stage-sub">
              {numeralOf(c, key) && <b>{numeralOf(c, key)} · </b>}
              {c.root != null ? QUALITY[c.quality]?.label : 'free chord'}
            </p>
          </div>
          <NoteCount count={c.notes.length} />
        </div>
        <Keyboard low={settings.lowKey} notes={c.notes} notation={n} onKey={m => playChord([m], 0.6)} />
        <ol className="notes-big">
          {c.notes.map((m, k) => (
            <li key={m}>
              <span className="nb-finger">{k === 0 ? 'lowest' : k === c.notes.length - 1 ? 'highest' : ''}</span>
              <span className="nb-note">{noteName(m, n)}</span>
            </li>
          ))}
        </ol>
      </section>

      <nav className="pl-nav">
        <button className="btn btn-lg" onClick={() => go(i - 1)}>← Previous</button>
        <button className="btn btn-lg" onClick={() => playChord(c.notes)}>Listen</button>
        <button className={`btn btn-lg ${auto ? 'is-on' : ''}`} onClick={toggleAuto}>{auto ? '■ Stop' : '▶ Play all'}</button>
        <button className="btn btn-lg" onClick={() => go(i + 1)}>Next →</button>
      </nav>
    </main>
  )
}
