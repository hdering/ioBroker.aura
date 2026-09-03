'use strict';

/**
 * The dashboard's colours, as the tokens a widget should actually use.
 *
 * Reported from use: the schema mentions `var(--accent-green)` and
 * `var(--text-secondary)` in its option descriptions, but nothing anywhere
 * listed the tokens — so a generated dashboard came back full of #f59e0b and
 * #94a3b8. Those hold up in the theme they were guessed against and clash in the
 * next one, and the user switches light/dark.
 *
 * Two halves: the palette itself (generated from src-vis/themes/index.ts into
 * public/ai/aura-theme-tokens.json, so it cannot drift) and what THIS
 * installation has selected, which only the adapter can know.
 *
 * Pure functions apart from the one state read.
 */

/** Which theme(s) a dashboard shows, and the user's own overrides. */
async function readThemeChoice(adapter) {
    const state = await adapter.getStateAsync('config.theme');
    const raw = state && state.val;
    if (typeof raw !== 'string' || raw.length < 3) {
        return {};
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    const s = (parsed && parsed.state) || parsed || {};
    return {
        themeId: typeof s.themeId === 'string' ? s.themeId : undefined,
        // With "follow the browser" on there is no single theme: the device
        // decides, so both have to be described or half the answer is wrong.
        followBrowser: s.followBrowser === true,
        browserLightThemeId: typeof s.browserLightThemeId === 'string' ? s.browserLightThemeId : undefined,
        browserDarkThemeId: typeof s.browserDarkThemeId === 'string' ? s.browserDarkThemeId : undefined,
        customVars: s.customVars && typeof s.customVars === 'object' ? s.customVars : {},
    };
}

/** The themes actually in play, most relevant first. */
function activeThemes(tokens, choice) {
    const byId = new Map((tokens.themes || []).map((t) => [t.id, t]));
    // Only what is really in play. Appending the default theme as well produced
    // two values per token on a dashboard that has exactly one — and "#a6e3a1 /
    // #22c55e" reads as "it depends", which would be a lie.
    const ids =
        choice && choice.followBrowser
            ? [choice.browserLightThemeId, choice.browserDarkThemeId]
            : [choice && choice.themeId];
    const out = [];
    for (const id of ids) {
        const t = id && byId.get(id);
        if (t && !out.includes(t)) {
            out.push(t);
        }
    }
    if (out.length) {
        return out;
    }
    const fallback = byId.get(tokens.defaultThemeId);
    return fallback ? [fallback] : (tokens.themes || []).slice(0, 1);
}

/** A token's value in a theme, the user's own override taking precedence. */
function valueOf(theme, name, customVars) {
    const own = customVars && customVars[name];
    return typeof own === 'string' && own ? own : theme.vars[name];
}

/**
 * token → the value(s) it has on THIS dashboard.
 *
 * Used by the validator to tell a token that exists from one that does not: an
 * unknown token in a chart colour resolves to nothing and the series quietly
 * takes a palette colour instead. With "follow the browser" two themes are in
 * play and a token can have two values — both are listed.
 */
function themeValues(tokens, choice) {
    const out = new Map();
    if (!tokens || !Array.isArray(tokens.themes)) {
        return out;
    }
    const themes = activeThemes(tokens, choice);
    const custom = (choice && choice.customVars) || {};
    const names = new Set([
        ...(tokens.baseTokens || []).map((t) => t.name),
        ...(tokens.elementTokens || []).map((t) => t.name),
        ...Object.keys(custom),
    ]);
    for (const name of names) {
        const values = [...new Set(themes.map((t) => valueOf(t, name, custom)).filter(Boolean))];
        if (values.length) {
            out.set(name, values.join(' / '));
        }
    }
    return out;
}

/**
 * The short block that goes into aura_dashboard: the palette, nothing else.
 *
 * Deliberately only the base tokens — they are what a widget colour normally
 * wants, and 41 element tokens on every dashboard read would be prompt budget
 * spent on the rare case. aura_theme has the rest.
 */
function renderPalette(tokens, choice) {
    if (!tokens || !Array.isArray(tokens.baseTokens)) {
        return '';
    }
    const themes = activeThemes(tokens, choice);
    const custom = (choice && choice.customVars) || {};
    const head = themes.map((t) => `${t.name}${t.dark ? ' (dunkel)' : ''}`).join(' + ');
    const lines = tokens.baseTokens
        // The three that are not colours (radius, border width, shadow) are of no
        // use to a model choosing a colour and only make the block longer.
        .filter((t) => /color|bg|border$|text|accent|surface/.test(t.name))
        .map((t) => {
            const values = themes.map((th) => valueOf(th, t.name, custom)).filter(Boolean);
            const shown = [...new Set(values)].join(' / ');
            return `  var(${t.name})${shown ? ` = ${shown}` : ''}${custom[t.name] ? ' [angepasst]' : ''}`;
        });
    return [
        `Farben: Theme „${head}“. Immer var(--token) schreiben, nie einen Hex-Wert — sonst passt die Farbe ` +
            'im anderen Theme nicht mehr.',
        ...lines,
        'Weitere Token je Bedienelement (Schalter, Rollladen, Gauge …): aura_theme.',
    ].join('\n');
}

/** The whole palette — the answer to `aura_theme`. */
function renderTheme(tokens, choice, opts = {}) {
    if (!tokens || !Array.isArray(tokens.baseTokens)) {
        return 'Die Theme-Token sind in dieser Installation nicht mitgeliefert (public/ai/aura-theme-tokens.json fehlt).';
    }
    const themes = activeThemes(tokens, choice);
    const custom = (choice && choice.customVars) || {};
    const out = [];

    out.push('# Farben dieses Dashboards');
    out.push(
        choice && choice.followBrowser
            ? 'Das Dashboard folgt der Browser-Einstellung, es sind also ZWEI Themes im Spiel — eine feste ' +
                  'Farbe kann nur in einem davon stimmen.'
            : `Ausgewähltes Theme: ${themes.map((t) => `${t.name} (${t.id})`).join(', ')}.`,
    );
    out.push(
        'Farbwerte gehören als var(--token) in die Konfiguration, nicht als Hex-Wert. Die Token folgen dem ' +
            'Theme des Nutzers; ein fester Wert tut das nicht.',
    );

    const table = (list, withInherit) => {
        let group = null;
        const rows = [];
        for (const t of list) {
            if (t.group && t.group !== group) {
                group = t.group;
                rows.push(`## ${group}`);
            }
            const values = themes.map((th) => valueOf(th, t.name, custom)).filter(Boolean);
            const shown = [...new Set(values)].join(' / ');
            rows.push(
                `- var(${t.name})` +
                    (shown ? ` = ${shown}` : '') +
                    (withInherit && t.inherits ? ` — ohne eigene Einstellung wie ${t.inherits}` : '') +
                    (t.description ? ` (${t.description})` : '') +
                    (custom[t.name] ? ' [vom Nutzer angepasst]' : ''),
            );
        }
        return rows;
    };

    out.push('', '# Basis-Palette', ...table(tokens.baseTokens, false));

    if (opts.elements !== false) {
        out.push(
            '',
            '# Token je Bedienelement',
            'Optionale Feinjustierung. Unbenutzt erben sie den genannten Basis-Token — für eine normale ' +
                'Widget-Farbe reicht die Basis-Palette.',
            ...table(tokens.elementTokens || [], true),
        );
    } else {
        out.push(
            '',
            `${(tokens.elementTokens || []).length} weitere Token je Bedienelement (Schalter, Rollladen, Gauge …) ` +
                'nicht ausgegeben — mit elements=true anfordern.',
        );
    }

    if (themes.length > 1) {
        out.push('', 'Zwei Werte je Token = die beiden aktiven Themes in derselben Reihenfolge wie oben genannt.');
    }
    const others = (tokens.themes || []).filter((t) => !themes.includes(t));
    if (others.length) {
        out.push(
            '',
            `Der Nutzer kann jederzeit umschalten (${others.length} weitere Themes: ` +
                `${others.map((t) => t.name).join(', ')}) — noch ein Grund, keine festen Farben zu schreiben.`,
        );
    }
    return out.join('\n');
}

module.exports = { activeThemes, readThemeChoice, renderPalette, renderTheme, themeValues };
