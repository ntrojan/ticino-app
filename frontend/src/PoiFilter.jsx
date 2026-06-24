import { useState } from 'react'
import { POI_CATEGORIES } from './config'
import { useI18n } from './i18n'

// Pannello flottante sulla mappa (in alto a sinistra) coi filtri-categoria dei POI.
// Collassabile per non coprire la mappa.
export default function PoiFilter({ visibleCategories, toggleCategory }) {
  const { t, poiCat } = useI18n()
  const [open, setOpen] = useState(true)

  return (
    <div className="poi-filter">
      <button className="poi-filter-head" onClick={() => setOpen((o) => !o)}>
        <span>📍 {t('poi_title')}</span>
        <span className="poi-filter-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="poi-grid">
          {Object.entries(POI_CATEGORIES).map(([key, { color, icon }]) => {
            const on = visibleCategories.includes(key)
            return (
              <button
                key={key}
                className={`poi-toggle ${on ? 'on' : ''}`}
                style={on ? { background: color, borderColor: color } : { borderColor: color }}
                onClick={() => toggleCategory(key)}
              >
                <span>{icon}</span> {poiCat(key)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
