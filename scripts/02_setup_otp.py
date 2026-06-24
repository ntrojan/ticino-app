"""
02_setup_otp.py
===============
Scarica OpenTripPlanner (come .jar) e prepara tutto per costruire il grafo
della rete di trasporto del Ticino (GTFS + rete pedonale OSM).

Esegue OTP direttamente con `java -jar`, senza Docker.

PREREQUISITI
------------
- Java 17 o superiore installato (verifica con: java -version)
- Script 01_filter_gtfs.py già eseguito

UTILIZZO
--------
    python scripts/02_setup_otp.py            # scarica OTP, prepara i file, costruisce il grafo

Poi, per avviare OTP in modalità server:
    python scripts/02_setup_otp.py --serve

DIPENDENZE
----------
Solo librerie standard Python + Java (non serve pip install nulla).
"""

import argparse
import json
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

# ── Configurazione ────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent.parent
OTP_DIR     = ROOT / "otp"
GTFS_DIR    = ROOT / "data/processed/gtfs_ticino"
# OSM già ritagliato sull'AOI (CH + Italia NO, clip su poligono) da 00_build_aoi.py.
OSM_FILE    = ROOT / "data/raw/osm/aoi.osm.pbf"

# Versione OTP da usare (richiede Java 17+)
OTP_VERSION = "2.5.0"
OTP_JAR_URL = (
    "https://repo1.maven.org/maven2/org/opentripplanner/otp/"
    f"{OTP_VERSION}/otp-{OTP_VERSION}-shaded.jar"
)
OTP_JAR     = OTP_DIR / f"otp-{OTP_VERSION}-shaded.jar"

# Memoria massima per la JVM. Il grafo è ritagliato sull'AOI (~74 MB di OSM),
# quindi 8G sono abbondanti.
JVM_MEM = "8G"

# Porta locale dove OTP risponderà
OTP_PORT = 8080


def check_java():
    """Verifica che Java 17+ sia installato."""
    try:
        result = subprocess.run(["java", "-version"],
                                capture_output=True, text=True, timeout=10)
        # `java -version` stampa su stderr
        out = result.stderr or result.stdout
        print(f"[✓] Java trovato: {out.splitlines()[0] if out else '?'}")
    except FileNotFoundError:
        print("[ERRORE] Java non trovato.")
        print("  → Installa un JDK 17+ (es. Amazon Corretto, Temurin) e riprova.")
        sys.exit(1)


def download_otp_jar():
    """Scarica il .jar di OpenTripPlanner da Maven Central."""
    OTP_DIR.mkdir(exist_ok=True)

    if OTP_JAR.exists():
        size_mb = OTP_JAR.stat().st_size / 1024 / 1024
        print(f"[✓] OTP jar già presente ({size_mb:.0f} MB), skip download")
        return

    print(f"[→] Download OpenTripPlanner {OTP_VERSION} (~174 MB) ...")
    print(f"    {OTP_JAR_URL}")

    def progress(count, block_size, total_size):
        pct = min(count * block_size / total_size * 100, 100)
        print(f"\r    {pct:.0f}%", end="", flush=True)

    urllib.request.urlretrieve(OTP_JAR_URL, OTP_JAR, reporthook=progress)
    print(f"\n[✓] OTP scaricato: {OTP_JAR}")


def check_osm():
    """Verifica che l'OSM ritagliato sull'AOI sia presente (lo produce 00_build_aoi.py)."""
    if not OSM_FILE.exists():
        print(f"[ERRORE] OSM dell'AOI non trovato: {OSM_FILE}")
        print("  → Esegui prima: python scripts/00_build_aoi.py (costruisce AOI + ritaglia OSM)")
        sys.exit(1)
    size_mb = OSM_FILE.stat().st_size / 1024 / 1024
    print(f"[✓] OSM AOI presente ({size_mb:.0f} MB)")


def setup_otp_dir():
    """Prepara la cartella OTP con i file necessari (GTFS, OSM, config)."""
    OTP_DIR.mkdir(exist_ok=True)

    # Comprimi il GTFS filtrato nella cartella OTP
    gtfs_zip = OTP_DIR / "gtfs_ticino.zip"
    if not gtfs_zip.exists():
        if not GTFS_DIR.exists():
            print(f"[ERRORE] GTFS filtrato non trovato: {GTFS_DIR}")
            print("  → Esegui prima: python scripts/01_filter_gtfs.py")
            sys.exit(1)
        print("[→] Comprimo il feed GTFS per OTP ...")
        shutil.make_archive(str(OTP_DIR / "gtfs_ticino"), "zip", GTFS_DIR)
        print(f"[✓] {gtfs_zip.name} creato")
    else:
        print(f"[✓] {gtfs_zip.name} già presente")

    # Copia OSM dell'AOI nella cartella OTP. Rimuove eventuali .pbf vecchi (OTP
    # legge TUTTI i .pbf nella cartella: un residuo manderebbe in errore il build).
    for old in OTP_DIR.glob("*.osm.pbf"):
        if old.name != "aoi.osm.pbf":
            old.unlink()
    osm_dest = OTP_DIR / "aoi.osm.pbf"
    shutil.copy2(OSM_FILE, osm_dest)
    print(f"[✓] aoi.osm.pbf copiato in otp/")

    # Scrivi otp-config.json per abilitare l'API isocrone (sandbox TravelTime).
    # In OTP 2.x le isocrone vivono nella sandbox "TravelTime" e vanno abilitate
    # esplicitamente; senza questo flag l'endpoint /otp/traveltime/* non esiste.
    config = {"otpFeatures": {"SandboxAPITravelTime": True}}
    config_file = OTP_DIR / "otp-config.json"
    config_file.write_text(json.dumps(config, indent=2))
    print(f"[✓] otp-config.json scritto (SandboxAPITravelTime abilitata)")


def build_graph():
    """Costruisce il grafo OTP (operazione una tantum, ~10-20 min)."""
    print("\n[→] Costruzione grafo OTP (potrebbe richiedere 10-20 minuti) ...")
    print("    Puoi seguire i log qui sotto:\n")

    cmd = [
        "java", f"-Xmx{JVM_MEM}", "-jar", str(OTP_JAR),
        "--build", "--save", str(OTP_DIR.resolve()),
    ]

    result = subprocess.run(cmd)
    if result.returncode == 0:
        print("\n[✓] Grafo costruito! File: otp/graph.obj")
    else:
        print("\n[ERRORE] Build fallita. Controlla i log sopra.")
        sys.exit(1)


def serve():
    """Avvia OTP in modalità server."""
    graph_file = OTP_DIR / "graph.obj"
    if not graph_file.exists():
        print("[ERRORE] Grafo non trovato. Esegui prima: python 02_setup_otp.py")
        sys.exit(1)

    print(f"\n[→] Avvio OTP server su http://localhost:{OTP_PORT} ...")
    print("    Premi Ctrl+C per fermare\n")

    cmd = [
        "java", f"-Xmx{JVM_MEM}", "-jar", str(OTP_JAR),
        "--load", "--serve", str(OTP_DIR.resolve()),
    ]

    subprocess.run(cmd)


def main():
    parser = argparse.ArgumentParser(description="Setup OpenTripPlanner per Ticino")
    parser.add_argument("--serve", action="store_true",
                        help="Avvia OTP in modalità server (dopo il build)")
    args = parser.parse_args()

    check_java()

    if args.serve:
        serve()
    else:
        download_otp_jar()
        check_osm()
        setup_otp_dir()
        build_graph()
        print("\n" + "="*50)
        print("Setup completato!")
        print("Per avviare OTP: python scripts/02_setup_otp.py --serve")
        print(f"API disponibile su: http://localhost:{OTP_PORT}/otp/")
        print("="*50)


if __name__ == "__main__":
    main()
