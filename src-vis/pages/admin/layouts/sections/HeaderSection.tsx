import { useT } from '../../../../i18n';
import { ToggleRow, SubGroup } from '../shared/SettingControls';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import type { LayoutSettings } from '../../../../store/dashboardStore';

const HEADER_KEYS: (keyof LayoutSettings)[] = [
    'showHeader',
    'headerTitle',
    'showConnectionBadge',
    'showAdminLink',
    'headerClockEnabled',
    'headerClockDisplay',
    'headerClockShowSeconds',
    'headerClockDateLength',
    'headerClockCustomFormat',
    'headerDatapoint',
    'headerDatapointTemplate',
];

// Frontend header configuration (title, connection badge, admin link, header
// clock, header datapoint). Scope-aware: global or per layout
// (contextId = null | layout id).
export function HeaderSection({ contextId }: { contextId: string | null }) {
    const t = useT();
    const { eff, set, clear, level } = useLayoutSetting(contextId);

    const [showHeader] = eff('showHeader');
    const [headerTitle] = eff('headerTitle');
    const [showConnectionBadge] = eff('showConnectionBadge');
    const [showAdminLink] = eff('showAdminLink');
    const [headerClockEnabled] = eff('headerClockEnabled');
    const [headerClockDisplay] = eff('headerClockDisplay');
    const [headerClockShowSeconds] = eff('headerClockShowSeconds');
    const [headerClockDateLength] = eff('headerClockDateLength');
    const [headerClockCustomFormat] = eff('headerClockCustomFormat');
    const [headerDatapoint] = eff('headerDatapoint');
    const [headerDatapointTemplate] = eff('headerDatapointTemplate');

    const overridden = level !== 'global' && HEADER_KEYS.some((k) => eff(k as 'showHeader')[1]);

    return (
        <div
            className="rounded-xl p-6 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('layouts.subtab.header')}
                </h2>
                {overridden && (
                    <button
                        onClick={() => HEADER_KEYS.forEach((k) => clear(k))}
                        className="text-[10px] px-2 py-0.5 rounded-full hover:opacity-80"
                        style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                        title={t('layouts.scope.resetHint')}
                    >
                        {t('layouts.scope.reset')}
                    </button>
                )}
            </div>
            <p className="text-xs -mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t('design.header.hint')}
            </p>

            <ToggleRow
                label={t('settings.frontend.showHeader')}
                value={showHeader ?? true}
                onChange={(v) => set('showHeader', v)}
            />
            {showHeader && (
                <SubGroup>
                    <div className="py-2 border-b" style={{ borderColor: 'var(--app-border)' }}>
                        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.frontend.dashboardTitle')}
                        </p>
                        <input
                            value={headerTitle ?? ''}
                            onChange={(e) => set('headerTitle', e.target.value)}
                            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                    </div>
                    <ToggleRow
                        label={t('settings.frontend.connectionBadge')}
                        value={showConnectionBadge ?? true}
                        onChange={(v) => set('showConnectionBadge', v)}
                    />
                    <ToggleRow
                        label={t('settings.frontend.showAdminLink')}
                        value={showAdminLink ?? false}
                        onChange={(v) => set('showAdminLink', v)}
                    />

                    <ToggleRow
                        label={t('settings.frontend.headerClock')}
                        value={headerClockEnabled ?? false}
                        onChange={(v) => set('headerClockEnabled', v)}
                    />
                    {headerClockEnabled && (
                        <div className="space-y-2 pl-1 pb-1">
                            <div>
                                <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.frontend.headerClockDisplay')}
                                </p>
                                <div className="flex gap-1.5 flex-wrap">
                                    {(['time', 'date', 'datetime'] as const).map((v) => {
                                        const labels = {
                                            time: t('wf.clock.timeOnly'),
                                            date: t('wf.clock.dateOnly'),
                                            datetime: t('wf.clock.datetime'),
                                        };
                                        const active = (headerClockDisplay ?? 'time') === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => set('headerClockDisplay', v)}
                                                className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                                style={{
                                                    background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                    color: active ? '#fff' : 'var(--text-secondary)',
                                                    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                }}
                                            >
                                                {labels[v]}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {headerClockDisplay !== 'date' && (
                                <ToggleRow
                                    label={t('settings.frontend.headerClockSeconds')}
                                    value={headerClockShowSeconds ?? false}
                                    onChange={(v) => set('headerClockShowSeconds', v)}
                                />
                            )}
                            {headerClockDisplay !== 'time' && (
                                <div>
                                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.frontend.headerClockDateLen')}
                                    </p>
                                    <div className="flex gap-1.5">
                                        {(['short', 'long'] as const).map((v) => {
                                            const labels = { short: t('wf.clock.short'), long: t('wf.clock.long') };
                                            const active = (headerClockDateLength ?? 'short') === v;
                                            return (
                                                <button
                                                    key={v}
                                                    onClick={() => set('headerClockDateLength', v)}
                                                    className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                                    style={{
                                                        background: active ? 'var(--accent)' : 'var(--app-bg)',
                                                        color: active ? '#fff' : 'var(--text-secondary)',
                                                        border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                    }}
                                                >
                                                    {labels[v]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div>
                                <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('settings.frontend.headerClockCustom')}
                                </p>
                                <input
                                    value={headerClockCustomFormat ?? ''}
                                    onChange={(e) => set('headerClockCustomFormat', e.target.value)}
                                    placeholder="HH:mm · EE dd.MM."
                                    className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="pt-1">
                        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.frontend.headerDatapoint')}
                        </p>
                        <input
                            value={headerDatapoint ?? ''}
                            onChange={(e) => set('headerDatapoint', e.target.value)}
                            placeholder={t('settings.frontend.headerDatapointPh')}
                            className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                    </div>
                    {headerDatapoint && (
                        <div>
                            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                                {t('settings.frontend.headerDatapointTemplate')}
                            </p>
                            <input
                                value={headerDatapointTemplate ?? ''}
                                onChange={(e) => set('headerDatapointTemplate', e.target.value)}
                                placeholder={t('settings.frontend.headerDatapointTemplatePh')}
                                className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            />
                            <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                                {t('settings.frontend.headerDatapointTemplateHint')}
                            </p>
                        </div>
                    )}
                </SubGroup>
            )}
        </div>
    );
}
