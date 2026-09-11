import { Plus } from 'lucide-react';
import { useT } from '../../../../i18n';
import { ToggleRow, SubGroup } from '../shared/SettingControls';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import { MenuItemRow, menuItemTypeLabelKey } from '../shared/MenuItemFields';
import { canMoveMenuItem, moveMenuItem } from '../../../../utils/menuItemOrder';
import { deriveHeaderItems, makeMenuItem } from '../../../../utils/menuItems';
import type { HeaderItem, LayoutSettings } from '../../../../store/dashboardStore';

const HEADER_KEYS: (keyof LayoutSettings)[] = [
    'showHeader',
    'headerTitle',
    'showConnectionBadge',
    'showAdminLink',
    'showMessageBell',
    'headerClockEnabled',
    'headerClockDisplay',
    'headerClockShowSeconds',
    'headerClockDateLength',
    'headerClockCustomFormat',
    'headerDatapoint',
    'headerDatapointTemplate',
    'headerItems',
];

// Frontend header configuration (title, connection badge, admin link, header
// clock, header datapoint). Scope-aware: global or per layout
// (contextId = null | layout id).
export function HeaderSection({ contextId }: { contextId: string | null }) {
    const t = useT();
    const { eff, set, resetKeys, isDirty, level } = useLayoutSetting(contextId);

    const [showHeader] = eff('showHeader');
    const [headerTitle] = eff('headerTitle');
    const [showConnectionBadge] = eff('showConnectionBadge');
    const [showAdminLink] = eff('showAdminLink');
    const [showMessageBell] = eff('showMessageBell');
    const [headerItemsRaw] = eff('headerItems');
    const [headerClockEnabled] = eff('headerClockEnabled');
    const [headerClockDisplay] = eff('headerClockDisplay');
    const [headerClockShowSeconds] = eff('headerClockShowSeconds');
    const [headerClockDateLength] = eff('headerClockDateLength');
    const [headerClockCustomFormat] = eff('headerClockCustomFormat');
    const [headerDatapoint] = eff('headerDatapoint');
    const [headerDatapointTemplate] = eff('headerDatapointTemplate');

    // Configs written before #634 have no list — the two legacy single slots are
    // shown as list entries instead, and the first edit writes the whole derived
    // list back, after which the legacy fields are inert.
    const items = deriveHeaderItems({
        headerItems: headerItemsRaw,
        headerClockEnabled,
        headerClockDisplay,
        headerClockShowSeconds,
        headerClockDateLength,
        headerClockCustomFormat,
        headerDatapoint,
        headerDatapointTemplate,
    });
    const isLegacy = headerItemsRaw === undefined && items.length > 0;
    const writeItems = (next: HeaderItem[]) => set('headerItems', next);
    const updateItem = (id: string, patch: Partial<HeaderItem>) =>
        writeItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));

    return (
        <div
            className="rounded-xl p-6 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('layouts.subtab.header')}
                </h2>
                <ResetDefaultsButton
                    onReset={() => resetKeys(HEADER_KEYS)}
                    disabled={!isDirty(HEADER_KEYS)}
                    scoped={level !== 'global'}
                />
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
                        label={t('settings.frontend.showMessageBell')}
                        value={showMessageBell ?? false}
                        onChange={(v) => set('showMessageBell', v)}
                    />

                    <div className="pt-2">
                        <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                                {t('settings.header.items')}
                            </p>
                        </div>
                        <p className="text-[11px] mb-2" style={{ color: 'var(--text-secondary)' }}>
                            {t('settings.header.itemsHint')}
                        </p>
                        {isLegacy && (
                            <p className="text-[10px] mb-2" style={{ color: 'var(--text-secondary)', opacity: 0.8 }}>
                                {t('settings.header.legacyHint')}
                            </p>
                        )}
                        <div className="space-y-1.5">
                            {items.map((item) => (
                                <MenuItemRow
                                    key={item.id}
                                    item={item}
                                    positions={[
                                        { key: 'left', label: t('settings.header.posLeft') },
                                        { key: 'right', label: t('settings.header.posRight') },
                                    ]}
                                    onUpdate={(patch) => updateItem(item.id, patch)}
                                    onRemove={() => writeItems(items.filter((it) => it.id !== item.id))}
                                    onMove={(dir) => writeItems(moveMenuItem(items, item.id, dir))}
                                    canMoveUp={canMoveMenuItem(items, item.id, -1)}
                                    canMoveDown={canMoveMenuItem(items, item.id, 1)}
                                    variant="bar"
                                />
                            ))}
                        </div>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                            {(['clock', 'datapoint', 'text', 'widget', 'idleReturn'] as const).map((type) => (
                                <button
                                    key={type}
                                    onClick={() =>
                                        writeItems([...items, makeMenuItem<HeaderItem>(type, { position: 'right' })])
                                    }
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <Plus size={11} /> {t(menuItemTypeLabelKey(type))}
                                </button>
                            ))}
                        </div>
                    </div>
                </SubGroup>
            )}
        </div>
    );
}
