"""
04_fetch_poi.py
===============
Scarica i Punti di Interesse turistici del Ticino da:
  - OpenStreetMap (via Overpass API) — dati completi, gratuiti
  - Wikidata (via SPARQL) — descrizioni e link Wikipedia per i POI principali

OUTPUT
------
data/processed/poi/poi_{categoria}.geojson   ← un file per categoria
data/processed/poi/poi_all.geojson           ← tutti i POI uniti

CATEGORIE
---------
  attrazioni     → tourism=attraction, tourism=viewpoint, historic=*
  musei          → tourism=museum, tourism=gallery
  parchi         → leisure=park, leisure=nature_reserve, boundary=national_park
  ristoranti     → amenity=restaurant, amenity=cafe
  laghi          → natural=water (type=lake)
  sentieri       → route=hiking (relazioni OSM)
  chiese         → amenity=place_of_worship
  belvedere      → tourism=viewpoint

DIPENDENZE
----------
pip install geopandas requests shapely
"""

import json
import time
from pathlib import Path

import geopandas as gpd
import requests
from shapely.geometry import Point, Polygon, MultiPolygon, shape

# ── Configurazione ────────────────────────────────────────────────────────────
ROOT     = Path(__file__).parent.parent
OUT_DIR  = ROOT / "data/processed/poi"
AOI_FILE = ROOT / "data/processed/aoi.geojson"

# AOI (poligono) da 00_build_aoi.py. Le query Overpass usano il bounding box
# dell'AOI; i risultati vengono poi ritagliati sul poligono vero.
AOI_POLY = gpd.read_file(AOI_FILE).geometry.union_all()
_minx, _miny, _maxx, _maxy = AOI_POLY.bounds
TI_BBOX = f"{_miny},{_minx},{_maxy},{_maxx}"   # Overpass vuole S,W,N,E

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Header necessari: senza un Accept esplicito overpass-api.de risponde HTTP 406.
OVERPASS_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "TicinoTP/1.0 (isocrone trasporti pubblici Ticino)",
}

# Pausa tra query per rispettare i limiti di Overpass
SLEEP = 5  # secondi
# Retry su rate-limit (429) / timeout server (504)
MAX_RETRIES = 4
RETRY_WAIT = 25  # secondi (backoff lineare: 25, 50, 75, 100)

# ── Definizione categorie e query Overpass ────────────────────────────────────
CATEGORIES = {
    "attrazioni": """
        [out:json][timeout:60];
        (
          node["tourism"="attraction"]({bbox});
          node["tourism"="viewpoint"]({bbox});
          node["historic"]["historic"!="no"]({bbox});
          way["tourism"="attraction"]({bbox});
          way["historic"]["historic"!="no"]({bbox});
        );
        out center tags;
    """,
    "musei": """
        [out:json][timeout:60];
        (
          node["tourism"="museum"]({bbox});
          node["tourism"="gallery"]({bbox});
          way["tourism"="museum"]({bbox});
          way["tourism"="gallery"]({bbox});
        );
        out center tags;
    """,
    "parchi": """
        [out:json][timeout:60];
        (
          node["leisure"="park"]({bbox});
          node["leisure"="nature_reserve"]({bbox});
          way["leisure"="park"]({bbox});
          way["leisure"="nature_reserve"]({bbox});
          relation["boundary"="national_park"]({bbox});
          relation["boundary"="protected_area"]({bbox});
        );
        out center tags;
    """,
    "ristoranti": """
        [out:json][timeout:60];
        (
          node["amenity"="restaurant"]({bbox});
          node["amenity"="cafe"]({bbox});
          node["amenity"="bar"]["bar"!="no"]({bbox});
        );
        out center tags;
    """,
    "laghi": """
        [out:json][timeout:60];
        (
          way["natural"="water"]["water"="lake"]({bbox});
          way["natural"="water"]["name"]({bbox});
          relation["natural"="water"]["water"="lake"]({bbox});
        );
        out center tags;
    """,
    "chiese": """
        [out:json][timeout:60];
        (
          node["amenity"="place_of_worship"]({bbox});
          way["amenity"="place_of_worship"]({bbox});
        );
        out center tags;
    """,
    "belvedere": """
        [out:json][timeout:60];
        (
          node["tourism"="viewpoint"]({bbox});
        );
        out center tags;
    """,
    "sport_acqua": """
        [out:json][timeout:60];
        (
          node["leisure"="swimming_area"]({bbox});
          node["leisure"="marina"]({bbox});
          node["leisure"="slipway"]({bbox});
          node["amenity"="ferry_terminal"]({bbox});
        );
        out center tags;
    """,
}

# Mappa tag OSM → etichetta leggibile per l'utente
TAG_LABELS = {
    "tourism=attraction":       "Attrazione",
    "tourism=viewpoint":        "Belvedere",
    "tourism=museum":           "Museo",
    "tourism=gallery":          "Galleria d'arte",
    "amenity=restaurant":       "Ristorante",
    "amenity=cafe":             "Caffè",
    "amenity=bar":              "Bar",
    "leisure=park":             "Parco",
    "leisure=nature_reserve":   "Riserva naturale",
    "natural=water":            "Lago",
    "amenity=place_of_worship": "Luogo di culto",
    "leisure=swimming_area":    "Area balneabile",
    "leisure=marina":           "Porto",
}


def overpass_query(category: str, query_template: str) -> list[dict]:
    """Esegue una query Overpass con retry. Overpass limita le richieste (429)
    e talvolta va in timeout server (504): in quei casi si aspetta e si ritenta."""
    query = query_template.replace("{bbox}", TI_BBOX).strip()
    print(f"  [→] Query Overpass: {category} ...")

    for attempt in range(MAX_RETRIES):
        try:
            r = requests.post(OVERPASS_URL, data={"data": query},
                              headers=OVERPASS_HEADERS, timeout=120)
            if r.status_code == 200:
                elements = r.json().get("elements", [])
                print(f"      → {len(elements)} elementi trovati")
                return elements
            if r.status_code in (429, 504):
                wait = RETRY_WAIT * (attempt + 1)   # backoff lineare
                print(f"      [HTTP {r.status_code}] rate-limit, attendo {wait}s "
                      f"(tentativo {attempt+1}/{MAX_RETRIES})")
                time.sleep(wait)
                continue
            print(f"      [HTTP {r.status_code}] Errore query")
            return []
        except Exception as e:
            print(f"      [ERRORE] {e} — ritento tra {RETRY_WAIT}s")
            time.sleep(RETRY_WAIT)

    print(f"      [✗] {category}: rate-limit persistente, salto")
    return []


def element_to_feature(elem: dict, category: str) -> dict | None:
    """Converte un elemento Overpass in un feature GeoJSON."""
    tags = elem.get("tags", {})

    # Coordinate: i way hanno "center", i node hanno "lat"/"lon"
    if elem["type"] == "node":
        lat, lon = elem.get("lat"), elem.get("lon")
    elif "center" in elem:
        lat, lon = elem["center"]["lat"], elem["center"]["lon"]
    else:
        return None

    if lat is None or lon is None:
        return None

    # Ritaglio sul poligono AOI (Overpass interroga il bounding box, più largo)
    if not AOI_POLY.contains(Point(lon, lat)):
        return None

    # Nome
    name = (tags.get("name") or
            tags.get("name:it") or
            tags.get("name:en") or
            tags.get("ref") or
            "")
    if not name:
        return None  # senza nome non è utile per i turisti

    # Tipo leggibile
    tipo = "POI"
    for tag_key, label in TAG_LABELS.items():
        key, val = tag_key.split("=")
        if tags.get(key) == val:
            tipo = label
            break

    # URL Wikipedia (se disponibile in OSM)
    wiki_url = None
    if tags.get("wikipedia"):
        lang, title = tags["wikipedia"].split(":", 1) if ":" in tags["wikipedia"] else ("it", tags["wikipedia"])
        wiki_url = f"https://{lang}.wikipedia.org/wiki/{title.replace(' ', '_')}"

    # URL sito web ufficiale
    website = tags.get("website") or tags.get("url") or tags.get("contact:website")

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "osm_id":    f"{elem['type']}/{elem['id']}",
            "name":      name,
            "categoria": category,
            "tipo":      tipo,
            "wiki_url":  wiki_url,
            "website":   website,
            "osm_url":   f"https://www.openstreetmap.org/{elem['type']}/{elem['id']}",
            "wikidata":  tags.get("wikidata"),   # QID, usato per l'enrichment
            # attributi extra utili
            "description": tags.get("description") or tags.get("description:it"),
            "opening_hours": tags.get("opening_hours"),
            "phone":     tags.get("phone") or tags.get("contact:phone"),
            "image":     None,   # popolato da enrich_with_wikidata (foto Commons)
        }
    }


WIKIDATA_API = "https://www.wikidata.org/w/api.php"


def enrich_with_wikidata(features: list[dict]) -> list[dict]:
    """
    Per i POI con un tag `wikidata` in OSM, recupera da Wikidata la descrizione
    (it, fallback en) e la foto (P18 → URL Commons). Batch di 50 QID per chiamata.
    """
    qids = sorted({f["properties"]["wikidata"] for f in features
                   if f["properties"].get("wikidata")})
    if not qids:
        return features
    print(f"\n[WIKIDATA] Arricchisco {len(qids)} POI con QID ...")

    info: dict[str, dict] = {}
    for i in range(0, len(qids), 50):
        batch = qids[i:i + 50]
        try:
            r = requests.get(WIKIDATA_API, headers=OVERPASS_HEADERS, timeout=60, params={
                "action": "wbgetentities", "ids": "|".join(batch),
                "props": "descriptions|claims", "languages": "it|en", "format": "json",
            })
            entities = r.json().get("entities", {})
        except Exception as e:
            print(f"   [ERRORE batch {i//50+1}] {e}")
            continue

        for qid, ent in entities.items():
            descr = (ent.get("descriptions", {}).get("it")
                     or ent.get("descriptions", {}).get("en") or {}).get("value")
            image = None
            p18 = ent.get("claims", {}).get("P18")
            if p18:
                try:
                    fname = p18[0]["mainsnak"]["datavalue"]["value"]
                    image = f"https://commons.wikimedia.org/wiki/Special:FilePath/{fname.replace(' ', '_')}?width=400"
                except (KeyError, IndexError):
                    pass
            info[qid] = {"descrizione": descr, "image": image}
        print(f"   batch {i//50+1}/{(len(qids)+49)//50}: {len(entities)} entità")
        time.sleep(1)

    enriched = 0
    for f in features:
        qid = f["properties"].get("wikidata")
        if qid and qid in info:
            data = info[qid]
            if data["image"]:
                f["properties"]["image"] = data["image"]
            if data["descrizione"] and not f["properties"].get("description"):
                f["properties"]["description"] = data["descrizione"]
            enriched += 1
    print(f"[WIKIDATA] {enriched} POI arricchiti (con foto: "
          f"{sum(1 for f in features if f['properties'].get('image'))})")
    return features


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    all_features = []

    for category, query_template in CATEGORIES.items():
        print(f"\n[{category.upper()}]")

        elements = overpass_query(category, query_template)

        features = []
        for elem in elements:
            feat = element_to_feature(elem, category)
            if feat:
                features.append(feat)

        # Rimuovi duplicati per nome (stesso nome a distanza ravvicinata)
        seen_names = set()
        unique = []
        for f in features:
            key = f["properties"]["name"].lower().strip()
            if key not in seen_names:
                seen_names.add(key)
                unique.append(f)

        print(f"      → {len(unique)} POI validi (con nome)")

        # Salva per categoria
        if unique:
            geojson = {"type": "FeatureCollection", "features": unique}
            out_file = OUT_DIR / f"poi_{category}.geojson"
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(geojson, f, ensure_ascii=False)
            print(f"      → Salvato: {out_file.name}")

            all_features.extend(unique)

        time.sleep(SLEEP)

    # Arricchimento Wikidata (descrizione + foto) sul file unico usato dal frontend
    all_features = enrich_with_wikidata(all_features)

    # Salva file unico con tutti i POI
    all_geojson = {"type": "FeatureCollection", "features": all_features}
    all_file = OUT_DIR / "poi_all.geojson"
    with open(all_file, "w", encoding="utf-8") as f:
        json.dump(all_geojson, f, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"Completato!")
    print(f"  Totale POI: {len(all_features)}")
    print(f"  Per categoria: {OUT_DIR}/poi_{{categoria}}.geojson")
    print(f"  File unico:    {all_file}")
    print(f"{'='*50}")
    print("\nProssimo step: setup del frontend")


if __name__ == "__main__":
    main()
