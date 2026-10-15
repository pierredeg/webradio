import { useEffect, useState } from 'react'
import { initMidi, midiDevices, onMidi, setMidiInput, setMidiOutput } from './audio.js'

export default function Settings({ settings, setSettings, onClose }) {
  const [devices, setDevices] = useState({ inputs: [], outputs: [] })
  const [midiError, setMidiError] = useState('')

  const connect = async () => {
    try {
      await initMidi()
      setDevices(midiDevices())
      setMidiError('')
    } catch (e) {
      setMidiError(e?.message || 'Accès MIDI refusé par le navigateur.')
    }
  }

  useEffect(() => onMidi(e => e.type === 'devices' && setDevices(midiDevices())), [])

  const chooseOut = id => {
    setMidiOutput(id)
    setSettings({ midiOut: id })
  }
  const chooseIn = id => {
    setMidiInput(id)
    setSettings({ midiIn: id })
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="Réglages" onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Réglages</h2>
          <button className="btn-ghost" onClick={onClose}>Fermer</button>
        </header>

        <label className="field">
          <span>Noms des notes</span>
          <select id="set-notation" value={settings.notation} onChange={e => setSettings({ notation: e.target.value })}>
            <option value="en">C D E F G A B</option>
            <option value="fr">Do Ré Mi Fa Sol La Si</option>
          </select>
        </label>

        <label className="field">
          <span>Première touche de ton clavier 37 touches</span>
          <select id="set-low" value={settings.lowKey} onChange={e => setSettings({ lowKey: +e.target.value })}>
            <option value={36}>C2 (clavier C2–C5)</option>
            <option value={48}>C3 (clavier C3–C6)</option>
          </select>
        </label>

        <label className="check">
          <input id="set-sevenths" type="checkbox" checked={settings.sevenths} onChange={e => setSettings({ sevenths: e.target.checked })} />
          Suggérer des accords 4 sons (sinon triades)
        </label>

        <label className="check">
          <input id="set-internal" type="checkbox" checked={settings.internal} onChange={e => setSettings({ internal: e.target.checked })} />
          Son interne
        </label>

        <section className="midi">
          <h3>MIDI</h3>
          <p className="muted">
            Envoie les accords vers ton JU-06A en USB, ou capture un accord joué sur ton clavier. Fonctionne dans
            Chrome ou Edge, si la page a le droit d’accéder au MIDI.
          </p>
          {!devices.inputs.length && !devices.outputs.length && (
            <button className="btn" onClick={connect}>Connecter le MIDI</button>
          )}
          {midiError && <p className="status status-bad">{midiError}</p>}
          {(devices.inputs.length > 0 || devices.outputs.length > 0) && (
            <>
              <label className="field">
                <span>Sortie (vers le synthé)</span>
                <select id="set-midi-out" value={settings.midiOut} onChange={e => chooseOut(e.target.value)}>
                  <option value="">Aucune</option>
                  {devices.outputs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Entrée (capture depuis le clavier)</span>
                <select id="set-midi-in" value={settings.midiIn} onChange={e => chooseIn(e.target.value)}>
                  <option value="">Aucune</option>
                  {devices.inputs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
