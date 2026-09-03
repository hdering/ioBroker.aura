/**
 * Popup surface colour field (issue #611).
 *
 * The same control on all three levels a popup reads — global default, popup
 * view, click action — so "empty = inherit the next level" looks and behaves
 * identically everywhere. `undefined` is a real value here (inherit), which the
 * ColorPicker alone cannot express: hence the reset button and the `unset`
 * swatch glyph.
 *
 * An unset picker opens on the colour the popup ACTUALLY has right now, read
 * from the DOM (`--popup-bg` → `--app-surface` of the current theme) instead of
 * a hardcoded guess — so the first drag starts from the current look rather than
 * jumping to some unrelated colour.
 */
import { ColorPicker } from './ColorPicker';
import { DEFAULT_POPUP_BACKGROUND } from '../../store/popupConfigStore';
import { resolveCssColor } from '../../utils/cssColor';

/** Current popup surface as a hex/rgb string the colour picker can parse. */
function currentSurface(): string {
    const el = document.querySelector('[data-aura-app="frontend"]') ?? document.documentElement;
    return resolveCssColor(DEFAULT_POPUP_BACKGROUND, getComputedStyle(el)) ?? '#1f2937';
}

interface Props {
    label: string;
    value: string | undefined;
    onChange: (value: string | undefined) => void;
    /** What an empty value falls back to, e.g. "View/Global". */
    inheritLabel: string;
    /** Toolbar variant: label sits beside the swatch instead of above it. */
    inline?: boolean;
    /** Optional explanation below the field (block variant only). */
    hint?: string;
}

export function PopupBackgroundField({ label, value, onChange, inheritLabel, inline, hint }: Props) {
    const picker = (
        <ColorPicker
            value={value ?? currentSurface()}
            unset={!value}
            onChange={(v) => onChange(v)}
            title={label}
            className="shrink-0 rounded cursor-pointer"
            style={{ width: 30, height: 30, border: '1px solid var(--app-border)' }}
        />
    );
    const reset = value ? (
        <button
            onClick={() => onChange(undefined)}
            title="Zurücksetzen"
            className="text-[10px] px-2 py-1 rounded-lg hover:opacity-70"
            style={{
                background: 'var(--app-bg)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
            }}
        >
            Zurücksetzen
        </button>
    ) : (
        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
            {inheritLabel}
        </span>
    );

    if (inline) {
        return (
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {label}
                {picker}
                {reset}
            </div>
        );
    }

    return (
        <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                {label}
            </label>
            <div className="flex items-center gap-2">
                {picker}
                {reset}
            </div>
            {hint && (
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {hint}
                </p>
            )}
        </div>
    );
}
