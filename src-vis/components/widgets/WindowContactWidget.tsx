import { CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { contentPositionClass } from '../../utils/widgetUtils';
import { StatusBadges } from './StatusBadges';

// ─── state helpers ────────────────────────────────────────────────────────────

type ContactState = 'closed' | 'tilted' | 'open';

function resolveState(value: unknown): ContactState {
  if (typeof value === 'boolean') return value ? 'open' : 'closed';
  if (typeof value === 'number') {
    if (value === 0) return 'closed';
    if (value === 1) return 'tilted';
    return 'open';
  }
  // string values from hmip: "CLOSED" / "TILTED" / "OPEN"
  if (typeof value === 'string') {
    const v = value.toUpperCase();
    if (v === 'CLOSED' || v === 'FALSE' || v === '0') return 'closed';
    if (v === 'TILTED') return 'tilted';
  }
  return 'open';
}

const STATE_LABEL: Record<ContactState, string> = {
  closed: 'Geschlossen',
  tilted: 'Gekippt',
  open: 'Offen',
};

const STATE_COLOR: Record<ContactState, string> = {
  closed: 'var(--accent-green)',
  tilted: '#f59e0b',
  open: 'var(--accent-red, #ef4444)',
};

function StateIcon({ state, size }: { state: ContactState; size: number }) {
  const color = STATE_COLOR[state];
  if (state === 'closed') return <CheckCircle2 size={size} style={{ color }} />;
  if (state === 'tilted') return <TriangleAlert size={size} style={{ color }} />;
  return <XCircle size={size} style={{ color }} />;
}

// ─── widget ───────────────────────────────────────────────────────────────────

export function WindowContactWidget({ config }: WidgetProps) {
  const { value } = useDatapoint(config.datapoint);

  const state = resolveState(value);
  const stateColor = STATE_COLOR[state];
  const label = STATE_LABEL[state];
  const layout = config.layout ?? 'default';

  // ── CARD ─────────────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 rounded-widget"
        style={{
          position: 'relative',
          background: state === 'closed'
            ? 'linear-gradient(135deg, var(--accent-green), color-mix(in srgb, var(--accent-green) 60%, black))'
            : state === 'tilted'
              ? 'linear-gradient(135deg, #f59e0b, color-mix(in srgb, #f59e0b 60%, black))'
              : 'linear-gradient(135deg, var(--accent-red, #ef4444), color-mix(in srgb, var(--accent-red, #ef4444) 60%, black))',
          border: `2px solid ${stateColor}`,
        }}>
        <StateIcon state={state} size={36} />
        <div className="text-center">
          <p className="font-bold text-sm" style={{ color: '#fff' }}>{config.title}</p>
          <p className="text-xs opacity-80" style={{ color: '#fff' }}>{label}</p>
        </div>
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── COMPACT ──────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-3 h-full" style={{ position: 'relative' }}>
        <StateIcon state={state} size={18} />
        <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {config.title}
        </span>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: `${stateColor}22`, color: stateColor, border: `1px solid ${stateColor}55` }}>
          {label}
        </span>
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── MINIMAL ──────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1" style={{ position: 'relative' }}>
        <StateIcon state={state} size={36} />
        <span className="text-xs font-medium" style={{ color: stateColor }}>{label}</span>
        <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  const posClass = contentPositionClass(config.options?.contentPosition as string | undefined);

  return (
    <div className={`flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
      <div className="flex items-center gap-2">
        <StateIcon state={state} size={14} />
        <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
      </div>
      <span className="text-2xl font-bold" style={{ color: stateColor }}>{label}</span>
      <StatusBadges config={config} />
    </div>
  );
}
