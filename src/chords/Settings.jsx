import { useEffect, useState } from 'react'
import { initMidi, midiDevices, onMidi, setMidiInput, setMidiOutput } from './audio.js'
import { diagnose } from './storage.js'

const yesNo = v => (v == null ? 'unknown' : v ? 'yes' : 'no')

export default function Settings({ settings, setSettings, onClose, onImportText }) {
  const [diag, setDiag] = useState(null)
  const [pasted, setPasted] = useState('')
  const runDiag = async () => {
    setDiag('…')
    setDiag(await diagnose())
  }
  const [devices, setDevices] = useState({ inputs: [], outputs: [] })
  const [midiError, setMidiError] = useState('')

  const connect = async () => {
    try {
      await initMidi()
      setDevices(midiDevices())
      setMidiError('')
    } catch (e) {
      setMidiError(e?.message || 'The browser refused MIDI access.')
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
      <div className="modal" role="dialog" aria-label="Settings" onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Settings</h2>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </header>

        <label className="field">
          <span>Note names</span>
          <select id="set-notation" value={settings.notation} onChange={e => setSettings({ notation: e.target.value })}>
            <option value="en">C D E F G A B</option>
            <option value="fr">Do Ré Mi Fa Sol La Si (solfège)</option>
          </select>
        </label>

        <label className="field">
          <span>Lowest key of your 37-key keyboard</span>
          <select id="set-low" value={settings.lowKey} onChange={e => setSettings({ lowKey: +e.target.value })}>
            <option value={36}>C2 (keyboard C2–C5)</option>
            <option value={48}>C3 (keyboard C3–C6)</option>
          </select>
        </label>

        <label className="check">
          <input id="set-sevenths" type="checkbox" checked={settings.sevenths} onChange={e => setSettings({ sevenths: e.target.checked })} />
          Suggest seventh chords (otherwise triads)
        </label>

        <label className="field">
          <span>Sound</span>
          <select id="set-sound" value={settings.sound} onChange={e => setSettings({ sound: e.target.value })}>
            <option value="piano">Grand piano</option>
            <option value="synth">Synth (Juno style)</option>
          </select>
        </label>

        <label className="check">
          <input id="set-internal" type="checkbox" checked={settings.internal} onChange={e => setSettings({ internal: e.target.checked })} />
          Built-in sound
        </label>

        <section className="midi">
          <h3>Storage</h3>
          <p className="muted">
            Check whether this page may write to the notebook’s database, the one all your devices see.
          </p>
          <button className="btn" onClick={runDiag} disabled={diag === '…'}>Check database access</button>
          {diag && diag !== '…' && (
            <ul className="diag">
              <li>Database available: <b>{yesNo(diag.db)}</b></li>
              <li>Recognized as owner: <b>{yesNo(diag.owner)}</b></li>
              <li>Edit right: <b>{yesNo(diag.canEdit)}</b></li>
              <li>Write right reported: <b>{yesNo(diag.write)}</b></li>
              <li>Write test: <b className={diag.test === 'ok' ? 'ok' : 'bad'}>{diag.test === 'ok' ? 'passed' : diag.test ? `refused (${diag.test})` : 'not possible'}</b></li>
            </ul>
          )}
          <label className="field">
            <span>Paste a backup (exported text)</span>
            <textarea id="paste-backup" rows="3" value={pasted} onChange={e => setPasted(e.target.value)} placeholder='{"app": "carnet-accords", …}' />
          </label>
          <button
            className="btn"
            disabled={!pasted.trim()}
            onClick={async () => {
              if (await onImportText(pasted)) setPasted('')
            }}
          >
            Import this text
          </button>
        </section>

        <section className="midi">
          <h3>MIDI</h3>
          <p className="muted">
            Send chords to your JU-06A over USB, or capture a chord played on your keyboard. Works in
            Chrome or Edge, if the page is allowed MIDI access.
          </p>
          {!devices.inputs.length && !devices.outputs.length && (
            <button className="btn" onClick={connect}>Connect MIDI</button>
          )}
          {midiError && <p className="status status-bad">{midiError}</p>}
          {(devices.inputs.length > 0 || devices.outputs.length > 0) && (
            <>
              <label className="field">
                <span>Output (to the synth)</span>
                <select id="set-midi-out" value={settings.midiOut} onChange={e => chooseOut(e.target.value)}>
                  <option value="">None</option>
                  {devices.outputs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Input (capture from the keyboard)</span>
                <select id="set-midi-in" value={settings.midiIn} onChange={e => chooseIn(e.target.value)}>
                  <option value="">None</option>
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
