import { useEffect, useRef, useState } from 'react'
import Keyboard from './Keyboard.jsx'
import { chordName, makeChord, rangeOf, spelling } from './theory.js'
import { extractProgressions, askClaudeForChords } from './importer.js'
import { playSequence } from './audio.js'
import { IconClose, IconEdit, IconPlay, IconSearch, IconStop } from './Icons.jsx'

const isMinorish = q => /^m(?!aj)|dim|m7b5/.test(q || '')

// Voicings enchaînés (voice leading) pour une grille trouvée.
function voice(found, settings) {
  const range = rangeOf(settings)
  let prev = null
  const chords = found.chords.map(c => {
    const chord = makeChord(c.root, c.quality, { prev, range, rootPosition: true })
    prev = chord.notes
    return chord
  })
  const first = found.chords[0]
  return { ...found, chords, key: { tonic: first.root, mode: isMinorish(first.quality) ? 'minor' : 'major' } }
}

export default function FindChords({ settings, onOpen, onClose }) {
  const [text, setText] = useState('')
  const [results, setResults] = useState(null)
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [playing, setPlaying] = useState(-1)
  const stop = useRef(null)

  useEffect(() => () => stop.current?.(), [])
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const find = async () => {
    stop.current?.()
    setPlaying(-1)
    setMessage('')
    const found = extractProgressions(text)
    if (found.length) {
      setResults(found.map(f => voice(f, settings)))
      setSource('text')
      return
    }
    // Pas d'accords dans le texte : on le traite comme un titre de chanson.
    setBusy(true)
    setResults(null)
    try {
      const fromClaude = await askClaudeForChords(text.trim())
      setResults(fromClaude.map(f => voice(f, settings)))
      setSource('claude')
      if (!fromClaude.length) setMessage('Claude doesn’t know this song. Paste a text that contains its chords instead.')
    } catch (e) {
      setMessage(
        e?.code === 'not_granted'
          ? 'No chords found in this text, and song search isn’t available in this view. Paste a text that contains chords (e.g. E – C#m – B – A).'
          : e?.code === 'rate_limited'
            ? 'Too many searches in a row. Wait a moment and try again.'
            : 'The song search failed. Try again, or paste a text that contains chords.',
      )
    } finally {
      setBusy(false)
    }
  }

  const listen = (r, i) => {
    stop.current?.()
    if (playing === i) {
      setPlaying(-1)
      return
    }
    stop.current = playSequence(r.chords, { onStep: s => setPlaying(s < 0 ? -1 : i) })
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-label="Find chords" onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Find chords</h2>
          <button className="btn-ghost" onClick={onClose}><IconClose />Close</button>
        </header>

        <label className="field">
          <span>Song title, or any text with chords</span>
          <textarea
            id="find-input"
            rows="5"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && text.trim() && find()}
            placeholder={'Virgin Suicide Columbine\n\nor paste: Accords principaux : E – C#m – B – A …'}
          />
        </label>
        <button className="btn-primary find-go" onClick={find} disabled={!text.trim() || busy}>
          <IconSearch />{busy ? 'Searching…' : 'Find'}
        </button>

        {message && <p className="status">{message}</p>}

        {results && results.length > 0 && (
          <>
            {source === 'claude' && (
              <p className="muted">Suggested by Claude from memory. Check them against the recording.</p>
            )}
            <ul className="found">
              {results.map((r, i) => {
                const n = spelling(settings.notation, r.key)
                return (
                  <li key={i} className="found-item">
                    <div className="found-head">
                      <h3 className="found-title">{r.title || 'Chords found'}</h3>
                      {r.total > r.chords.length && <span className="pill pill-warn">first 5 of {r.total}</span>}
                    </div>
                    <ol className="card-chords">
                      {r.chords.map((c, k) => (
                        <li key={k}>
                          <span className="cc-name">{chordName(c, n)}</span>
                          <Keyboard low={settings.lowKey} notes={c.notes} mini labels={false} />
                        </li>
                      ))}
                    </ol>
                    <div className="card-actions">
                      <button className="btn-primary" onClick={() => listen(r, i)} aria-pressed={playing === i}>
                        {playing === i ? <><IconStop />Stop</> : <><IconPlay />Play</>}
                      </button>
                      <button
                        className="btn"
                        onClick={() => {
                          stop.current?.()
                          onOpen({ name: r.title || '', key: r.key, chords: r.chords })
                        }}
                      >
                        <IconEdit />Open in editor
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
