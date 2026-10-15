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
  const [notice, setNotice] = useState('')
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
    delete item.local
    const res = await store.current.save(item)
    return { ...item, synced: res.synced }
  }

  const remove = id => store.current.remove(id)

  // Sauvegarde : un fichier JSON de tout le carnet, réimportable.
  const exportBackup = async () => {
    const data = JSON.stringify({ app: 'carnet-accords', version: 1, progressions: list.map(p => ({ ...p, local: undefined })) }, null, 2)
    const filename = `carnet-accords-${new Date().toISOString().slice(0, 10)}.json`
    try {
      const downloads = await window.claude?.use?.('downloads')
      if (downloads) {
        await downloads.save({ filename, data })
        setNotice('Sauvegarde enregistrée.')
        return
      }
    } catch (e) {
      if (e?.code === 'declined') return
    }
    try {
      await navigator.clipboard.writeText(data)
      setNotice('Téléchargement indisponible ici : la sauvegarde a été copiée dans le presse-papiers.')
    } catch {
      setError('Impossible d’exporter la sauvegarde depuis cette vue.')
    }
  }

  const importBackup = async file => {
    try {
      const data = JSON.parse(await file.text())
      const incoming = (data.progressions || []).filter(p => p && Array.isArray(p.chords) && p.chords.length)
      await store.current.importMany(incoming.map(p => ({ ...p, id: p.id || newId() })))
      setNotice(`${incoming.length} enchaînement${incoming.length > 1 ? 's' : ''} importé${incoming.length > 1 ? 's' : ''}.`)
    } catch {
      setError('Ce fichier n’est pas une sauvegarde du carnet d’accords.')
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
      {notice && (
        <div className="toast toast-ok" role="status">
          {notice}
          <button className="btn-ghost" onClick={() => setNotice('')}>Fermer</button>
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
          onExport={exportBackup}
          onImport={importBackup}
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
