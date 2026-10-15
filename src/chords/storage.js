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

const PENDING_KEY = LOCAL_KEY + ':pending'

function loadPending() {
  try {
    return new Set(JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function savePending(set) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...set]))
  } catch {
    // ignoré
  }
}

// Corps du document : JSON pur (sans undefined ni NaN), l'id est celui du document.
function toDoc(p) {
  const body = JSON.parse(JSON.stringify(p))
  delete body.id
  return body
}

// Ce que la plateforme dit des droits du visiteur (aide au diagnostic).
async function accessInfo() {
  try {
    const user = await window.claude?.use?.('user')
    if (!user) return 'visiteur non identifié'
    const [owner, write] = await Promise.all([user.isOwner(), user.can('data.write')])
    return `propriétaire : ${owner ? 'oui' : 'non'}, droit d’écriture : ${write == null ? 'inconnu' : write ? 'oui' : 'non'}`
  } catch {
    return 'droits inconnus'
  }
}

// Ouvre le carnet. `onChange(list, mode)` est appelé à chaque mise à jour.
// Un enchaînement que la base refuse reste sur l'appareil (« en attente »)
// et est renvoyé à la prochaine ouverture.
export function openStore(onChange) {
  let local = loadLocal()
  let remote = []
  let pending = loadPending()
  let col = null
  let unsub = null
  let cancelled = false

  const emit = () => {
    if (!col) return onChange(local, 'local')
    const ids = new Set(remote.map(p => p.id))
    const waiting = local.filter(p => pending.has(p.id) && !ids.has(p.id)).map(p => ({ ...p, pending: true }))
    onChange([...remote, ...waiting], 'db')
  }
  onChange(local, 'local')

  const push = async p => {
    await col.doc(p.id).set(toDoc(p))
    pending.delete(p.id)
    savePending(pending)
  }

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
      let migrated = false
      try {
        migrated = !!localStorage.getItem(LOCAL_KEY + ':migrated')
      } catch {
        migrated = true
      }
      if (!migrated) {
        // première connexion : ce qui était enregistré localement part dans la base
        const first = await col.get()
        const known = new Set(first.docs.map(d => d.id))
        for (const p of local) if (!known.has(p.id)) pending.add(p.id)
        try {
          localStorage.setItem(LOCAL_KEY + ':migrated', '1')
        } catch {
          // ignoré
        }
      }
      for (const p of local.filter(x => pending.has(x.id))) {
        try {
          await push(p)
        } catch {
          // reste en attente
        }
      }
      if (cancelled) return
      unsub = col.onSnapshot(
        snap => {
          remote = snap.docs.map(d => ({ ...d.data(), id: d.id }))
          local = [...remote, ...local.filter(p => pending.has(p.id) && !remote.some(r => r.id === p.id))]
          saveLocal(local)
          emit()
        },
        () => {
          col = null
          emit()
        },
      )
    } catch {
      col = null
    }
  })()

  return {
    ready,
    // Résout { synced } : false si la base a refusé (gardé sur l'appareil).
    async save(p) {
      const clean = { ...toDoc(p), id: p.id }
      delete clean.pending
      local = [...local.filter(x => x.id !== p.id), clean]
      saveLocal(local)
      if (!col) {
        emit()
        return { synced: false }
      }
      pending.add(p.id)
      savePending(pending)
      try {
        await push(clean)
        return { synced: true }
      } catch (e) {
        console.warn('carnet-accords: écriture refusée', e?.code, e?.message)
        emit()
        return { synced: false, error: e, access: await accessInfo() }
      }
    },
    async remove(id) {
      local = local.filter(x => x.id !== id)
      saveLocal(local)
      pending.delete(id)
      savePending(pending)
      if (col && remote.some(r => r.id === id)) await col.doc(id).delete()
      else emit()
    },
    close() {
      cancelled = true
      unsub?.()
    },
  }
}
