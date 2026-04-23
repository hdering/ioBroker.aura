import { CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import type { WidgetProps } from '../../types';
import { contentPositionClass } from '../../utils/widgetUtils';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { StatusBadges } from './StatusBadges';
import { CustomGridView } from './CustomGridView';

// ─── types ────────────────────────────────────────────────────────────────────

type ContactState = 'closed' | 'tilted' | 'open';

export type StateCfg = {
  type: 'icon' | 'base64';
  icon?: string;
  color: string;
  base64?: string;
  label: string;
};

// ─── presets ──────────────────────────────────────────────────────────────────

export const WC_PRESETS: Record<string, { closed: string; tilted: string; open: string }> = {
  hmip:             { closed: '0',        tilted: '1',      open: '2,3,4,5,6,7' },
  boolean:          { closed: 'false,0',  tilted: '',       open: 'true,1'       },
  boolean_inverted: { closed: 'true,1',   tilted: '',       open: 'false,0'      },
  '0_7':            { closed: '0',        tilted: '',       open: '7'            },
  string_hmip:      { closed: 'closed',   tilted: 'tilted', open: 'open'         },
};

export const WC_PRESET_LABELS: Record<string, string> = {
  hmip:             'HmIP (0=zu, 1=gekippt, 2+=offen)',
  boolean:          'Boolean (false=zu, true=offen)',
  boolean_inverted: 'Boolean invertiert (true=zu, false=offen)',
  '0_7':            'Numerisch 0 / 7',
  string_hmip:      'String (CLOSED / TILTED / OPEN)',
  custom:           'Benutzerdefiniert',
};

// ─── fallbacks ────────────────────────────────────────────────────────────────

export const WC_FALLBACK: Record<ContactState, { Icon: typeof CheckCircle2; color: string; label: string }> = {
  closed: { Icon: CheckCircle2,  color: '#22c55e', label: 'Geschlossen' },
  tilted: { Icon: TriangleAlert, color: '#f59e0b', label: 'Gekippt'     },
  open:   { Icon: XCircle,       color: '#ef4444', label: 'Offen'       },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

export function matchesValues(value: unknown, valList: string): boolean {
  if (!valList.trim()) return false;
  const str = String(value ?? '').toLowerCase().trim();
  return valList.split(',').map(v => v.trim().toLowerCase()).filter(Boolean).some(v => v === str);
}

export function resolveContactState(
  value: unknown,
  preset: string,
  customValues: { closed: string; tilted: string; open: string },
): ContactState {
  const mapping = preset === 'custom' ? customValues : (WC_PRESETS[preset] ?? WC_PRESETS.hmip);
  if (matchesValues(value, mapping.closed)) return 'closed';
  if (mapping.tilted && matchesValues(value, mapping.tilted)) return 'tilted';
  if (matchesValues(value, mapping.open)) return 'open';
  // Backward-compat fallback for existing widgets without statePreset
  if (value === false || value === 0) return 'closed';
  if (value === 1) return 'tilted';
  if (value === true) return 'open';
  return 'open';
}

export function getWcCfg(o: Record<string, unknown>, st: ContactState): StateCfg {
  const fb = WC_FALLBACK[st];
  return {
    type:   (o[`${st}Type`]   as 'icon' | 'base64') ?? 'icon',
    icon:    o[`${st}Icon`]   as string | undefined,
    color:  (o[`${st}Color`]  as string) || fb.color,
    base64:  o[`${st}Base64`] as string | undefined,
    label:  (o[`${st}Label`]  as string) || fb.label,
  };
}

// ─── StateDisplay ─────────────────────────────────────────────────────────────

function StateDisplay({
  cfg,
  fallback: Fallback,
  size,
}: {
  cfg: StateCfg;
  fallback: typeof CheckCircle2;
  size: number;
}) {
  if (cfg.type === 'base64' && cfg.base64) {
    return (
      <img
        src={cfg.base64}
        style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
        alt=""
      />
    );
  }
  const Icon = getWidgetIcon(cfg.icon, Fallback);
  return <Icon size={size} style={{ color: cfg.color, flexShrink: 0 }} />;
}

// ─── widget ───────────────────────────────────────────────────────────────────

export function WindowContactWidget({ config }: WidgetProps) {
  const o = config.options ?? {};

  const { value } = useDatapoint(config.datapoint);

  const preset = (o.statePreset as string) ?? 'hmip';
  const state = resolveContactState(value, preset, {
    closed: (o.stateValuesClosed as string) ?? WC_PRESETS.hmip.closed,
    tilted: (o.stateValuesTilted as string) ?? WC_PRESETS.hmip.tilted,
    open:   (o.stateValuesOpen   as string) ?? WC_PRESETS.hmip.open,
  });

  const layout    = config.layout ?? 'default';
  const showTitle = o.showTitle !== false;
  const showLabel = o.showLabel !== false;
  const iconSize  = (o.iconSize as number) || 36;

  const cfg = getWcCfg(o, state);
  const fb  = WC_FALLBACK[state];

  // Extra DPs for custom layout extraFields – hooks must always run unconditionally
  const battDpId  = (o.batteryDp as string) ?? '';
  const lockDpId  = (o.lockDp    as string) ?? '';
  const reachDpId = (o.unreachDp as string) ?? '';
  const { value: battRaw  } = useDatapoint(battDpId);
  const { value: lockRaw  } = useDatapoint(lockDpId);
  const { value: reachRaw } = useDatapoint(reachDpId);

  // Battery string
  const battMode      = (o.batteryMode as 'percent' | 'boolean') ?? 'boolean';
  const battInvert    = o.batteryInvert === true;
  let battStr = '';
  if (battDpId) {
    if (battMode === 'percent') {
      const num = typeof battRaw === 'number' ? battRaw : parseFloat(String(battRaw ?? ''));
      battStr = isNaN(num) ? '–' : `${Math.round(num)}%`;
    } else {
      const low = matchesValues(battRaw, 'true,1');
      battStr = (battInvert ? !low : low) ? 'Niedrig' : 'OK';
    }
  }

  // Lock string
  const lockLockedValues = (o.lockLockedValues as string) ?? 'true,1';
  const lockStr = lockDpId
    ? matchesValues(lockRaw, lockLockedValues) ? 'Abgeschlossen' : 'Offen'
    : '';

  // Reach string
  const reachMode       = (o.reachMode as 'unreachable' | 'available') ?? 'unreachable';
  const reachTrueValues = (o.reachTrueValues as string) ?? 'true,1';
  let reachStr = '';
  if (reachDpId) {
    const rawBool   = matchesValues(reachRaw, reachTrueValues);
    const isUnreach = reachMode === 'unreachable' ? rawBool : !rawBool;
    reachStr = isUnreach ? 'Nicht erreichbar' : 'Erreichbar';
  }

  // ── custom layout ─────────────────────────────────────────────────────────
  if (layout === 'custom') return (
    <CustomGridView
      config={config}
      value={cfg.label}
      extraFields={{
        label:   cfg.label,
        open:    state === 'open'   ? 'Ja' : 'Nein',
        tilted:  state === 'tilted' ? 'Ja' : 'Nein',
        closed:  state === 'closed' ? 'Ja' : 'Nein',
        lock:    lockStr,
        battery: battStr,
        reach:   reachStr,
      }}
      extraComponents={{
        icon: <StateDisplay cfg={cfg} fallback={fb.Icon} size={iconSize} />,
      }}
    />
  );

  // ── CARD ─────────────────────────────────────────────────────────────────
  if (layout === 'card') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-2 rounded-widget"
        style={{
          position: 'relative',
          background: `linear-gradient(135deg, ${cfg.color}, color-mix(in srgb, ${cfg.color} 60%, black))`,
          border: `2px solid ${cfg.color}`,
        }}>
        <StateDisplay cfg={cfg} fallback={fb.Icon} size={iconSize} />
        <div className="text-center">
          {showTitle && <p className="font-bold text-sm" style={{ color: '#fff' }}>{config.title}</p>}
          {showLabel && <p className="text-xs opacity-80" style={{ color: '#fff' }}>{cfg.label}</p>}
        </div>
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── COMPACT ──────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-3 h-full" style={{ position: 'relative' }}>
        <StateDisplay cfg={cfg} fallback={fb.Icon} size={18} />
        {showTitle && (
          <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {config.title}
          </span>
        )}
        {!showTitle && <span className="flex-1" />}
        {showLabel && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: `${cfg.color}22`, color: cfg.color, border: `1px solid ${cfg.color}55` }}>
            {cfg.label}
          </span>
        )}
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── MINIMAL ──────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1" style={{ position: 'relative' }}>
        <StateDisplay cfg={cfg} fallback={fb.Icon} size={iconSize} />
        {showLabel && <span className="text-xs font-medium" style={{ color: cfg.color }}>{cfg.label}</span>}
        {showTitle && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{config.title}</span>}
        <StatusBadges config={config} />
      </div>
    );
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  const posClass = contentPositionClass(config.options?.contentPosition as string | undefined);

  return (
    <div className={`flex flex-col h-full gap-2 ${posClass}`} style={{ position: 'relative' }}>
      {showTitle && (
        <div className="flex items-center gap-2">
          <StateDisplay cfg={cfg} fallback={fb.Icon} size={14} />
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
        </div>
      )}
      {showLabel && <span className="text-2xl font-bold" style={{ color: cfg.color }}>{cfg.label}</span>}
      <StatusBadges config={config} />
    </div>
  );
}
