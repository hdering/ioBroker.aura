// Reusable demo config for admin-area screenshots. Recognisable smart-home
// content, all bound to fictional `demo.*` datapoints that are mocked in the
// browser — nothing touches the real ioBroker instance.

// Auto-place widgets in a grid: `perRow` columns, each cell w×h with a gap.
function placeRow(widgets, { w = 11, h = 6, perRow = 3, gap = 1 } = {}) {
    return widgets.map((wg, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        return { ...wg, gridPos: { x: col * (w + gap), y: row * (h + gap), w, h } };
    });
}

let nid = 0;
const W = (type, title, datapoint, options = {}, layout = 'default') => ({
    id: `w-demo-${nid++}`,
    type,
    title,
    datapoint,
    layout,
    options,
});

export const LAYOUTS = [
    {
        id: 'layout-wohnzimmer',
        name: 'Wohnzimmer',
        slug: 'wohnzimmer',
        icon: 'Sofa',
        activeTabId: 'tab-wz-overview',
        settings: { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 },
        tabs: [
            {
                id: 'tab-wz-overview',
                name: 'Übersicht',
                slug: 'uebersicht',
                widgets: placeRow([
                    W('switch', 'Deckenlicht', 'demo.wz.deckenlicht'),
                    W('dimmer', 'Stehlampe', 'demo.wz.stehlampe'),
                    W('shutter', 'Rollladen', 'demo.wz.rollladen'),
                    W('value', 'Temperatur', 'demo.wz.temp', { unit: '°C' }),
                    W('value', 'Luftfeuchte', 'demo.wz.hum', { unit: '%' }),
                    W('gauge', 'CO₂', 'demo.wz.co2', { unit: 'ppm', min: 400, max: 1500 }),
                ]),
            },
            {
                id: 'tab-wz-klima',
                name: 'Klima',
                slug: 'klima',
                widgets: placeRow([
                    W('thermostat', 'Heizung', 'demo.wz.heizung'),
                    W('value', 'Vorlauf', 'demo.wz.vorlauf', { unit: '°C' }),
                ]),
            },
        ],
    },
    {
        id: 'layout-kueche',
        name: 'Küche',
        slug: 'kueche',
        icon: 'CookingPot',
        activeTabId: 'tab-ku-overview',
        settings: { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 },
        tabs: [
            {
                id: 'tab-ku-overview',
                name: 'Übersicht',
                slug: 'uebersicht',
                widgets: placeRow([
                    W('switch', 'Kaffeemaschine', 'demo.ku.kaffee'),
                    W('value', 'Temperatur', 'demo.ku.temp', { unit: '°C' }),
                    W('windowcontact', 'Fenster', 'demo.ku.fenster'),
                ]),
            },
        ],
    },
    {
        id: 'layout-wetter',
        name: 'Wetter',
        slug: 'wetter',
        icon: 'CloudSun',
        activeTabId: 'tab-we-today',
        settings: { gridRowHeight: 20, gridSnapX: 20, gridGap: 10 },
        tabs: [
            {
                id: 'tab-we-today',
                name: 'Heute',
                slug: 'heute',
                widgets: placeRow([
                    W('clock', 'Uhrzeit', ''),
                    W('value', 'Außentemperatur', 'demo.we.temp', { unit: '°C' }),
                ]),
            },
        ],
    },
];

export const ACTIVE_LAYOUT_ID = 'layout-wohnzimmer';

export const MOCK = {
    'demo.wz.deckenlicht': true,
    'demo.wz.stehlampe': 60,
    'demo.wz.rollladen': 40,
    'demo.wz.temp': 21.5,
    'demo.wz.hum': 48,
    'demo.wz.co2': 650,
    'demo.wz.heizung': 21.5,
    'demo.wz.vorlauf': 38,
    'demo.ku.kaffee': false,
    'demo.ku.temp': 23.1,
    'demo.ku.fenster': false,
    'demo.we.temp': 14.2,
};
