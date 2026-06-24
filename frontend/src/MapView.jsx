import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import {
  MAP_STYLE, TICINO_CENTER, TICINO_ZOOM, MAX_BOUNDS, MIN_ZOOM,
  AOI_URL, BAND_COLORS, STOP_TYPES, POI_CATEGORIES,
} from './config'
import { EMPTY_FC } from './isochrones'
import { resolvePoiImage } from './poiImage'
import { translate } from './i18n'

// Costruisce un'espressione MapLibre ['match', input, k, v, ..., fallback]
function matchExpr(input, mapping, fallback) {
  const expr = ['match', input]
  for (const [k, v] of Object.entries(mapping)) expr.push(isNaN(+k) ? k : +k, v)
  expr.push(fallback)
  return expr
}

const bandColor = matchExpr(['get', 'band'], BAND_COLORS, '#cccccc')
const poiColor = matchExpr(
  ['get', 'categoria'],
  Object.fromEntries(Object.entries(POI_CATEGORIES).map(([k, v]) => [k, v.color])),
  '#888888',
)
// Fermate e POI hanno un'icona-immagine dedicata (disco colorato + emoji),
// generata a runtime su canvas (gli emoji nei glyph del basemap non rendono).
const stopIcon = matchExpr(
  ['get', 'tipo'],
  Object.fromEntries(Object.keys(STOP_TYPES).map((k) => [k, `stop-${k}`])),
  'stop-altro',
)
const poiIcon = matchExpr(
  ['get', 'categoria'],
  Object.fromEntries(Object.keys(POI_CATEGORIES).map((k) => [k, `poi-${k}`])),
  'poi-attrazioni',
)

// Disegna un marker (disco colorato + bordo bianco + emoji) e ne restituisce l'ImageData.
function makeMarkerIcon(color, emoji) {
  const size = 46
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.font = '20px -apple-system, "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, size / 2, size / 2 + 1)
  return ctx.getImageData(0, 0, size, size)
}

function registerIcons(map) {
  const all = [
    ...Object.entries(STOP_TYPES).map(([k, m]) => [`stop-${k}`, m]),
    ...Object.entries(POI_CATEGORIES).map(([k, m]) => [`poi-${k}`, m]),
  ]
  for (const [id, meta] of all) {
    if (map.hasImage(id)) continue
    map.addImage(id, makeMarkerIcon(meta.color, meta.icon), { pixelRatio: 2 })
  }
}

// Anello che copre il mondo: serve come contorno esterno della maschera grigia
// (l'AOI viene poi "bucato" come foro interno).
const WORLD_RING = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]

// HTML del popup POI (riusato dal click sulla mappa e dal pannello laterale).
function poiPopupHTML(p) {
  const cat = POI_CATEGORIES[p.categoria]
  const links = [
    p.website && `<a href="${p.website}" target="_blank" rel="noreferrer">${translate('link_site')}</a>`,
    p.wiki_url && `<a href="${p.wiki_url}" target="_blank" rel="noreferrer">${translate('link_wiki')}</a>`,
  ].filter(Boolean).join(' · ')
  const img = p.image ? `<img class="poi-img" src="${p.image}" alt="" loading="lazy"/>` : ''
  const desc = p.description ? `<div class="poi-desc">${p.description}</div>` : ''
  return (
    `<div class="poi-popup">${img}<strong>${p.name}</strong>` +
    `<div class="poi-tipo">${cat?.icon || ''} ${p.tipo || ''}</div>` +
    desc + (links ? `<div class="poi-links">${links}</div>` : '') + '</div>'
  )
}

// Apre il popup di un POI e, se manca la foto, la cerca su Wikipedia e la inserisce.
function openPoiPopup(map, lngLat, p) {
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
    .setLngLat(lngLat)
    .setHTML(poiPopupHTML(p))
    .addTo(map)
  if (!p.image) {
    resolvePoiImage(p).then((url) => {
      if (!url) return
      const box = popup.getElement()?.querySelector('.poi-popup')
      if (!box || box.querySelector('.poi-img')) return
      const im = document.createElement('img')
      im.className = 'poi-img'
      im.src = url
      im.loading = 'lazy'
      box.insertBefore(im, box.firstChild)
    })
  }
  return popup
}

export default function MapView({
  stopsData, poiData, onSelectStop, isoData, selectedStop,
  activeBands, visibleCategories, showStops, focusedPoi,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  const stopsRef = useRef(stopsData)
  stopsRef.current = stopsData
  const poiRef = useRef(poiData)
  poiRef.current = poiData

  // ── Inizializzazione (una sola volta) ───────────────────────────────────────
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: TICINO_CENTER,
      zoom: TICINO_ZOOM,
      minZoom: MIN_ZOOM,
      maxBounds: MAX_BOUNDS,
      attributionControl: false,
    })
    mapRef.current = map
    if (import.meta.env.DEV) window.__map = map // comodo per debug/QA
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    // Attribuzione in basso a sinistra: il pannello "Luoghi" sta in basso a destra.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    map.on('load', () => {
      registerIcons(map)
      map.addSource('aoi', { type: 'geojson', data: AOI_URL })
      map.addSource('aoi-mask', { type: 'geojson', data: EMPTY_FC })
      map.addSource('isochrones', { type: 'geojson', data: EMPTY_FC })
      map.addSource('selected', { type: 'geojson', data: EMPTY_FC })
      map.addSource('stops', { type: 'geojson', data: stopsRef.current || EMPTY_FC })
      map.addSource('poi', { type: 'geojson', data: EMPTY_FC })

      // Maschera grigia su tutto ciò che è FUORI dall'AOI (mondo bucato dall'AOI).
      map.addLayer({
        id: 'aoi-mask', type: 'fill', source: 'aoi-mask',
        paint: { 'fill-color': '#1f2937', 'fill-opacity': 0.45 },
      })

      // Costruisco la maschera dall'AOI: mondo come anello esterno, AOI come foro.
      fetch(AOI_URL).then((r) => r.json()).then((fc) => {
        const g = fc.type === 'FeatureCollection' ? fc.features[0].geometry : fc.geometry || fc
        const aoiRings = g.type === 'MultiPolygon'
          ? g.coordinates.map((poly) => poly[0])
          : [g.coordinates[0]]
        map.getSource('aoi-mask')?.setData({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [WORLD_RING, ...aoiRings] },
          properties: {},
        })
      })

      // Bordo dell'AOI (Ticino + Moesano + 20km IT)
      map.addLayer({
        id: 'aoi-line', type: 'line', source: 'aoi',
        paint: { 'line-color': '#0d9488', 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.7 },
      })

      map.addLayer({
        id: 'iso-fill', type: 'fill', source: 'isochrones',
        paint: { 'fill-color': bandColor, 'fill-opacity': 0.4 },
      })
      map.addLayer({
        id: 'iso-line', type: 'line', source: 'isochrones',
        paint: { 'line-color': bandColor, 'line-width': 1.5 },
      })

      // POI a basso zoom = pallino colorato (denso ma leggero). Svanisce nel
      // crossfade verso le emoji (z 11 → 12.5) per non sovraccaricare la vista.
      map.addLayer({
        id: 'poi', type: 'circle', source: 'poi',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.6, 12, 4],
          'circle-color': poiColor,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.9, 12.5, 0],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 11, 1, 12.5, 0],
        },
      })
      // POI ad alto zoom = emoji per categoria, a dimensione leggibile e
      // declutterata (collisione) così non si accavallano. Compaiono da z 11.
      map.addLayer({
        id: 'poi-icon', type: 'symbol', source: 'poi', minzoom: 11,
        layout: {
          'icon-image': poiIcon,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 16, 0.95],
          'icon-allow-overlap': false,
        },
        paint: {
          'icon-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 12.5, 1],
        },
      })

      // Fermate: simbolo (icona) diverso per tipo di mezzo. Nascoste di default.
      map.addLayer({
        id: 'stops', type: 'symbol', source: 'stops',
        layout: {
          'icon-image': stopIcon,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.45, 13, 0.85],
          'icon-allow-overlap': false,
          'visibility': showStops ? 'visible' : 'none',
        },
      })

      map.addLayer({
        id: 'selected', type: 'circle', source: 'selected',
        paint: {
          'circle-radius': 9,
          'circle-color': '#ffffff',
          'circle-stroke-width': 4,
          'circle-stroke-color': '#0d9488',
        },
      })

      map.on('click', 'stops', (e) => {
        const f = e.features[0]
        const [lon, lat] = f.geometry.coordinates
        onSelectStop({
          id: f.properties.stop_id,
          name: f.properties.stop_name,
          tipo: f.properties.tipo,
          comune: f.properties.comune,
          lon, lat,
        })
      })

      const onPoiClick = (e) => openPoiPopup(map, e.lngLat, e.features[0].properties)
      map.on('click', 'poi', onPoiClick)
      map.on('click', 'poi-icon', onPoiClick)

      for (const layer of ['stops', 'poi', 'poi-icon']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }

      readyRef.current = true
      if (stopsRef.current) map.getSource('stops')?.setData(stopsRef.current)
      if (poiRef.current) map.getSource('poi')?.setData(poiRef.current)
      const poiFilter = ['in', ['get', 'categoria'], ['literal', visibleCategories]]
      map.setFilter('poi', poiFilter)
      map.setFilter('poi-icon', poiFilter)
    })

    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Dati fermate (caricati in modo asincrono dal parent) ─────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !stopsData) return
    map.getSource('stops')?.setData(stopsData)
  }, [stopsData])

  // ── Dati POI (caricati in modo asincrono dal parent) ─────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !poiData) return
    map.getSource('poi')?.setData(poiData)
  }, [poiData])

  // ── Isocrone della fermata selezionata ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.getSource('isochrones')?.setData(isoData || EMPTY_FC)
  }, [isoData])

  // ── Evidenzia + centra la fermata selezionata ───────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (!selectedStop) {
      map.getSource('selected')?.setData(EMPTY_FC)
      return
    }
    map.getSource('selected')?.setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [selectedStop.lon, selectedStop.lat] },
        properties: {},
      }],
    })
    map.flyTo({ center: [selectedStop.lon, selectedStop.lat], zoom: Math.max(map.getZoom(), 11) })
  }, [selectedStop])

  // ── Visibilità fermate (nascoste di default) ─────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setLayoutProperty('stops', 'visibility', showStops ? 'visible' : 'none')
  }, [showStops])

  // ── Focus su un POI dal pannello laterale: centra + apre il popup ────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current || !focusedPoi) return
    const [lon, lat] = focusedPoi.geometry.coordinates
    map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 13) })
    openPoiPopup(map, [lon, lat], focusedPoi.properties)
  }, [focusedPoi])

  // ── Filtro fasce isocrone ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const filter = ['in', ['get', 'band'], ['literal', activeBands]]
    map.setFilter('iso-fill', filter)
    map.setFilter('iso-line', filter)
  }, [activeBands])

  // ── Filtro categorie POI ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const poiFilter = ['in', ['get', 'categoria'], ['literal', visibleCategories]]
    map.setFilter('poi', poiFilter)
    map.setFilter('poi-icon', poiFilter)
  }, [visibleCategories])

  return <div ref={containerRef} className="map" />
}
