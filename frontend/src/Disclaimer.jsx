import { useEffect } from 'react'
import { useI18n } from './i18n'

// Disclaimer modale: cos'è l'app, metodologia, limiti. Si apre all'avvio
// (la prima volta) e dal pulsante ℹ️ nell'header.
export default function Disclaimer({ open, onClose }) {
  const { disclaimer: d } = useI18n()

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={d.title}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="×">×</button>
        <h2 className="modal-title">🏔️ {d.title}</h2>

        <section className="modal-sec">
          <h3>{d.whatH}</h3>
          <p>{d.whatP}</p>
        </section>

        <section className="modal-sec">
          <h3>{d.methodH}</h3>
          <ul>{d.methodLi.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>

        <section className="modal-sec">
          <h3>⚠️ {d.limitsH}</h3>
          <ul>{d.limitsLi.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>

        <button className="modal-cta" onClick={onClose}>{d.cta}</button>
      </div>
    </div>
  )
}
