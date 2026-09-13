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
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    return {
        themeId: typeof s.themeId === 'string' ? s.themeId : undefined,
        // With "follow the browser" on there is no single theme: the device
        // decides, so both have to be described or half the answer is wrong.
        followBrowser: s.followBrowser === true,
        browserLightThemeId: typeof s.browserLightThemeId === 'string' ? s.browserLightThemeId : undefined,
        browserDarkThemeId: typeof s.browserDarkThemeId === 'string' ? s.browserDarkThemeId : undefined,
        customVars: obj(s.customVars),
        // Overrides that apply to ONE brightness only (#640). Without them the
        // answer would report the shared accent for both halves while the
        // dashboard actually shows two different ones.
        customVarsLight: obj(s.customVarsLight),
        customVarsDark: obj(s.customVarsDark),
        // Themes the user made themselves — they exist on this installation only,
        // so the generated token list has to come from here, not from the file
        // generated out of the sources.
        userThemes: Array.isArray(s.userThemes) ? s.userThemes : [],
    };
}

/**
 * A user theme as a complete theme, mirroring materializeUserTheme in the
 * frontend: a built-in base plus the vars the user changed.
 */
function materializeUserTheme(tokens, ut) {
    const list = (tokens && tokens.themes) || [];
    const base = list.find((t) => t.id === ut.baseId) || list[0];
    return {
        id: ut.id,
        name: ut.name,
        dark: ut.dark === true,
        vars: Object.assign({}, base && base.vars, ut.vars),
    };
}

/** Built-in themes plus the ones this installation defined itself. */
function knownThemes(tokens, choice) {
    const builtin = (tokens && tokens.themes) || [];
    const own = ((choice && choice.userThemes) || [])
        .filter((t) => t && typeof t.id === 'string')
        .map((t) => materializeUserTheme(tokens, t));
    return own.length ? [...builtin, ...own] : builtin;
}

/**
 * The overrides that apply to a theme of this brightness (#640).
 *
 * The shared set first, the matching half on top — the same order the frontend
 * lays them on :root.
 */
function customFor(choice, theme) {
    const shared = (choice && choice.customVars) || {};
    const half = (choice && (theme.dark ? choice.customVarsDark : choice.customVarsLight)) || {};
    return Object.keys(half).length ? Object.assign({}, shared, half) : shared;
}

/** Every token the user changed anywhere — what gets the "[angepasst]" marker. */
function allCustomKeys(choice) {
    const out = new Set();
    for (const key of ['customVars', 'customVarsLight', 'customVarsDark']) {
        Object.keys((choice && choice[key]) || {}).forEach((k) => out.add(k));
    }
    return out;
}

/** The themes actually in play, most relevant first. */
function activeThemes(tokens, choice) {
    const byId = new Map(knownThemes(tokens, choice).map((t) => [t.id, t]));
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
    return fallback ? [fallback] : knownThemes(tokens, choice).slice(0, 1);
}

/**
 * The element tokens, and what a config value has to write to use one.
 *
 * Reported from the field, with a probe element in the running frontend: NONE of
 * the element tokens is defined on `:root` — `--light-on`, `--switch-bg`,
 * `--chip-active` and the rest all resolve to `rgba(0,0,0,0)` while the base
 * palette resolves fine. They are deliberately unset (themes/index.ts: optional
 * overrides), and every WIDGET reads them as `var(--light-on, var(--accent-yellow))`
 * — the fallback is in the widget's own code, not in CSS. A configuration value
 * copied from this answer has no such fallback: `activeColor: "var(--light-on)"`
 * is invalid at computed-value time and paints nothing, which is how a row of
 * switches came out grey instead of yellow.
 *
 * So the answer now hands over the form that WORKS, and `use` is what to write.
 *
 * @returns {Map<string, {inherits: string|undefined, use: string}>}
 */
function elementTokenIndex(tokens) {
    const out = new Map();
    for (const t of (tokens && tokens.elementTokens) || []) {
        const fb = t.inherits;
        out.set(t.name, {
            inherits: fb,
            use: fb ? `var(${t.name}, ${String(fb).startsWith('--') ? `var(${fb})` : fb})` : `var(${t.name})`,
        });
    }
    return out;
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
    const names = new Set([
        ...(tokens.baseTokens || []).map((t) => t.name),
        ...(tokens.elementTokens || []).map((t) => t.name),
        ...allCustomKeys(choice),
    ]);
    for (const name of names) {
        const values = [...new Set(themes.map((t) => valueOf(t, name, customFor(choice, t))).filter(Boolean))];
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
    const customKeys = allCustomKeys(choice);
    const head = themes.map((t) => `${t.name}${t.dark ? ' (dunkel)' : ''}`).join(' + ');
    const lines = tokens.baseTokens
        // The three that are not colours (radius, border width, shadow) are of no
        // use to a model choosing a colour and only make the block longer.
        .filter((t) => /color|bg|border$|text|accent|surface/.test(t.name))
        .map((t) => {
            const values = themes.map((th) => valueOf(th, t.name, customFor(choice, th))).filter(Boolean);
            const shown = [...new Set(values)].join(' / ');
            return `  var(${t.name})${shown ? ` = ${shown}` : ''}${customKeys.has(t.name) ? ' [angepasst]' : ''}`;
        });
    return [
        `Farben: Theme „${head}“. Immer var(--token) schreiben, nie einen Hex-Wert — sonst passt die Farbe ` +
            'im anderen Theme nicht mehr.',
        ...lines,
        'Weitere Token je Bedienelement (Schalter, Rollladen, Gauge …): aura_theme. Die sind im CSS nicht ' +
            'definiert und brauchen in der Konfiguration immer den Rückfall: var(--light-on, var(--accent-yellow)).',
    ].join('\n');
}

/** The whole palette — the answer to `aura_theme`. */
function renderTheme(tokens, choice, opts = {}) {
    if (!tokens || !Array.isArray(tokens.baseTokens)) {
        return 'Die Theme-Token sind in dieser Installation nicht mitgeliefert (public/ai/aura-theme-tokens.json fehlt).';
    }
    const themes = activeThemes(tokens, choice);
    const customKeys = allCustomKeys(choice);
    const out = [];

    out.push('# Farben dieses Dashboards');
    out.push(
        choice && choice.followBrowser
            ? 'Das Dashboard folgt der Browser-Einstellung, es sind also ZWEI Themes im Spiel — eine feste ' +
                  'Farbe kann nur in einem davon stimmen. Der Nutzer kann beide Haelften getrennt anpassen, ' +
                  'ein Token hat deshalb je Theme seinen eigenen Wert.'
            : `Ausgewähltes Theme: ${themes.map((t) => `${t.name} (${t.id})`).join(', ')}.`,
    );
    out.push(
        'Farbwerte gehören als var(--token) in die Konfiguration, nicht als Hex-Wert. Die Token folgen dem ' +
            'Theme des Nutzers; ein fester Wert tut das nicht.',
    );

    const elements = elementTokenIndex(tokens);
    const table = (list, isElement) => {
        let group = null;
        const rows = [];
        for (const t of list) {
            if (t.group && t.group !== group) {
                group = t.group;
                rows.push(`## ${group}`);
            }
            const values = themes.map((th) => valueOf(th, t.name, customFor(choice, th))).filter(Boolean);
            const shown = [...new Set(values)].join(' / ');
            // An element token is printed AS IT MUST BE WRITTEN, with its
            // fallback: bare, it is undefined CSS and paints nothing (see
            // elementTokenIndex). The base tokens are defined and stay short.
            const el = isElement ? elements.get(t.name) : null;
            const set = customKeys.has(t.name);
            rows.push(
                `- ${el && !set ? el.use : `var(${t.name})`}` +
                    (shown ? ` = ${shown}` : el && el.inherits ? ` = wie ${el.inherits}` : '') +
                    (t.description ? ` (${t.description})` : '') +
                    (set ? ' [vom Nutzer angepasst]' : ''),
            );
        }
        return rows;
    };

    out.push('', '# Basis-Palette', ...table(tokens.baseTokens, false));

    if (opts.elements !== false) {
        out.push(
            '',
            '# Token je Bedienelement',
            'Optionale Feinjustierung; für eine normale Widget-Farbe reicht die Basis-Palette.',
            'WICHTIG: diese Token sind im CSS NICHT definiert, solange der Nutzer sie nicht anpasst — ' +
                'var(--light-on) allein ist ungültiges CSS und färbt gar nichts (transparent). Die Widgets ' +
                'bringen den Rückfall in ihrem eigenen Code mit, eine Konfiguration tut das nicht. Deshalb ' +
                'immer genau die Schreibweise unten übernehmen, mit Rückfall: ' +
                'var(--light-on, var(--accent-yellow)).',
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
    const others = knownThemes(tokens, choice).filter((t) => !themes.includes(t));
    if (others.length) {
        out.push(
            '',
            `Der Nutzer kann jederzeit umschalten (${others.length} weitere Themes: ` +
                `${others.map((t) => t.name).join(', ')}) — noch ein Grund, keine festen Farben zu schreiben.`,
        );
    }
    return out.join('\n');
}

module.exports = {
    activeThemes,
    customFor,
    elementTokenIndex,
    knownThemes,
    readThemeChoice,
    renderPalette,
    renderTheme,
    themeValues,
};
