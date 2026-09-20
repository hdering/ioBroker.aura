// The per-setting override line under a control on the Design page:
//
//   ● hier gesetzt ✕      this scope sets its own value (the ✕ drops it)
//   ○ geerbt von Global   inherited — from Global or from the parent layout
//   abweichend in …       scopes BELOW the selected one that set their own value
//   Ebenen                a dialog with the value on every level
//
// It only informs and clears; it never changes the selected scope — the tree on
// the left is the one place that does.

import { Fragment, useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe2, Layers, LayoutDashboard, X } from 'lucide-react';
import {
    useDashboardStore,
    type DashboardLayout,
    type LayoutSettings,
    type Section,
} from '../../../../store/dashboardStore';
import { useConfigStore } from '../../../../store/configStore';
import { usePortalTarget } from '../../../../contexts/PortalTargetContext';
import { useEscapeLayer } from '../../../../utils/escapeStack';
import { useT } from '../../../../i18n';
import { BAND_TABS, TAB_KEYS, OVERRIDE_COLOR, OVERRIDE_TINT } from './scopeBands';

type Key = keyof LayoutSettings;
export type ValueFormatter = (key: Key, value: unknown) => string;

interface ScopeRef {
    level: 'global' | 'layout' | 'section';
    layout?: DashboardLayout;
    section?: Section;
}

function resolveScope(layouts: DashboardLayout[], contextId: string | null): ScopeRef {
    if (!contextId) return { level: 'global' };
    for (const layout of layouts) {
        if (layout.id === contextId) return { level: 'layout', layout };
        const section = layout.sections.find((s) => s.id === contextId);
        if (section) return { level: 'section', layout, section };
    }
    return { level: 'global' };
}

function useDefaultFormat(): ValueFormatter {
    const t = useT();
    return (_key, v) => {
        if (v === undefined || v === null) return '—';
        if (typeof v === 'boolean') return v ? t('design.override.on') : t('design.override.off');
        if (typeof v === 'number') return String(v);
        if (typeof v === 'string') return v.length > 24 ? `„${v.slice(0, 24)}…“` : `„${v}“`;
        return t('design.override.own');
    };
}

interface OverrideStateProps {
    contextId: string | null;
    /** The settings keys this control writes (usually one). */
    keys: readonly Key[];
    /** Label of the control — title of the levels dialog. */
    label: string;
    /** Formats a value for the "abweichend in …" text and the dialog (unit, an/aus …). */
    format?: ValueFormatter;
}

export function OverrideState({ contextId, keys, label, format }: OverrideStateProps) {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);
    const clearSectionSettings = useDashboardStore((s) => s.clearSectionSettings);
    const defaultFormat = useDefaultFormat();
    const fmt = format ?? defaultFormat;
    const [open, setOpen] = useState(false);

    const scope = resolveScope(layouts, contextId);
    const own = (s?: LayoutSettings) => keys.filter((k) => s?.[k] !== undefined);
    const ownText = (s?: LayoutSettings) => {
        const k = own(s)[0];
        return k ? fmt(k, s?.[k]) : '';
    };
    // Sections only take part when every key reaches down to them.
    const threeLevel = keys.every((k) => BAND_TABS.section.some((tab) => TAB_KEYS[tab].includes(k)));

    const clearAt = (layout: DashboardLayout, section?: Section) => {
        for (const k of keys) {
            if (section) clearSectionSettings(layout.id, section.id, k);
            else clearLayoutSettings(layout.id, k);
        }
    };

    let stateNode: React.ReactNode = null;
    if (scope.level !== 'global' && scope.layout) {
        const here = scope.level === 'layout' ? scope.layout.settings : scope.section?.settings;
        if (own(here).length) {
            stateNode = (
                <button
                    onClick={() => clearAt(scope.layout!, scope.section)}
                    className="inline-flex items-center gap-1.5 hover:opacity-80"
                    style={{ color: OVERRIDE_COLOR }}
                    title={t('design.override.clear')}
                    data-testid="override-set-here"
                >
                    <span className="w-[7px] h-[7px] rounded-full" style={{ background: OVERRIDE_COLOR }} />
                    {t('design.override.setHere')} ✕
                </button>
            );
        } else {
            const from =
                scope.level === 'section' && own(scope.layout.settings).length
                    ? scope.layout.name
                    : t('layouts.scope.global');
            stateNode = (
                <span
                    className="inline-flex items-center gap-1.5"
                    style={{ color: 'var(--text-secondary)' }}
                    data-testid="override-inherited"
                >
                    <span
                        className="w-[7px] h-[7px] rounded-full"
                        style={{ border: '1.5px solid var(--text-secondary)' }}
                    />
                    {t('design.override.inheritedFrom', { scope: from })}
                </span>
            );
        }
    }

    const below: { label: string; text: string }[] = [];
    if (scope.level === 'global') {
        for (const l of layouts) {
            if (own(l.settings).length) below.push({ label: l.name, text: ownText(l.settings) });
            if (threeLevel)
                for (const s of l.sections)
                    if (own(s.settings).length)
                        below.push({ label: `${l.name} › ${s.name}`, text: ownText(s.settings) });
        }
    } else if (scope.level === 'layout' && threeLevel && scope.layout) {
        for (const s of scope.layout.sections)
            if (own(s.settings).length) below.push({ label: s.name, text: ownText(s.settings) });
    }

    return (
        <div className="flex items-center gap-2.5 flex-wrap text-[11px]" data-testid="override-state">
            {stateNode}
            {below.length > 0 && (
                <span style={{ color: 'var(--text-secondary)' }} data-testid="override-below">
                    {t('design.override.below')}{' '}
                    {below.map((b, i) => (
                        <Fragment key={b.label}>
                            {i > 0 && ', '}
                            <b className="font-semibold" style={{ color: OVERRIDE_COLOR }}>
                                {b.label}
                            </b>{' '}
                            {b.text}
                        </Fragment>
                    ))}
                </span>
            )}
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:opacity-80"
                style={{ color: 'var(--text-secondary)', border: '1px solid transparent' }}
                title={t('design.override.levelsHint')}
                data-testid="override-levels"
            >
                <Layers size={11} />
                {t('design.override.levels')}
            </button>
            {open && (
                <LevelsDialog
                    label={label}
                    keys={keys}
                    fmt={fmt}
                    threeLevel={threeLevel}
                    scope={scope}
                    layouts={layouts}
                    onClearAt={clearAt}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
}

// ── Ebenen-Dialog ────────────────────────────────────────────────────────────

interface LevelsDialogProps {
    label: string;
    keys: readonly Key[];
    fmt: ValueFormatter;
    threeLevel: boolean;
    scope: ScopeRef;
    layouts: DashboardLayout[];
    onClearAt: (layout: DashboardLayout, section?: Section) => void;
    onClose: () => void;
}

function LevelsDialog({ label, keys, fmt, threeLevel, scope, layouts, onClearAt, onClose }: LevelsDialogProps) {
    const t = useT();
    const target = usePortalTarget();
    const frontend = useConfigStore((s) => s.frontend) as unknown as Record<string, unknown>;
    useEscapeLayer(onClose);

    const globalValue = (() => {
        const k = keys.find((key) => frontend[key] !== undefined);
        return k ? fmt(k, frontend[k]) : undefined;
    })();
    const ownOf = (s?: LayoutSettings) => keys.find((k) => s?.[k] !== undefined);

    const row = (opts: {
        id: string;
        icon: React.ReactNode;
        name: string;
        own?: Key;
        settings?: LayoutSettings;
        inherited?: string;
        isCurrent: boolean;
        isGlobal?: boolean;
        onClear?: () => void;
        indent?: boolean;
    }) => {
        const isOwn = opts.isGlobal || opts.own !== undefined;
        const value = opts.isGlobal
            ? (globalValue ?? '—')
            : opts.own
              ? fmt(opts.own, opts.settings?.[opts.own])
              : `${t('design.override.inherits')}${opts.inherited ? ` · ${opts.inherited}` : ''}`;
        return (
            <div
                key={opts.id}
                className={`grid items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs ${opts.indent ? 'ml-[18px]' : ''}`}
                style={{
                    gridTemplateColumns: '1fr auto 110px',
                    background: isOwn && !opts.isGlobal ? OVERRIDE_TINT : undefined,
                    outline: opts.isCurrent ? '1px solid var(--accent)' : undefined,
                }}
                data-testid={`levels-row-${opts.id}`}
            >
                <span className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                    {opts.icon}
                    {opts.name}
                    {opts.isCurrent && (
                        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                            · {t('design.override.selected')}
                        </span>
                    )}
                </span>
                <span
                    className={`text-right ${isOwn ? 'font-mono font-semibold' : 'italic'}`}
                    style={{
                        color: isOwn
                            ? opts.isGlobal
                                ? 'var(--text-primary)'
                                : OVERRIDE_COLOR
                            : 'var(--text-secondary)',
                    }}
                >
                    {value}
                </span>
                <span className="text-right">
                    {opts.onClear && opts.own !== undefined && (
                        <button
                            onClick={opts.onClear}
                            className="text-[11px] px-1.5 py-0.5 rounded-md hover:opacity-80"
                            style={{ color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                            title={t('design.override.clear')}
                        >
                            ✕ {t('design.override.remove')}
                        </button>
                    )}
                </span>
            </div>
        );
    };

    const rows: React.ReactNode[] = [
        row({
            id: 'global',
            icon: <Globe2 size={12} />,
            name: t('layouts.scope.global'),
            isCurrent: scope.level === 'global',
            isGlobal: true,
        }),
    ];
    for (const l of layouts) {
        const lo = ownOf(l.settings);
        const layoutEffective = lo ? fmt(lo, l.settings?.[lo]) : globalValue;
        rows.push(
            row({
                id: l.id,
                icon: <LayoutDashboard size={12} />,
                name: l.name,
                own: lo,
                settings: l.settings,
                inherited: globalValue,
                isCurrent: scope.level === 'layout' && scope.layout?.id === l.id,
                onClear: () => onClearAt(l),
            }),
        );
        if (!threeLevel) continue;
        for (const s of l.sections) {
            const so = ownOf(s.settings);
            rows.push(
                row({
                    id: s.id,
                    icon: <Layers size={12} />,
                    name: s.name,
                    own: so,
                    settings: s.settings,
                    inherited: layoutEffective,
                    isCurrent: scope.level === 'section' && scope.section?.id === s.id,
                    onClear: () => onClearAt(l, s),
                    indent: true,
                }),
            );
        }
    }

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
            style={{ background: 'rgba(17, 24, 39, 0.35)' }}
            onClick={onClose}
            data-testid="levels-dialog"
        >
            <div
                className="rounded-2xl p-5 w-[560px] max-w-full space-y-3"
                style={{
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    boxShadow: '0 20px 60px rgba(0,0,0,.25)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-[15px] font-semibold m-0" style={{ color: 'var(--text-primary)' }}>
                            {label}
                        </h2>
                        <p className="text-[11px] mt-0.5 m-0" style={{ color: 'var(--text-secondary)' }}>
                            {t('design.override.levelsHint')}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:opacity-80"
                        style={{ color: 'var(--text-secondary)' }}
                        title={t('common.close')}
                    >
                        <X size={14} />
                    </button>
                </div>
                <div className="flex flex-col gap-0.5">{rows}</div>
                <p className="text-[11px] m-0" style={{ color: 'var(--text-secondary)' }}>
                    {threeLevel ? t('design.override.chain3') : t('design.override.chain2')}
                </p>
            </div>
        </div>,
        target,
    );
}
