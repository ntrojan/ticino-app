// Utilità geometriche minime (niente dipendenze: turf non è installato).
// Servono a capire quali POI cadono dentro le isocrone di una fermata.

// Ray casting su un singolo anello [[lon,lat],…]. true se il punto è interno.
function pointInRing(lon, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const intersect =
      (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// Un Polygon è [anello_esterno, foro1, foro2, …]: dentro l'esterno e fuori dai fori.
function pointInPolygon(lon, lat, polygon) {
  if (!pointInRing(lon, lat, polygon[0])) return false
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(lon, lat, polygon[h])) return false // dentro un foro
  }
  return true
}

// Gestisce Polygon e MultiPolygon (le isocrone OTP sono MultiPolygon).
export function pointInGeometry(lon, lat, geom) {
  if (!geom) return false
  if (geom.type === 'Polygon') return pointInPolygon(lon, lat, geom.coordinates)
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (pointInPolygon(lon, lat, poly)) return true
    }
  }
  return false
}

// Bounding box [minLon, minLat, maxLon, maxLat] di una geometria poligonale,
// usata come pre-filtro veloce prima del test punto-in-poligono.
export function geomBBox(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const scan = (ring) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]
  for (const poly of polys) for (const ring of poly) scan(ring)
  return [minX, minY, maxX, maxY]
}
