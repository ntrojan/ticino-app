"""
00_build_aoi.py
===============
Costruisce l'Area Of Interest (AOI) come poligono, al posto del vecchio
bounding box rettangolare. L'AOI è:

    (Canton Ticino ∪ Regione Moesa/GR)  bufferata di 10 km

cioè il Ticino più il Moesano (Mesolcina + Calanca), con una fascia uniforme
di 10 km tutt'attorno (in ogni direzione: Italia, resto della CH, ecc.).

FONTE CONFINI
-------------
swissBOUNDARIES3D (swisstopo, gratuito). Scaricato in:
    data/raw/boundaries/swissBOUNDARIES3D_1_5_LV95_LN02.gpkg

OUTPUT
------
data/processed/aoi.geojson   ← poligono AOI in WGS84 (per osmium e per il frontend)

DIPENDENZE
----------
pip install geopandas shapely
"""

import os
import shutil
import subprocess
import urllib.request
from pathlib import Path

import geopandas as gpd
import shapely

ROOT = Path(__file__).parent.parent
GPKG = ROOT / "data/raw/boundaries/swissBOUNDARIES3D_1_5_LV95_LN02.gpkg"
OUT  = ROOT / "data/processed/aoi.geojson"

# Buffer uniforme attorno all'AOI, in metri (CRS metrico CH LV95 = EPSG:2056)
BUFFER_M = 10_000
CRS_METRIC = 2056

# ── OSM: sorgenti da ritagliare sull'AOI (CH + Italia nord-ovest) ─────────────
OSM_DIR = ROOT / "data/raw/osm"
OSM_SOURCES = {
    OSM_DIR / "switzerland.osm.pbf": "https://download.geofabrik.de/europe/switzerland-latest.osm.pbf",
    OSM_DIR / "nord-ovest.osm.pbf":  "https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf",
}
AOI_PBF = OSM_DIR / "aoi.osm.pbf"   # output: OSM ritagliato sull'AOI (lo usa 02_setup_otp.py)


def dissolve_2d(gdf: gpd.GeoDataFrame):
    """Unione di tutte le geometrie, forzate a 2D (lo SwissBOUNDARIES3D è 3D)."""
    geom = shapely.force_2d(shapely.union_all(gdf.geometry.values))
    return geom


def find_osmium() -> str:
    """Trova l'eseguibile osmium (PATH o Miniconda)."""
    exe = shutil.which("osmium") or str(Path.home() / "miniconda3/bin/osmium")
    if not Path(exe).exists():
        raise SystemExit("[ERRORE] osmium non trovato. Installa osmium-tool "
                         "(es. conda install -c conda-forge osmium-tool).")
    return exe


def download_if_missing(dest: Path, url: str):
    if dest.exists():
        print(f"    [✓] {dest.name} già presente ({dest.stat().st_size/1e6:.0f} MB)")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"    [→] Scarico {dest.name} ...")
    urllib.request.urlretrieve(url, dest)


def prepare_osm():
    """Ritaglia l'OSM (CH + Italia NO) sull'AOI e lo unisce in aoi.osm.pbf."""
    if AOI_PBF.exists() and AOI_PBF.stat().st_mtime >= OUT.stat().st_mtime:
        print(f"[OSM] {AOI_PBF.name} già aggiornato, skip ritaglio")
        return
    osmium = find_osmium()
    print("[OSM] Scarico le sorgenti se mancanti ...")
    for dest, url in OSM_SOURCES.items():
        download_if_missing(dest, url)

    clips = []
    for src in OSM_SOURCES:
        clip = OSM_DIR / f"_clip_{src.stem}.pbf"
        print(f"[OSM] Ritaglio {src.name} sull'AOI ...")
        subprocess.run([osmium, "extract", "-p", str(OUT), "-s", "smart",
                        "--overwrite", str(src), "-o", str(clip)], check=True)
        clips.append(str(clip))

    print("[OSM] Unisco i ritagli → aoi.osm.pbf ...")
    subprocess.run([osmium, "merge", *clips, "--overwrite", "-o", str(AOI_PBF)], check=True)
    for c in clips:
        os.unlink(c)
    print(f"[OSM] Fatto: {AOI_PBF} ({AOI_PBF.stat().st_size/1e6:.0f} MB)")


def main():
    if not GPKG.exists():
        raise SystemExit(f"[ERRORE] GeoPackage confini non trovato: {GPKG}")

    print("[1/5] Carico cantone Ticino + regione Moesa ...")
    kant = gpd.read_file(GPKG, layer="tlm_kantonsgebiet").to_crs(CRS_METRIC)
    bez  = gpd.read_file(GPKG, layer="tlm_bezirksgebiet").to_crs(CRS_METRIC)

    ticino = kant[kant["name"] == "Ticino"]
    moesa  = bez[bez["name"] == "Moesa"]
    if ticino.empty or moesa.empty:
        raise SystemExit("[ERRORE] Ticino o Moesa non trovati nel GeoPackage.")
    print(f"    Ticino: {len(ticino)} poligoni · Moesa: {len(moesa)} poligoni")

    print("[2/5] Unisco l'AOI svizzera (Ticino ∪ Moesa) ...")
    aoi_ch = shapely.union_all([dissolve_2d(ticino), dissolve_2d(moesa)])

    print(f"[3/5] Buffer uniforme di {BUFFER_M/1000:.0f} km attorno a Ticino+Moesano ...")
    aoi_final = aoi_ch.buffer(BUFFER_M)

    print("[4/5] Riproietto in WGS84 e salvo ...")
    aoi_gdf = gpd.GeoDataFrame({"name": ["AOI TicinoTP"]}, geometry=[aoi_final], crs=CRS_METRIC)
    aoi_gdf = aoi_gdf.to_crs(4326)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    aoi_gdf.to_file(OUT, driver="GeoJSON")

    km2 = aoi_final.area / 1e6
    bounds = aoi_gdf.total_bounds  # WGS84
    print(f"[5/5] Poligono AOI ≈ {km2:,.0f} km² · bbox WGS84 ="
          f" [{bounds[0]:.3f},{bounds[1]:.3f},{bounds[2]:.3f},{bounds[3]:.3f}]")
    print(f"    → {OUT}")

    # Ritaglio OSM sull'AOI (per OTP)
    prepare_osm()


if __name__ == "__main__":
    main()
