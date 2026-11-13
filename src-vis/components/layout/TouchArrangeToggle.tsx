import { Move } from 'lucide-react';
import { useT } from '../../i18n';
import { useCoarsePointer, useTouchArrangeDom, useTouchArrangeStore } from '../../hooks/useGridEditInteraction';

/** Editor toolbar switch for arranging widgets on touch devices (#699).
 *  Renders nothing with a fine pointer — a mouse drags the grid as before. */
export function TouchArrangeToggle() {
    const t = useT();
    const coarse = useCoarsePointer();
    const arrange = useTouchArrangeStore((s) => s.arrange);
    const setArrange = useTouchArrangeStore((s) => s.setArrange);
    useTouchArrangeDom(coarse && arrange);
    if (!coarse) return null;
    return (
        <button
            type="button"
            onClick={() => setArrange(!arrange)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-80"
            style={{
                background: arrange ? 'color-mix(in srgb, var(--accent) 13%, transparent)' : 'var(--app-bg)',
                color: arrange ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${arrange ? 'var(--accent)' : 'var(--app-border)'}`,
            }}
            title={arrange ? t('editor.arrange.on') : t('editor.arrange.off')}
            aria-pressed={arrange}
            data-aura-touch-arrange={arrange ? 'on' : 'off'}
        >
            <Move size={15} />
            <span>{t('editor.arrange.label')}</span>
        </button>
    );
}
