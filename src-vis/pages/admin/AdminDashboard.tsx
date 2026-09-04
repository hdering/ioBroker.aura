import { useDashboardStore } from '../../store/dashboardStore';
import { useIoBroker } from '../../hooks/useIoBroker';
import {
    Layers,
    Wifi,
    WifiOff,
    Layout,
    Hash,
    Copy,
    Check,
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    Trash2,
    Bot,
    ExternalLink,
} from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n';
import { copyToClipboard } from '../../utils/clipboard';
import { useTimerOrphans, type OrphanItem } from '../../hooks/useTimerOrphans';
import { useBrokenDpRefs, type BrokenRef } from '../../hooks/useBrokenDpRefs';
import { useMcpStatus } from '../../hooks/useMcpStatus';
import { ConfigModal } from '../../components/config/ConfigModal';
import { Link } from 'react-router-dom';
import { NS } from '../../utils/namespace';

/** Rows a health list shows inline; everything beyond moves into its dialog.
 *  Keeps the overview the same height no matter how damaged the installation
 *  is — otherwise the cards below (MCP guide, stats) get pushed off screen. */
const PREVIEW_ROWS = 5;

function StatCard({
    label,
    value,
    icon: Icon,
    color,
}: {
    label: string;
    value: string | number;
    icon: React.ElementType;
    color: string;
}) {
    return (
        <div
            className="rounded-xl p-5"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                </span>
                <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: `${color}22` }}
                >
                    <Icon size={16} style={{ color }} />
                </div>
            </div>
            <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {value}
            </p>
        </div>
    );
}

function CopyButton({ text }: { text: string }) {
    const t = useT();
    const [copied, setCopied] = useState(false);
    const copy = () => {
        copyToClipboard(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button onClick={copy} className="hover:opacity-70 shrink-0" title={t('dashboard.nav.copy')}>
            {copied ? (
                <Check size={12} style={{ color: 'var(--accent-green)' }} />
            ) : (
                <Copy size={12} style={{ color: 'var(--text-secondary)' }} />
            )}
        </button>
    );
}

/** Small secondary button — refresh, "show all", dialog actions. */
function GhostButton({
    onClick,
    disabled,
    title,
    testId,
    children,
}: {
    onClick: () => void;
    disabled?: boolean;
    title?: string;
    testId?: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            data-aura-action={testId}
            className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-lg hover:opacity-80 disabled:opacity-50"
            style={{
                background: 'var(--app-bg)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
            }}
        >
            {children}
        </button>
    );
}

function OrphanRow({
    label,
    ns,
    items,
    limit,
}: {
    label: string;
    ns: 'timers' | 'lists' | 'panels';
    items: OrphanItem[];
    /** Caps the inline list. Omitted = show everything (dialog). */
    limit?: number;
}) {
    const t = useT();
    const clean = items.length === 0;
    const shown = limit ? items.slice(0, limit) : items;
    const hidden = items.length - shown.length;
    return (
        <div className="space-y-1.5" data-aura-orphan-row={ns}>
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                <span
                    className="inline-flex items-center justify-center text-[10px] font-bold rounded-full w-5 h-5"
                    style={{
                        background: clean
                            ? 'color-mix(in srgb, var(--accent-green) 18%, transparent)'
                            : 'color-mix(in srgb, var(--accent-yellow) 22%, transparent)',
                        color: clean ? 'var(--accent-green)' : 'var(--accent-yellow)',
                    }}
                >
                    {items.length}
                </span>
                <span>{label}</span>
            </div>
            {shown.length > 0 && (
                <ul
                    className={
                        limit
                            ? 'text-xs space-y-0.5 px-3 py-1.5 rounded-lg ml-7'
                            : 'aura-scroll text-xs max-h-64 overflow-y-auto space-y-0.5 px-3 py-1.5 rounded-lg ml-7'
                    }
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                >
                    {shown.map((it) => (
                        <li key={it.id} className="font-mono flex items-baseline gap-2" data-aura-orphan-item>
                            <span>
                                {NS}.{ns}.{it.id}
                            </span>
                            {it.name && (
                                <span className="font-sans" style={{ color: 'var(--text-primary)' }}>
                                    — {it.name}
                                </span>
                            )}
                        </li>
                    ))}
                    {hidden > 0 && (
                        <li className="italic" style={{ opacity: 0.7 }} data-aura-orphan-more>
                            {t('dashboard.orphans.more', { count: hidden })}
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}

function TimerOrphansSection() {
    const t = useT();
    const { timer, list, panel, loading, refresh, cleanup } = useTimerOrphans();
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [showAll, setShowAll] = useState(false);

    const total = timer.length + list.length + panel.length;
    const clean = total === 0;
    const accent = clean ? 'var(--accent-green)' : 'var(--accent-yellow)';
    const truncated =
        timer.length + list.length + panel.length > 0 && [timer, list, panel].some((g) => g.length > PREVIEW_ROWS);

    const handleCleanup = async () => {
        setBusy(true);
        try {
            await cleanup();
            setConfirm(false);
        } finally {
            setBusy(false);
        }
    };

    const rows = (limit?: number) => (
        <div className="space-y-3 pt-1">
            <OrphanRow label={t('dashboard.orphans.timerLabel')} ns="timers" items={timer} limit={limit} />
            <OrphanRow label={t('dashboard.orphans.listLabel')} ns="lists" items={list} limit={limit} />
            <OrphanRow label={t('dashboard.orphans.panelLabel')} ns="panels" items={panel} limit={limit} />
        </div>
    );

    return (
        <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: 'var(--app-surface)', border: `1px solid ${accent}` }}
            data-aura-health="orphans"
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    {clean ? (
                        <CheckCircle2 size={16} style={{ color: accent }} />
                    ) : (
                        <AlertTriangle size={16} style={{ color: accent }} />
                    )}
                    <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {clean ? t('dashboard.orphans.titleClean') : t('dashboard.orphans.title', { count: total })}
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <GhostButton
                        onClick={() => void refresh()}
                        disabled={loading || busy}
                        title={t('dashboard.orphans.refresh')}
                    >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                        {t('dashboard.orphans.refresh')}
                    </GhostButton>
                    {truncated && (
                        <GhostButton onClick={() => setShowAll(true)} testId="orphans-show-all">
                            {t('dashboard.orphans.showAll', { count: total })}
                        </GhostButton>
                    )}
                    {!clean &&
                        (confirm ? (
                            <>
                                <button
                                    onClick={handleCleanup}
                                    disabled={busy}
                                    className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-lg text-white hover:opacity-80 disabled:opacity-50"
                                    style={{ background: 'var(--accent-red)' }}
                                >
                                    <Trash2 size={12} />
                                    {t('common.confirm')}
                                </button>
                                <GhostButton onClick={() => setConfirm(false)} disabled={busy}>
                                    {t('common.cancel')}
                                </GhostButton>
                            </>
                        ) : (
                            <button
                                onClick={() => setConfirm(true)}
                                className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-lg text-white hover:opacity-80"
                                style={{ background: 'var(--accent-red)' }}
                            >
                                <Trash2 size={12} />
                                {t('dashboard.orphans.cleanup')}
                            </button>
                        ))}
                </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {clean ? t('dashboard.orphans.hintClean') : t('dashboard.orphans.hint')}
            </p>
            {rows(PREVIEW_ROWS)}
            {showAll && (
                <ConfigModal
                    title={t('dashboard.orphans.allTitle', { count: total })}
                    maxWidth={720}
                    maxHeight={640}
                    padded
                    onClose={() => setShowAll(false)}
                >
                    {rows()}
                </ConfigModal>
            )}
        </div>
    );
}

function BrokenDpTable({ rows }: { rows: BrokenRef[] }) {
    const t = useT();
    return (
        <table className="w-full text-xs">
            <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                    <th className="text-left font-medium px-3 py-1.5">{t('dashboard.brokenDps.colWidget')}</th>
                    <th className="text-left font-medium px-3 py-1.5">{t('dashboard.brokenDps.colLocation')}</th>
                    <th className="text-left font-medium px-3 py-1.5">{t('dashboard.brokenDps.colField')}</th>
                    <th className="text-left font-medium px-3 py-1.5">{t('dashboard.brokenDps.colDp')}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((ref, i) => (
                    <tr
                        key={`${ref.widgetId}-${ref.field}-${i}`}
                        style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--app-border)' }}
                        data-aura-broken-row
                    >
                        <td className="px-3 py-1.5">
                            {ref.routeTo ? (
                                <Link to={ref.routeTo} className="hover:underline" style={{ color: 'var(--accent)' }}>
                                    <span className="font-medium">{ref.widgetTitle}</span>
                                </Link>
                            ) : (
                                <span className="font-medium">{ref.widgetTitle}</span>
                            )}
                            <span className="ml-1.5" style={{ color: 'var(--text-secondary)' }}>
                                · {ref.widgetType}
                            </span>
                        </td>
                        <td className="px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>
                            {ref.location}
                        </td>
                        <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--text-secondary)' }}>
                            {ref.field}
                        </td>
                        <td className="px-3 py-1.5 font-mono" style={{ color: 'var(--accent-red)' }}>
                            {ref.dp}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function BrokenDpRefsSection() {
    const t = useT();
    const { broken, loading, refresh } = useBrokenDpRefs();
    const [showAll, setShowAll] = useState(false);
    const clean = broken.length === 0;
    const accent = clean ? 'var(--accent-green)' : 'var(--accent-yellow)';
    const hidden = broken.length - PREVIEW_ROWS;

    return (
        <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: 'var(--app-surface)', border: `1px solid ${accent}` }}
            data-aura-health="broken"
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    {clean ? (
                        <CheckCircle2 size={16} style={{ color: accent }} />
                    ) : (
                        <AlertTriangle size={16} style={{ color: accent }} />
                    )}
                    <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {clean
                            ? t('dashboard.brokenDps.titleClean')
                            : t('dashboard.brokenDps.title', { count: broken.length })}
                    </h2>
                </div>
                <div className="flex items-center gap-2">
                    <GhostButton onClick={() => void refresh()} disabled={loading}>
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                        {t('dashboard.orphans.refresh')}
                    </GhostButton>
                    {hidden > 0 && (
                        <GhostButton onClick={() => setShowAll(true)} testId="broken-show-all">
                            {t('dashboard.brokenDps.showAll', { count: broken.length })}
                        </GhostButton>
                    )}
                </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {clean ? t('dashboard.brokenDps.hintClean') : t('dashboard.brokenDps.hint')}
            </p>
            {!clean && (
                <>
                    <div
                        className="rounded-lg overflow-hidden"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    >
                        <BrokenDpTable rows={broken.slice(0, PREVIEW_ROWS)} />
                    </div>
                    {hidden > 0 && (
                        <p className="text-xs italic" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                            {t('dashboard.orphans.more', { count: hidden })}
                        </p>
                    )}
                </>
            )}
            {showAll && (
                <ConfigModal
                    title={t('dashboard.brokenDps.allTitle', { count: broken.length })}
                    maxWidth={900}
                    maxHeight={640}
                    padded
                    onClose={() => setShowAll(false)}
                >
                    <div
                        className="aura-scroll max-h-[70vh] overflow-y-auto rounded-lg"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    >
                        <BrokenDpTable rows={broken} />
                    </div>
                </ConfigModal>
            )}
        </div>
    );
}

function McpSection() {
    const t = useT();
    const { enabled, mode } = useMcpStatus();
    const [expanded, setExpanded] = useState(false);

    // Until the instance config answered we do not know whether MCP is set up —
    // rendering nothing beats a full guide card that collapses a moment later.
    if (enabled === null) return null;

    const guideVisible = !enabled || expanded;
    const steps = [
        t('dashboard.mcp.step1'),
        t('dashboard.mcp.step2'),
        t('dashboard.mcp.step3'),
        t('dashboard.mcp.step4'),
    ];

    const docsLink = (
        <a
            href="https://hdering.github.io/ioBroker.aura/einstellungen/mcp"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs hover:underline"
            style={{ color: 'var(--accent)' }}
        >
            {t('dashboard.mcp.docs')}
            <ExternalLink size={12} />
        </a>
    );

    return (
        <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            data-aura-mcp-card
            data-aura-mcp-state={enabled ? 'active' : 'setup'}
        >
            <div className="flex items-center gap-2 flex-wrap">
                {enabled ? (
                    <CheckCircle2 size={16} style={{ color: 'var(--accent-green)' }} />
                ) : (
                    <Bot size={16} style={{ color: 'var(--accent)' }} />
                )}
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {enabled ? t('dashboard.mcp.titleActive') : t('dashboard.mcp.title')}
                </h2>
                <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                        background: 'color-mix(in srgb, var(--accent-yellow) 22%, transparent)',
                        color: 'var(--accent-yellow)',
                    }}
                >
                    {t('dashboard.mcp.badge')}
                </span>
                {enabled && (
                    <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                            color: 'var(--accent)',
                        }}
                        data-aura-mcp-mode={mode}
                    >
                        {t(`dashboard.mcp.mode.${mode}`)}
                    </span>
                )}
                {enabled && (
                    <div className="ml-auto flex items-center gap-3">
                        {!expanded && docsLink}
                        <GhostButton onClick={() => setExpanded((v) => !v)} testId="mcp-toggle-guide">
                            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            {expanded ? t('dashboard.mcp.hideGuide') : t('dashboard.mcp.showGuide')}
                        </GhostButton>
                    </div>
                )}
            </div>

            {guideVisible && (
                <>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('dashboard.mcp.description')}
                    </p>

                    <ol className="space-y-1.5" data-aura-mcp-steps>
                        {steps.map((step, i) => (
                            <li
                                key={i}
                                className="flex items-baseline gap-2 text-xs"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                <span
                                    className="inline-flex items-center justify-center shrink-0 text-[10px] font-bold rounded-full w-5 h-5"
                                    style={{
                                        background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                                        color: 'var(--accent)',
                                    }}
                                >
                                    {i + 1}
                                </span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>

                    <p
                        className="text-xs px-3 py-2 rounded-lg"
                        style={{
                            background: 'color-mix(in srgb, var(--accent-yellow) 12%, transparent)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        {t('dashboard.mcp.warning', { ns: NS })}
                    </p>

                    {docsLink}
                </>
            )}
        </div>
    );
}

export function AdminDashboard() {
    const t = useT();
    const { layouts } = useDashboardStore();
    const allTabs = layouts.flatMap((l) => l.sections.flatMap((s) => s.tabs));
    const totalTabsAll = allTabs.length;
    const totalWidgetsAll = allTabs.reduce((a, tab) => a + tab.widgets.length, 0);
    const { connected } = useIoBroker();

    return (
        <div className="p-8 space-y-8">
            <div>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {t('dashboard.title')}
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('dashboard.subtitle')}
                </p>
            </div>

            {/* Onboarding before status: the health cards below grow with the damage,
                so anything placed after them can be pushed off screen entirely. */}
            <McpSection />

            <TimerOrphansSection />
            <BrokenDpRefsSection />

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label={t('dashboard.stats.layouts')}
                    value={layouts.length}
                    icon={Layers}
                    color="var(--accent)"
                />
                <StatCard
                    label={t('dashboard.stats.tabs')}
                    value={totalTabsAll}
                    icon={Layout}
                    color="var(--accent-green)"
                />
                <StatCard
                    label={t('dashboard.stats.widgets')}
                    value={totalWidgetsAll}
                    icon={Hash}
                    color="var(--accent-yellow)"
                />
                <StatCard
                    label="ioBroker"
                    value={connected ? t('dashboard.stats.connected') : t('dashboard.stats.disconnected')}
                    icon={connected ? Wifi : WifiOff}
                    color={connected ? 'var(--accent-green)' : 'var(--accent-red)'}
                />
            </div>

            {/* Navigation via ioBroker */}
            <div
                className="rounded-xl p-5 space-y-3"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
                <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {t('dashboard.nav.title')}
                </h2>

                <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                >
                    <code className="text-sm font-mono flex-1" style={{ color: 'var(--accent)' }}>
                        {NS}.clients.{'<clientId>'}.navigate.url
                    </code>
                    <CopyButton text={`${NS}.clients.<clientId>.navigate.url`} />
                </div>

                <pre
                    className="aura-scroll text-xs font-mono overflow-x-auto px-3 py-2 rounded-lg"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                >{`setState('${NS}.clients.<clientId>.navigate.url', 'tab-slug');`}</pre>
            </div>

            {/* AURA acronym — small footer */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 px-1">
                {(
                    [
                        ['A', 'daptive', t('dashboard.aura.adaptive')],
                        ['U', 'nified', t('dashboard.aura.unified')],
                        ['R', 'oom', t('dashboard.aura.room')],
                        ['A', 'utomation', t('dashboard.aura.automation')],
                    ] as [string, string, string][]
                ).map(([letter, rest, desc]) => (
                    <div key={letter + rest} className="flex items-baseline gap-1">
                        <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
                            {letter}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {rest}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>
                            · {desc}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
