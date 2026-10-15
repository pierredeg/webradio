// Enchaînements : base de données de l'artifact (durable) si disponible,
// sinon localStorage. Réglages : toujours en local (confort par appareil).

const LOCAL_KEY = 'carnet-accords:v1'
const SETTINGS_KEY = 'carnet-accords:settings'

export const DEFAULT_SETTINGS = {
  notation: 'en', // 'en' (C D E) ou 'fr' (Do Ré Mi)
  lowKey: 48, // première touche du clavier 37 touches (48 = C3)
  sevenths: true, // suggestions en accords 4 sons
  internal: true, // son interne
  sound: 'piano', // 'piano' ou 'synth'
  bpm: 72,
  midiIn: '',
  midiOut: '',
}

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    return { ...DEFAULT_SETTINGS, ...saved, midiIn: '', midiOut: '' }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s) {
  try {
    // les périphériques MIDI se reconnectent à chaque visite : on ne les garde pas
    const rest = { ...s }
    delete rest.midiIn
    delete rest.midiOut
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest))
  } catch {
    // stockage indisponible : réglages valables pour cette visite seulement
  }
}

function loadLocal() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function saveLocal(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
  } catch {
    // ignoré
  }
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// Ouvre le carnet. `onChange(list, mode)` est appelé à chaque mise à jour.
export function openStore(onChange) {
  let local = loadLocal()
  let col = null
  let unsub = null
  let cancelled = false
  onChange(local, 'local')

  const ready = (async () => {
    let db = null
    try {
      db = (await window.claude?.use?.('db')) ?? null
    } catch {
      db = null
    }
    if (!db || cancelled) return
    try {
      col = db.collection('progressions')
      // première connexion : ce qui était enregistré localement part dans la base
      if (!localStorage.getItem(LOCAL_KEY + ':migrated')) {
        const first = await col.get()
        const known = new Set(first.docs.map(d => d.id))
        for (const p of local) if (!known.has(p.id)) await col.doc(p.id).set(p)
        try { localStorage.setItem(LOCAL_KEY + ':migrated', '1') } catch { /* ignoré */ }
      }
      if (cancelled) return
      unsub = col.onSnapshot(
        snap => {
          local = snap.docs.map(d => ({ ...d.data(), id: d.id }))
          saveLocal(local)
          onChange(local, 'db')
        },
        () => {
          col = null
          onChange(local, 'local')
        },
      )
    } catch {
      col = null
    }
  })()

  return {
    ready,
    async save(p) {
      local = [...local.filter(x => x.id !== p.id), p]
      saveLocal(local)
      if (col) await col.doc(p.id).set(p)
      else onChange(local, 'local')
    },
    async remove(id) {
      local = local.filter(x => x.id !== id)
      saveLocal(local)
      if (col) await col.doc(id).delete()
      else onChange(local, 'local')
    },
    close() {
      cancelled = true
      unsub?.()
    },
  }
}
