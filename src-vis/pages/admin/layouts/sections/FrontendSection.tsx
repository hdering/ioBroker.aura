import { useConfigStore } from '../../../../store/configStore';
import { useT } from '../../../../i18n';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className="relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none shrink-0"
            style={{ background: value ? 'var(--accent-green)' : 'var(--app-border)' }}
        >
            <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-4' : 'translate-x-0'}`}
            />
        </button>
    );
}

function ToggleRow({
    label,
    hint,
    value,
    onChange,
}: {
    label: string;
    hint?: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div
            className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
            style={{ borderColor: 'var(--app-border)' }}
        >
            <div className="min-w-0">
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    {label}
                </p>
                {hint && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {hint}
                    </p>
                )}
            </div>
            <Toggle value={value} onChange={onChange} />
        </div>
    );
}

/** Indented, accent-bordered container that visually groups the sub-settings of an enabled toggle. */
function SubGroup({ children }: { children: React.ReactNode }) {
    return (
        <div className="ml-1.5 pl-3 my-1 py-1 space-y-2 border-l-2" style={{ borderColor: 'var(--accent)' }}>
            {children}
        </div>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
                {title}
            </p>
            {children}
        </div>
    );
}

export function FrontendSection() {
    const t = useT();
    const { frontend, updateFrontend } = useConfigStore();

    return (
        <Card title={t('settings.frontend.title')}>
            <ToggleRow
                label={t('settings.frontend.showHeader')}
                value={frontend.showHeader}
                onChange={(v) => updateFrontend({ showHeader: v })}
            />
            {frontend.showHeader && (
                <SubGroup>
                    <div className="py-2 border-b" style={{ borderColor: 'var(--app-border)' }}>
                        <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.frontend.dashboardTitle')}
                        </p>
                        <input
                            value={frontend.headerTitle}
                            onChange={(e) => updateFrontend({ headerTitle: e.target.value })}
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
                        value={frontend.showConnectionBadge}
                        onChange={(v) => updateFrontend({ showConnectionBadge: v })}
                    />
                    <ToggleRow
                        label={t('settings.frontend.showAdminLink')}
                        value={frontend.showAdminLink ?? false}
                        onChange={(v) => updateFrontend({ showAdminLink: v })}
                    />

                    <ToggleRow
                        label={t('settings.frontend.headerClock')}
                        value={frontend.headerClockEnabled}
                        onChange={(v) => updateFrontend({ headerClockEnabled: v })}
                    />
                    {frontend.headerClockEnabled && (
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
                                        const active = (frontend.headerClockDisplay ?? 'time') === v;
                                        return (
                                            <button
                                                key={v}
                                                onClick={() => updateFrontend({ headerClockDisplay: v })}
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
                            {frontend.headerClockDisplay !== 'date' && (
                                <ToggleRow
                                    label={t('settings.frontend.headerClockSeconds')}
                                    value={frontend.headerClockShowSeconds}
                                    onChange={(v) => updateFrontend({ headerClockShowSeconds: v })}
                                />
                            )}
                            {frontend.headerClockDisplay !== 'time' && (
                                <div>
                                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        {t('settings.frontend.headerClockDateLen')}
                                    </p>
                                    <div className="flex gap-1.5">
                                        {(['short', 'long'] as const).map((v) => {
                                            const labels = { short: t('wf.clock.short'), long: t('wf.clock.long') };
                                            const active = (frontend.headerClockDateLength ?? 'short') === v;
                                            return (
                                                <button
                                                    key={v}
                                                    onClick={() => updateFrontend({ headerClockDateLength: v })}
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
                                    value={frontend.headerClockCustomFormat}
                                    onChange={(e) => updateFrontend({ headerClockCustomFormat: e.target.value })}
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
                            value={frontend.headerDatapoint}
                            onChange={(e) => updateFrontend({ headerDatapoint: e.target.value })}
                            placeholder={t('settings.frontend.headerDatapointPh')}
                            className="w-full rounded-lg px-3 py-2 text-xs font-mono focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                    </div>
                    {frontend.headerDatapoint && (
                        <div>
                            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                                {t('settings.frontend.headerDatapointTemplate')}
                            </p>
                            <input
                                value={frontend.headerDatapointTemplate ?? ''}
                                onChange={(e) => updateFrontend({ headerDatapointTemplate: e.target.value })}
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
            <ToggleRow
                label={t('settings.frontend.layoutDrawer')}
                hint={t('settings.frontend.layoutDrawerHint')}
                value={frontend.layoutDrawerEnabled ?? false}
                onChange={(v) => updateFrontend({ layoutDrawerEnabled: v })}
            />
            {frontend.layoutDrawerEnabled && (
                <SubGroup>
                    <div>
                        <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.frontend.layoutDrawerSize')}
                        </p>
                        <div className="flex gap-1.5">
                            {(['sm', 'md', 'lg'] as const).map((v) => {
                                const labels = {
                                    sm: t('common.sizeSmall'),
                                    md: t('common.sizeMedium'),
                                    lg: t('common.sizeLarge'),
                                };
                                const active = (frontend.layoutDrawerSize ?? 'md') === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => updateFrontend({ layoutDrawerSize: v })}
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
                    <ToggleRow
                        label={t('settings.frontend.layoutDrawerAutoHide')}
                        value={frontend.layoutDrawerAutoHide ?? false}
                        onChange={(v) => updateFrontend({ layoutDrawerAutoHide: v })}
                    />
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {t('settings.frontend.layoutDrawerAutoHideHint')}
                    </p>
                    <div>
                        <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.frontend.layoutDrawerPlacement')}
                        </p>
                        <div className="flex gap-1.5">
                            {(['floating', 'tabbar'] as const).map((v) => {
                                const labels = {
                                    floating: t('settings.frontend.layoutDrawerPlacementFloating'),
                                    tabbar: t('settings.frontend.layoutDrawerPlacementTabbar'),
                                };
                                const active = (frontend.layoutDrawerPlacement ?? 'floating') === v;
                                const autoHide = frontend.layoutDrawerAutoHide ?? false;
                                let disabledReason: string | undefined;
                                if (frontend.showHeader) {
                                    disabledReason = t('settings.frontend.layoutDrawerPlacementDisabledHeader');
                                } else if (v === 'tabbar' && autoHide) {
                                    disabledReason = t('settings.frontend.layoutDrawerPlacementTabbarDisabledAutoHide');
                                }
                                const disabled = !!disabledReason;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => {
                                            if (!disabled) updateFrontend({ layoutDrawerPlacement: v });
                                        }}
                                        disabled={disabled}
                                        title={disabledReason}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-medium ${disabled ? 'cursor-not-allowed' : 'hover:opacity-80'}`}
                                        style={{
                                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                                            color: active ? '#fff' : 'var(--text-secondary)',
                                            border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                            opacity: disabled ? 0.4 : 1,
                                        }}
                                    >
                                        {labels[v]}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                            {t('settings.frontend.layoutDrawerPlacementHint')}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.frontend.layoutDrawerTitle')}
                        </p>
                        <input
                            type="text"
                            value={frontend.layoutDrawerTitle ?? ''}
                            onChange={(e) => updateFrontend({ layoutDrawerTitle: e.target.value })}
                            placeholder={t('layoutDrawer.title')}
                            className="w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                    </div>
                    <div>
                        <p className="text-xs mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.frontend.layoutDrawerEntryStyle')}
                        </p>
                        <div className="flex gap-1.5">
                            {(['iconAndName', 'iconOnly', 'nameOnly'] as const).map((v) => {
                                const labels = {
                                    iconAndName: t('settings.frontend.layoutDrawerEntryStyleIconAndName'),
                                    iconOnly: t('settings.frontend.layoutDrawerEntryStyleIconOnly'),
                                    nameOnly: t('settings.frontend.layoutDrawerEntryStyleNameOnly'),
                                };
                                const active = (frontend.layoutDrawerEntryStyle ?? 'iconAndName') === v;
                                return (
                                    <button
                                        key={v}
                                        onClick={() => updateFrontend({ layoutDrawerEntryStyle: v })}
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
                </SubGroup>
            )}
            <ToggleRow
                label={t('settings.frontend.idleReturn')}
                value={frontend.idleReturnEnabled ?? false}
                onChange={(v) => updateFrontend({ idleReturnEnabled: v })}
            />
            {frontend.idleReturnEnabled && (
                <SubGroup>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('settings.frontend.idleReturnDelay')}
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            min={5}
                            max={3600}
                            value={frontend.idleReturnDelay ?? 30}
                            onChange={(e) => {
                                const v = Math.max(5, parseInt(e.target.value) || 30);
                                updateFrontend({ idleReturnDelay: v });
                            }}
                            className="w-20 text-sm rounded-lg px-2.5 py-1.5 focus:outline-none"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        />
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {t('common.seconds')}
                        </span>
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {t('settings.frontend.idleReturnHint')}
                    </p>
                </SubGroup>
            )}
            <ToggleRow
                label={t('settings.frontend.optimisticUpdates')}
                hint={t('settings.frontend.optimisticUpdatesHint')}
                value={frontend.optimisticUpdates !== false}
                onChange={(v) => updateFrontend({ optimisticUpdates: v })}
            />
        </Card>
    );
}
