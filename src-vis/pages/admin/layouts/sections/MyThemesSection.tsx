import { useRef, useState } from 'react';
import { Copy, Download, Plus, Trash2, Upload, Check, Sun, Moon } from 'lucide-react';
import { useThemeStore, globalVarSets, snapshotUserTheme } from '../../../../store/themeStore';
import { resolveThemeModeId, useThemeModeStore } from '../../../../utils/themeModeCache';
import { resolveThemeVars } from '../../../../utils/themeVars';
import { parseThemeFile, serializeThemes, uniqueThemeName } from '../../../../utils/themeIo';
import { getTheme, type UserTheme } from '../../../../themes';
import { browserBrightness, useEditBrightness } from '../shared/editBrightness';
import { useHasTwoBrightnesses } from '../shared/BrightnessTabs';
import { useT } from '../../../../i18n';

/**
 * The user's own themes (#640).
 *
 * "Follow the browser" used to offer the built-in presets only, so a fully own
 * design could not be used for light AND dark. A theme here is a built-in base
 * plus the variables the user changed — exactly what the var editor produces —
 * and once saved it shows up anywhere a theme can be picked: the preset grid,
 * the two browser-sync pickers and every layout / section override.
 */
export function MyThemesSection() {
    const t = useT();
    const userThemes = useThemeStore((s) => s.userThemes);
    const themeId = useThemeStore((s) => s.themeId);
    const followBrowser = useThemeStore((s) => s.followBrowser);
    const browserLightThemeId = useThemeStore((s) => s.browserLightThemeId);
    const browserDarkThemeId = useThemeStore((s) => s.browserDarkThemeId);
    const addUserTheme = useThemeStore((s) => s.addUserTheme);
    const updateUserTheme = useThemeStore((s) => s.updateUserTheme);
    const removeUserTheme = useThemeStore((s) => s.removeUserTheme);
    const setTheme = useThemeStore((s) => s.setTheme);
    const setBrowserLightThemeId = useThemeStore((s) => s.setBrowserLightThemeId);
    const setBrowserDarkThemeId = useThemeStore((s) => s.setBrowserDarkThemeId);
    const mode = useThemeModeStore((s) => s.mode);
    // Which half the page is working on — the same choice the preset grid and the
    // variable editor show (#640).
    const twoBrightnesses = useHasTwoBrightnesses();
    const scope = useEditBrightness((s) => s.scope);

    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    /**
     * Which design "save the current look" captures.
     *
     * This used to read the ADMIN browser's prefers-color-scheme, so working on
     * the dark half on a light desktop saved a LIGHT theme carrying the light
     * overrides — the dark edits were not in it (#640). The half picked on the
     * page decides now; only with no half chosen (the shared set, or a single
     * design) does the rendered theme still have the say.
     */
    const picked = twoBrightnesses && scope !== 'base' ? scope : null;
    const saveTargetId = picked
        ? picked === 'dark'
            ? browserDarkThemeId
            : browserLightThemeId
        : resolveThemeModeId(
              followBrowser ? (browserBrightness() === 'dark' ? browserDarkThemeId : browserLightThemeId) : themeId,
              mode,
              browserDarkThemeId,
              browserLightThemeId,
          );
    const saveTarget = getTheme(saveTargetId);

    function saveCurrent() {
        const state = useThemeStore.getState();
        const vars = resolveThemeVars(saveTarget.dark, globalVarSets(state));
        const name = uniqueThemeName(
            t('theme.user.newName', { theme: saveTarget.name }),
            userThemes.map((th) => th.name),
        );
        const id = addUserTheme(snapshotUserTheme(saveTargetId, vars, name));
        setNote(t('theme.user.saved', { name }));
        return id;
    }

    function duplicate(th: UserTheme) {
        addUserTheme({
            name: uniqueThemeName(
                th.name,
                userThemes.map((x) => x.name),
            ),
            dark: th.dark,
            baseId: th.baseId,
            vars: { ...th.vars },
        });
    }

    function exportThemes(list: UserTheme[], filename: string) {
        const blob = new Blob([serializeThemes(list)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function importFile(file: File) {
        const parsed = parseThemeFile(await file.text());
        if (!parsed.length) {
            setNote(t('theme.user.importFailed'));
            return;
        }
        const taken = userThemes.map((x) => x.name);
        for (const th of parsed) {
            const name = uniqueThemeName(th.name, taken);
            taken.push(name);
            addUserTheme({ ...th, name });
        }
        setNote(t('theme.user.imported', { count: String(parsed.length) }));
    }

    /** Where a theme is in use right now — shown instead of a bare "active". */
    function usedAs(id: string): string | null {
        if (followBrowser) {
            if (browserLightThemeId === id && browserDarkThemeId === id) return t('theme.user.usedBoth');
            if (browserLightThemeId === id) return t('theme.user.usedLight');
            if (browserDarkThemeId === id) return t('theme.user.usedDark');
            return null;
        }
        return themeId === id ? t('theme.preset.active') : null;
    }

    /** Clicking a theme applies it where it can actually take effect. */
    function apply(th: UserTheme) {
        if (!followBrowser) {
            setTheme(th.id);
            return;
        }
        if (th.dark) setBrowserDarkThemeId(th.id);
        else setBrowserLightThemeId(th.id);
    }

    const btn = {
        background: 'var(--app-bg)',
        border: '1px solid var(--app-border)',
        color: 'var(--text-secondary)',
    };

    return (
        <div
            data-aura-my-themes
            className="rounded-xl p-6"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('theme.user.title')}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        data-aura-save-theme
                        onClick={saveCurrent}
                        className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 hover:opacity-80"
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                            border: '1px solid var(--accent)',
                            color: 'var(--accent)',
                        }}
                    >
                        <Plus size={13} />
                        {t('theme.user.saveCurrent')}
                    </button>
                    <button
                        onClick={() => fileRef.current?.click()}
                        className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 hover:opacity-80"
                        style={btn}
                    >
                        <Upload size={13} />
                        {t('theme.user.import')}
                    </button>
                    {userThemes.length > 0 && (
                        <button
                            onClick={() => exportThemes(userThemes, 'aura-themes.json')}
                            className="flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 hover:opacity-80"
                            style={btn}
                        >
                            <Download size={13} />
                            {t('theme.user.exportAll')}
                        </button>
                    )}
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) void importFile(f);
                        }}
                    />
                </div>
            </div>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {t('theme.user.desc')}
                {twoBrightnesses && (
                    <>
                        {' '}
                        <span data-aura-save-target style={{ color: 'var(--text-primary)' }}>
                            {t(saveTarget.dark ? 'theme.user.savesDark' : 'theme.user.savesLight', {
                                theme: saveTarget.name,
                            })}
                        </span>
                    </>
                )}
            </p>
            {note && (
                <p className="text-xs mb-3" style={{ color: 'var(--accent)' }}>
                    {note}
                </p>
            )}

            {userThemes.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('theme.user.empty')}
                </p>
            ) : (
                <div className="space-y-2">
                    {userThemes.map((th) => {
                        const full = getTheme(th.id);
                        const used = usedAs(th.id);
                        return (
                            <div
                                key={th.id}
                                data-aura-user-theme={th.id}
                                className="flex items-center gap-2 rounded-lg p-2 flex-wrap"
                                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                            >
                                {/* Preview strip with the theme's own colours */}
                                <div
                                    className="flex items-center gap-1 rounded-md px-2 h-8 shrink-0"
                                    style={{
                                        background: full.vars['--app-bg'],
                                        border: `1px solid ${full.vars['--app-border']}`,
                                    }}
                                >
                                    {(['--widget-bg', '--accent', '--accent-green', '--accent-red'] as const).map(
                                        (k) => (
                                            <span
                                                key={k}
                                                className="w-3 h-3 rounded-full"
                                                style={{
                                                    background: full.vars[k],
                                                    border: `1px solid ${full.vars['--app-border']}`,
                                                }}
                                            />
                                        ),
                                    )}
                                </div>
                                <input
                                    value={th.name}
                                    onChange={(e) => updateUserTheme(th.id, { name: e.target.value })}
                                    className="text-xs rounded-md px-2 py-1.5 focus:outline-none flex-1 min-w-[120px]"
                                    style={{
                                        background: 'var(--app-surface)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                />
                                <button
                                    onClick={() => updateUserTheme(th.id, { dark: !th.dark })}
                                    title={t('theme.user.togglePolarity')}
                                    className="flex items-center gap-1 text-[11px] rounded-md px-2 py-1.5 hover:opacity-80 shrink-0"
                                    style={btn}
                                >
                                    {th.dark ? <Moon size={12} /> : <Sun size={12} />}
                                    {t(th.dark ? 'theme.scope.dark' : 'theme.scope.light')}
                                </button>
                                <span className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>
                                    {t('theme.user.basedOn', { theme: getTheme(th.baseId).name })}
                                </span>
                                {used ? (
                                    <span
                                        className="text-[11px] px-2 py-1 rounded-md shrink-0"
                                        style={{
                                            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                            color: 'var(--accent)',
                                        }}
                                    >
                                        {used}
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => apply(th)}
                                        className="flex items-center gap-1 text-[11px] rounded-md px-2 py-1.5 hover:opacity-80 shrink-0"
                                        style={btn}
                                    >
                                        <Check size={12} />
                                        {t('theme.user.use')}
                                    </button>
                                )}
                                <button
                                    onClick={() => duplicate(th)}
                                    title={t('theme.user.duplicate')}
                                    className="rounded-md p-1.5 hover:opacity-80 shrink-0"
                                    style={btn}
                                >
                                    <Copy size={12} />
                                </button>
                                <button
                                    onClick={() => exportThemes([th], `aura-theme-${th.id}.json`)}
                                    title={t('theme.user.export')}
                                    className="rounded-md p-1.5 hover:opacity-80 shrink-0"
                                    style={btn}
                                >
                                    <Download size={12} />
                                </button>
                                {confirmId === th.id ? (
                                    <button
                                        data-aura-confirm-delete-theme
                                        onClick={() => {
                                            removeUserTheme(th.id);
                                            setConfirmId(null);
                                        }}
                                        className="text-[11px] rounded-md px-2 py-1.5 shrink-0"
                                        style={{
                                            background: 'color-mix(in srgb, var(--accent-red) 18%, transparent)',
                                            border: '1px solid var(--accent-red)',
                                            color: 'var(--accent-red)',
                                        }}
                                    >
                                        {t('theme.user.confirmDelete')}
                                    </button>
                                ) : (
                                    <button
                                        data-aura-delete-theme
                                        onClick={() => setConfirmId(th.id)}
                                        title={t('theme.user.delete')}
                                        className="rounded-md p-1.5 hover:opacity-80 shrink-0"
                                        style={btn}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
