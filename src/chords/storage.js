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
const HIDDEN_KEY = LOCAL_KEY + ':hidden'

const loadSet = k => {
  try {
    return new Set(JSON.parse(localStorage.getItem(k) || '[]'))
  } catch {
    return new Set()
  }
}
const saveSet = (k, set) => {
  try {
    localStorage.setItem(k, JSON.stringify([...set]))
  } catch {
    // ignoré
  }
}

// Corps du document : JSON pur (sans undefined ni NaN), l'id est celui du document.
function toDoc(p) {
  const body = JSON.parse(JSON.stringify(p))
  delete body.id
  delete body.pending
  delete body.local
  return body
}

// Ce que la plateforme dit des droits du visiteur.
async function canWrite() {
  try {
    const user = await window.claude?.use?.('user')
    if (!user) return null
    if (await user.isOwner()) return true
    return await user.can('data.write')
  } catch {
    return null
  }
}

// Diagnostic affiché dans les réglages : ce que la plateforme dit de ce
// visiteur, et un vrai essai d'écriture (document créé puis supprimé).
export async function diagnose() {
  const out = { db: false, owner: null, canEdit: null, write: null, test: null }
  try {
    const user = await window.claude?.use?.('user')
    if (user) {
      out.owner = await user.isOwner()
      out.canEdit = await user.canEdit()
      out.write = await user.can('data.write')
    }
  } catch {
    // ignoré
  }
  let db = null
  try {
    db = (await window.claude?.use?.('db')) ?? null
  } catch {
    db = null
  }
  if (!db) return out
  out.db = true
  try {
    const ref = db.collection('diagnostic').doc('essai')
    await ref.set({ at: Date.now() })
    await ref.delete()
    out.test = 'ok'
  } catch (e) {
    out.test = e?.code || 'refusé'
  }
  return out
}

// Ouvre le carnet. `onChange(list, mode)` est appelé à chaque mise à jour.
// mode : 'db' (base partagée, écriture OK), 'readonly' (base lisible mais
// écriture refusée : les changements restent dans ce navigateur), 'local'.
// Les enchaînements de ce navigateur ont priorité sur ceux de la base ; un
// enchaînement de la base supprimé ici sans droit d'écriture est masqué.
export function openStore(onChange) {
  let local = loadLocal()
  let remote = []
  const pending = loadSet(PENDING_KEY) // à envoyer dans la base
  const hidden = loadSet(HIDDEN_KEY) // de la base, masqués ici
  let col = null
  let writable = false
  let unsub = null
  let cancelled = false

  const emit = () => {
    if (!col) return onChange(local, 'local')
    const localIds = new Set(local.map(p => p.id))
    const fromDb = remote.filter(p => !hidden.has(p.id) && !(localIds.has(p.id) && pending.has(p.id)))
    const dbIds = new Set(fromDb.map(p => p.id))
    const mine = local.filter(p => !dbIds.has(p.id)).map(p => ({ ...p, local: true }))
    onChange([...fromDb, ...mine], writable ? 'db' : 'readonly')
  }
  onChange(local, 'local')

  const push = async p => {
    await col.doc(p.id).set(toDoc(p))
    pending.delete(p.id)
    saveSet(PENDING_KEY, pending)
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
      writable = (await canWrite()) !== false
      // tout ce qui n'est que dans ce navigateur est à envoyer dès que possible
      const first = await col.get()
      const known = new Set(first.docs.map(d => d.id))
      for (const p of local) if (!known.has(p.id)) pending.add(p.id)
      saveSet(PENDING_KEY, pending)
      if (writable) {
        for (const p of local.filter(x => pending.has(x.id))) {
          try {
            await push(p)
          } catch {
            writable = false
            break
          }
        }
      }
      if (cancelled) return
      unsub = col.onSnapshot(
        snap => {
          remote = snap.docs.map(d => ({ ...d.data(), id: d.id }))
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
    // Résout { synced } : false si gardé seulement dans ce navigateur.
    async save(p) {
      const clean = { ...toDoc(p), id: p.id }
      local = [...local.filter(x => x.id !== p.id), clean]
      saveLocal(local)
      pending.add(p.id)
      saveSet(PENDING_KEY, pending)
      if (col && writable) {
        try {
          await push(clean)
          local = local.filter(x => x.id !== p.id) // la base fait foi
          saveLocal(local)
        } catch (e) {
          console.warn('carnet-accords: écriture refusée', e?.code, e?.message)
          writable = false
        }
      }
      emit()
      return { synced: !col || !pending.has(p.id) }
    },
    async remove(id) {
      local = local.filter(x => x.id !== id)
      saveLocal(local)
      pending.delete(id)
      saveSet(PENDING_KEY, pending)
      if (col && remote.some(r => r.id === id)) {
        let done = false
        if (writable) {
          try {
            await col.doc(id).delete()
            done = true
          } catch {
            writable = false
          }
        }
        if (!done) {
          hidden.add(id)
          saveSet(HIDDEN_KEY, hidden)
        }
      }
      emit()
    },
    // Remplace / ajoute des enchaînements importés (fichier de sauvegarde).
    async importMany(list) {
      for (const p of list) await this.save(p)
    },
    close() {
      cancelled = true
      unsub?.()
    },
  }
}
