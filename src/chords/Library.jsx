import { useEffect, useRef, useState } from 'react'
import Keyboard from './Keyboard.jsx'
import { chordName, spelling, numeralOf, rootName, MODES } from './theory.js'
import { playSequence } from './audio.js'

export default function Library({ list, settings, storeMode, onNew, onEdit, onPlay, onDuplicate, onDelete, onSettings, onExport, onImport }) {
  const [query, setQuery] = useState('')
  const [playing, setPlaying] = useState({ id: null, step: -1 })
  const [confirmDelete, setConfirmDelete] = useState(null)
  const stop = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const fileRef = useRef(null)

  // ferme le menu ⋮ au clic ailleurs ou avec Échap
  useEffect(() => {
    if (!menuOpen) return
    const onDown = e => !menuRef.current?.contains(e.target) && setMenuOpen(false)
    const onKey = e => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])
  const n = settings.notation

  useEffect(() => () => stop.current?.(), [])

  const listen = p => {
    stop.current?.()
    if (playing.id === p.id) {
      setPlaying({ id: null, step: -1 })
      return
    }
    stop.current = playSequence(p.chords, {
      onStep: step => setPlaying(step < 0 ? { id: null, step: -1 } : { id: p.id, step }),
    })
  }

  const q = query.trim().toLowerCase()
  const shown = [...list]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .filter(p => {
      if (!q) return true
      const names = p.chords.map(c => chordName(c, 'en') + ' ' + chordName(c, 'fr')).join(' ')
      return ((p.emoji || '') + ' ' + p.name + ' ' + names).toLowerCase().includes(q)
    })

  return (
    <main className="library">
      <header className="lib-head">
        <div className="brand">
          <span className="brand-stripe" aria-hidden="true"><i /><i /><i /><i /></span>
          <h1>Chord Notebook</h1>
        </div>
        <div className="lib-actions">
          <button className="btn-ghost" onClick={onSettings}>Settings</button>
          <button className="btn-primary" onClick={onNew}>New progression</button>
        </div>
      </header>

      <div className="lib-tools">
        <input
          id="search"
          className="search"
          type="search"
          placeholder="Search by name or chord (e.g. Am7, F)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className="lib-count">
          {list.length} progression{list.length === 1 ? '' : 's'}
        </span>
        <div className="kebab" ref={menuRef}>
          <button
            className="btn-ghost kebab-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            ⋮
          </button>
          {menuOpen && (
            <div className="kebab-menu" role="menu">
              <button
                role="menuitem"
                disabled={!list.length}
                onClick={() => {
                  setMenuOpen(false)
                  onExport()
                }}
              >
                Export a backup
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  fileRef.current?.click()
                }}
              >
                Import a backup
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onImport(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      {storeMode !== 'db' && (
        <p className="store-note">
          {storeMode === 'readonly'
            ? 'Your progressions are saved in this browser: this view can’t write to the notebook’s database.'
            : 'Your progressions are saved in this browser.'}{' '}
          Remember to <button className="link" onClick={onExport} disabled={!list.length}>export a backup</button> now and then.
        </p>
      )}

      {list.length === 0 && (
        <section className="empty">
          <Keyboard low={settings.lowKey} notes={[57, 60, 64, 67]} notation={n} />
          <h2>Your notebook is empty</h2>
          <p>
            Create a first progression of 2 to 5 chords. Each chord is written key by key on a 37-key
            keyboard, with 4 notes preferred for the JU-06A.
          </p>
          <button className="btn-primary" onClick={onNew}>Create my first progression</button>
        </section>
      )}

      {list.length > 0 && shown.length === 0 && <p className="muted">No progression matches “{query}”.</p>}

      <ul className="cards">
        {shown.map(p => (
          <li key={p.id} className="card">
            <div className="card-head">
              <button className="card-title" onClick={() => onPlay(p)}>
                <h2>{p.emoji && <span className="emoji">{p.emoji}</span>}{p.name || 'Untitled'}</h2>
                <span className="card-key">
                  {rootName(p.key?.tonic ?? 0, n)} {MODES[p.key?.mode || 'major'].label} · {p.chords.length} chords
                </span>
              </button>
              <button
                className={`btn-round ${playing.id === p.id ? 'is-on' : ''}`}
                onClick={() => listen(p)}
                aria-label={playing.id === p.id ? 'Stop' : 'Listen'}
              >
                {playing.id === p.id ? '■' : '▶'}
              </button>
            </div>
            <ol className="card-chords">
              {p.chords.map((c, i) => (
                <li key={i} className={playing.id === p.id && playing.step === i ? 'is-playing' : ''}>
                  <span className="cc-name">{chordName(c, spelling(n, p.key))}</span>
                  <span className="cc-num">{numeralOf(c, p.key || { tonic: 0, mode: 'major' })}</span>
                  <Keyboard low={settings.lowKey} notes={c.notes} mini labels={false} />
                </li>
              ))}
            </ol>
            <div className="card-actions">
              <button className="btn" onClick={() => onPlay(p)}>Play</button>
              <button className="btn-ghost" onClick={() => onEdit(p)}>Edit</button>
              <button className="btn-ghost" onClick={() => onDuplicate(p)}>Duplicate</button>
              {confirmDelete === p.id ? (
                <span className="confirm">
                  <button className="btn-danger" onClick={() => onDelete(p.id)}>Delete for good</button>
                  <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                </span>
              ) : (
                <button className="btn-ghost btn-quiet-danger" onClick={() => setConfirmDelete(p.id)}>Delete</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
