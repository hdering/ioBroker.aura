// Click action of the header title and the menu title (#922): nothing, the
// layout's home tab, any tab of any layout, or a link.

import { useT } from '../../../../i18n';
import { useDashboardStore, type TitleAction } from '../../../../store/dashboardStore';
import { Toggle } from './SettingControls';

const fieldCls = 'w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none';
const fieldStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export function TitleActionField({
    value,
    onChange,
}: {
    value: TitleAction | undefined;
    onChange: (v: TitleAction) => void;
}) {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const action: TitleAction = value ?? { kind: 'none' };

    const setKind = (kind: TitleAction['kind']) => {
        if (kind === action.kind) return;
        if (kind === 'link-tab') {
            const lay = layouts[0];
            const sec = lay?.sections[0];
            onChange({ kind, layoutId: lay?.id ?? '', sectionId: sec?.id, tabId: sec?.tabs[0]?.id ?? '' });
        } else if (kind === 'link-external') onChange({ kind, url: '' });
        else onChange({ kind });
    };

    // Tab targets: every tab of every layout, grouped by layout. The value carries
    // all three ids, since tab ids are only unique per section.
    const tabValue = action.kind === 'link-tab' ? `${action.layoutId}|${action.sectionId ?? ''}|${action.tabId}` : '';

    return (
        <div className="space-y-2">
            <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('titleAction.label')}
            </p>
            <select
                value={action.kind}
                onChange={(e) => setKind(e.target.value as TitleAction['kind'])}
                className={fieldCls}
                style={fieldStyle}
                data-title-action-kind=""
            >
                <option value="none">{t('titleAction.none')}</option>
                <option value="home">{t('titleAction.home')}</option>
                <option value="link-tab">{t('titleAction.tab')}</option>
                <option value="link-external">{t('titleAction.url')}</option>
            </select>
            {action.kind === 'link-tab' && (
                <select
                    value={tabValue}
                    onChange={(e) => {
                        const [layoutId, sectionId, tabId] = e.target.value.split('|');
                        onChange({ kind: 'link-tab', layoutId, sectionId: sectionId || undefined, tabId });
                    }}
                    className={fieldCls}
                    style={fieldStyle}
                    data-title-action-tab=""
                >
                    {layouts.map((l) => (
                        <optgroup key={l.id} label={l.name}>
                            {l.sections.flatMap((sec) =>
                                sec.tabs.map((tab) => (
                                    <option key={`${sec.id}|${tab.id}`} value={`${l.id}|${sec.id}|${tab.id}`}>
                                        {l.sections.length > 1 ? `${sec.name} · ${tab.name}` : tab.name}
                                    </option>
                                )),
                            )}
                        </optgroup>
                    ))}
                </select>
            )}
            {action.kind === 'link-external' && (
                <>
                    <input
                        type="text"
                        value={action.url}
                        onChange={(e) => onChange({ ...action, url: e.target.value })}
                        placeholder="https://…"
                        className={fieldCls}
                        style={fieldStyle}
                        data-title-action-url=""
                    />
                    <label className="flex items-center justify-between gap-3 text-sm">
                        <span style={{ color: 'var(--text-primary)' }}>{t('titleAction.newTab')}</span>
                        <Toggle value={!!action.newTab} onChange={(v) => onChange({ ...action, newTab: v })} />
                    </label>
                </>
            )}
        </div>
    );
}
