import { Puzzle, RefreshCw } from 'lucide-react';
import { getSettingsGroups, getText, resolveManifestUrl } from '@iobroker/web-components';
import { useConfigStore } from '../../store/configStore';
import {
    findKnownWebComponent,
    hostOwnedSettings,
    isTestedWebComponent,
    typedSettings,
} from '../../utils/webComponentHost';
import { findWebComponent, useWebComponentCatalog } from '../../utils/webComponentRegistry';
import { useT } from '../../i18n';
import {
    WebComponentFields,
    wcHintStyle as hintSty,
    wcInputCls as iCls,
    wcInputStyle as iSty,
    wcLabelCls as labelCls,
    type WebComponentLang,
} from './WebComponentFields';

interface Props {
    options: Record<string, unknown>;
    onChange: (patch: Record<string, unknown>) => void;
}

/**
 * The type name of a webcomponent widget in the edit dialog: the name of its
 * component (from the manifest, or the known name while the adapter is missing),
 * `fallback` - "Web-Komponente" - while none is chosen. With `children`, that
 * function renders the name (e.g. a type list sorted by it).
 */
export function WebComponentTypeLabel({
    options: o,
    fallback,
    children,
}: {
    options: Record<string, unknown>;
    fallback: string;
    children?: (name: string) => React.ReactNode;
}) {
    const lang = useConfigStore((s) => s.frontend.language ?? 'de') as WebComponentLang;
    const { components } = useWebComponentCatalog();
    const component = findWebComponent(components, o.wcTag, o.wcAdapter);
    const known = findKnownWebComponent(o.wcTag, o.wcAdapter);
    const name =
        (component && getText(component.manifest.name, lang)) ||
        (known && (lang === 'de' ? known.name.de : known.name.en)) ||
        fallback;
    return <>{children ? children(name) : name}</>;
}

/**
 * Under the type list of the edit dialog: which component the "Web-Komponente"
 * widget shows, from which adapter (and version), and that its content comes
 * from that adapter - marked when the adapter is missing or the component is not
 * tested with Aura yet. The component itself is chosen in the settings below.
 */
export function WebComponentInfoCard({ options: o }: { options: Record<string, unknown> }) {
    const t = useT();
    const lang = useConfigStore((s) => s.frontend.language ?? 'de') as WebComponentLang;
    const { components, loading } = useWebComponentCatalog();
    const component = findWebComponent(components, o.wcTag, o.wcAdapter);
    const known = findKnownWebComponent(o.wcTag, o.wcAdapter);
    const chosen = typeof o.wcTag === 'string' && !!o.wcTag;
    const name =
        (component && getText(component.manifest.name, lang)) ||
        (known && (lang === 'de' ? known.name.de : known.name.en)) ||
        (chosen ? String(o.wcTag) : '');
    const adapter = component?.adapter ?? known?.adapter ?? (typeof o.wcAdapter === 'string' ? o.wcAdapter : '');
    const iconUrl = component?.manifest.icon ? resolveManifestUrl(component.manifest.icon, component.url) : undefined;
    const missing = chosen && !loading && !component;
    const untested = !!component && !isTestedWebComponent(component.manifest.tag, component.adapter);
    const color = '#0ea5e9'; // the colour of the widget type (widgetRegistry)
    return (
        <div
            data-wc-info
            className="mt-1.5 rounded-lg px-2.5 py-2 flex items-center gap-2.5"
            style={{
                background: `color-mix(in srgb, ${color} 8%, var(--app-bg))`,
                border: `1px solid color-mix(in srgb, ${color} 35%, var(--app-border))`,
            }}
        >
            {iconUrl ? (
                <img src={iconUrl} alt="" className="object-contain shrink-0" style={{ width: 24, height: 24 }} />
            ) : (
                <Puzzle size={20} className="shrink-0" style={{ color }} />
            )}
            <div className="min-w-0 flex-1">
                {chosen ? (
                    <>
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {name}
                        </p>
                        <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                            {adapter && (
                                <>
                                    Adapter <code>{adapter}</code>
                                    {component?.version ? ` ${component.version}` : ''}
                                    {' · '}
                                </>
                            )}
                            {missing ? (
                                <span style={{ color: 'var(--accent-yellow)' }}>
                                    {t('wf.edit.wc.adapterMissing', { adapter: adapter || '?' })}
                                </span>
                            ) : (
                                t('wf.edit.wc.fromAdapter')
                            )}
                            {untested && ` · ${t('editor.manual.wc.untested')}`}
                        </p>
                    </>
                ) : (
                    <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                        {t('wf.edit.wc.none')}
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * Settings of the webcomponent widget: which component of which adapter, and its
 * own settings as its manifest declares them (a subset of JSON-Config). Values
 * are stored in `options.wcSettings`, only what the user set - the defaults of
 * the manifest fill in the rest when the element gets them. The fields are those
 * of the form dialogs a component opens at runtime (WebComponentFields).
 */
export function WebComponentConfig({ options: o, onChange }: Props) {
    const lang = useConfigStore((s) => s.frontend.language ?? 'de') as WebComponentLang;
    const { components, loading, reload } = useWebComponentCatalog();
    const component = findWebComponent(components, o.wcTag, o.wcAdapter);
    // Placed from the dialog before its adapter was installed: say which one is missing
    const known = component ? undefined : findKnownWebComponent(o.wcTag, o.wcAdapter);
    const knownName = known ? (lang === 'de' ? known.name.de : known.name.en) : '';
    // Title and "open large" come from the widget frame, not from the component
    const hostKeys = component ? hostOwnedSettings(component.manifest.tag, component.adapter) : [];
    const stored = (o.wcSettings && typeof o.wcSettings === 'object' ? o.wcSettings : {}) as Record<string, unknown>;
    const data = component ? (typedSettings(component.manifest, stored) as Record<string, unknown>) : {};

    const setValue = (key: string, value: unknown): void => {
        const next = { ...stored };
        if (value === undefined || value === '') delete next[key];
        else next[key] = value;
        onChange({ wcSettings: next });
    };

    // a stored component that is not installed stays selected (its "nicht installiert" entry)
    const choice = component
        ? `${component.adapter}|${component.manifest.tag}`
        : typeof o.wcTag === 'string' && o.wcTag
          ? `${String(o.wcAdapter ?? '')}|${o.wcTag}`
          : '';
    const icon = component ? resolveManifestUrl(component.manifest.icon, component.url) : undefined;

    return (
        <>
            <div>
                <label className={labelCls} style={{ color: 'var(--text-secondary)' }}>
                    Komponente
                </label>
                <div className="flex gap-1">
                    <select
                        value={choice}
                        onChange={(e) => {
                            const [adapter, tag] = e.target.value.split('|');
                            if (tag === o.wcTag && adapter === o.wcAdapter) return;
                            onChange({ wcTag: tag || undefined, wcAdapter: adapter || undefined, wcSettings: {} });
                        }}
                        className={`${iCls} flex-1 min-w-0`}
                        style={iSty}
                    >
                        <option value="">{loading ? 'Lade…' : '– wählen –'}</option>
                        {typeof o.wcTag === 'string' && o.wcTag && !component && (
                            <option value={`${String(o.wcAdapter ?? '')}|${o.wcTag}`}>
                                {knownName || o.wcTag} (nicht installiert)
                            </option>
                        )}
                        {components.map((c) => (
                            <option key={`${c.adapter}|${c.manifest.tag}`} value={`${c.adapter}|${c.manifest.tag}`}>
                                {c.adapter}: {getText(c.manifest.name, lang) || c.manifest.tag}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={reload}
                        className="px-2 rounded-lg hover:opacity-80 shrink-0"
                        style={{ ...iSty, color: 'var(--text-secondary)' }}
                        title="Komponenten neu einlesen"
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>
                {!loading && known && (
                    <p className="text-[11px] mt-1.5" style={{ color: 'var(--accent-yellow)' }}>
                        Der Adapter {`„${known.adapter}“`} fehlt: {knownName} braucht ioBroker.{known.adapter} ab
                        Version {known.minVersion}. Nach der Installation mit ↻ neu einlesen.
                    </p>
                )}
                {!loading && !known && !components.length && (
                    <p className="text-[10px] mt-0.5" style={hintSty}>
                        Kein installierter Adapter bietet Web-Komponenten an (io-package: common.webComponents).
                    </p>
                )}
                {component && (
                    <div className="flex gap-2 items-start mt-1.5">
                        {icon && <img src={icon} alt="" className="w-6 h-6 object-contain shrink-0" />}
                        <p className="text-[10px]" style={hintSty}>
                            {getText(component.manifest.description, lang)}{' '}
                            <span className="font-mono">&lt;{component.manifest.tag}&gt;</span>
                        </p>
                    </div>
                )}
            </div>

            {component &&
                getSettingsGroups(component.manifest).map((group) => (
                    <div key={group.name} className="space-y-2">
                        {group.label && (
                            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {getText(group.label, lang)}
                            </p>
                        )}
                        <WebComponentFields
                            items={Object.fromEntries(
                                Object.entries(group.panel.items).filter(([key]) => !hostKeys.includes(key)),
                            )}
                            data={data}
                            lang={lang}
                            onSet={setValue}
                        />
                    </div>
                ))}
        </>
    );
}
