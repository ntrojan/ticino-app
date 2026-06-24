"""
05_pack_for_deploy.py
=====================
Prepara i dati per il deploy statico (es. Netlify). Le ~21k isocrone per-fascia
sono tante e hanno i ":" nel nome (problematici su molti host/CDN). Questo script:

  - combina le 4 fasce di ogni fermata in UN file (FeatureCollection con `band`)
  - sanifica il nome file: ":" e "/" → "_"
  - copia stops / poi / aoi
  - rigenera _index.json puntando ai file combinati

UTILIZZO
--------
    python scripts/05_pack_for_deploy.py [cartella_destinazione]

Default destinazione: frontend/dist/data  (esegui DOPO `npm run build`).
Il frontend (isochrones.js) prova prima il file combinato, poi ripiega sui
per-fascia: così funziona sia in deploy (combinati) sia in dev (per-fascia).
"""

import json
import shutil
import sys
from pathlib import Path

ROOT     = Path(__file__).parent.parent
PROC     = ROOT / "data/processed"
ISO_SRC  = PROC / "isocrone"
TIME_LIMITS = [15, 30, 45, 60]


def safe(stop_id: str) -> str:
    return str(stop_id).replace("/", "_").replace(":", "_")


def main():
    dest = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "frontend/dist/data"
    iso_dest = dest / "isocrone"
    iso_dest.mkdir(parents=True, exist_ok=True)

    stops = json.loads((PROC / "stops_ticino.geojson").read_text())

    index, packed = [], 0
    for feat in stops["features"]:
        p = feat["properties"]
        sid = p["stop_id"]
        lon, lat = feat["geometry"]["coordinates"]
        entry = {"stop_id": sid, "stop_name": p["stop_name"], "comune": p.get("comune"),
                 "tipo": p.get("tipo", "altro"), "lat": lat, "lon": lon, "file": None}

        features = []
        for m in TIME_LIMITS:
            f = ISO_SRC / f"{p['stop_id'].replace('/', '_')}_{m}min.geojson"
            if not f.exists():
                continue
            for g in json.loads(f.read_text()).get("features", []):
                g.setdefault("properties", {})["band"] = m
                features.append(g)

        if features:
            features.sort(key=lambda g: -g["properties"]["band"])  # ampie sotto
            fname = f"{safe(sid)}.geojson"
            (iso_dest / fname).write_text(
                json.dumps({"type": "FeatureCollection", "features": features},
                           ensure_ascii=False))
            entry["file"] = fname
            packed += 1
        index.append(entry)

    (iso_dest / "_index.json").write_text(json.dumps(index, ensure_ascii=False))

    # Copia gli altri dati
    shutil.copy2(PROC / "stops_ticino.geojson", dest / "stops_ticino.geojson")
    shutil.copy2(PROC / "aoi.geojson", dest / "aoi.geojson")
    (dest / "poi").mkdir(exist_ok=True)
    shutil.copy2(PROC / "poi/poi_all.geojson", dest / "poi/poi_all.geojson")

    print(f"[✓] Pacchetto deploy in {dest}")
    print(f"    fermate con isocrone: {packed}/{len(index)}")


if __name__ == "__main__":
    main()
