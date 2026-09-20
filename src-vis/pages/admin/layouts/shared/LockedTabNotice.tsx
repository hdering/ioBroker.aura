import { ArrowUpLeft } from 'lucide-react';
import { useT } from '../../../../i18n';
import type { Band } from './scopeBands';

interface LockedTabNoticeProps {
    /** Label of the selected group (tab). */
    groupLabel: string;
    /** The group's band — 'global' or 'layout'; a section-band tab is never locked. */
    band: Band;
    /** Names of the selected scope. */
    layoutName: string;
    sectionName?: string;
    /** Label of the scope the group is edited at, and the jump to it. */
    targetLabel: string;
    onJump: () => void;
}

/**
 * Shown instead of a card when the selected group's chain does not reach the
 * selected scope. It stays selectable on purpose: the user learns WHY the group
 * is not here and gets the one jump that leads to it — up, never down.
 */
export function LockedTabNotice({
    groupLabel,
    band,
    layoutName,
    sectionName,
    targetLabel,
    onJump,
}: LockedTabNoticeProps) {
    const t = useT();
    const scopeLabel = sectionName ? `${layoutName} › ${sectionName}` : layoutName;
    const title =
        band === 'global'
            ? t('design.locked.globalTitle', { group: groupLabel })
            : t('design.locked.layoutTitle', { group: groupLabel });
    const text =
        band === 'global'
            ? t('design.locked.globalText', { scope: scopeLabel })
            : t('design.locked.layoutText', { section: sectionName ?? '', layout: layoutName });

    return (
        <div
            className="rounded-xl p-6"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            data-testid="design-locked-notice"
        >
            <div
                className="rounded-r-xl px-4 py-3.5 space-y-2"
                style={{
                    background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                    borderLeft: '3px solid var(--accent)',
                }}
            >
                <h3 className="text-sm font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
                    {title}
                </h3>
                <p className="text-xs m-0" style={{ color: 'var(--text-primary)' }}>
                    {text}
                </p>
                <div>
                    <button
                        onClick={onJump}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg hover:opacity-80"
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)',
                        }}
                        data-testid="design-locked-jump"
                    >
                        <ArrowUpLeft size={12} />
                        {t('design.locked.jump', { scope: targetLabel })}
                    </button>
                </div>
            </div>
        </div>
    );
}
