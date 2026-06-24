# TicinoTP — Frontend

Mappa interattiva (React + [MapLibre GL](https://maplibre.org/)) per esplorare cosa si
raggiunge coi mezzi pubblici dal Ticino. Clicchi una fermata e vedi l'area raggiungibile
entro 15/30/45/60 minuti, con i punti di interesse sovrapposti.

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5173
```

I dati GeoJSON sono serviti da `public/data`, che è un **symlink** a `../data/processed`
(l'output degli script Python). Vanno quindi generati prima i dati con la pipeline (vedi
[../README.md](../README.md)). Se il symlink manca:

```bash
ln -sfn ../../data/processed public/data
```

## Da dove legge i dati

| Dato | File |
|------|------|
| Fermate (punti cliccabili) | `data/stops_ticino.geojson` |
| Isocrone (on-demand per fermata) | `data/isocrone/{stop_id}_{min}min.geojson` |
| Punti di interesse | `data/poi/poi_all.geojson` |

Le fermate senza isocrone ancora calcolate restano cliccabili ma mostrano un avviso
(il fetch del file isocrona dà 404 e viene gestito).

## Build / deploy

```bash
npm run build    # genera dist/
```

Per il deploy (es. Netlify) i file GeoJSON vanno **copiati** dentro la build (il symlink
non basta in produzione). Passo da definire quando i dati saranno completi.

## Configurazione

Colori, fasce temporali, categorie POI, basemap e centro mappa stanno in
[src/config.js](src/config.js). Il basemap usa le tile vettoriali gratuite di
[OpenFreeMap](https://openfreemap.org) (nessuna API key).
