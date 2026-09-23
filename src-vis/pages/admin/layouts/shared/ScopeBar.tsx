import { Globe2 } from 'lucide-react';
import { useT } from '../../../../i18n';
import { OVERRIDE_COLOR } from './scopeBands';

interface ScopeBarProps {
    level: 'global' | 'layout' | 'section';
    layoutName?: string;
    sectionName?: string;
    /** Icon of the selected layout/section (the tree's own icon node). */
    iconNode?: React.ReactNode;
    /** Number of own values the selected scope carries (layout/section only). */
    ownCount?: number;
}

/**
 * The first thing the right pane says: which scope is being edited and whom the
 * values reach. The tree on the left is the only place that changes it.
 */
export function ScopeBar({ level, layoutName = '', sectionName = '', iconNode, ownCount = 0 }: ScopeBarProps) {
    const t = useT();
    const name = level === 'layout' ? layoutName : `${layoutName} › ${sectionName}`;
    const word = level === 'layout' ? t('design.scope.layoutWord') : t('design.scope.sectionWord');
    const text =
        level === 'global'
            ? t('design.scope.globalText')
            : level === 'layout'
              ? t('design.scope.layoutText')
              : t('design.scope.sectionText', { layout: layoutName });
    const own =
        ownCount === 1
            ? t('design.scope.ownOne')
            : ownCount > 1
              ? t('design.scope.ownMany')
              : t('design.scope.ownNone');

    return (
        <div
            data-testid="design-scope-bar"
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3.5 py-2.5 text-sm"
            style={{
                background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                borderLeft: '3px solid var(--accent)',
                color: 'var(--text-primary)',
            }}
        >
            <span className="shrink-0 flex items-center" style={{ color: 'var(--accent)' }}>
                {level === 'global' ? <Globe2 size={14} /> : iconNode}
            </span>
            <span className="min-w-0 flex-1 basis-[200px]">
                {t('design.scope.editing')} {level !== 'global' && <>{word} </>}
                <b className="font-bold" style={{ color: 'var(--accent)' }}>
                    {level === 'global' ? t('layouts.scope.global') : name}
                </b>
                {' · '}
                {text}
            </span>
            {level !== 'global' && (
                <span
                    className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px]"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {ownCount > 0 && (
                        <span
                            className="text-[10px] leading-[14px] px-1.5 rounded-full font-semibold"
                            style={{ background: OVERRIDE_COLOR, color: '#fff' }}
                        >
                            {ownCount}
                        </span>
                    )}
                    {own}
                </span>
            )}
        </div>
    );
}
