# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TicinoTP is a data pipeline that pre-computes public-transport isochrones (areas
reachable within N minutes) for every transit stop in Canton Ticino, plus tourist
POIs, to feed an interactive map. The four scripts in `scripts/` run **in numbered
order** — each consumes the previous one's output. There is no test suite or build
system; the "build" is running the pipeline end to end. Code comments and CLI output
are in Italian; keep that convention when editing.

The `frontend/` (React + MapLibre) exists and reads the pipeline's GeoJSON output.

## Setup & running the pipeline

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

Then run the scripts in order from the repo root (paths are resolved relative to the
script location, so they work from anywhere):

```bash
python scripts/00_build_aoi.py            # build AOI polygon + clip OSM to it (needs osmium-tool)
python scripts/01_filter_gtfs.py          # filter Swiss GTFS to the AOI polygon (~2 min)
python scripts/02_setup_otp.py            # download OTP jar, build graph from AOI OSM (Java 17+)
python scripts/02_setup_otp.py --serve    # start OTP server on localhost:8080
python scripts/03_compute_isocrones.py    # query OTP for ~20k isochrones (5093 stops × 4)
python scripts/04_fetch_poi.py            # fetch POIs from Overpass, clipped to AOI
```

The **AOI** (Area of Interest) is a polygon, not a bbox: (Canton Ticino ∪ the Moesa
region — GR: Mesolcina + Calanca) buffered by a uniform **10 km** in all directions.
Built by `00_build_aoi.py` from **swissBOUNDARIES3D**
(`tlm_kantonsgebiet` name="Ticino", `tlm_bezirksgebiet` name="Moesa", `tlm_landesgebiet`
icc="CH"). Saved to `data/processed/aoi.geojson` (also drawn on the map). Scripts 01 and
04 filter by this polygon; `00` clips OSM to it.

Useful flags while developing:
- `03_compute_isocrones.py --test` — only the first 5 stops (fast smoke test)
- `03_compute_isocrones.py --resume` — skip already-computed isochrones; safe to
  interrupt and restart at any point (progress = files already on disk)

`02_setup_otp.py` runs OTP 2.5.0 directly as a `java -jar` process (Java 17+, no Docker)
and downloads the shaded jar from Maven Central into `otp/`. `03` requires the OTP server
from `02 --serve` to be live in a separate terminal.

OTP 2.x note: isochrones come from the **TravelTime sandbox API** (`/otp/traveltime/isochrone`),
not the removed OTP-1.x `/otp/routers/default/isochrone`. Script 02 enables it by writing
`otp-config.json` with `"SandboxAPITravelTime": true`; script 03 calls the new endpoint.
The exact request params in script 03 (`location`, `modes`, `time` with UTC offset, `cutoff`
like `15m`) should be confirmed with `03 --test` against a live OTP the first time.

## Manual prerequisites (not automated)

- **Swiss GTFS feed**: needed at `data/raw/gtfs/gtfs_switzerland.zip` before script 01.
  The CKAN portal exposes a no-login direct download (R2-signed) — find the current one
  from the dataset page `opendata.swiss/en/dataset/fahrplan-<year>-gtfs2020`; the 2026
  feed was `gtfs_fp2026_2025-07-03.zip`. Script 02 downloads OSM itself.

## Gotchas learned from actually running the pipeline (2026-06)

These bit us once and are now fixed in the scripts; don't reintroduce them:
- **`transfers.txt` must be filtered** to Ticino stops in script 01. Copying it whole
  leaves dangling stop references and OTP aborts the graph build.
- **No Ticino OSM extract on Geofabrik.** Script 02 downloads all-Switzerland
  (`switzerland-latest.osm.pbf`, ~530 MB) and builds the full street graph (hence
  `JVM_MEM = "10G"`). The wrong URL silently returns an HTML error page — script 02 now
  size/HTML-checks the download.
- **OTP 2.5 isochrones** = TravelTime sandbox (`/otp/traveltime/isochrone`), enabled via
  `otp-config.json` `"SandboxAPITravelTime": true`. Working request params live in
  script 03 (`location`, `modes`, `time` with `+02:00`/`+01:00` offset, `cutoff=15m`).
  `ActuatorAPI` is off, so readiness is checked by hitting the isochrone endpoint, not
  `/otp/actuators/health`.
- **`DEPART_DATE` must be inside the feed's calendar validity** (FP2026 = 2025-12-14 to
  2026-12-12) or isochrones come back empty. Use a non-holiday Tuesday in range.
- **Overpass needs an explicit `Accept: application/json` header** (script 04) or it
  returns HTTP 406 and zero POIs.
- **Some GTFS `stop_id`s contain `/`** (e.g. `8505470:0:11/12`), which breaks isochrone
  filenames (treated as a subdir). Script 03 sanitizes via `safe_stop_id` (`/`→`_`); the
  frontend (`isochrones.js`) replicates it. `:` is fine on APFS and is kept.
- **Don't `encodeURIComponent` the `:` in isochrone URLs.** Most stop_ids contain `:`;
  encoding it to `%3A` makes Vite's dev server return the SPA `index.html` (200) instead
  of the file, so `res.json()` fails and isochrones silently vanish. `isochrones.js` keeps
  `:` literal. (For deploy, isochrone files should be repacked to drop `:` from names.)

## Data flow & key conventions

```
gtfs_switzerland.zip ──01──> data/processed/gtfs_ticino/        (filtered GTFS feed)
                       └────> data/processed/stops_ticino.geojson (stops, for 03 + frontend)
ticino.osm.pbf ───────02──> otp/graph.obj                       (OTP graph)
stops + OTP ──────────03──> data/processed/isocrone/{stop_id}_{min}min.geojson
                       └────> data/processed/isocrone/_index.json (frontend index)
Overpass ─────────────04──> data/processed/poi/poi_{categoria}.geojson + poi_all.geojson
```

- **Ticino bounding box** is hardcoded in scripts 01 and 04 as
  `W=8.40, E=9.20, S=45.70, N=46.65`. If you change it, change it in both places.
- **Stop type heuristic**: in script 01, `stop_id` starting with `"85"` is classified
  as `treno` (train), otherwise `bus` — this is specific to the Swiss GTFS ID scheme.
- **Isochrone time bands** (`TIME_LIMITS = [15, 30, 45, 60]`) and the fixed departure
  time (`DEPART_DATE` / `DEPART_TIME`, a Tuesday 09:00 to avoid weekends/holidays) live
  in script 03. The `DEPART_DATE` must fall within the GTFS feed's calendar validity —
  update it when using a newer feed, or isochrones come back empty.
- `_index.json` is the manifest the future frontend reads: it lists every stop with its
  coords, type, and which isochrone files exist. Always regenerated by `save_index()` at
  the end of script 03.
- Script 04's POI **categories and Overpass queries** are defined in the `CATEGORIES`
  dict; `TAG_LABELS` maps raw OSM tags to Italian user-facing labels. POIs without a
  name are dropped, and duplicates are removed by lowercased name within each category.
- `enrich_with_wikidata()` in script 04 is a stub (returns features unchanged) —
  Wikidata enrichment is noted as future work.

## Notes for editing the pipeline

- The OTP isochrone API (`/otp/routers/default/isochrone`) is OTP 2.5.0-specific;
  changing `OTP_VERSION` in script 02 may change the available endpoints.
- External APIs (Overpass, OTP) are rate-limited via `time.sleep` constants and retry
  loops — preserve these when modifying request logic to avoid being throttled/banned.
- `data/` and `otp/` are generated artifacts and are not checked in.
