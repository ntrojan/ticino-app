"""
01_filter_gtfs.py
=================
Scarica il feed GTFS svizzero completo da opentransportdata.swiss
e lo filtra per il Canton Ticino, producendo un feed ridotto pronto
per OpenTripPlanner.

UTILIZZO
--------
1. Scarica manualmente il file GTFS da:
   https://opentransportdata.swiss/it/dataset/timetable-2024-gtfs2020
   Salva il file come: data/raw/gtfs/gtfs_switzerland.zip

2. Esegui:
   python scripts/01_filter_gtfs.py

OUTPUT
------
data/processed/gtfs_ticino/   → feed GTFS filtrato (pronto per OTP)
data/processed/stops_ticino.geojson  → fermate come GeoJSON (per il frontend)

DIPENDENZE
----------
pip install gtfs-kit geopandas shapely pandas
"""

import zipfile
import shutil
from collections import defaultdict
from pathlib import Path

import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

# ── Percorsi ──────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent.parent
INPUT_ZIP   = ROOT / "data/raw/gtfs/gtfs_switzerland.zip"
OUTPUT_DIR  = ROOT / "data/processed/gtfs_ticino"
OUTPUT_STOPS= ROOT / "data/processed/stops_ticino.geojson"

# ── Area Of Interest (poligono) ──────────────────────────────────────────────
# Ticino + Moesano + 20 km in Italia. Prodotta da scripts/00_build_aoi.py.
AOI_FILE = ROOT / "data/processed/aoi.geojson"

# ── File che compongono un feed GTFS ─────────────────────────────────────────
# Required = devono esserci; Optional = inclusi se presenti
GTFS_REQUIRED = ["agency.txt", "stops.txt", "routes.txt",
                  "trips.txt", "stop_times.txt", "calendar.txt"]
GTFS_OPTIONAL = ["calendar_dates.txt", "feed_info.txt",
                  "transfers.txt", "shapes.txt"]


def load_table(zf: zipfile.ZipFile, name: str) -> pd.DataFrame | None:
    """Carica un file .txt dal feed GTFS come DataFrame."""
    try:
        with zf.open(name) as f:
            return pd.read_csv(f, dtype=str, low_memory=False)
    except KeyError:
        return None


def filter_gtfs():
    if not INPUT_ZIP.exists():
        print(f"[ERRORE] File non trovato: {INPUT_ZIP}")
        print("  → Scarica il GTFS da opentransportdata.swiss e salvalo in:")
        print(f"    {INPUT_ZIP}")
        return

    print(f"[1/7] Apertura feed GTFS: {INPUT_ZIP.name} ...")
    with zipfile.ZipFile(INPUT_ZIP) as zf:

        # 1. Carica stops e filtra con il poligono AOI (point-in-polygon)
        print("[2/7] Filtraggio fermate dentro l'AOI (Ticino + Moesano + 20km IT) ...")
        if not AOI_FILE.exists():
            print(f"[ERRORE] AOI non trovata: {AOI_FILE}")
            print("  → Esegui prima: python scripts/00_build_aoi.py")
            return
        aoi = gpd.read_file(AOI_FILE).geometry.union_all()

        stops = load_table(zf, "stops.txt")
        stops["stop_lat"] = pd.to_numeric(stops["stop_lat"], errors="coerce")
        stops["stop_lon"] = pd.to_numeric(stops["stop_lon"], errors="coerce")
        stops = stops.dropna(subset=["stop_lat", "stop_lon"])
        # Escludi le stazioni-padre (contenitori non serviti da corse, id "Parent…"
        # o location_type=1): sono doppioni delle fermate vere e gonfiano i dati.
        is_parent = stops["stop_id"].astype(str).str.startswith("Parent")
        if "location_type" in stops.columns:
            is_parent |= stops["location_type"].astype(str) == "1"
        stops = stops[~is_parent]
        # Prefiltro rapido col bounding box dell'AOI, poi point-in-polygon preciso
        minx, miny, maxx, maxy = aoi.bounds
        bbox_mask = (
            (stops["stop_lat"] >= miny) & (stops["stop_lat"] <= maxy) &
            (stops["stop_lon"] >= minx) & (stops["stop_lon"] <= maxx)
        )
        cand = stops[bbox_mask]
        pts = gpd.GeoSeries(
            gpd.points_from_xy(cand["stop_lon"], cand["stop_lat"]), crs=4326
        )
        stops_ti = cand[pts.within(aoi).values].copy()
        print(f"    → {len(stops_ti):,} fermate nell'AOI (su {len(stops):,} totali)")

        stop_ids = set(stops_ti["stop_id"])

        # 2. Filtra stop_times per le fermate selezionate
        print("[3/7] Filtraggio stop_times ...")
        stop_times = load_table(zf, "stop_times.txt")
        stop_times_ti = stop_times[stop_times["stop_id"].isin(stop_ids)]
        trip_ids = set(stop_times_ti["trip_id"])
        print(f"    → {len(trip_ids):,} corse che toccano il Ticino")

        # 3. Filtra trips
        print("[4/7] Filtraggio trips ...")
        trips = load_table(zf, "trips.txt")
        trips_ti = trips[trips["trip_id"].isin(trip_ids)]
        route_ids    = set(trips_ti["route_id"])
        service_ids  = set(trips_ti["service_id"])
        shape_ids    = set(trips_ti["shape_id"]) if "shape_id" in trips_ti.columns else set()

        # 4. Filtra routes
        print("[5/7] Filtraggio routes e agency ...")
        routes = load_table(zf, "routes.txt")
        routes_ti = routes[routes["route_id"].isin(route_ids)]
        agency_ids = set(routes_ti["agency_id"]) if "agency_id" in routes_ti.columns else None

        agency = load_table(zf, "agency.txt")
        if agency is not None and agency_ids:
            agency_ti = agency[agency["agency_id"].isin(agency_ids)]
        else:
            agency_ti = agency  # piccolo file, tienilo tutto

        # 5. Filtra calendar e calendar_dates
        calendar = load_table(zf, "calendar.txt")
        calendar_ti = calendar[calendar["service_id"].isin(service_ids)] if calendar is not None else None

        cal_dates = load_table(zf, "calendar_dates.txt")
        cal_dates_ti = cal_dates[cal_dates["service_id"].isin(service_ids)] if cal_dates is not None else None

        # 6. Filtra shapes (opzionale)
        shapes = load_table(zf, "shapes.txt")
        shapes_ti = shapes[shapes["shape_id"].isin(shape_ids)] if (shapes is not None and shape_ids) else None

        # 7. Scrivi il feed filtrato
        print("[6/7] Scrittura feed GTFS filtrato ...")
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        tables = {
            "agency.txt":         agency_ti,
            "stops.txt":          stops_ti,
            "routes.txt":         routes_ti,
            "trips.txt":          trips_ti,
            "stop_times.txt":     stop_times_ti,
            "calendar.txt":       calendar_ti,
            "calendar_dates.txt": cal_dates_ti,
            "shapes.txt":         shapes_ti,
        }

        # Copia feed_info invariato (non contiene riferimenti a fermate)
        try:
            with zf.open("feed_info.txt") as src, open(OUTPUT_DIR / "feed_info.txt", "wb") as dst:
                dst.write(src.read())
        except KeyError:
            pass

        # Filtra transfers: tieni solo i trasferimenti tra fermate del Ticino.
        # Se si copiasse il file intero, conterrebbe riferimenti a fermate fuori
        # cantone (ora assenti) e OTP rifiuterebbe il build per riferimenti pendenti.
        transfers = load_table(zf, "transfers.txt")
        if transfers is not None and {"from_stop_id", "to_stop_id"} <= set(transfers.columns):
            transfers_ti = transfers[
                transfers["from_stop_id"].isin(stop_ids) &
                transfers["to_stop_id"].isin(stop_ids)
            ]
            if len(transfers_ti) > 0:
                transfers_ti.to_csv(OUTPUT_DIR / "transfers.txt", index=False)
                print(f"    ✓ transfers.txt: {len(transfers_ti):,} righe "
                      f"(su {len(transfers):,} totali)")

        for filename, df in tables.items():
            if df is not None and len(df) > 0:
                df.to_csv(OUTPUT_DIR / filename, index=False)
                print(f"    ✓ {filename}: {len(df):,} righe")

    # 8. Esporta fermate come GeoJSON per il frontend
    print("[7/7] Esportazione fermate GeoJSON per il frontend ...")
    gdf_stops = gpd.GeoDataFrame(
        stops_ti[["stop_id", "stop_name", "stop_lat", "stop_lon"]].copy(),
        geometry=[Point(lon, lat) for lon, lat in
                  zip(stops_ti["stop_lon"].astype(float),
                      stops_ti["stop_lat"].astype(float))],
        crs="EPSG:4326"
    )

    # Tipo di trasporto per fermata, dal route_type GTFS esteso delle linee che la
    # servono (più accurato dell'euristica sul prefisso stop_id). Il feed svizzero usa
    # i codici estesi: 1xx=treno, 7xx=bus, 13xx=funivia, 116=cremagliera, ecc.
    def categoria(route_type: str) -> str:
        try:
            rt = int(route_type)
        except (TypeError, ValueError):
            return "altro"
        if rt == 116 or 1400 <= rt <= 1499:   return "funicolare"
        if rt == 2 or 100 <= rt <= 199:       return "treno"
        if rt == 3 or 700 <= rt <= 799:       return "bus"
        if rt in (6, 7) or 1300 <= rt <= 1399: return "funivia"
        if rt == 4 or 1000 <= rt <= 1299:     return "battello"
        if rt == 0 or 900 <= rt <= 999:       return "tram"
        return "altro"

    rt_by_route   = dict(zip(routes_ti["route_id"], routes_ti["route_type"]))
    route_by_trip = dict(zip(trips_ti["trip_id"], trips_ti["route_id"]))
    stop_cats: dict[str, set] = defaultdict(set)
    for sid, tid in zip(stop_times_ti["stop_id"], stop_times_ti["trip_id"]):
        rt = rt_by_route.get(route_by_trip.get(tid))
        if rt is not None:
            stop_cats[sid].add(categoria(rt))

    # Una fermata servita da più mezzi prende il tipo "più importante".
    PRIORITA = ["treno", "funicolare", "funivia", "battello", "tram", "bus", "altro"]
    gdf_stops["tipo"] = gdf_stops["stop_id"].map(
        lambda sid: next((p for p in PRIORITA if p in stop_cats.get(sid, ())), "altro")
    )

    # Comune: prima parte del nome (prima della virgola), senza il marcatore "(I)".
    gdf_stops["comune"] = gdf_stops["stop_name"].map(
        lambda n: str(n).split(",")[0].strip().replace(" (I)", "").strip()
    )

    gdf_stops.to_file(OUTPUT_STOPS, driver="GeoJSON")
    print(f"    ✓ {OUTPUT_STOPS.name}: {len(gdf_stops):,} fermate")

    print("\n[✓] Completato!")
    print(f"    Feed GTFS Ticino → {OUTPUT_DIR}/")
    print(f"    Fermate GeoJSON  → {OUTPUT_STOPS}")
    print("\n  Prossimo step: esegui 02_setup_otp.py")


if __name__ == "__main__":
    filter_gtfs()
