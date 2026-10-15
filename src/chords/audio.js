// Son interne : grand piano échantillonné (par défaut) ou petit synthé façon
// Juno, et sortie / entrée MIDI (Web MIDI, Chrome & Edge).
import PIANO_SAMPLES from './pianoSamples.js'

let ctx = null
let bus = null
let pianoBus = null

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

  // piano : sortie directe + petite réverbération de pièce
  pianoBus = ctx.createGain()
  pianoBus.gain.value = 0.9
  pianoBus.connect(comp)
  const verb = ctx.createConvolver()
  verb.buffer = roomImpulse(1.4)
  const verbWet = ctx.createGain()
  verbWet.gain.value = 0.18
  pianoBus.connect(verb).connect(verbWet).connect(comp)
  return ctx
}

function roomImpulse(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  }
  return buf
}

// ---------- Piano ----------

let pianoBuffers = null // [{ midi, buffer }]
let pianoLoading = null

function loadPiano() {
  if (pianoLoading) return pianoLoading
  pianoLoading = Promise.all(
    Object.entries(PIANO_SAMPLES).map(async ([midi, b64]) => {
      const bytes = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))
      return { midi: +midi, buffer: await ctx.decodeAudioData(bytes.buffer) }
    }),
  ).then(list => {
    pianoBuffers = list.sort((a, b) => a.midi - b.midi)
    return pianoBuffers
  })
  return pianoLoading
}

function pianoNote(midi, t0, dur, level) {
  const s = pianoBuffers.reduce((a, b) => (Math.abs(b.midi - midi) < Math.abs(a.midi - midi) ? b : a))
  const src = ctx.createBufferSource()
  src.buffer = s.buffer
  src.playbackRate.value = 2 ** ((midi - s.midi) / 12)
  const g = ctx.createGain()
  g.gain.setValueAtTime(level, t0)
  g.gain.setTargetAtTime(0, t0 + dur, 0.07) // relâché de la touche
  src.connect(g).connect(pianoBus)
  src.start(t0)
  src.stop(t0 + dur + 0.5)
  src.onended = () => g.disconnect()
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
  if (!navigator.requestMIDIAccess) throw new Error('Web MIDI isn’t available in this browser (use Chrome or Edge).')
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

let settings = { internal: true, sound: 'piano', channel: 0 }
export function configureAudio(s) {
  settings = { ...settings, ...s }
}

export function playChord(notes, dur = 0.9) {
  if (!notes?.length) return
  if (settings.internal) {
    ensureCtx()
    if (settings.sound === 'synth') {
      const t0 = ctx.currentTime + 0.01
      const level = 0.22 / Math.sqrt(notes.length)
      notes.forEach(n => voice(n, t0, dur, level))
    } else {
      const start = () => {
        const t0 = ctx.currentTime + 0.01
        const level = 0.9 / Math.sqrt(notes.length)
        notes.forEach(n => pianoNote(n, t0, dur, level))
      }
      if (pianoBuffers) start()
      else {
        // premier son : on décode les échantillons, puis on joue si c'est encore d'actualité
        const asked = performance.now()
        loadPiano().then(() => performance.now() - asked < 1500 && start())
      }
    }
  }
  if (output) {
    const ch = settings.channel & 0x0f
    notes.forEach(n => output.send([0x90 | ch, n, 96]))
    const off = notes.map(n => [0x80 | ch, n, 0])
    setTimeout(() => off.forEach(m => output?.send(m)), dur * 1000 - 20)
  }
}

// Lecture : un accord par mesure (4 temps), à 110 BPM.
export const PLAYBACK_BPM = 110
const BEATS_PER_CHORD = 4

// Joue un enchaînement ; renvoie une fonction d'arrêt.
export function playSequence(chords, { loop = false, onStep, onEnd }) {
  const stepMs = (60000 / PLAYBACK_BPM) * BEATS_PER_CHORD
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
    playChord(chords[i].notes, stepMs / 1000 - 0.08)
    i++
    timer = setTimeout(tick, stepMs)
  }
  tick()
  return () => {
    clearTimeout(timer)
    onStep?.(-1)
  }
}
