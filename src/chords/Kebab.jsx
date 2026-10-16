import { useEffect, useRef, useState } from 'react'
import { IconMore } from './Icons.jsx'

// Bouton ⋮ et son menu. items : [{ label, onClick, disabled, danger, confirm }]
// `confirm` : libellé de la seconde étape (ex. « Delete for good »).
export default function Kebab({ items, label = 'More options', className = '', children }) {
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => !ref.current?.contains(e.target) && close()
    const onKey = e => e.key === 'Escape' && close()
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    setAsking(null)
  }

  return (
    <div className={`kebab ${className}`} ref={ref}>
      <button className="btn-ghost kebab-btn" onClick={() => (open ? close() : setOpen(true))} aria-label={label} aria-haspopup="menu" aria-expanded={open}>
        <IconMore />
      </button>
      {open && (
        <div className="kebab-menu" role="menu">
          {asking ? (
            <>
              <button role="menuitem" className="is-danger" onClick={() => { close(); asking.onClick() }}>{asking.confirm}</button>
              <button role="menuitem" onClick={() => setAsking(null)}>Cancel</button>
            </>
          ) : (
            items.map(it => (
              <button
                key={it.label}
                role="menuitem"
                className={it.danger ? 'is-danger' : ''}
                disabled={it.disabled}
                onClick={() => (it.confirm ? setAsking(it) : (close(), it.onClick()))}
              >
                {it.icon}
                {it.label}
              </button>
            ))
          )}
        </div>
      )}
      {children}
    </div>
  )
}
