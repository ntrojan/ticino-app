import { createContext, useContext, useEffect, useState, useCallback } from 'react'

// Internazionalizzazione minimale (niente dipendenze). Tre lingue: it / de / en.
// I testi-dati (nomi POI, comuni, descrizioni da OSM) NON sono tradotti: sono dati.

export const LANGS = ['it', 'de', 'en']

const messages = {
  it: {
    brand_tagline: 'Esplora il Ticino con i mezzi pubblici',
    page_title: 'TicinoTour — Esplora il Ticino con i mezzi pubblici',
    deselect: 'Deseleziona',
    loading_iso: 'Carico le isocrone…',
    iso_not_ready: '⏳ Isocrone non ancora calcolate per questa fermata.',
    reachable_within: 'Raggiungibile entro',
    n_min: '{n} min',
    choose_stop: 'Scegli una fermata',
    show_on_map: 'Mostra sulla mappa',
    poi_title: 'Punti di interesse',
    tab_transit: '🚌 Mezzi',
    tab_poi: '📍 Luoghi',
    credits: 'Dati: opentransportdata.swiss · OpenStreetMap · OpenTripPlanner',
    search_placeholder: 'Cerca fermata o comune…',
    clear: 'Pulisci',
    all_comuni: 'Tutti i comuni ({n})',
    stops_count: '{n} fermate',
    showing_first: ' · mostro le prime {n}',
    no_stops: 'Nessuna fermata trovata.',
    reach_title: 'Punti di interesse raggiungibili',
    no_poi_in_iso: 'Nessun POI (tra le categorie attive) dentro queste isocrone.',
    within_min: 'entro {n} min',
    no_card: 'Nessuna scheda disponibile.',
    link_site: 'Sito',
    link_wiki: 'Wikipedia',
    stop_type: { treno: 'Treno', bus: 'Bus', funivia: 'Funivia', funicolare: 'Funicolare', battello: 'Battello', tram: 'Tram', altro: 'Altro' },
    poi_cat: { attrazioni: 'Attrazioni', musei: 'Musei', parchi: 'Parchi', ristoranti: 'Ristoranti', laghi: 'Laghi', chiese: 'Chiese', belvedere: 'Belvedere', sport_acqua: 'Sport acquatici' },
    info: 'Informazioni',
    disclaimer: {
      title: 'Come funziona TicinoTour',
      whatH: "Cos'è",
      whatP: 'TicinoTour mostra, per ogni fermata del trasporto pubblico in Ticino e nel Moesano, le aree raggiungibili in 15, 30, 45 e 60 minuti (isocrone) e i punti di interesse turistici che vi rientrano.',
      methodH: 'Metodologia',
      methodLi: [
        'Le isocrone sono calcolate con OpenTripPlanner sull’orario ufficiale GTFS svizzero e sulla rete stradale di OpenStreetMap.',
        'La partenza è fissata a un giorno feriale infrasettimanale alle 09:00: i risultati riflettono quel momento, comprensivo di attese e cambi.',
        'I punti di interesse provengono da OpenStreetMap; foto e descrizioni, quando presenti, da OpenStreetMap e Wikipedia.',
      ],
      limitsH: 'Limiti',
      limitsLi: [
        'La raggiungibilità dipende dall’orario e dal giorno scelti: nei weekend, di sera o di notte cambia sensibilmente.',
        'I tempi non considerano ritardi, soppressioni o coincidenze reali del giorno.',
        'I dati GTFS e OSM possono essere incompleti o non aggiornati; alcune fermate non hanno isocrone.',
        'I punti di interesse sono di fonte collaborativa: possono essere incompleti o mal classificati.',
        'Strumento esplorativo, non per pianificare viaggi: per gli spostamenti reali usa gli orari ufficiali (es. FFS).',
      ],
      cta: 'Ho capito',
    },
  },
  de: {
    brand_tagline: 'Entdecke das Tessin mit dem ÖV',
    page_title: 'TicinoTour — Entdecke das Tessin mit dem ÖV',
    deselect: 'Abwählen',
    loading_iso: 'Isochronen werden geladen…',
    iso_not_ready: '⏳ Isochronen für diese Haltestelle noch nicht berechnet.',
    reachable_within: 'Erreichbar innerhalb',
    n_min: '{n} Min.',
    choose_stop: 'Haltestelle wählen',
    show_on_map: 'Auf Karte zeigen',
    poi_title: 'Sehenswürdigkeiten',
    tab_transit: '🚌 ÖV',
    tab_poi: '📍 Orte',
    credits: 'Daten: opentransportdata.swiss · OpenStreetMap · OpenTripPlanner',
    search_placeholder: 'Haltestelle oder Ort suchen…',
    clear: 'Löschen',
    all_comuni: 'Alle Gemeinden ({n})',
    stops_count: '{n} Haltestellen',
    showing_first: ' · zeige die ersten {n}',
    no_stops: 'Keine Haltestelle gefunden.',
    reach_title: 'Erreichbare Sehenswürdigkeiten',
    no_poi_in_iso: 'Keine POI (aktive Kategorien) innerhalb dieser Isochronen.',
    within_min: 'innerhalb {n} Min.',
    no_card: 'Keine Beschreibung verfügbar.',
    link_site: 'Website',
    link_wiki: 'Wikipedia',
    stop_type: { treno: 'Zug', bus: 'Bus', funivia: 'Seilbahn', funicolare: 'Standseilbahn', battello: 'Schiff', tram: 'Tram', altro: 'Andere' },
    poi_cat: { attrazioni: 'Sehenswürdigkeiten', musei: 'Museen', parchi: 'Parks', ristoranti: 'Restaurants', laghi: 'Seen', chiese: 'Kirchen', belvedere: 'Aussichtspunkte', sport_acqua: 'Wassersport' },
    info: 'Informationen',
    disclaimer: {
      title: 'So funktioniert TicinoTour',
      whatH: 'Was es ist',
      whatP: 'TicinoTour zeigt für jede ÖV-Haltestelle im Tessin und im Moesano die in 15, 30, 45 und 60 Minuten erreichbaren Gebiete (Isochronen) sowie die darin liegenden Sehenswürdigkeiten.',
      methodH: 'Methodik',
      methodLi: [
        'Die Isochronen werden mit OpenTripPlanner auf Basis des offiziellen Schweizer GTFS-Fahrplans und des Strassennetzes von OpenStreetMap berechnet.',
        'Die Abfahrt ist auf einen Werktag um 09:00 Uhr festgelegt: die Ergebnisse gelten für diesen Zeitpunkt, inkl. Wartezeiten und Umstiegen.',
        'Die Sehenswürdigkeiten stammen aus OpenStreetMap; Fotos und Beschreibungen, sofern vorhanden, aus OpenStreetMap und Wikipedia.',
      ],
      limitsH: 'Grenzen',
      limitsLi: [
        'Die Erreichbarkeit hängt von gewählter Zeit und Tag ab: am Wochenende, abends oder nachts ändert sie sich deutlich.',
        'Die Zeiten berücksichtigen keine Verspätungen, Ausfälle oder tatsächlichen Anschlüsse.',
        'GTFS- und OSM-Daten können unvollständig oder veraltet sein; einige Haltestellen haben keine Isochronen.',
        'Die Sehenswürdigkeiten stammen aus einer Community-Quelle und können unvollständig oder falsch kategorisiert sein.',
        'Ein Erkundungstool, kein Reiseplaner: für echte Fahrten die offiziellen Fahrpläne nutzen (z. B. SBB).',
      ],
      cta: 'Verstanden',
    },
  },
  en: {
    brand_tagline: 'Explore Ticino by public transport',
    page_title: 'TicinoTour — Explore Ticino by public transport',
    deselect: 'Deselect',
    loading_iso: 'Loading isochrones…',
    iso_not_ready: '⏳ Isochrones not yet computed for this stop.',
    reachable_within: 'Reachable within',
    n_min: '{n} min',
    choose_stop: 'Choose a stop',
    show_on_map: 'Show on map',
    poi_title: 'Points of interest',
    tab_transit: '🚌 Transit',
    tab_poi: '📍 Places',
    credits: 'Data: opentransportdata.swiss · OpenStreetMap · OpenTripPlanner',
    search_placeholder: 'Search stop or town…',
    clear: 'Clear',
    all_comuni: 'All municipalities ({n})',
    stops_count: '{n} stops',
    showing_first: ' · showing the first {n}',
    no_stops: 'No stop found.',
    reach_title: 'Reachable points of interest',
    no_poi_in_iso: 'No POIs (among active categories) inside these isochrones.',
    within_min: 'within {n} min',
    no_card: 'No description available.',
    link_site: 'Website',
    link_wiki: 'Wikipedia',
    stop_type: { treno: 'Train', bus: 'Bus', funivia: 'Cable car', funicolare: 'Funicular', battello: 'Boat', tram: 'Tram', altro: 'Other' },
    poi_cat: { attrazioni: 'Attractions', musei: 'Museums', parchi: 'Parks', ristoranti: 'Restaurants', laghi: 'Lakes', chiese: 'Churches', belvedere: 'Viewpoints', sport_acqua: 'Water sports' },
    info: 'About',
    disclaimer: {
      title: 'How TicinoTour works',
      whatH: 'What it is',
      whatP: 'TicinoTour shows, for every public-transport stop in Ticino and the Moesano region, the areas reachable within 15, 30, 45 and 60 minutes (isochrones), along with the tourist points of interest that fall inside them.',
      methodH: 'Methodology',
      methodLi: [
        'Isochrones are computed with OpenTripPlanner on the official Swiss GTFS timetable and the OpenStreetMap street network.',
        'Departure is fixed to a weekday at 09:00: results reflect that moment, including waiting times and transfers.',
        'Points of interest come from OpenStreetMap; photos and descriptions, where available, from OpenStreetMap and Wikipedia.',
      ],
      limitsH: 'Limitations',
      limitsLi: [
        'Reachability depends on the chosen time and day: on weekends, evenings or at night it changes significantly.',
        'Times don’t account for delays, cancellations or the day’s actual connections.',
        'GTFS and OSM data may be incomplete or outdated; some stops have no isochrones.',
        'Points of interest are community-sourced and may be incomplete or misclassified.',
        'An exploration tool, not a trip planner: for real journeys use official timetables (e.g. SBB).',
      ],
      cta: 'Got it',
    },
  },
}

function detectLang() {
  try {
    const saved = localStorage.getItem('lang')
    if (saved && messages[saved]) return saved
  } catch { /* localStorage non disponibile */ }
  const nav = (navigator.language || 'it').slice(0, 2)
  return messages[nav] ? nav : 'it'
}

// Lingua corrente a livello di modulo: serve al codice imperativo (popup MapLibre)
// che non passa per React.
let _lang = detectLang()

function interp(s, vars) {
  if (!vars) return s
  for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k])
  return s
}

export function translate(key, vars, lang = _lang) {
  const s = messages[lang]?.[key] ?? messages.it[key] ?? key
  return interp(s, vars)
}
export function stopTypeLabel(tipo, lang = _lang) {
  return messages[lang]?.stop_type?.[tipo] ?? messages.it.stop_type[tipo] ?? tipo
}
export function poiCatLabel(cat, lang = _lang) {
  return messages[lang]?.poi_cat?.[cat] ?? messages.it.poi_cat[cat] ?? cat
}
export function disclaimerContent(lang = _lang) {
  return messages[lang]?.disclaimer ?? messages.it.disclaimer
}

const I18nCtx = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(_lang)

  const setLang = useCallback((l) => {
    if (!messages[l]) return
    _lang = l
    try { localStorage.setItem('lang', l) } catch { /* ignore */ }
    setLangState(l)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = translate('page_title', null, lang)
  }, [lang])

  return <I18nCtx.Provider value={{ lang, setLang }}>{children}</I18nCtx.Provider>
}

export function useI18n() {
  const { lang, setLang } = useContext(I18nCtx)
  const t = useCallback((key, vars) => translate(key, vars, lang), [lang])
  return {
    lang,
    setLang,
    t,
    stopType: (x) => stopTypeLabel(x, lang),
    poiCat: (x) => poiCatLabel(x, lang),
    disclaimer: disclaimerContent(lang),
  }
}
