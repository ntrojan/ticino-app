import { useEffect, useMemo, useState } from 'react'
import MapView from './MapView'
import Sidebar from './Sidebar'
import PoiFilter from './PoiFilter'
import Disclaimer from './Disclaimer'
import { STOPS_URL, POI_URL, TIME_BANDS, POI_CATEGORIES } from './config'
import { loadIsochrones, EMPTY_FC } from './isochrones'
import { pointInGeometry, geomBBox } from './geo'

export default function App() {
  const [stopsFC, setStopsFC] = useState(null)
  const [poiFC, setPoiFC] = useState(null)
  const [selectedStop, setSelectedStop] = useState(null)
  const [isoData, setIsoData] = useState(EMPTY_FC)
  const [isoLoading, setIsoLoading] = useState(false)
  const [activeBands, setActiveBands] = useState([...TIME_BANDS])
  const [focusedPoi, setFocusedPoi] = useState(null)
  // Disclaimer: aperto all'avvio la prima volta, poi memorizzo la chiusura.
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try { return !localStorage.getItem('disclaimerSeen') } catch { return true }
  })
  const closeDisclaimer = () => {
    setShowDisclaimer(false)
    try { localStorage.setItem('disclaimerSeen', '1') } catch { /* ignore */ }
  }
  // Le fermate sono nascoste di default: la mappa parte coi soli POI. L'utente
  // le accende dal pannello quando vuole sceglierne una.
  const [showStops, setShowStops] = useState(false)
  // Di default mostro le categorie "da turista" e tengo spente le più dense
  // (ristoranti, chiese) per non affollare la mappa: l'utente le riattiva a piacere.
  const [visibleCategories, setVisibleCategories] = useState(
    Object.keys(POI_CATEGORIES).filter((k) => k !== 'ristoranti' && k !== 'chiese'),
  )

  // Carica le fermate una sola volta (servono a mappa e browser).
  // Escludo le stazioni-padre del GTFS (tipo "altro", id "Parent…"): sono
  // contenitori non serviti da corse, doppioni delle fermate vere.
  useEffect(() => {
    fetch(STOPS_URL).then((r) => r.json()).then((fc) => {
      fc.features = fc.features.filter((f) => f.properties.tipo !== 'altro')
      setStopsFC(fc)
    })
  }, [])

  // Carica i POI una sola volta: servono alla mappa e al pannello "cosa raggiungi".
  useEffect(() => {
    fetch(POI_URL).then((r) => r.json()).then(setPoiFC)
  }, [])

  // Lista normalizzata per il browser
  const stops = useMemo(() => {
    if (!stopsFC) return []
    return stopsFC.features.map((f) => ({
      id: f.properties.stop_id,
      name: f.properties.stop_name,
      tipo: f.properties.tipo || 'altro',
      comune: f.properties.comune || '',
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }))
  }, [stopsFC])

  // Carica le isocrone quando cambia la fermata selezionata
  useEffect(() => {
    if (!selectedStop) { setIsoData(EMPTY_FC); return }
    let cancelled = false
    setIsoLoading(true)
    loadIsochrones(selectedStop.id).then((fc) => {
      if (!cancelled) { setIsoData(fc); setIsoLoading(false) }
    })
    return () => { cancelled = true }
  }, [selectedStop])

  // POI raggiungibili: ogni POI (tra le categorie attive) viene assegnato alla
  // fascia PIÙ STRETTA che lo contiene (le isocrone sono annidate). Risultato:
  // { 15: [...], 30: [...], 45: [...], 60: [...] }.
  const poiByBand = useMemo(() => {
    const out = Object.fromEntries(TIME_BANDS.map((b) => [b, []]))
    if (!poiFC || isoData.features.length === 0) return out

    // Geometria + bbox per ogni fascia, ordinate dalla più stretta alla più ampia.
    const bands = [...TIME_BANDS]
      .sort((a, b) => a - b)
      .map((band) => {
        const feat = isoData.features.find((f) => f.properties.band === band)
        return feat ? { band, geom: feat.geometry, bbox: geomBBox(feat.geometry) } : null
      })
      .filter(Boolean)
    if (bands.length === 0) return out

    for (const poi of poiFC.features) {
      if (!visibleCategories.includes(poi.properties.categoria)) continue
      const [lon, lat] = poi.geometry.coordinates
      for (const { band, geom, bbox } of bands) {
        if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue
        if (pointInGeometry(lon, lat, geom)) { out[band].push(poi); break }
      }
    }
    // Ordina ogni elenco per nome
    for (const band of TIME_BANDS) {
      out[band].sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'it'))
    }
    return out
  }, [poiFC, isoData, visibleCategories])

  const toggleBand = (band) =>
    setActiveBands((b) => (b.includes(band) ? b.filter((x) => x !== band) : [...b, band]))

  const toggleCategory = (key) =>
    setVisibleCategories((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]))

  return (
    <div className="app">
      <Sidebar
        stops={stops}
        selectedStop={selectedStop}
        onSelectStop={setSelectedStop}
        isoLoading={isoLoading}
        isoEmpty={isoData.features.length === 0}
        activeBands={activeBands}
        toggleBand={toggleBand}
        showStops={showStops}
        toggleShowStops={() => setShowStops((v) => !v)}
        poiByBand={poiByBand}
        onFocusPoi={setFocusedPoi}
        onClear={() => setSelectedStop(null)}
        onOpenInfo={() => setShowDisclaimer(true)}
      />
      <div className="map-area">
        <MapView
          stopsData={stopsFC}
          poiData={poiFC}
          onSelectStop={setSelectedStop}
          isoData={isoData}
          selectedStop={selectedStop}
          activeBands={activeBands}
          visibleCategories={visibleCategories}
          showStops={showStops}
          focusedPoi={focusedPoi}
        />
        <PoiFilter
          visibleCategories={visibleCategories}
          toggleCategory={toggleCategory}
        />
      </div>
      <Disclaimer open={showDisclaimer} onClose={closeDisclaimer} />
    </div>
  )
}
