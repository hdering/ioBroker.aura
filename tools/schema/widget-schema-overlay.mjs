// Hand-written layer on top of the generated widget schema.
//
// The generator reads types and defaults out of the source; what it cannot read
// is what an option MEANS. Everything a language model needs in prose lives
// here. Keep the descriptions short and factual — they are prompt tokens.
//
//   KEY_DESCRIPTIONS     → text for an option key, wherever that key appears
//   WIDGET_OPTION_NOTES  → per-widget description/enum for a key that exists
//   EXTRA_OPTIONS        → keys the readers cannot see (set indirectly, e.g.
//                          through a config panel or a helper module)
//   DROP_KEYS            → misreads: identifiers that are not option keys

/**
 * Description per option KEY NAME, applied to every widget that has that key.
 * Most keys repeat across widgets (showTitle, sortBy, filterRooms, …), so this is
 * where a single line of prose buys the most coverage. A per-widget entry in
 * WIDGET_OPTION_NOTES overrides it.
 */
export const KEY_DESCRIPTIONS = {
    showTitle: 'Titelzeile anzeigen.',
    showIcon: 'Icon anzeigen.',
    showValue: 'Wert anzeigen.',
    showUnit: 'Einheit hinter dem Wert anzeigen.',
    showLabel: 'Beschriftung neben dem Bedienelement anzeigen.',
    icon: 'Lucide-Icon-Name (z. B. "Lightbulb", "Thermometer"). Leer = Standard-Icon des Typs.',
    iconSize: 'Icongröße in px.',
    titleAlign: 'Ausrichtung des Titels: left, center oder right.',
    titlePosition: 'Position der Titelzeile im Widget.',
    contentPosition:
        'Position des Inhalts in der Karte als Zweibuchstaben-Code aus Zeile (t/c/b) und Spalte (l/c/r), z. B. "cc" = zentriert.',
    valueSize: 'Schriftgröße des Werts in px.',
    valueFontSize: 'Schriftgröße des Werts in px. 0 = automatisch.',
    decimals: 'Nachkommastellen. Ohne Angabe gilt die globale Einstellung.',
    numberFormat: 'Tausender-/Dezimaltrennzeichen. Ohne Angabe gilt die globale Einstellung.',
    unit: 'Einheit hinter dem Wert, z. B. "°C", "%", "kWh".',
    valueFactor: 'Rohwert wird mit diesem Faktor multipliziert, bevor er angezeigt wird.',
    valueOffset: 'Dieser Wert wird nach dem Faktor addiert.',
    colorThresholds: 'Schwellenwerte, die den Wert je nach Höhe einfärben.',
    autoHeight: 'Widget in der gestapelten Mobilansicht an seinen Inhalt anpassen.',
    confirmAction: 'Vor dem Schalten eine Rückfrage anzeigen.',
    confirmText: 'Text der Rückfrage. Leer = Standardtext.',
    batteryDp: 'Datenpunkt für den Batteriestatus (Badge in der Ecke).',
    unreachDp: 'Datenpunkt für die Erreichbarkeit (Badge in der Ecke).',
    lockDp: 'Datenpunkt für die Kindersicherung (Badge in der Ecke).',
    showStatusBadges: 'Batterie-/Erreichbarkeits-/Sperr-Badges anzeigen.',
    namePattern: 'Namensvorlage mit den Platzhaltern <Raum> <Gerät> <DPName> <Name> <ID>.',
    showRoom: 'Raum des Geräts mit anzeigen.',
    showCount: 'Anzahl-Chip in der Kopfzeile anzeigen.',

    // ── Kopfzeile, Werkzeugleiste, Tabellen ──────────────────────────────────
    showHeader: 'Kopfzeile anzeigen.',
    showSubtitle: 'Zweite Zeile unter dem Titel anzeigen.',
    showFilter: 'Filter-Schaltflächen anzeigen.',
    showSearch: 'Suchfeld anzeigen.',
    showControls: 'Bedienelemente anzeigen.',
    showSlider: 'Schieberegler anzeigen.',
    showLegend: 'Legende anzeigen.',
    showMinMax: 'Skalenanfang und -ende beschriften.',
    showDate: 'Datum anzeigen.',
    showId: 'Datenpunkt-Id statt/neben dem Namen anzeigen.',
    showLastChange: 'Zeitpunkt der letzten Änderung anzeigen.',
    lastChangePosition: 'Wo die letzte Änderung steht: left oder right.',
    striped: 'Zeilen abwechselnd einfärben.',
    compact: 'Dichtere Darstellung mit kleineren Zeilen.',
    sortable: 'Spalten per Klick auf die Kopfzeile sortierbar machen.',
    transparent: 'Kartenhintergrund weglassen.',
    readOnly: 'Nur anzeigen, nicht bedienbar.',
    autoRotate: 'Automatisch weiterblättern.',

    // ── Geometrie ────────────────────────────────────────────────────────────
    align: 'Horizontale Ausrichtung.',
    valign: 'Vertikale Ausrichtung.',
    gap: 'Abstand zwischen den Elementen in px.',
    orientation: 'Ausrichtung: vertical oder horizontal.',
    barSize: 'Größe des Balkens in Prozent der verfügbaren Fläche.',
    barStyle: 'Als Balken statt als Schieberegler darstellen.',
    sizeScale: 'Skaliert die gesamte Darstellung (1 = Normalgröße).',
    fontSize: 'Schriftgröße in px. 0 = automatisch.',
    dateFontSize: 'Schriftgröße des Datums in px. 0 = automatisch.',
    cardMinWidth: 'Kartenlayout: Mindestbreite einer Kachel in px.',
    step: 'Schrittweite.',
    minValue: 'Kleinster Wert der Skala.',
    maxValue: 'Größter Wert der Skala.',
    color: 'Farbe des Bedienelements (CSS-Farbe oder var()).',
    zones: 'Farbzonen der Skala.',

    // ── Zustandsauswertung (Schalter, Dimmer, Zustandsbild) ──────────────────
    stateMode:
        '"boolean" wertet den Wert als wahr/falsch aus, "condition" vergleicht ihn mit stateOperator und stateValue.',
    stateOperator: 'Vergleichsoperator für stateMode "condition".',
    stateValue: 'Vergleichswert für stateMode "condition".',
    switchDp: 'Separater Ein/Aus-Datenpunkt neben dem Hauptwert.',
    statusDp: 'Datenpunkt für die Rückmeldung, wenn der Schalt-DP nicht liest.',

    // ── Listen: Quelle, Filter, Sortierung ───────────────────────────────────
    entries: 'Die Zeilen der Liste.',
    entriesSource: '"manual" = die Einträge aus entries, "json" = aus dem JSON-Datenpunkt entriesDp.',
    entriesDp: 'JSON-Datenpunkt, der die Einträge liefert (bei entriesSource "json").',
    entriesLabelKey: 'Feldname im JSON, der die Beschriftung liefert.',
    entriesValueKey: 'Feldname im JSON, der den Wert liefert.',
    entriesColorKey: 'Feldname im JSON, der die Farbe liefert.',
    entriesIconKey: 'Feldname im JSON, der den Iconnamen liefert.',
    entriesImageKey: 'Feldname im JSON, der die Bild-URL liefert.',
    entryDisplay: 'Listenweite Darstellung der Zeilen; eine Zeile mit eigenem displayType ignoriert sie.',
    showSelect: 'Auswahlfeld zum Umschalten der Einträge anzeigen.',
    filterRooms: 'Auf diese Räume einschränken, kommagetrennte Raumnamen. Leer = alle.',
    filterFuncs: 'Auf diese Gewerke einschränken, kommagetrennte Namen. Leer = alle.',
    filterRoles: 'Auf diese ioBroker-Rollen einschränken, kommagetrennt. Leer = alle.',
    filterTypes: 'Auf diese Datentypen einschränken, kommagetrennt. Leer = alle.',
    filterAdapters: 'Auf diese Adapterinstanzen einschränken, z. B. "zigbee.0". Leer = alle.',
    filterEnums: 'Auf diese Aufzählungen einschränken — volle enum-Ids, kommagetrennt.',
    filterIdPattern: 'Nur Datenpunkte, deren Id dazu passt (Text oder /regex/).',
    filterRelevant: 'Nur Datenpunkte anzeigen, die als bedienbar/relevant erkannt wurden.',
    filterPresets: 'Eigene Filter-Schaltflächen über der Liste.',
    filterMode: 'Welche Einträge die Liste beim Öffnen zeigt.',
    excludeIds: 'Diese Datenpunkt-Ids auslassen.',
    excludeIdPatterns: 'Datenpunkte auslassen, deren Id dazu passt (Text oder /regex/, kommagetrennt).',
    sortBy: 'Sortierschlüssel: none, label, value oder "sub:<Feld>" für eine Zweitzeile.',
    sortBy2: 'Zweiter Sortierschlüssel bei Gleichstand.',
    sortOrder: 'Sortierrichtung: asc oder desc.',
    sortOrder2: 'Sortierrichtung des zweiten Schlüssels.',
    syncIntervalMin: 'Abstand in Minuten, in dem die Liste neu nach passenden Datenpunkten sucht.',
    groupByRoom: 'Zeilen nach Raum gruppieren.',

    // ── Zeilen-Popup (Listen, Statusübersicht) ───────────────────────────────
    rowPopupTitle: 'Titel des Popups, das eine Zeile beim Antippen öffnet.',
    rowPopupWidth: 'Breite des Zeilen-Popups in px.',
    rowPopupHeight: 'Höhe des Zeilen-Popups in px.',
    rowPopupHideTitle: 'Titelzeile des Zeilen-Popups ausblenden.',
    rowPopupBackdropDim: 'Abdunklung des Hintergrunds hinter dem Zeilen-Popup, 0–100.',
    rowPopupAutoCloseSec: 'Zeilen-Popup nach so vielen Sekunden schließen. 0 = nie.',

    // ── Verlauf / Diagramme ──────────────────────────────────────────────────
    historyInstance: 'History-Adapterinstanz, z. B. "history.0" oder "influxdb.0".',
    autoHistoryInstance: 'History-Instanz automatisch aus dem Datenpunkt bestimmen.',
    historyRange: 'Angezeigter Zeitraum.',
    historyRangeCustomValue: 'Länge des eigenen Zeitraums.',
    historyRangeCustomUnit: 'Einheit des eigenen Zeitraums: h oder d.',
    lockRange: 'Zeitraum-Umschalter ausblenden und den eingestellten Zeitraum festhalten.',
    lineColor: 'Farbe der Linie.',
    avgColor: 'Farbe der Mittelwertlinie.',
    showAverage: 'Mittelwertlinie einzeichnen.',
    showAverageAsValue: 'Mittelwert zusätzlich als Zahl anzeigen.',
    showGridLines: 'Gitternetz einzeichnen.',
    showYAxis: 'Y-Achse anzeigen.',
    showXAxis: 'X-Achse anzeigen.',
    yAxisCompact: 'Y-Achsenbeschriftung kürzen (1,2 k statt 1200).',

    // ── Chips (Karussell, Chips-Widget) ──────────────────────────────────────
    chips: 'Die einzelnen Chips.',
    chipStyle: 'Darstellung der Chips.',
    chipSize: 'Größe der Chips — Zahl in px oder eine benannte Stufe.',
    chipRadius: 'Eckenradius der Chips in px.',
    chipBgColor: 'Hintergrundfarbe der Chips.',
    chipTextColor: 'Textfarbe der Chips.',
    checkDp: 'Datenpunkt, dessen Wert bestimmt, welcher Chip als aktiv gilt.',

    // ── Sonstiges mit Mehrfachverwendung ─────────────────────────────────────
    refreshInterval: 'Neuladen alle n Sekunden. 0 = nie.',
    reloadOnWake: 'Nach dem Aufwachen des Geräts neu laden.',
    sandboxPreset: 'Sicherheitsstufe des eingebetteten Inhalts.',
    sandboxCustom: 'Eigene sandbox-Attribute, wenn sandboxPreset "custom" ist.',
    showActualTemp: 'Ist-Temperatur anzeigen.',
    bins: 'Die Tonnen mit Name, Farbe und Datenpunkt.',
};

/** Per-widget prose for a key the generator already found. */
export const WIDGET_OPTION_NOTES = {
    switch: {
        onValue: { description: 'Wert, der beim Einschalten geschrieben wird. Leer = true.' },
        offValue: { description: 'Wert, der beim Ausschalten geschrieben wird. Leer = false.' },
        controlMode: {
            enum: ['toggle', 'buttons'],
            description: '"toggle" = ein Umschalter, "buttons" = getrennte Ein/Aus-Tasten.',
        },
        momentary: { description: 'Taster statt Schalter: schreibt an und nach momentaryDelay wieder aus.' },
        momentaryDelay: { description: 'Verzögerung des Tastermodus in ms.' },
        statusDp: { description: 'Separater Datenpunkt für die Rückmeldung, wenn der Schalt-DP nicht liest.' },
        onColor: { description: 'Farbe im eingeschalteten Zustand (CSS-Farbe oder var()).' },
        offColor: { description: 'Farbe im ausgeschalteten Zustand.' },
        onIcon: { description: 'Icon im eingeschalteten Zustand. Leer = wie icon.' },
        offIcon: { description: 'Icon im ausgeschalteten Zustand. Leer = wie icon.' },
    },
    thermostat: {
        actualDatapoint: { description: 'Datenpunkt der Ist-Temperatur (der Haupt-DP ist die Soll-Temperatur).' },
        minTemp: { description: 'Untere Grenze der Soll-Temperatur.' },
        maxTemp: { description: 'Obere Grenze der Soll-Temperatur.' },
        step: { description: 'Schrittweite der Soll-Temperatur.' },
    },
    slider: {
        min: { description: 'Kleinster einstellbarer Wert.' },
        max: { description: 'Größter einstellbarer Wert.' },
        step: { description: 'Schrittweite.' },
    },
    value: {
        htmlTemplate: { description: 'HTML-Vorlage für die Wertanzeige; {value} wird ersetzt.' },
        valueTimeFormat: { description: 'Zeitstempel statt Zahl darstellen.' },
    },
    image: {
        imageUrl: { description: 'Feste Bild-URL. Relative Pfade laufen über /webfs.' },
        imageDatapoint: { description: 'Datenpunkt, der die Bild-URL liefert.' },
        refreshInterval: { description: 'Neuladen alle n Sekunden. 0 = nie.' },
    },
    iframe: {
        iframeUrlMode: { description: 'Woher die Adresse kommt: fest oder aus einem Datenpunkt.' },
        iframeUrl: { description: 'Eingebettete Adresse.' },
        iframeUrlDp: { description: 'Datenpunkt, der die Adresse liefert.' },
        useProxy: { description: 'Seite über /proxy?url= laden, wenn sie das Einbetten sonst verbietet.' },
        keepAlive: { description: 'Seite im Hintergrund geladen lassen statt beim Tabwechsel zu verwerfen.' },
        sandbox: { description: 'Sandbox einschalten.' },
        fullscreenButton: { description: 'Taste für Vollbild anzeigen.' },
    },
    clock: {
        display: {
            enum: ['time', 'date', 'both', 'custom'],
            description: 'Was die Uhr zeigt; "custom" nutzt customFormat.',
        },
        customFormat: {
            description: 'Eigene Formatvorlage, u. a. mit den Tokens ww (KW), SR/SS (Auf-/Untergang), CT (Ort).',
        },
        showCity: { description: 'Ort aus der ioBroker-Systemkonfiguration anzeigen.' },
        showSunrise: { description: 'Sonnenaufgang anzeigen.' },
        showSunset: { description: 'Sonnenuntergang anzeigen.' },
        showWeek: { description: 'Kalenderwoche anzeigen.' },
    },
    html: {
        htmlContent: { description: 'Fester HTML-Inhalt.' },
        htmlDatapoint: { description: 'Datenpunkt, der den HTML-Inhalt liefert.' },
    },
    button: {
        buttonLabel: { description: 'Beschriftung der Taste. Leer = Widget-Titel.' },
        buttonColor: { description: 'Farbe der Beschriftung.' },
    },
    httpRequest: {
        url: { description: 'Aufgerufene Adresse. Ziele ohne CORS laufen über /proxy?url=.' },
        method: { description: 'HTTP-Methode.' },
    },
    mirror: {
        targetWidgetId: { description: 'Id des Widgets, das hier gespiegelt wird.' },
    },
    light: {
        colorMode: {
            description:
                'Über welche Datenpunkte die Farbe läuft: "hsv" (hueDp/saturationDp), "rgb" (rDp/gDp/bDp), ' +
                '"hex" (colorHexDp), "hm-color" (Homematic-Farbwert) oder "none" für ein Licht ohne Farbe.',
        },
        brightnessDp: { description: 'Datenpunkt der Helligkeit.' },
        brightnessMin: { description: 'Kleinster Helligkeitswert des Geräts.' },
        brightnessMax: { description: 'Größter Helligkeitswert des Geräts.' },
        temperatureDp: { description: 'Datenpunkt der Farbtemperatur.' },
        ctMin: { description: 'Kleinste Farbtemperatur des Geräts.' },
        ctMax: { description: 'Größte Farbtemperatur des Geräts.' },
        satMax: { description: 'Größter Sättigungswert des Geräts.' },
        hmWhiteValue: { description: 'Homematic: Farbwert, der Weiß bedeutet.' },
        effectDp: { description: 'Datenpunkt für den Lichteffekt.' },
        effects: { description: 'Auswählbare Effekte.' },
        colorPresets: { description: 'Farbfelder der Palette.' },
        colorWheelStyle: { description: 'Darstellung des Farbwählers.' },
        activeTab: { description: 'Zuletzt geöffneter Reiter — wird vom Widget selbst gesetzt.' },
        showState: { description: 'Zustandstext neben dem Titel anzeigen.' },
        statusAlign: { description: 'Ausrichtung des Zustandstexts.' },
    },
    fill: {
        overActive: { description: 'Farbwechsel ab einer Schwelle einschalten.' },
        overThreshold: {
            description:
                'Prozent der Skala, ab dem die Warnfarbe gilt (100 = der Max-Wert). Der Rohwert zählt, nicht der begrenzte.',
        },
        overColor: { description: 'Farbe der Füllung ab der Schwelle. Überschreibt Füllfarbe und Farbzonen.' },
    },
    gauge: {
        minValue: { description: 'Skalenanfang.' },
        maxValue: { description: 'Skalenende.' },
        minDatapoint: { description: 'Datenpunkt, der den Skalenanfang liefert (überschreibt minValue).' },
        maxDatapoint: { description: 'Datenpunkt, der das Skalenende liefert (überschreibt maxValue).' },
        pointer2Datapoint: { description: 'Zweiter Zeiger aus diesem Datenpunkt.' },
        pointer3Datapoint: { description: 'Dritter Zeiger aus diesem Datenpunkt.' },
        colorZones: { description: 'Farbige Zonen auf dem Bogen einschalten.' },
        dynamicMax: { description: 'Skalenende automatisch an den größten gesehenen Wert anpassen.' },
        strokeWidth: { description: 'Dicke des Bogens in px.' },
        showValueBadge: { description: 'Wert in einer Plakette statt frei anzeigen.' },
        zone1Max: { description: 'Obergrenze der ersten Farbzone.' },
        zone1Color: { description: 'Farbe der ersten Zone.' },
        zone2Max: { description: 'Obergrenze der zweiten Farbzone.' },
        zone2Color: { description: 'Farbe der zweiten Zone.' },
        zone3Color: { description: 'Farbe oberhalb von zone2Max.' },
        pointer1Color: { description: 'Farbe des ersten Zeigers.' },
        pointer1ZoneColor: { description: 'Ersten Zeiger in der Farbe seiner Zone zeichnen.' },
        pointer1Label: { description: 'Beschriftung des ersten Zeigers.' },
        pointer2Color: { description: 'Farbe des zweiten Zeigers.' },
        pointer2ZoneColor: { description: 'Zweiten Zeiger in der Farbe seiner Zone zeichnen.' },
        pointer2Label: { description: 'Beschriftung des zweiten Zeigers.' },
        pointer3Color: { description: 'Farbe des dritten Zeigers.' },
        pointer3ZoneColor: { description: 'Dritten Zeiger in der Farbe seiner Zone zeichnen.' },
        pointer3Label: { description: 'Beschriftung des dritten Zeigers.' },
    },
    shutter: {
        controlMode: {
            enum: ['position', 'buttons'],
            description: '"position" = Prozentwert über einen Schieberegler, "buttons" = Auf/Stopp/Zu.',
        },
        openDp: { description: 'Datenpunkt für "Auf" (nur nötig, wenn der Antrieb keine Position kennt).' },
        closeDp: { description: 'Datenpunkt für "Zu".' },
        stopDp: { description: 'Datenpunkt für "Stopp".' },
        actualPositionDp: { description: 'Datenpunkt der Ist-Position, wenn er vom Soll-DP abweicht.' },
        invertPosition: { description: '0 % bedeutet offen statt geschlossen.' },
        tiltDp: { description: 'Datenpunkt für die Lamellenstellung.' },
        actualTiltDp: { description: 'Datenpunkt der Ist-Lamellenstellung.' },
        activityDp: { description: 'Datenpunkt, der meldet, ob der Rollladen gerade fährt.' },
        directionDp: { description: 'Datenpunkt der Fahrtrichtung.' },
        sendOnRelease: { description: 'Position erst beim Loslassen des Reglers schreiben.' },
        showClosedPercent: { description: 'Prozentwert als "geschlossen" statt als "offen" lesen.' },
        positionLivePreview: { description: 'Position schon beim Ziehen des Reglers übernehmen.' },
        activityMovingValues: { description: 'Werte von activityDp, die "fährt gerade" bedeuten, kommagetrennt.' },
        tiltStep: { description: 'Schrittweite der Lamellen.' },
        tiltLabel: { description: 'Beschriftung der Lamellensteuerung.' },
        tiltLivePreview: { description: 'Lamellenwert schon beim Ziehen übernehmen.' },
        tiltPlacement: { description: '"inline" zeigt die Lamellensteuerung im Widget, "popup" hinter einer Taste.' },
        tiltControl: { description: 'Art der Lamellensteuerung bei tiltPlacement "inline".' },
        tiltSliderSide: { description: 'Auf welcher Seite der Lamellenregler steht: left oder right.' },
        tiltSliderWidth: { description: 'Breite des Lamellenreglers in px.' },
        showTiltValue: { description: 'Lamellenwert als Zahl anzeigen.' },
        reapplyTiltAfterMove: { description: 'Lamellen nach einer Fahrt erneut auf den eingestellten Wert setzen.' },
        buttonSize: { description: 'Größe der Auf/Stopp/Zu-Tasten in px.' },
        sliderHeight: { description: 'Höhe des Positionsreglers in px.' },
    },
    dimmer: {
        controlMode: { description: '"toggle" = ein Umschalter, "buttons" = getrennte Ein/Aus-Tasten.' },
        controlIconSize: { description: 'Größe der Ein/Aus-Symbole in px.' },
        showToggle: { description: 'Ein/Aus-Schalter neben dem Regler anzeigen.' },
        sendOnRelease: { description: 'Helligkeit erst beim Loslassen des Reglers schreiben.' },
        onValue: { description: 'Wert, der beim Einschalten geschrieben wird.' },
        offValue: { description: 'Wert, der beim Ausschalten geschrieben wird.' },
        onColor: { description: 'Farbe im eingeschalteten Zustand.' },
        offColor: { description: 'Farbe im ausgeschalteten Zustand.' },
        onIcon: { description: 'Icon im eingeschalteten Zustand.' },
        offIcon: { description: 'Icon im ausgeschalteten Zustand.' },
    },
    stateimage: {
        trueType: { description: 'Woher die Darstellung für "wahr" kommt: Icon, Bild oder Text.' },
        trueIcon: { description: 'Icon für den wahren Zustand.' },
        trueColor: { description: 'Farbe für den wahren Zustand.' },
        trueBase64: { description: 'Eingebettetes Bild (data:-URL) für den wahren Zustand.' },
        trueLabel: { description: 'Beschriftung für den wahren Zustand.' },
        falseType: { description: 'Woher die Darstellung für "falsch" kommt: Icon, Bild oder Text.' },
        falseIcon: { description: 'Icon für den falschen Zustand.' },
        falseColor: { description: 'Farbe für den falschen Zustand.' },
        falseBase64: { description: 'Eingebettetes Bild (data:-URL) für den falschen Zustand.' },
        falseLabel: { description: 'Beschriftung für den falschen Zustand.' },
    },
    mediaplayer: {
        titleDp: { description: 'Datenpunkt des Titels.' },
        artistDp: { description: 'Datenpunkt des Interpreten.' },
        albumDp: { description: 'Datenpunkt des Albums.' },
        coverDp: { description: 'Datenpunkt der Cover-URL. Relative Pfade laufen über /webfs.' },
        sourceDp: { description: 'Datenpunkt der Quelle/des Geräts.' },
        playStateDp: { description: 'Datenpunkt des Abspielzustands.' },
        playValue: { description: 'Wert von playStateDp, der "spielt" bedeutet.' },
        playDp: { description: 'Datenpunkt für Wiedergabe starten.' },
        pauseDp: { description: 'Datenpunkt für Pause.' },
        prevDp: { description: 'Datenpunkt für vorheriger Titel.' },
        nextDp: { description: 'Datenpunkt für nächster Titel.' },
        shuffleDp: { description: 'Datenpunkt für Zufallswiedergabe.' },
        repeatDp: { description: 'Datenpunkt für Wiederholung.' },
        volumeDp: { description: 'Datenpunkt der Lautstärke.' },
        volumeMin: { description: 'Kleinster Lautstärkewert des Geräts.' },
        volumeMax: { description: 'Größter Lautstärkewert des Geräts.' },
        volumeStep: { description: 'Schrittweite der Lautstärke.' },
        muteDp: { description: 'Datenpunkt für Stummschaltung.' },
        muteViaVolume: { description: 'Stummschalten, indem die Lautstärke auf 0 gesetzt wird.' },
        mediaProgressDp: { description: 'Datenpunkt der Abspielposition als Zahl.' },
        mediaLengthDp: { description: 'Datenpunkt der Titellänge als Zahl.' },
        mediaProgressStrDp: { description: 'Datenpunkt der Abspielposition als fertiger Text.' },
        mediaLengthStrDp: { description: 'Datenpunkt der Titellänge als fertiger Text.' },
    },
    climate: {
        targetDatapoint: { description: 'Datenpunkt der Soll-Temperatur.' },
        humidityDatapoint: { description: 'Datenpunkt der Luftfeuchte.' },
        pressureDatapoint: { description: 'Datenpunkt des Luftdrucks.' },
        pressureDecimals: { description: 'Nachkommastellen des Luftdrucks.' },
        showComfort: { description: 'Komfortbereich hervorheben.' },
        showChart: { description: 'Verlaufsdiagramm anzeigen.' },
    },
    camera: {
        streamUrlMode: { description: 'Woher die Stream-Adresse kommt: fest oder aus einem Datenpunkt.' },
        streamUrl: { description: 'Feste Stream-Adresse.' },
        streamUrlDp: { description: 'Datenpunkt, der die Stream-Adresse liefert.' },
        streamTimeout: { description: 'Abbruch, wenn der Stream nach so vielen Sekunden kein Bild liefert.' },
        videoRatio: { description: 'Seitenverhältnis des Bildes.' },
        fitMode: { description: 'Wie das Bild in die Kachel eingepasst wird.' },
        wakeUpDp: { description: 'Datenpunkt, der die Kamera aufweckt.' },
        wakeUpMode: { description: '"onClick" weckt beim Antippen, "onView" beim Sichtbarwerden.' },
        wakeUpDelay: { description: 'Wartezeit nach dem Aufwecken in Sekunden, bevor der Stream startet.' },
        showTimestamp: { description: 'Zeitstempel im Bild anzeigen.' },
        infoItems: { description: 'Zusätzliche Werte, die über dem Bild eingeblendet werden.' },
        cameraTemplate: { description: 'Vorlage für eine bekannte Kameramarke.' },
    },
    panels: {
        loop: { description: 'Nach dem letzten Panel wieder beim ersten beginnen.' },
        autoplay: { description: 'Automatisch weiterblättern.' },
        autoplayInterval: { description: 'Wartezeit beim automatischen Weiterblättern in Sekunden.' },
        showDots: { description: 'Punkte für die Panel-Auswahl anzeigen.' },
        showArrows: { description: 'Blätterpfeile anzeigen.' },
        activeDp: { description: 'Datenpunkt, der das aktive Panel spiegelt bzw. auswählt.' },
        activeDpBase: { description: 'Nummer des ersten Panels in activeDp: 0 oder 1.' },
        activeDpWrite: { description: 'Beim Blättern auch in activeDp schreiben.' },
    },
    input: {
        inputMode: { description: '"number" für ein Zahlenfeld, sonst Text.' },
        multiline: { description: 'Mehrzeiliges Textfeld.' },
        placeholder: { description: 'Hinweistext im leeren Feld.' },
        submitMode: { description: '"submit" schreibt erst auf Knopfdruck, "live" bei jeder Eingabe.' },
        showSubmit: { description: 'Absende-Taste anzeigen.' },
        clearAfterSubmit: { description: 'Feld nach dem Absenden leeren.' },
        inputWidth: { description: 'Breite des Eingabefelds in px. 0 = volle Breite.' },
        textAlign: { description: 'Ausrichtung des eingegebenen Texts.' },
        fieldAlign: { description: 'Ausrichtung des Eingabefelds in der Kachel.' },
    },
    datepicker: {
        timeOnly: { description: 'Nur eine Uhrzeit statt eines Datums abfragen.' },
        showTime: { description: 'Zusätzlich zur Datumsauswahl eine Uhrzeit abfragen.' },
        showCurrentValue: { description: 'Aktuellen Wert des Datenpunkts anzeigen.' },
        inputFormat: { description: 'Format, in dem der Datenpunkt gelesen wird.' },
        inputPattern: { description: 'Eigene Lesevorlage, wenn inputFormat "custom" ist.' },
        outputFormat: { description: 'Format, in dem geschrieben wird.' },
        outputPattern: { description: 'Eigene Schreibvorlage, wenn outputFormat "custom" ist.' },
    },
    messages: {
        severities: { description: 'Welche Dringlichkeitsstufen die Liste zeigt.' },
        maxEntries: { description: 'Höchstzahl angezeigter Meldungen.' },
        hours: { description: 'Nur Meldungen der letzten n Stunden zeigen. 0 = alle.' },
        unreadOnly: { description: 'Nur ungelesene Meldungen zeigen.' },
        groupByDay: { description: 'Meldungen nach Tag gruppieren.' },
        detailed: { description: 'Ausführliche Darstellung mit Quelle und Zeitstempel.' },
        showAck: { description: 'Taste zum Bestätigen anzeigen.' },
        allowClear: { description: 'Taste zum Leeren des Archivs anzeigen.' },
        layoutFilter: { description: 'Nur Meldungen dieses Layouts zeigen. Leer = alle.' },
    },
    weather: {
        dataSource: { description: '"online" holt die Daten selbst, "adapter" liest sie aus adapterLocationPath.' },
        adapterLocationPath: { description: 'Objektpfad eines Wetteradapters, z. B. "daswetter.0.NextHours".' },
        latitude: { description: 'Breitengrad. Leer = Ort aus der ioBroker-Systemkonfiguration.' },
        longitude: { description: 'Längengrad. Leer = Ort aus der ioBroker-Systemkonfiguration.' },
        locationName: { description: 'Angezeigter Ortsname.' },
        localTempDatapoint: { description: 'Datenpunkt eines eigenen Thermometers statt der Online-Temperatur.' },
        forecastDays: { description: 'Anzahl Vorhersagetage.' },
        forecastTempThresholds: { description: 'Schwellenwerte, die die Vorhersagebalken einfärben.' },
        feelsLikeStyle: { description: 'Gefühlte Temperatur als "text", als "icon" oder "hidden".' },
        refreshMinutes: { description: 'Abstand der Aktualisierung in Minuten.' },
    },
    aircontrol: {
        deviceType: { description: 'Geräteart, bestimmt die angebotenen Betriebsarten.' },
        powerDp: { description: 'Datenpunkt für Ein/Aus.' },
        currentTempDp: { description: 'Datenpunkt der Ist-Temperatur.' },
        targetTempDp: { description: 'Datenpunkt der Soll-Temperatur.' },
        tempMin: { description: 'Untere Grenze der Soll-Temperatur.' },
        tempMax: { description: 'Obere Grenze der Soll-Temperatur.' },
        tempStep: { description: 'Schrittweite der Soll-Temperatur.' },
        modeDp: { description: 'Datenpunkt der Betriebsart.' },
        fanSpeedDp: { description: 'Datenpunkt der Lüfterstufe.' },
        vaneVDp: { description: 'Datenpunkt der senkrechten Luftklappe.' },
        vaneHDp: { description: 'Datenpunkt der waagerechten Luftklappe.' },
        ecoDp: { description: 'Datenpunkt des Sparbetriebs.' },
        onlineDp: { description: 'Datenpunkt der Erreichbarkeit.' },
        errorDp: { description: 'Datenpunkt der Störungsmeldung.' },
        consumptionDp: { description: 'Datenpunkt des Verbrauchs.' },
        outsideTempDp: { description: 'Datenpunkt der Außentemperatur.' },
    },
    echart: {
        echartMode: {
            description:
                '"timeseries" = Verlauf über die Zeit, "comparison" = Balkenvergleich, "json" = fertige ECharts-Option aus einem Datenpunkt.',
        },
        echartSeries: { description: 'Die Datenreihen des Diagramms.' },
        echartRange: { description: 'Angezeigter Zeitraum.' },
        echartRangeCustomValue: { description: 'Länge des eigenen Zeitraums.' },
        echartRangeCustomUnit: { description: 'Einheit des eigenen Zeitraums: h oder d.' },
        echartVisibleRanges: { description: 'Welche Zeiträume der Umschalter anbietet.' },
        echartDayNav: { description: 'Blättern zwischen einzelnen Tagen erlauben.' },
        echartShowCurrent: { description: 'Aktuellen Wert je Reihe über dem Diagramm anzeigen.' },
        echartCurrentFrom: { description: '"last" nimmt den letzten Punkt der Reihe, "first" den ersten.' },
        echartCurrentAlign: { description: 'Ausrichtung des Aktuell-Blocks.' },
        echartShowValues: { description: 'Werte an den Datenpunkten beschriften.' },
        echartShowStackPercent: { description: 'Bei gestapelten Reihen zusätzlich den Prozentanteil beschriften.' },
        echartShowLegend: { description: 'Legende anzeigen.' },
        echartShowGridLines: { description: 'Gitternetz einzeichnen.' },
        echartAnimation: { description: 'Übergänge animieren.' },
        echartShowXAxis: { description: 'X-Achse anzeigen.' },
        echartShowYAxis: { description: 'Linke Y-Achse anzeigen.' },
        echartShowYAxisRight: { description: 'Rechte Y-Achse anzeigen.' },
        echartLeftUnit: { description: 'Einheit der linken Y-Achse.' },
        echartRightUnit: { description: 'Einheit der rechten Y-Achse.' },
        echartLeftMin: { description: 'Fester Anfang der linken Y-Achse.' },
        echartLeftMax: { description: 'Festes Ende der linken Y-Achse.' },
        echartRightMin: { description: 'Fester Anfang der rechten Y-Achse.' },
        echartRightMax: { description: 'Festes Ende der rechten Y-Achse.' },
        echartLeftMinDp: { description: 'Datenpunkt, der den Anfang der linken Y-Achse liefert.' },
        echartLeftMaxDp: { description: 'Datenpunkt, der das Ende der linken Y-Achse liefert.' },
        echartRightMinDp: { description: 'Datenpunkt, der den Anfang der rechten Y-Achse liefert.' },
        echartRightMaxDp: { description: 'Datenpunkt, der das Ende der rechten Y-Achse liefert.' },
        echartJsonExtra: { description: 'Zusätzliche ECharts-Option, die über die erzeugte gelegt wird.' },
        echartJsonTimeAxis: { description: 'Im JSON-Modus die X-Achse als Zeitachse behandeln.' },
        echartJsonAxisBounds: { description: 'Im JSON-Modus die Achsengrenzen aus dieser Konfiguration übernehmen.' },
    },
    map: {
        center: { description: 'Kartenmittelpunkt als [Breitengrad, Längengrad].' },
        zoom: { description: 'Zoomstufe der Karte.' },
        mapStyle: { description: 'Kartenstil.' },
        tileAttribution: { description: 'Quellenangabe unter der Karte.' },
        markers: { description: 'Die Markierungen auf der Karte.' },
        homeMarkerId: { description: 'Id der Markierung, die als Zuhause gilt.' },
        followMarkers: { description: 'Kartenausschnitt automatisch an die Markierungen anpassen.' },
        showDistance: { description: 'Entfernung zur Zuhause-Markierung anzeigen.' },
        quickViews: { description: 'Gespeicherte Kartenausschnitte zum Anspringen.' },
        chipsPosition: { description: 'Wo die Chips über der Karte liegen.' },
        chipsCorner: { description: 'In welcher Ecke die Chips liegen.' },
        styleChipsCorner: { description: 'In welcher Ecke die Stil-Umschalter liegen.' },
    },
    alarm: {
        alarmPrefix: { description: 'Objektpfad der Alarmanlage, z. B. "alarm.0".' },
        showModes: { description: 'Auswahl der Scharfschaltmodi anzeigen.' },
        showModeOff: { description: 'Modus "Unscharf" anbieten.' },
        showModeSharp: { description: 'Modus "Scharf" anbieten.' },
        showModeInside: { description: 'Modus "Anwesend" anbieten.' },
        showModeNight: { description: 'Modus "Nacht" anbieten.' },
        showCountdown: { description: 'Verbleibende Verzögerungszeit anzeigen.' },
        showDelay: { description: 'Eingestellte Verzögerungszeit anzeigen.' },
        showCircuits: { description: 'Sicherungskreise anzeigen.' },
        showZones: { description: 'Zonen anzeigen.' },
        showPresence: { description: 'Anwesenheit anzeigen.' },
        showLog: { description: 'Ereignisliste anzeigen.' },
        logLines: { description: 'Anzahl Zeilen der Ereignisliste.' },
        showPanic: { description: 'Panik-Taste anzeigen.' },
        panicConfirm: { description: 'Vor dem Panikalarm eine Rückfrage anzeigen.' },
        requirePinForDisarm: { description: 'Zum Unscharfschalten die PIN abfragen.' },
        compactMode: { description: 'Dichtere Darstellung.' },
    },
    calendar: {
        calendars: { description: 'Die eingebundenen Kalenderquellen.' },
        icalUrl: { description: 'iCal-Adresse einer einzelnen Quelle.' },
        daysAhead: { description: 'Wie viele Tage im Voraus angezeigt werden.' },
        maxEvents: { description: 'Höchstzahl angezeigter Termine.' },
        showCalName: { description: 'Kalendernamen neben dem Termin anzeigen.' },
        showCalIcon: { description: 'Das je Kalender vergebene Icon vor dem Termin anzeigen.' },
        showWeek: {
            description:
                'Kalenderwoche anzeigen — in Default und Agenda am ersten Termin jeder Woche, in Card und Compact am angezeigten Termin.',
        },
        calNameWidth: { description: 'Breite der Kalendernamen-Spalte in px.' },
        calFontScale: { description: 'Skaliert die Schrift der Terminliste.' },
        showSummary: { description: 'Terminbezeichnung anzeigen.' },
        showLocation: { description: 'Ort des Termins anzeigen.' },
        showMore: { description: '"Mehr"-Zeile anzeigen, wenn Termine abgeschnitten werden.' },
        highlightEnabled: { description: 'Termine mit Stichwörtern hervorheben.' },
        highlightKeywords: { description: 'Stichwörter für die Hervorhebung, kommagetrennt.' },
        highlightColor: { description: 'Farbe der Hervorhebung.' },
        highlightPriority: { description: 'Hervorgehobene Termine nach oben ziehen.' },
        importantOnly: { description: 'Nur als wichtig markierte Termine zeigen.' },
        importantIcon: { description: 'Icon für wichtige Termine.' },
        hideImportantIcon: { description: 'Icon für wichtige Termine ausblenden.' },
    },
    timer: {
        events: { description: 'Die Schaltzeiten.' },
        enabled: { description: 'Ob die Zeitschaltuhr aktiv ist.' },
        targetDp: { description: 'Datenpunkt, den die Schaltzeiten schreiben.' },
        value: { description: 'Wert, den eine Schaltzeit ohne eigenen Wert schreibt.' },
        allowEventValue: { description: 'Je Schaltzeit einen eigenen Wert erlauben.' },
        stateBaseId: { description: 'Objektpfad, unter dem der Adapter die Schaltzeiten ablegt.' },
        holidaysDp: { description: 'Datenpunkt, der einen Feiertag meldet.' },
        vacationDp: { description: 'Datenpunkt, der Urlaub meldet.' },
        showMasterSwitch: { description: 'Hauptschalter der Zeitschaltuhr anzeigen.' },
        showAddButton: { description: 'Taste zum Anlegen einer Schaltzeit anzeigen.' },
        showAstroSymbol: { description: 'Sonnensymbol bei astronomischen Zeiten anzeigen.' },
        showEvents: { description: 'Liste der Schaltzeiten anzeigen.' },
    },
    trashSchedule: {
        hiddenNames: { description: 'Tonnen, die nicht angezeigt werden.' },
        iconMap: { description: 'Zuordnung von Tonnennamen zu Icons.' },
        showNames: { description: 'Tonnennamen anzeigen.' },
        showDays: { description: 'Verbleibende Tage anzeigen.' },
        showDot: { description: 'Farbpunkt je Tonne anzeigen.' },
        dotSize: { description: 'Größe des Farbpunkts in px.' },
        dateFormat: { description: 'Datumsformat der Abholtermine.' },
        binSize: { description: 'Größe einer Tonnenkachel in px.' },
        listBinSize: { description: 'Größe einer Tonnenkachel im Listenlayout in px.' },
        nameFontSize: { description: 'Schriftgröße des Tonnennamens in px. 0 = automatisch.' },
        daysFontSize: { description: 'Schriftgröße der Tagesangabe in px. 0 = automatisch.' },
    },
    carousel: {
        items: { description: 'Die Elemente des Karussells.' },
        mode: { description: 'Was das Karussell zeigt.' },
        snap: { description: 'Beim Blättern auf ganze Elemente einrasten.' },
        maxItemWidth: { description: 'Größte Breite eines Elements in px.' },
        labelAlign: { description: 'Ausrichtung der Beschriftung.' },
        hideScrollbar: { description: 'Bildlaufleiste ausblenden.' },
        shakeOnOpen: { description: 'Beim Öffnen kurz anrucken, um die Wischbarkeit zu zeigen.' },
        autoRotateInterval: { description: 'Wartezeit beim automatischen Weiterblättern in Sekunden.' },
        autoRotateSpeed: { description: 'Dauer des Übergangs beim automatischen Blättern in ms.' },
    },
    evcc: {
        evccPrefix: { description: 'Objektpfad der evcc-Instanz, z. B. "evcc.0".' },
        loadpointCount: { description: 'Anzahl der Ladepunkte.' },
        visibleLoadpoints: { description: 'Welche Ladepunkte angezeigt werden.' },
        showLoadpoints: { description: 'Ladepunkte anzeigen.' },
        showBattery: { description: 'Hausspeicher anzeigen.' },
        gridPowerDatapoint: { description: 'Datenpunkt der Netzleistung, wenn evcc sie nicht flach liefert.' },
        batteryPowerDatapoint: { description: 'Datenpunkt der Speicherleistung.' },
        batterySocDatapoint: { description: 'Datenpunkt des Speicherladestands.' },
        autoScale: { description: 'Darstellung automatisch an die Kachelgröße anpassen.' },
        autoScaleMin: { description: 'Untere Grenze der automatischen Skalierung.' },
        autoScaleMax: { description: 'Obere Grenze der automatischen Skalierung.' },
        headerScale: { description: 'Skaliert die Kopfzeile.' },
        flowScale: { description: 'Skaliert die Energieflussgrafik.' },
        loadpointScale: { description: 'Skaliert die Ladepunkte.' },
        mainScale: { description: 'Skaliert den Hauptbereich.' },
        tariffScale: { description: 'Skaliert die Tarifanzeige.' },
    },
    list: {
        entryIcon: { description: 'Icon, das alle Zeilen ohne eigenes Icon bekommen.' },
        entryIconColor: { description: 'Farbe des Zeilen-Icons.' },
        entryIconSize: { description: 'Größe des Zeilen-Icons in px.' },
        showEntryLastChange: { description: 'Letzte Änderung je Zeile anzeigen.' },
        noRoomLabel: { description: 'Überschrift für Zeilen ohne Raum.' },
        roomHeaderBg: { description: 'Hintergrundfarbe der Raumüberschrift.' },
        roomHeaderColor: { description: 'Textfarbe der Raumüberschrift.' },
        roomHeaderFontSize: { description: 'Schriftgröße der Raumüberschrift in px.' },
        subDpTemplate: { description: 'Vorlage für die Zweitzeile, z. B. ein Batterie- oder Verbrauchs-DP.' },
        subDpTemplateHideMissing: { description: 'Zeilen ohne passenden Zweitzeilen-DP ohne Zweitzeile zeigen.' },
    },
};

/**
 * Keys the readers cannot see. Group and panels keep their children in a
 * separate store, so the component never reads them off `options`.
 */
export const EXTRA_OPTIONS = {
    calendar: {
        // Read inside getMultiDayMode(options), i.e. through a parameter rather
        // than the component's own options binding.
        multiDayDisplay: {
            type: 'string',
            enum: ['off', 'span', 'badge', 'both'],
            default: 'both',
            description: 'Wie mehrtägige Termine dargestellt werden.',
        },
        multiDaySplit: {
            type: 'boolean',
            default: false,
            description:
                'Mehrtägige Termine als einen Eintrag je Tag zeigen. Das Badge nennt dann den Tag der Laufzeit ("Tag 2/5").',
        },
    },
    group: {
        defId: {
            type: 'string',
            description:
                'Verweis auf die Kinderliste in aura-group-defs. Beim Import wird sie aus dem Feld "groupDefs" der ' +
                'Import-JSON angelegt — nicht von Hand vergeben.',
        },
    },
    panels: {
        defId: {
            type: 'string',
            description: 'Verweis auf die Kinderliste je Panel-Slide, analog zum Gruppen-Widget.',
        },
    },
};

/**
 * Options every widget accepts, whatever its type.
 *
 * They are read by the WidgetFrame wrapper (components/layout/WidgetFrame.tsx),
 * not by the widget components — which is exactly why the source reader missed
 * them: it walks components/widgets/ only. Left out, a model concludes that only
 * the handful of widgets that happen to read `transparent` themselves can be
 * transparent, and that conditions, badges and click actions do not exist.
 *
 * `ts` is the TypeScript type, resolved by the generator like any other.
 */
export const UNIVERSAL_OPTIONS = {
    conditions: {
        ts: 'WidgetCondition[]',
        description:
            'Regeln, die Aussehen und Sichtbarkeit des Widgets vom Wert eines Datenpunkts abhängig machen ' +
            '(Farbe, Icon, Titel, Textgröße, ausblenden).',
    },
    badges: {
        ts: 'BadgeDef[]',
        description: 'Kleine Marker in der Ecke des Widgets, gespeist aus einem Datenpunkt.',
    },
    clickAction: {
        ts: 'ClickAction',
        description: 'Was ein Klick auf das Widget auslöst — Popup, Navigation, Datenpunkt schreiben, URL.',
    },
    transparent: {
        ts: 'boolean',
        description: 'Kartenhintergrund und Rahmen weglassen; das Widget schwebt frei auf dem Dashboard.',
    },
    transparency: {
        ts: 'number',
        description: 'Deckkraft der Karte in Prozent (100 = voll deckend).',
    },
    styleOverride: {
        ts: 'Record<string, string>',
        description: 'CSS-Variablen nur für dieses Widget, z. B. { "--accent": "#f00" }.',
    },
};

/**
 * Type per option KEY NAME, where the source reader could not work one out.
 *
 * `customGrid` is the case that mattered: it arrived as an untyped `{}`, so the
 * 27 widget types that offer layout "custom" came with no description of what the
 * grid looks like — and a model choosing that layout produced a widget of nine
 * empty cells with nothing to warn it.
 */
export const KEY_TYPES = {
    // The stored value may also be a bare CustomCell[] (legacy 3x3); normalizeGrid
    // accepts both. Describing the current shape is what a generator needs.
    customGrid: 'CustomGridDef',
};

/** Identifiers the readers picked up that are not option keys. */
export const DROP_KEYS = {};
