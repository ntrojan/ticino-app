# TicinoTP — Isocrone trasporti pubblici per turisti

App interattiva per esplorare cosa si raggiunge con i mezzi pubblici partendo da
qualsiasi fermata del **Ticino e del Moesano**, con i punti di interesse integrati.
Clicchi una fermata → vedi l'area raggiungibile entro 15/30/45/60 minuti, con sopra
musei, laghi, belvedere, ristoranti, ecc.

## Come funziona

Una pipeline di 5 script Python pre-calcola tutti i dati, poi un frontend
React + MapLibre li mostra su mappa. OpenTripPlanner (OTP) fa il routing dei trasporti.

```
GTFS CH ─┐
         ├─00─► AOI (poligono) + OSM ritagliato ─02─► grafo OTP ─┐
swissBOUNDARIES3D ┘                                              │
GTFS CH ─01─► fermate nell'AOI (stops_ticino.geojson) ──────────03─► isocrone/*.geojson
OpenStreetMap ─04─► poi/*.geojson                                    └─► frontend (mappa)
```

### Area Of Interest (AOI)

Non un rettangolo, ma un **poligono**: Canton Ticino ∪ regione **Moesa** dei Grigioni
(Mesolcina + Calanca), con un **buffer uniforme di 10 km** tutt'attorno. Costruito da
`00_build_aoi.py` a partire da swissBOUNDARIES3D. Le fermate e i POI sono filtrati su
questo poligono; l'OSM (Svizzera + Italia nord-ovest) viene ritagliato sull'AOI.

## Setup

### 1. Ambiente Python

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

### 2. Strumenti esterni

- **Java 17+** (per OTP — gira come `java -jar`, niente Docker)
- **osmium-tool** (per ritagliare l'OSM): `conda install -c conda-forge osmium-tool`

### 3. GTFS svizzero (download manuale)

Scaricalo dalla pagina `opendata.swiss/it/dataset/fahrplan-<anno>-gtfs2020`
(download diretto senza login) e salvalo come `data/raw/gtfs/gtfs_switzerland.zip`.

### 4. Esegui la pipeline in ordine

```bash
python scripts/00_build_aoi.py          # poligono AOI + ritaglio OSM (scarica swissBOUNDARIES3D, CH+IT OSM)
python scripts/01_filter_gtfs.py        # fermate dentro l'AOI (~2 min)
python scripts/02_setup_otp.py          # scarica OTP, costruisce il grafo dall'OSM AOI
python scripts/02_setup_otp.py --serve  # avvia OTP su :8080 (in un terminale a parte)
python scripts/03_compute_isocrones.py  # ~21k isocrone (5340 fermate × 4 fasce) — ore
python scripts/04_fetch_poi.py          # POI da OpenStreetMap, ritagliati sull'AOI
```

Flag utili:
- `03_compute_isocrones.py --test` — solo 5 fermate (prova rapida)
- `03_compute_isocrones.py --resume` — salta le isocrone già calcolate (sicuro interrompere e riprendere)

Calcolo lungo? Tieni sveglio il Mac legandolo al processo:
```bash
caffeinate -dimsu -w $(pgrep -f 03_compute_isocrones.py)
```

### 5. Frontend

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
```

I GeoJSON sono serviti via il symlink `frontend/public/data → ../data/processed`.
Dettagli in [frontend/README.md](frontend/README.md).

## Note importanti

- **`DEPART_DATE`** in `03_compute_isocrones.py` deve cadere nella validità del feed GTFS,
  altrimenti le isocrone escono vuote.
- OTP 2.x: le isocrone usano l'API sandbox **TravelTime** (`/otp/traveltime/isochrone`),
  abilitata da `02_setup_otp.py` via `otp-config.json`.
- Vedi [CLAUDE.md](CLAUDE.md) per le insidie incontrate eseguendo la pipeline.

## Roadmap

- [x] Pipeline dati (AOI, GTFS, OTP, isocrone, POI)
- [x] Frontend React + MapLibre (ricerca/filtri fermate, isocrone, POI)
- [ ] Arricchimento Wikidata dei POI
- [ ] Deploy (Netlify)
