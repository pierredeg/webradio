import { useEffect, useRef, useState } from 'react'
import Library from './Library.jsx'
import Creator from './Creator.jsx'
import Player from './Player.jsx'
import Settings from './Settings.jsx'
import { openStore, loadSettings, saveSettings, newId } from './storage.js'
import { configureAudio } from './audio.js'

export default function App() {
  const [list, setList] = useState([])
  const [storeMode, setStoreMode] = useState('local')
  const [settings, setSettingsState] = useState(loadSettings)
  const [view, setView] = useState({ name: 'library' })
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState('')
  const store = useRef(null)

  useEffect(() => {
    const s = openStore((l, mode) => {
      setList(l)
      setStoreMode(mode)
    })
    store.current = s
    return () => s.close()
  }, [])

  useEffect(() => configureAudio({ internal: settings.internal, sound: settings.sound }), [settings.internal, settings.sound])

  const setSettings = patch =>
    setSettingsState(s => {
      const next = { ...s, ...patch }
      saveSettings(next)
      return next
    })

  const save = async p => {
    const now = Date.now()
    const item = { ...p, id: p.id || newId(), createdAt: p.createdAt || now, updatedAt: now }
    try {
      await store.current.save(item)
      setError('')
      return item
    } catch (e) {
      setError("L'enregistrement a échoué : " + (e?.message || 'base indisponible') + '. Réessaie dans un instant.')
      throw e
    }
  }

  const remove = async id => {
    try {
      await store.current.remove(id)
    } catch (e) {
      setError('Suppression impossible : ' + (e?.message || 'base indisponible'))
    }
  }

  const duplicate = p => save({ ...p, id: undefined, createdAt: undefined, name: p.name + ' (copie)' })

  const current = view.id ? list.find(p => p.id === view.id) : null

  return (
    <div className={`app view-${view.name}`}>
      {error && (
        <div className="toast toast-error" role="alert">
          {error}
          <button className="btn-ghost" onClick={() => setError('')}>Fermer</button>
        </div>
      )}
      {view.name === 'library' && (
        <Library
          list={list}
          settings={settings}
          storeMode={storeMode}
          onNew={() => setView({ name: 'create' })}
          onEdit={p => setView({ name: 'create', id: p.id })}
          onPlay={p => setView({ name: 'play', id: p.id })}
          onDuplicate={duplicate}
          onDelete={remove}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {view.name === 'create' && (
        <Creator
          key={view.id || 'new'}
          initial={current}
          settings={settings}
          setSettings={setSettings}
          onSave={save}
          onClose={() => setView({ name: 'library' })}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {view.name === 'play' && current && (
        <Player
          progression={current}
          settings={settings}
          onClose={() => setView({ name: 'library' })}
          onEdit={() => setView({ name: 'create', id: current.id })}
        />
      )}
      {showSettings && <Settings settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
