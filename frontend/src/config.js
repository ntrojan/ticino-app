// Percorsi dei dati (serviti da public/data → ../data/processed).
// Usa BASE_URL così funziona sia in dev ('/') sia su GitHub Pages ('/ticino-app/').
export const DATA_BASE = `${import.meta.env.BASE_URL}data`
export const STOPS_URL = `${DATA_BASE}/stops_ticino.geojson`
export const POI_URL = `${DATA_BASE}/poi/poi_all.geojson`
export const AOI_URL = `${DATA_BASE}/aoi.geojson`
export const ISO_BASE = `${DATA_BASE}/isocrone`

// Fasce temporali (minuti). Dal più ampio al più stretto per il disegno annidato.
export const TIME_BANDS = [60, 45, 30, 15]

// Colore per fascia (palette sequenziale calda: 60min chiaro → 15min intenso)
export const BAND_COLORS = {
  60: '#fde7c9',
  45: '#fbbf6b',
  30: '#f97316',
  15: '#c2410c',
}

// Tipi di trasporto per fermata (campo `tipo` da scripts/01_filter_gtfs.py).
// label + colore marker/badge + icona.
export const STOP_TYPES = {
  treno:      { label: 'Treno', color: '#0d9488', icon: '🚆' },
  bus:        { label: 'Bus', color: '#f97316', icon: '🚌' },
  funivia:    { label: 'Funivia', color: '#7c3aed', icon: '🚠' },
  funicolare: { label: 'Funicolare', color: '#db2777', icon: '🚟' },
  battello:   { label: 'Battello', color: '#2563eb', icon: '⛴️' },
  tram:       { label: 'Tram', color: '#16a34a', icon: '🚊' },
  altro:      { label: 'Altro', color: '#94a3b8', icon: '•' },
}

// Categorie POI: etichetta + colore marker. Le chiavi combaciano con `categoria`
// nei file poi_*.geojson generati da scripts/04_fetch_poi.py.
export const POI_CATEGORIES = {
  attrazioni:  { label: 'Attrazioni', color: '#e11d48', icon: '✨' },
  musei:       { label: 'Musei', color: '#9333ea', icon: '🏛️' },
  parchi:      { label: 'Parchi', color: '#16a34a', icon: '🌳' },
  ristoranti:  { label: 'Ristoranti', color: '#f97316', icon: '🍽️' },
  laghi:       { label: 'Laghi', color: '#0891b2', icon: '🏞️' },
  chiese:      { label: 'Chiese', color: '#a16207', icon: '⛪' },
  belvedere:   { label: 'Belvedere', color: '#0ea5e9', icon: '🔭' },
  sport_acqua: { label: 'Sport acquatici', color: '#1d4ed8', icon: '🛶' },
}

// Basemap vettoriale gratuito, senza API key.
export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
export const TICINO_CENTER = [8.95, 46.15]
export const TICINO_ZOOM = 8.3

// Limiti di navigazione: l'AOI (bbox lon 8.25–9.43, lat 45.73–46.72) con un
// margine di ~100 km (~1.3° lon a questa latitudine, ~0.9° lat). L'utente non
// può allontanarsi oltre, né rimpicciolire troppo.
export const MAX_BOUNDS = [[6.95, 44.85], [10.75, 47.60]]
export const MIN_ZOOM = 7.4
