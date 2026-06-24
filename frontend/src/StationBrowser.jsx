import { useMemo, useState } from 'react'
import { STOP_TYPES } from './config'
import { useI18n } from './i18n'

const RESULT_LIMIT = 200

export default function StationBrowser({ stops, selectedId, onSelect }) {
  const { t, stopType } = useI18n()
  const [query, setQuery] = useState('')
  const [activeTypes, setActiveTypes] = useState(() => new Set())
  const [comune, setComune] = useState('')

  // Tipi effettivamente presenti nei dati, con conteggio
  const typeCounts = useMemo(() => {
    const c = {}
    for (const s of stops) c[s.tipo] = (c[s.tipo] || 0) + 1
    return c
  }, [stops])

  // Elenco comuni ordinato
  const comuni = useMemo(
    () => [...new Set(stops.map((s) => s.comune).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'it'),
    ),
    [stops],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return stops.filter((s) => {
      if (activeTypes.size && !activeTypes.has(s.tipo)) return false
      if (comune && s.comune !== comune) return false
      if (q && !(`${s.name} ${s.comune}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [stops, query, activeTypes, comune])

  const toggleType = (t) =>
    setActiveTypes((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })

  const shown = filtered.slice(0, RESULT_LIMIT)

  return (
    <div className="browser">
      <div className="search">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder={t('search_placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')} aria-label={t('clear')}>×</button>
        )}
      </div>

      <div className="type-chips">
        {Object.entries(STOP_TYPES)
          .filter(([type]) => typeCounts[type])
          .map(([type, meta]) => {
            const on = activeTypes.has(type)
            return (
              <button
                key={type}
                className={`chip ${on ? 'on' : ''}`}
                style={on ? { background: meta.color, borderColor: meta.color } : { borderColor: meta.color, color: meta.color }}
                onClick={() => toggleType(type)}
              >
                <span>{meta.icon}</span> {stopType(type)}
                <span className="chip-count">{typeCounts[type]}</span>
              </button>
            )
          })}
      </div>

      <select className="comune-select" value={comune} onChange={(e) => setComune(e.target.value)}>
        <option value="">{t('all_comuni', { n: comuni.length })}</option>
        {comuni.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <div className="result-count">
        {t('stops_count', { n: filtered.length })}
        {filtered.length > RESULT_LIMIT ? t('showing_first', { n: RESULT_LIMIT }) : ''}
      </div>

      <ul className="stop-list">
        {shown.map((s) => {
          const meta = STOP_TYPES[s.tipo] || STOP_TYPES.altro
          return (
            <li
              key={s.id}
              data-id={s.id}
              className={`stop-row ${s.id === selectedId ? 'active' : ''}`}
              onClick={() => onSelect(s)}
            >
              <span className="stop-icon" style={{ background: meta.color }}>{meta.icon}</span>
              <span className="stop-text">
                <span className="stop-name">{s.name}</span>
                <span className="stop-comune">{s.comune}</span>
              </span>
            </li>
          )
        })}
        {filtered.length === 0 && <li className="stop-empty">{t('no_stops')}</li>}
      </ul>
    </div>
  )
}
