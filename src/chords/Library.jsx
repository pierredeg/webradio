import { useEffect, useRef, useState } from 'react'
import Keyboard from './Keyboard.jsx'
import { chordName, numeralOf, rootName, MODES } from './theory.js'
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
          <h1>Carnet d’accords</h1>
        </div>
        <div className="lib-actions">
          <button className="btn-ghost" onClick={onSettings}>Réglages</button>
          <button className="btn-primary" onClick={onNew}>Nouvel enchaînement</button>
        </div>
      </header>

      <div className="lib-tools">
        <input
          id="search"
          className="search"
          type="search"
          placeholder="Chercher par nom ou par accord (ex. Am7, Fa)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <span className="lib-count">
          {list.length} enchaînement{list.length > 1 ? 's' : ''}
        </span>
        <div className="kebab" ref={menuRef}>
          <button
            className="btn-ghost kebab-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Plus d’options"
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
                Exporter une sauvegarde
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  fileRef.current?.click()
                }}
              >
                Importer une sauvegarde
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
            ? 'Tes enchaînements sont enregistrés dans ce navigateur : cette vue n’a pas le droit d’écrire dans la base du carnet.'
            : 'Tes enchaînements sont enregistrés dans ce navigateur.'}{' '}
          Pense à <button className="link" onClick={onExport} disabled={!list.length}>exporter une sauvegarde</button> de temps en temps.
        </p>
      )}

      {list.length === 0 && (
        <section className="empty">
          <Keyboard low={settings.lowKey} notes={[57, 60, 64, 67]} notation={n} />
          <h2>Ton carnet est vide</h2>
          <p>
            Crée un premier enchaînement de 2 à 5 accords. Chaque accord est noté touche par touche sur un clavier
            37 touches, en 4 notes de préférence pour le JU-06A.
          </p>
          <button className="btn-primary" onClick={onNew}>Créer mon premier enchaînement</button>
        </section>
      )}

      {list.length > 0 && shown.length === 0 && <p className="muted">Aucun enchaînement ne correspond à « {query} ».</p>}

      <ul className="cards">
        {shown.map(p => (
          <li key={p.id} className="card">
            <div className="card-head">
              <button className="card-title" onClick={() => onPlay(p)}>
                <h2>{p.emoji && <span className="emoji">{p.emoji}</span>}{p.name || 'Sans nom'}</h2>
                <span className="card-key">
                  {rootName(p.key?.tonic ?? 0, n)} {MODES[p.key?.mode || 'major'].label} · {p.chords.length} accords
                </span>
              </button>
              <button
                className={`btn-round ${playing.id === p.id ? 'is-on' : ''}`}
                onClick={() => listen(p)}
                aria-label={playing.id === p.id ? 'Arrêter' : 'Écouter'}
              >
                {playing.id === p.id ? '■' : '▶'}
              </button>
            </div>
            <ol className="card-chords">
              {p.chords.map((c, i) => (
                <li key={i} className={playing.id === p.id && playing.step === i ? 'is-playing' : ''}>
                  <span className="cc-name">{chordName(c, n)}</span>
                  <span className="cc-num">{numeralOf(c, p.key || { tonic: 0, mode: 'major' })}</span>
                  <Keyboard low={settings.lowKey} notes={c.notes} mini labels={false} />
                </li>
              ))}
            </ol>
            <div className="card-actions">
              <button className="btn" onClick={() => onPlay(p)}>Jouer</button>
              <button className="btn-ghost" onClick={() => onEdit(p)}>Modifier</button>
              <button className="btn-ghost" onClick={() => onDuplicate(p)}>Dupliquer</button>
              {confirmDelete === p.id ? (
                <span className="confirm">
                  <button className="btn-danger" onClick={() => onDelete(p.id)}>Supprimer définitivement</button>
                  <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Annuler</button>
                </span>
              ) : (
                <button className="btn-ghost btn-quiet-danger" onClick={() => setConfirmDelete(p.id)}>Supprimer</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
