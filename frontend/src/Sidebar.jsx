import StationBrowser from './StationBrowser'
import PoiReachPanel from './PoiReachPanel'
import { TIME_BANDS, BAND_COLORS, STOP_TYPES } from './config'
import { useI18n, LANGS } from './i18n'

// Logo: bandiera del Ticino (blu/rosso) con un bus al centro.
function Logo() {
  return (
    <div className="logo" aria-hidden="true">
      <svg className="logo-flag" viewBox="0 0 40 40">
        <clipPath id="logo-clip"><rect width="40" height="40" rx="11" /></clipPath>
        <g clipPath="url(#logo-clip)">
          <rect width="20" height="40" fill="#0098d8" />
          <rect x="20" width="20" height="40" fill="#e2001a" />
          <circle cx="20" cy="20" r="11" fill="#ffffff" />
        </g>
      </svg>
      <span className="logo-bus">🚌</span>
    </div>
  )
}

function LangSwitcher() {
  const { lang, setLang } = useI18n()
  return (
    <div className="lang-switcher">
      {LANGS.map((l) => (
        <button
          key={l}
          className={`lang-btn ${l === lang ? 'on' : ''}`}
          onClick={() => setLang(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export default function Sidebar({
  stops, selectedStop, onSelectStop, onClear,
  isoLoading, isoEmpty,
  activeBands, toggleBand,
  showStops, toggleShowStops,
  poiByBand, onFocusPoi, onOpenInfo,
}) {
  const { t, stopType } = useI18n()
  const typeMeta = selectedStop ? (STOP_TYPES[selectedStop.tipo] || STOP_TYPES.altro) : null

  return (
    <aside className="sidebar">
      <header className="brand">
        <Logo />
        <div className="brand-text">
          <h1>TicinoTour</h1>
          <p>{t('brand_tagline')}</p>
        </div>
        <div className="brand-actions">
          <button className="info-btn" onClick={onOpenInfo} aria-label={t('info')} title={t('info')}>ℹ️</button>
          <LangSwitcher />
        </div>
      </header>

      <div className="sidebar-scroll">
        {selectedStop && (
          <section className="card selected-card">
            <div className="selected-head">
              <span className="type-badge" style={{ background: typeMeta.color }}>
                {typeMeta.icon} {stopType(selectedStop.tipo)}
              </span>
              <button className="clear" onClick={onClear} aria-label={t('deselect')}>×</button>
            </div>
            <h2 className="selected-name">{selectedStop.name}</h2>
            {selectedStop.comune && <p className="selected-comune">📍 {selectedStop.comune}</p>}

            {isoLoading && <p className="hint">{t('loading_iso')}</p>}
            {!isoLoading && isoEmpty && (
              <p className="hint warn">{t('iso_not_ready')}</p>
            )}

            {!isoLoading && !isoEmpty && (
              <div className="bands">
                <span className="bands-label">{t('reachable_within')}</span>
                <div className="band-pills">
                  {TIME_BANDS.map((band) => (
                    <button
                      key={band}
                      className={`band-pill ${activeBands.includes(band) ? 'on' : ''}`}
                      style={activeBands.includes(band)
                        ? { background: BAND_COLORS[band], borderColor: BAND_COLORS[band], color: band <= 30 ? '#fff' : '#7c2d12' }
                        : {}}
                      onClick={() => toggleBand(band)}
                    >
                      {t('n_min', { n: band })}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!isoLoading && !isoEmpty && (
              <PoiReachPanel
                poiByBand={poiByBand}
                activeBands={activeBands}
                onFocusPoi={onFocusPoi}
              />
            )}
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h3 className="card-title">{t('choose_stop')}</h3>
            <label className="switch">
              <input type="checkbox" checked={showStops} onChange={toggleShowStops} />
              <span>{t('show_on_map')}</span>
            </label>
          </div>
          <StationBrowser
            stops={stops}
            selectedId={selectedStop?.id}
            onSelect={onSelectStop}
          />
        </section>
      </div>

      <footer className="credits">
        {t('credits')}
      </footer>
    </aside>
  )
}
