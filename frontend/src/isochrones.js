import { ISO_BASE, TIME_BANDS } from './config'

const EMPTY = { type: 'FeatureCollection', features: [] }

/**
 * Carica le isocrone disponibili per una fermata e le unisce in una sola
 * FeatureCollection, taggando ogni feature con `band` (minuti).
 * Gli stop_id possono contenere ":" (es. "1300133:0:10000"), quindi il nome
 * file va URL-encoded. Le fasce non ancora calcolate (404) vengono saltate.
 */
export async function loadIsochrones(stopId) {
  // 1. File combinato (deploy): un solo file per fermata, nome sanificato (":"/"/"→"_"),
  //    con tutte le fasce già taggate `band`. In dev non esiste → si passa al punto 2.
  const combinedId = String(stopId).replaceAll('/', '_').replaceAll(':', '_')
  try {
    const res = await fetch(`${ISO_BASE}/${combinedId}.geojson`)
    if (res.ok) {
      const gj = await res.json() // su SPA fallback (html) lancia → catch → per-fascia
      if (gj?.type === 'FeatureCollection' && gj.features?.length) {
        return { type: 'FeatureCollection', features: sortBands(gj.features) }
      }
    }
  } catch { /* nessun file combinato: uso i per-fascia */ }

  // 2. Per-fascia (dev): un file per fascia. I ":" vanno lasciati LETTERALI: se
  //    encodeURIComponent li trasforma in %3A, Vite risponde con l'index.html (SPA
  //    fallback) invece del file → res.json() fallisce e l'isocrona sparisce.
  const safeId = String(stopId).replaceAll('/', '_')
  const features = []
  await Promise.all(
    TIME_BANDS.map(async (band) => {
      const fname = encodeURIComponent(`${safeId}_${band}min.geojson`).replaceAll('%3A', ':')
      try {
        const res = await fetch(`${ISO_BASE}/${fname}`)
        if (!res.ok) return
        const gj = await res.json()
        for (const f of gj.features || []) {
          features.push({ ...f, properties: { ...f.properties, band } })
        }
      } catch { /* fascia non disponibile: ignora */ }
    }),
  )
  return features.length ? { type: 'FeatureCollection', features: sortBands(features) } : EMPTY
}

// Disegna prima le fasce ampie (60) e per ultime quelle strette (15), così le
// aree più vicine restano in cima e ben visibili.
function sortBands(features) {
  return [...features].sort((a, b) => b.properties.band - a.properties.band)
}

export const EMPTY_FC = EMPTY
