// Son interne : grand piano échantillonné (par défaut) ou petit synthé façon
// Juno, et sortie / entrée MIDI (Web MIDI, Chrome & Edge).
import PIANO_SAMPLES from './pianoSamples.js'

let ctx = null
let bus = null
let pianoBus = null
let fmBus = null

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

  // FM : passe par le chorus (bus) et envoie davantage dans la réverbération
  fmBus = ctx.createGain()
  fmBus.gain.value = 1
  fmBus.connect(bus)
  const fmSend = ctx.createGain()
  fmSend.gain.value = 0.55
  fmBus.connect(fmSend).connect(verb)
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

// ---------- FM façon DX7 ----------
// Deux paires d'opérateurs par note : un « corps » doux (modulateur 1:1 dont
// l'indice retombe vite, donc un son rond) et une « lame » brillante (14:1)
// très brève pour l'attaque cristalline des pianos électriques FM. Une
// seconde voix légèrement désaccordée donne l'ampleur ; chorus et réverb.
function fmPair(f, ratio, index0, index1, tau, t0, end, out, detune = 0) {
  const car = ctx.createOscillator()
  car.frequency.value = f
  car.detune.value = detune
  const mod = ctx.createOscillator()
  mod.frequency.value = f * ratio
  mod.detune.value = detune
  const depth = ctx.createGain()
  depth.gain.setValueAtTime(index0 * f * ratio, t0)
  depth.gain.setTargetAtTime(index1 * f * ratio, t0 + 0.005, tau)
  mod.connect(depth).connect(car.frequency)
  car.connect(out)
  for (const o of [car, mod]) {
    o.start(t0)
    o.stop(end)
  }
  return car
}

function fmNote(midi, t0, dur, level) {
  const f = freq(midi)
  const end = t0 + dur + 1.2
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, t0)
  amp.gain.linearRampToValueAtTime(level, t0 + 0.006)
  amp.gain.setTargetAtTime(level * 0.42, t0 + 0.006, 0.9)
  amp.gain.setTargetAtTime(0, t0 + dur, 0.28)
  amp.connect(fmBus)

  const body = ctx.createGain()
  body.gain.value = 0.5
  body.connect(amp)
  fmPair(f, 1, 1.6, 0.35, 0.5, t0, end, body, -4)
  fmPair(f, 1, 1.4, 0.3, 0.6, t0, end, body, 5)

  const tine = ctx.createGain()
  tine.gain.setValueAtTime(0.22, t0)
  tine.gain.setTargetAtTime(0.02, t0, 0.18)
  tine.connect(amp)
  const last = fmPair(f, 14, 1.8, 0, 0.06, t0, end, tine)
  last.onended = () => amp.disconnect()
}

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
    } else if (settings.sound === 'fm') {
      const t0 = ctx.currentTime + 0.01
      const level = 0.3 / Math.sqrt(notes.length)
      notes.forEach(n => fmNote(n, t0, dur, level))
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

// Lecture : un accord par mesure (4 temps), à 120 BPM.
export const PLAYBACK_BPM = 120
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
