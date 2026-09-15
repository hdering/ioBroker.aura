import { useThemeStore } from '../../../../store/themeStore';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { BrightnessTabs, useHasTwoBrightnesses } from '../shared/BrightnessTabs';
import { useEditBrightness } from '../shared/editBrightness';
import { getTheme, ELEMENT_VAR_FALLBACKS, type ThemeVars, type AllVars } from '../../../../themes';
import { hasVars, VAR_SET_KEYS, type VarScope, type VarSets } from '../../../../utils/themeVars';
import { useT } from '../../../../i18n';
import { ColorPicker } from '../../../../components/common/ColorPicker';

/**
 * The editor's reading order (#640): first the palette everything else inherits
 * from, then the chrome that frames every screen (navigation, header), then the
 * card, and only after that the single control types. Before this, "Navigation"
 * sat between "Licht" and "Popup", eleven groups down the page.
 */
const VAR_GROUPS: { labelKey: string; keys: (keyof AllVars)[] }[] = [
    { labelKey: 'theme.vars.app', keys: ['--app-bg', '--app-surface', '--app-border'] },
    { labelKey: 'theme.vars.text', keys: ['--text-primary', '--text-secondary'] },
    { labelKey: 'theme.vars.colors', keys: ['--accent', '--accent-green', '--accent-yellow', '--accent-red'] },
    {
        labelKey: 'theme.vars.elNav',
        keys: ['--nav-bg', '--nav-text', '--nav-icon', '--nav-active', '--nav-active-icon', '--nav-shadow'],
    },
    { labelKey: 'theme.vars.elHeader', keys: ['--header-text', '--header-bg', '--header-accent'] },
    {
        labelKey: 'theme.vars.widget',
        keys: ['--widget-bg', '--widget-border', '--widget-border-width', '--widget-radius', '--widget-shadow'],
    },
    { labelKey: 'theme.vars.elGroup', keys: ['--widget-in-group-bg', '--widget-in-group-border'] },
    { labelKey: 'theme.vars.elPopup', keys: ['--popup-bg', '--popup-border'] },
    {
        labelKey: 'theme.vars.elSwitch',
        keys: ['--switch-bg', '--switch-off-bg', '--switch-thumb-color', '--switch-border'],
    },
    { labelKey: 'theme.vars.elSlider', keys: ['--slider-track', '--slider-fill', '--slider-thumb'] },
    { labelKey: 'theme.vars.elButton', keys: ['--button-bg', '--button-text', '--button-border'] },
    {
        labelKey: 'theme.vars.elBlind',
        keys: [
            '--blind-color',
            '--blind-bg',
            '--blind-border',
            '--blind-up-color',
            '--blind-up-bg',
            '--blind-up-border',
            '--blind-stop-color',
            '--blind-stop-bg',
            '--blind-stop-border',
            '--blind-down-color',
            '--blind-down-bg',
            '--blind-down-border',
        ],
    },
    { labelKey: 'theme.vars.elClimate', keys: ['--climate-heat', '--climate-cool'] },
    { labelKey: 'theme.vars.elLight', keys: ['--light-on', '--light-off'] },
    { labelKey: 'theme.vars.elChip', keys: ['--chip-bg', '--chip-border', '--chip-active'] },
    { labelKey: 'theme.vars.elBadge', keys: ['--badge-ok', '--badge-warn', '--badge-crit'] },
    { labelKey: 'theme.vars.elGauge', keys: ['--gauge-arc', '--gauge-track'] },
];

const VAR_LABEL_KEYS: Partial<Record<keyof AllVars, string>> = {
    '--app-bg': 'theme.vars.bg',
    '--app-surface': 'theme.vars.surface',
    '--app-border': 'theme.vars.border',
    '--widget-bg': 'theme.vars.bg',
    '--widget-border': 'theme.vars.border',
    '--widget-border-width': 'theme.vars.borderWidth',
    '--widget-radius': 'theme.vars.radius',
    '--widget-shadow': 'theme.vars.shadow',
    '--text-primary': 'theme.vars.primary',
    '--text-secondary': 'theme.vars.secondary',
    '--accent': 'theme.vars.accent',
    '--accent-green': 'theme.vars.green',
    '--accent-yellow': 'theme.vars.yellow',
    '--accent-red': 'theme.vars.red',
    // Element vars
    '--switch-bg': 'theme.vars.elOnBg',
    '--switch-off-bg': 'theme.vars.elOffBg',
    '--switch-thumb-color': 'theme.vars.elThumb',
    '--switch-border': 'theme.vars.border',
    '--blind-color': 'theme.vars.elIndicator',
    '--blind-bg': 'theme.vars.bg',
    '--blind-border': 'theme.vars.border',
    '--blind-up-color': 'theme.vars.elUpColor',
    '--blind-up-bg': 'theme.vars.elUpBg',
    '--blind-up-border': 'theme.vars.elUpBorder',
    '--blind-stop-color': 'theme.vars.elStopColor',
    '--blind-stop-bg': 'theme.vars.elStopBg',
    '--blind-stop-border': 'theme.vars.elStopBorder',
    '--blind-down-color': 'theme.vars.elDownColor',
    '--blind-down-bg': 'theme.vars.elDownBg',
    '--blind-down-border': 'theme.vars.elDownBorder',
    '--header-text': 'theme.vars.elText',
    '--header-bg': 'theme.vars.bg',
    '--header-accent': 'theme.vars.accent',
    '--widget-in-group-bg': 'theme.vars.bg',
    '--widget-in-group-border': 'theme.vars.border',
    '--slider-track': 'theme.vars.elTrack',
    '--slider-fill': 'theme.vars.elFill',
    '--slider-thumb': 'theme.vars.elThumb',
    '--button-bg': 'theme.vars.bg',
    '--button-text': 'theme.vars.elText',
    '--button-border': 'theme.vars.border',
    '--gauge-arc': 'theme.vars.elArc',
    '--gauge-track': 'theme.vars.elTrack',
    '--climate-heat': 'theme.vars.elHeat',
    '--climate-cool': 'theme.vars.elCool',
    '--chip-bg': 'theme.vars.bg',
    '--chip-border': 'theme.vars.border',
    '--chip-active': 'theme.vars.elActive',
    '--badge-ok': 'theme.vars.green',
    '--badge-warn': 'theme.vars.yellow',
    '--badge-crit': 'theme.vars.red',
    '--light-on': 'theme.vars.elOn',
    '--light-off': 'theme.vars.elOff',
    '--nav-bg': 'theme.vars.bg',
    '--nav-text': 'theme.vars.elText',
    '--nav-icon': 'theme.vars.elIcon',
    '--nav-active': 'theme.vars.elActive',
    '--nav-active-icon': 'theme.vars.elActiveIcon',
    '--nav-shadow': 'theme.vars.shadow',
    '--popup-bg': 'theme.vars.bg',
    '--popup-border': 'theme.vars.border',
};

function isColor(v: string) {
    return v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl');
}

/**
 * Resolve the inherited default for a var: base-palette vars come straight from
 * the theme; element vars fall back via ELEMENT_VAR_FALLBACKS (to another base
 * var or a literal like '#ffffff'/'transparent').
 */
function resolveBase(key: keyof AllVars, themeVars: ThemeVars, own: Partial<AllVars> = {}): string {
    if (key in themeVars) return themeVars[key as keyof ThemeVars];
    let fb: string | undefined = ELEMENT_VAR_FALLBACKS[key as keyof typeof ELEMENT_VAR_FALLBACKS];
    // An element var may inherit from another element var — the icon of the active
    // entry follows that entry's colour. Walk the chain and stop at the first hop
    // the user has already set, because that is what the frontend paints: showing
    // the accent behind "Icon aktiv" while the navigation's active colour is red
    // read like the accent was winning (#640).
    const seen = new Set<string>([key]);
    while (typeof fb === 'string' && fb.startsWith('--') && !seen.has(fb)) {
        seen.add(fb);
        const set = own[fb as keyof AllVars];
        if (set) return set;
        if (fb in themeVars) return themeVars[fb as keyof ThemeVars];
        fb = ELEMENT_VAR_FALLBACKS[fb as keyof typeof ELEMENT_VAR_FALLBACKS];
    }
    return fb ?? '';
}

interface ThemeVarsSectionProps {
    contextId: string | null;
}

export function ThemeVarsSection({ contextId }: ThemeVarsSectionProps) {
    const t = useT();
    const { themeId, customVars, customVarsLight, customVarsDark, setCustomVar, clearCustomVar, resetCustom } =
        useThemeStore();
    const browserLightThemeId = useThemeStore((s) => s.browserLightThemeId);
    const browserDarkThemeId = useThemeStore((s) => s.browserDarkThemeId);
    const { ls, setPatch } = useLayoutSetting(contextId);

    // Which half is being edited (#640). Only offered while two brightnesses are
    // actually in play - with a single fixed design there is nothing to choose
    // and the shared set is the only sensible target. The choice is shared with
    // the preset grid and with "save the current look", so the whole page works
    // on the same half.
    const twoBrightnesses = useHasTwoBrightnesses();
    const scope = useEditBrightness((s) => s.scope);
    const setScope = useEditBrightness((s) => s.setScope);
    const activeScope: VarScope = twoBrightnesses ? scope : 'base';

    const effectiveThemeId = ls?.themeId ?? themeId;
    // A scope that has no set of its own starts from the inherited one - same as
    // before, now once per half.
    const sets: VarSets = {
        base: ls?.customVars ?? customVars,
        light: ls?.customVarsLight ?? customVarsLight,
        dark: ls?.customVarsDark ?? customVarsDark,
    };
    const effectiveVars = sets[activeScope] ?? {};
    // What this half really paints: the shared set with the half laid on top.
    // resolveBase needs it to follow one element var to another (see there).
    const inherited: Partial<AllVars> = activeScope === 'base' ? effectiveVars : { ...sets.base, ...effectiveVars };
    // The values shown behind the fields belong to the theme this half applies
    // to: editing the dark half against the light theme's palette would show
    // placeholders the user never gets to see.
    const activeTheme = getTheme(
        activeScope === 'light' ? browserLightThemeId : activeScope === 'dark' ? browserDarkThemeId : effectiveThemeId,
    );

    const ownSets: VarSets = contextId
        ? { base: ls?.customVars, light: ls?.customVarsLight, dark: ls?.customVarsDark }
        : { base: customVars, light: customVarsLight, dark: customVarsDark };
    const hasCustomVars = hasVars(ownSets);
    const filledScopes = (['base', 'light', 'dark'] as VarScope[]).filter(
        (sc) => Object.keys(ownSets[sc] ?? {}).length > 0,
    );

    const isThemeOv = (key: keyof AllVars) => contextId !== null && ownSets[activeScope]?.[key] !== undefined;

    function setThemeVar(key: keyof AllVars, value: string) {
        if (!contextId) setCustomVar(key, value, activeScope);
        else setPatch({ [VAR_SET_KEYS[activeScope]]: { ...effectiveVars, [key]: value } });
    }

    function clearThemeVar(key: keyof AllVars) {
        if (!contextId) {
            clearCustomVar(key, activeScope);
        } else {
            const next = { ...effectiveVars };
            delete next[key];
            setPatch({ [VAR_SET_KEYS[activeScope]]: Object.keys(next).length ? next : undefined });
        }
    }

    function resetAllVars() {
        if (!contextId) {
            resetCustom();
            return;
        }
        setPatch({ customVars: undefined, customVarsLight: undefined, customVarsDark: undefined });
    }

    return (
        <div
            data-aura-theme-vars
            className="rounded-xl p-6"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('theme.vars.title')}
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                    {twoBrightnesses && <BrightnessTabs value={scope} onChange={setScope} filled={filledScopes} />}
                    <ResetDefaultsButton onReset={resetAllVars} disabled={!hasCustomVars} scoped={contextId !== null} />
                </div>
            </div>
            {twoBrightnesses && (
                <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {t(
                        activeScope === 'base'
                            ? 'theme.scope.baseHint'
                            : activeScope === 'light'
                              ? 'theme.scope.lightHint'
                              : 'theme.scope.darkHint',
                        { theme: activeTheme.name },
                    )}
                </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
                {VAR_GROUPS.map(({ labelKey, keys }) => (
                    <div key={labelKey}>
                        <p
                            className="text-xs font-semibold uppercase tracking-widest mb-3"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {t(labelKey as never)}
                        </p>
                        <div className="space-y-3">
                            {keys.map((key) => {
                                // A half inherits from the shared set first and only then
                                // from the theme - that is the value it really shows.
                                const base =
                                    (activeScope !== 'base' ? sets.base?.[key] : undefined) ??
                                    resolveBase(key, activeTheme.vars, inherited);
                                const custom = effectiveVars[key];
                                const current = custom ?? base;
                                const varLabelKey = VAR_LABEL_KEYS[key];
                                const isOv = isThemeOv(key);
                                return (
                                    <div key={key} className="flex items-center gap-2">
                                        <label
                                            className="text-xs w-24 shrink-0 flex items-center gap-1"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            {varLabelKey ? t(varLabelKey as never) : key}
                                            {isOv && (
                                                <span
                                                    className="text-[9px] px-1 py-0.5 rounded font-medium"
                                                    style={{
                                                        background:
                                                            'color-mix(in srgb, var(--accent) 15%, transparent)',
                                                        color: 'var(--accent)',
                                                    }}
                                                >
                                                    L
                                                </span>
                                            )}
                                        </label>
                                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                            {isColor(current) && (
                                                <ColorPicker
                                                    value={current.startsWith('#') ? current : '#000000'}
                                                    onChange={(v) => setThemeVar(key, v)}
                                                    className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0.5 shrink-0"
                                                    style={{
                                                        background: 'var(--app-bg)',
                                                        border: '1px solid var(--app-border)',
                                                    }}
                                                />
                                            )}
                                            <input
                                                type="text"
                                                data-aura-theme-var={key}
                                                value={custom ?? ''}
                                                placeholder={base}
                                                onChange={(e) => {
                                                    if (e.target.value) setThemeVar(key, e.target.value);
                                                    else clearThemeVar(key);
                                                }}
                                                className="flex-1 min-w-0 text-xs rounded-lg px-2 py-2 focus:outline-none font-mono"
                                                style={{
                                                    background: 'var(--app-bg)',
                                                    color: custom ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                    border: `1px solid ${custom ? 'var(--accent)' : 'var(--app-border)'}`,
                                                }}
                                            />
                                            {custom && (
                                                <button
                                                    onClick={() => clearThemeVar(key)}
                                                    className="text-xs hover:opacity-70 shrink-0"
                                                    style={{ color: 'var(--text-secondary)' }}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
