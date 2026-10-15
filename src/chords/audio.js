// Son interne (petit synthé façon Juno : scies désaccordées + chorus)
// et sortie / entrée MIDI (Web MIDI, Chrome & Edge).

let ctx = null
let bus = null

function ensureCtx() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.connect(ctx.destination)

  bus = ctx.createGain()
  bus.gain.value = 0.6
  bus.connect(comp)

  // chorus stéréo : deux lignes de retard modulées en opposition
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.6
  lfo.start()
  for (const [pan, sign] of [[-0.7, 1], [0.7, -1]]) {
    const d = ctx.createDelay()
    d.delayTime.value = 0.012
    const depth = ctx.createGain()
    depth.gain.value = 0.0025 * sign
    lfo.connect(depth).connect(d.delayTime)
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    const wet = ctx.createGain()
    wet.gain.value = 0.5
    bus.connect(d).connect(wet).connect(p).connect(comp)
  }
  return ctx
}

const freq = midi => 440 * 2 ** ((midi - 69) / 12)

function voice(midi, t0, dur, level) {
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, t0)
  // attaque nette, decay rapide vers un sustain bas, release court
  out.gain.linearRampToValueAtTime(level, t0 + 0.015)
  out.gain.setTargetAtTime(level * 0.3, t0 + 0.015, 0.12)
  out.gain.setTargetAtTime(0, t0 + dur, 0.05)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 3
  filter.frequency.setValueAtTime(500, t0)
  filter.frequency.linearRampToValueAtTime(2600, t0 + 0.03)
  filter.frequency.setTargetAtTime(1000, t0 + 0.03, 0.15)
  filter.connect(out).connect(bus)

  const oscs = [[-7, 'sawtooth', 1], [7, 'sawtooth', 1], [0, 'square', 0.35]].map(([detune, type, g]) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = type === 'square' ? freq(midi) / 2 : freq(midi)
    o.detune.value = detune
    const gain = ctx.createGain()
    gain.gain.value = g
    o.connect(gain).connect(filter)
    o.start(t0)
    o.stop(t0 + dur + 0.4)
    return o
  })
  oscs[0].onended = () => out.disconnect()
}

// ---------- MIDI ----------

let midiAccess = null
let output = null
const listeners = new Set()

export async function initMidi() {
  if (midiAccess) return midiAccess
  if (!navigator.requestMIDIAccess) throw new Error('Web MIDI indisponible dans ce navigateur (utilise Chrome ou Edge).')
  midiAccess = await navigator.requestMIDIAccess()
  midiAccess.onstatechange = () => listeners.forEach(fn => fn({ type: 'devices' }))
  return midiAccess
}

export function midiDevices() {
  if (!midiAccess) return { inputs: [], outputs: [] }
  const list = m => [...m.values()].map(d => ({ id: d.id, name: d.name }))
  return { inputs: list(midiAccess.inputs), outputs: list(midiAccess.outputs) }
}

export function setMidiOutput(id) {
  output = id && midiAccess ? midiAccess.outputs.get(id) || null : null
}

let input = null
export function setMidiInput(id) {
  if (input) input.onmidimessage = null
  input = id && midiAccess ? midiAccess.inputs.get(id) || null : null
  if (input) {
    input.onmidimessage = e => {
      const [status, note, vel] = e.data
      const type = status & 0xf0
      if (type === 0x90 && vel > 0) listeners.forEach(fn => fn({ type: 'on', note }))
      else if (type === 0x80 || (type === 0x90 && vel === 0)) listeners.forEach(fn => fn({ type: 'off', note }))
    }
  }
}

export function onMidi(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---------- Lecture ----------

let settings = { internal: true, channel: 0 }
export function configureAudio(s) {
  settings = { ...settings, ...s }
}

export function playChord(notes, dur = 0.9) {
  if (!notes?.length) return
  if (settings.internal) {
    ensureCtx()
    const t0 = ctx.currentTime + 0.01
    const level = 0.22 / Math.sqrt(notes.length)
    notes.forEach(n => voice(n, t0, dur, level))
  }
  if (output) {
    const ch = settings.channel & 0x0f
    notes.forEach(n => output.send([0x90 | ch, n, 96]))
    const off = notes.map(n => [0x80 | ch, n, 0])
    setTimeout(() => off.forEach(m => output?.send(m)), dur * 1000 - 20)
  }
}

// Joue un enchaînement ; renvoie une fonction d'arrêt.
export function playSequence(chords, { bpm = 80, beats = 4, loop = false, onStep, onEnd }) {
  const stepMs = (60000 / bpm) * beats
  let i = 0
  let timer = null
  const tick = () => {
    if (i >= chords.length) {
      if (!loop) {
        onStep?.(-1)
        onEnd?.()
        return
      }
      i = 0
    }
    onStep?.(i)
    playChord(chords[i].notes, Math.min(stepMs / 1000 - 0.08, 1.2))
    i++
    timer = setTimeout(tick, stepMs)
  }
  tick()
  return () => {
    clearTimeout(timer)
    onStep?.(-1)
  }
}
