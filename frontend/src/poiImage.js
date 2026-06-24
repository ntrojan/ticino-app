// Recupero "best effort" di una foto per un POI:
//   1. campo `image` già presente (da OSM/Wikidata nello script 04) → usato subito;
//   2. altrimenti, se c'è `wiki_url`, si chiede la thumbnail alla REST API di
//      Wikipedia (CORS abilitato, nessuna chiave).
// I risultati (anche i "niente foto") sono messi in cache per non ri-chiedere.

const cache = new Map()

export async function resolvePoiImage(p) {
  if (p.image) return p.image
  if (!p.wiki_url) return null
  if (cache.has(p.wiki_url)) return cache.get(p.wiki_url)

  const m = p.wiki_url.match(/^https?:\/\/([a-z-]+)\.wikipedia\.org\/wiki\/(.+)$/)
  if (!m) { cache.set(p.wiki_url, null); return null }
  const [, lang, title] = m

  let url = null
  try {
    const res = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`,
    )
    if (res.ok) {
      const j = await res.json()
      url = j.thumbnail?.source || j.originalimage?.source || null
    }
  } catch { /* offline / errore rete: nessuna foto */ }

  cache.set(p.wiki_url, url)
  return url
}
