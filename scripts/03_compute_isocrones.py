"""
03_compute_isocrones.py
=======================
Pre-calcola le isocrone per tutte le fermate TP del Ticino
interrogando OpenTripPlanner in locale.

PREREQUISITI
------------
- OTP in esecuzione: python scripts/02_setup_otp.py --serve
- File: data/processed/stops_ticino.geojson

UTILIZZO
--------
    python scripts/03_compute_isocrones.py

    # Per riprendere da dove ci si è fermati (in caso di interruzione):
    python scripts/03_compute_isocrones.py --resume

    # Per testare con le prime 5 fermate:
    python scripts/03_compute_isocrones.py --test

OUTPUT
------
data/processed/isocrone/{stop_id}_{minuti}min.geojson
data/processed/isocrone/_index.json   ← indice per il frontend

STIMA TEMPO
-----------
~1800 fermate × 4 fasce × ~2 sec = ~4 ore totali
Con --resume è sicuro interrompere e riprendere in qualsiasi momento.

DIPENDENZE
----------
pip install geopandas requests
"""

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

import geopandas as gpd
import requests

# ── Configurazione ────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent
STOPS_FILE = ROOT / "data/processed/stops_ticino.geojson"
OUT_DIR    = ROOT / "data/processed/isocrone"
INDEX_FILE = OUT_DIR / "_index.json"

# OTP 2.x: le isocrone stanno nella sandbox "TravelTime" (NON più in
# /otp/routers/default/isochrone, che era OTP 1.x). Va abilitata in
# otp-config.json con "SandboxAPITravelTime": true (lo fa lo script 02).
OTP_BASE   = "http://localhost:8080/otp"
ISOCHRONE_ENDPOINT = f"{OTP_BASE}/traveltime/isochrone"

# Fasce temporali in minuti
TIME_LIMITS = [15, 30, 45, 60]

# Orario di partenza per il calcolo (martedì mattina ore 9:00 — evita weekend e festivi).
# IMPORTANTE: la data DEVE rientrare nel periodo di validità del feed GTFS scaricato,
# altrimenti le isocrone escono vuote. Aggiornala a un martedì feriale coperto dal feed.
DEPART_DATE = "2026-06-16"   # martedì, dentro la validità del feed FP2026 (14.12.2025–12.12.2026)
DEPART_TIME = "09:00:00"
# Offset orario del Ticino: +01:00 in inverno, +02:00 con l'ora legale (giugno = estate).
UTC_OFFSET  = "+02:00"
# Velocità a piedi in m/s (default OTP ~1.33 = 4.8 km/h)
WALK_SPEED  = 1.33

# Pausa tra le richieste per non sovraccaricare OTP
SLEEP_BETWEEN = 0.5   # secondi
SLEEP_ON_ERROR = 5.0  # secondi

# Numero di tentativi per ogni richiesta
MAX_RETRIES = 3


def otp_alive() -> bool:
    """
    Verifica che OTP sia in ascolto. OTP avvia il web server solo dopo aver
    caricato il grafo, quindi qualsiasi risposta HTTP sull'endpoint isocrone
    (anche un 400 per parametri mancanti) significa che è pronto. Non usiamo
    /otp/actuators/health perché la feature ActuatorAPI è disattivata di default.
    """
    try:
        requests.get(ISOCHRONE_ENDPOINT, timeout=5)
        return True
    except Exception:
        return False


def compute_isochrone(stop_lat: float, stop_lon: float, minutes: int) -> dict | None:
    """
    Chiama l'API TravelTime di OTP 2.x per calcolare una singola isocrona.
    Restituisce il GeoJSON (FeatureCollection) della risposta, o None in caso di errore.
    """
    params = {
        "location":  f"{stop_lat},{stop_lon}",
        "modes":     "WALK,TRANSIT",
        "time":      f"{DEPART_DATE}T{DEPART_TIME}{UTC_OFFSET}",
        "arriveBy":  "false",
        "cutoff":    f"{minutes}m",
        "walkSpeed": WALK_SPEED,
    }

    # Stati deterministici: ritentare non aiuta. 500 = LOCATION_NOT_FOUND (la
    # fermata è fuori dalla copertura OSM svizzera, es. fermate italiane di confine
    # dentro il bbox); 400 = richiesta malformata. In questi casi si salta subito.
    PERMANENT_STATUS = {400, 404, 500}

    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(ISOCHRONE_ENDPOINT, params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            elif r.status_code in PERMANENT_STATUS:
                return None
            else:
                print(f"    [HTTP {r.status_code}] tentativo {attempt+1}/{MAX_RETRIES}")
                time.sleep(SLEEP_ON_ERROR)
        except requests.exceptions.Timeout:
            print(f"    [TIMEOUT] tentativo {attempt+1}/{MAX_RETRIES}")
            time.sleep(SLEEP_ON_ERROR)
        except Exception as e:
            print(f"    [ERRORE] {e}")
            time.sleep(SLEEP_ON_ERROR)

    return None


def safe_stop_id(stop_id: str) -> str:
    """
    Rende uno stop_id sicuro come nome file. Alcuni stop_id GTFS contengono "/"
    (es. "8505470:0:11/12"), che verrebbe interpretato come sottocartella. I ":"
    invece sono leciti su APFS e si tengono. La stessa trasformazione va replicata
    nel frontend per ricostruire il nome file.
    """
    return str(stop_id).replace("/", "_")


def load_progress() -> set:
    """Carica la lista dei file già calcolati (per --resume)."""
    if not OUT_DIR.exists():
        return set()
    return {f.stem for f in OUT_DIR.glob("*.geojson")}


def save_index(stops_gdf: gpd.GeoDataFrame):
    """Salva un indice JSON con tutte le fermate e i file disponibili."""
    index = []
    for _, row in stops_gdf.iterrows():
        stop_id = row["stop_id"]
        entry = {
            "stop_id":   stop_id,
            "stop_name": row["stop_name"],
            "lat":       row.geometry.y,
            "lon":       row.geometry.x,
            "tipo":      row.get("tipo", "bus"),
            "isocrone":  {}
        }
        for m in TIME_LIMITS:
            fname = f"{safe_stop_id(stop_id)}_{m}min.geojson"
            if (OUT_DIR / fname).exists():
                entry["isocrone"][f"{m}min"] = fname
        index.append(entry)

    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False)
    print(f"[✓] Indice aggiornato: {INDEX_FILE} ({len(index)} fermate)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", action="store_true",
                        help="Salta le fermate già calcolate")
    parser.add_argument("--test", action="store_true",
                        help="Calcola solo le prime 5 fermate (test rapido)")
    args = parser.parse_args()

    # Verifica OTP
    if not otp_alive():
        print("[ERRORE] OTP non raggiungibile su http://localhost:8080")
        print("  → Avvia OTP con: python scripts/02_setup_otp.py --serve")
        return

    print("[✓] OTP in ascolto")

    # Carica fermate
    if not STOPS_FILE.exists():
        print(f"[ERRORE] File non trovato: {STOPS_FILE}")
        print("  → Esegui prima: python scripts/01_filter_gtfs.py")
        return

    stops = gpd.read_file(STOPS_FILE)
    print(f"[✓] {len(stops)} fermate caricate")

    if args.test:
        stops = stops.head(5)
        print("[!] Modalità TEST: solo 5 fermate")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    done = load_progress() if args.resume else set()

    total    = len(stops) * len(TIME_LIMITS)
    computed = 0
    skipped  = 0
    errors   = 0
    t_start  = time.time()

    print(f"\n[→] Inizio calcolo: {len(stops)} fermate × {len(TIME_LIMITS)} fasce = {total} isocrone")
    if args.resume:
        already = len(done)
        print(f"    Già calcolate: {already}, da calcolare: {total - already}")
    print()

    for i, (_, stop) in enumerate(stops.iterrows()):
        stop_id   = stop["stop_id"]
        stop_name = stop["stop_name"]
        lat       = stop.geometry.y
        lon       = stop.geometry.x

        print(f"[{i+1}/{len(stops)}] {stop_name} ({stop_id})")

        for minutes in TIME_LIMITS:
            key      = f"{safe_stop_id(stop_id)}_{minutes}min"
            out_file = OUT_DIR / f"{key}.geojson"

            if args.resume and key in done:
                skipped += 1
                continue

            geojson = compute_isochrone(lat, lon, minutes)

            if geojson:
                with open(out_file, "w") as f:
                    json.dump(geojson, f)
                computed += 1
                print(f"    ✓ {minutes}min")
            else:
                errors += 1
                print(f"    ✗ {minutes}min — ERRORE (skippato)")

            time.sleep(SLEEP_BETWEEN)

        # Stima tempo rimanente ogni 10 fermate
        if (i + 1) % 10 == 0:
            elapsed  = time.time() - t_start
            rate     = (computed + skipped) / elapsed if elapsed > 0 else 0
            remaining = (total - computed - skipped - errors) / rate if rate > 0 else 0
            print(f"\n  ⏱ Progresso: {computed+skipped}/{total} | "
                  f"Errori: {errors} | "
                  f"Tempo rimanente stimato: {remaining/60:.0f} min\n")

    # Salva indice finale
    save_index(stops)

    elapsed = time.time() - t_start
    print(f"\n{'='*50}")
    print(f"Completato in {elapsed/60:.0f} minuti")
    print(f"  Calcolate:  {computed}")
    print(f"  Saltate:    {skipped}")
    print(f"  Errori:     {errors}")
    print(f"  Output:     {OUT_DIR}/")
    print(f"{'='*50}")
    print("\nProssimo step: python scripts/04_fetch_poi.py")


if __name__ == "__main__":
    main()
