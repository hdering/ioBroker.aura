import { RotateCcw } from 'lucide-react';
import { useT } from '../../../../i18n';

interface ResetDefaultsButtonProps {
    onReset: () => void;
    /** Nothing deviates from the default / no override set — button stays visible but inert. */
    disabled?: boolean;
    /**
     * Layout or section scope: the reset drops this scope's overrides so the values
     * inherit again, instead of writing back the shipped defaults.
     */
    scoped?: boolean;
}

/**
 * Uniform "Auf Standard" action shown in the header row of every design settings
 * card. The card owns the key list; this component only renders the affordance.
 */
export function ResetDefaultsButton({ onReset, disabled, scoped }: ResetDefaultsButtonProps) {
    const t = useT();
    return (
        <button
            onClick={onReset}
            disabled={disabled}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg shrink-0 hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
                background: 'var(--app-bg)',
                color: 'var(--accent-red)',
                border: '1px solid var(--app-border)',
            }}
            title={scoped ? t('layouts.scope.resetHint') : t('design.reset.hint')}
        >
            <RotateCcw size={13} />
            {t('design.reset.toDefaults')}
        </button>
    );
}
