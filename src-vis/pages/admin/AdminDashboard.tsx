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
    RefreshCw,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n';
import { copyToClipboard } from '../../utils/clipboard';
import { useTimerOrphans, type OrphanItem } from '../../hooks/useTimerOrphans';
import { useBrokenDpRefs } from '../../hooks/useBrokenDpRefs';
import { Link } from 'react-router-dom';
import { NS } from '../../utils/namespace';

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

function OrphanRow({ label, ns, items }: { label: string; ns: 'timers' | 'lists'; items: OrphanItem[] }) {
    const clean = items.length === 0;
    return (
        <div className="space-y-1.5">
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
            {items.length > 0 && (
                <ul
                    className="aura-scroll text-xs max-h-32 overflow-y-auto space-y-0.5 px-3 py-1.5 rounded-lg ml-7"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                >
                    {items.map((it) => (
                        <li key={it.id} className="font-mono flex items-baseline gap-2">
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
                </ul>
            )}
        </div>
    );
}

function TimerOrphansSection() {
    const t = useT();
    const { timer, list, loading, refresh, cleanup } = useTimerOrphans();
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(false);

    const total = timer.length + list.length;
    const clean = total === 0;
    const accent = clean ? 'var(--accent-green)' : 'var(--accent-yellow)';

    const handleCleanup = async () => {
        setBusy(true);
        try {
            await cleanup();
            setConfirm(false);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: 'var(--app-surface)', border: `1px solid ${accent}` }}
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
                    <button
                        onClick={() => void refresh()}
                        disabled={loading || busy}
                        className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-lg hover:opacity-80 disabled:opacity-50"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('dashboard.orphans.refresh')}
                    >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                        {t('dashboard.orphans.refresh')}
                    </button>
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
                                <button
                                    onClick={() => setConfirm(false)}
                                    disabled={busy}
                                    className="px-2.5 h-7 text-xs rounded-lg hover:opacity-80 disabled:opacity-50"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    {t('common.cancel')}
                                </button>
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
            <div className="space-y-3 pt-1">
                <OrphanRow label={t('dashboard.orphans.timerLabel')} ns="timers" items={timer} />
                <OrphanRow label={t('dashboard.orphans.listLabel')} ns="lists" items={list} />
            </div>
        </div>
    );
}

function BrokenDpRefsSection() {
    const t = useT();
    const { broken, loading, refresh } = useBrokenDpRefs();
    const clean = broken.length === 0;
    const accent = clean ? 'var(--accent-green)' : 'var(--accent-yellow)';

    return (
        <div
            className="rounded-xl p-5 space-y-3"
            style={{ background: 'var(--app-surface)', border: `1px solid ${accent}` }}
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
                <button
                    onClick={() => void refresh()}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-2.5 h-7 text-xs rounded-lg hover:opacity-80 disabled:opacity-50"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    {t('dashboard.orphans.refresh')}
                </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {clean ? t('dashboard.brokenDps.hintClean') : t('dashboard.brokenDps.hint')}
            </p>
            {!clean && (
                <div
                    className="aura-scroll max-h-64 overflow-y-auto rounded-lg"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                >
                    <table className="w-full text-xs">
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)' }}>
                                <th className="text-left font-medium px-3 py-1.5">
                                    {t('dashboard.brokenDps.colWidget')}
                                </th>
                                <th className="text-left font-medium px-3 py-1.5">
                                    {t('dashboard.brokenDps.colLocation')}
                                </th>
                                <th className="text-left font-medium px-3 py-1.5">
                                    {t('dashboard.brokenDps.colField')}
                                </th>
                                <th className="text-left font-medium px-3 py-1.5">{t('dashboard.brokenDps.colDp')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {broken.map((ref, i) => (
                                <tr
                                    key={`${ref.widgetId}-${ref.field}-${i}`}
                                    style={{ color: 'var(--text-primary)', borderTop: '1px solid var(--app-border)' }}
                                >
                                    <td className="px-3 py-1.5">
                                        {ref.routeTo ? (
                                            <Link
                                                to={ref.routeTo}
                                                className="hover:underline"
                                                style={{ color: 'var(--accent)' }}
                                            >
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
                </div>
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
