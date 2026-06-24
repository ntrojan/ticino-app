import { useEffect, useMemo, useState } from 'react'
import { TIME_BANDS, BAND_COLORS, POI_CATEGORIES } from './config'
import { resolvePoiImage } from './poiImage'
import { useI18n } from './i18n'

// Una riga POI: icona + nome, espandibile per foto/descrizione/link.
function PoiRow({ feature, onFocus }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [img, setImg] = useState(null)
  const p = feature.properties
  const cat = POI_CATEGORIES[p.categoria]

  // Alla prima apertura provo a recuperare una foto (campo image o Wikipedia).
  useEffect(() => {
    if (!open || img !== null) return
    let alive = true
    resolvePoiImage(p).then((url) => { if (alive) setImg(url || false) })
    return () => { alive = false }
  }, [open])

  const hasDetail = p.description || p.website || p.wiki_url || img

  return (
    <li className={`reach-poi ${open ? 'open' : ''}`}>
      <button
        className="reach-poi-head"
        onClick={() => { setOpen((o) => !o); onFocus?.(feature) }}
      >
        <span className="reach-poi-icon" style={{ background: cat?.color || '#888' }}>
          {cat?.icon || '•'}
        </span>
        <span className="reach-poi-name">{p.name}</span>
        <span className="reach-poi-caret">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="reach-poi-detail">
          {img && <img className="reach-poi-img" src={img} alt="" loading="lazy" />}
          {p.description && <p className="reach-poi-desc">{p.description}</p>}
          {(p.website || p.wiki_url) && (
            <div className="reach-poi-links">
              {p.website && <a href={p.website} target="_blank" rel="noreferrer">{t('link_site')}</a>}
              {p.wiki_url && <a href={p.wiki_url} target="_blank" rel="noreferrer">{t('link_wiki')}</a>}
            </div>
          )}
          {!hasDetail && <p className="reach-poi-desc muted">{t('no_card')}</p>}
        </div>
      )}
    </li>
  )
}

// Una categoria dentro una fascia: collassata di default, mostra solo il titolo
// e il conteggio; cliccando si espande l'elenco dei POI.
function CategoryGroup({ cat, items, onFocusPoi }) {
  const { poiCat } = useI18n()
  const [open, setOpen] = useState(false)
  const meta = POI_CATEGORIES[cat]
  return (
    <div className={`reach-cat ${open ? 'open' : ''}`}>
      <button className="reach-cat-head" onClick={() => setOpen((o) => !o)}>
        <span className="reach-cat-ico" style={{ background: meta.color }}>{meta.icon}</span>
        {poiCat(cat)}
        <span className="reach-cat-count">{items.length}</span>
        <span className="reach-cat-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="reach-list">
          {items.map((f, i) => (
            <PoiRow
              key={`${f.properties.osm_id || f.properties.name}-${i}`}
              feature={f}
              onFocus={onFocusPoi}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// Raggruppa i POI di una fascia per categoria, nell'ordine di POI_CATEGORIES.
function groupByCategory(list) {
  const groups = new Map()
  for (const f of list) {
    const k = f.properties.categoria
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(f)
  }
  return Object.keys(POI_CATEGORIES)
    .filter((k) => groups.has(k))
    .map((k) => [k, groups.get(k)])
}

// Pannello "cosa raggiungi": una sezione per fascia (espandibile su richiesta),
// e dentro ogni fascia i POI raggruppati per categoria.
export default function PoiReachPanel({ poiByBand, activeBands, onFocusPoi }) {
  const { t } = useI18n()
  const bands = useMemo(
    () => [...TIME_BANDS].sort((a, b) => a - b).filter((b) => activeBands.includes(b)),
    [activeBands],
  )
  const total = Object.values(poiByBand).reduce((n, arr) => n + arr.length, 0)

  // Quale fascia è aperta. Default: la più stretta che contiene qualcosa,
  // per non aprire tutto e tenere la GUI leggera.
  const firstNonEmpty = bands.find((b) => (poiByBand[b] || []).length > 0)
  const [openBand, setOpenBand] = useState(firstNonEmpty ?? null)
  useEffect(() => { setOpenBand(firstNonEmpty ?? null) }, [firstNonEmpty])

  if (total === 0) {
    return <p className="hint">{t('no_poi_in_iso')}</p>
  }

  return (
    <div className="reach">
      <span className="bands-label">{t('reach_title')}</span>
      {bands.map((band) => {
        const list = poiByBand[band] || []
        if (list.length === 0) return null
        const isOpen = openBand === band
        return (
          <div className="reach-group" key={band}>
            <button
              className={`reach-group-head ${isOpen ? 'open' : ''}`}
              style={{ borderColor: BAND_COLORS[band] }}
              onClick={() => setOpenBand(isOpen ? null : band)}
            >
              <span className="reach-dot" style={{ background: BAND_COLORS[band] }} />
              {t('within_min', { n: band })}
              <span className="reach-count">{list.length}</span>
              <span className="reach-group-caret">{isOpen ? '▾' : '▸'}</span>
            </button>

            {isOpen && (
              <div className="reach-cats">
                {groupByCategory(list).map(([cat, items]) => (
                  <CategoryGroup key={cat} cat={cat} items={items} onFocusPoi={onFocusPoi} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
