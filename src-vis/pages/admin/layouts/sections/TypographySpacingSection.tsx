import { useLayoutSetting } from '../shared/useLayoutSetting';
import { SliderSetting } from '../shared/SliderSetting';
import { useT } from '../../../../i18n';

const FONT_SCALE_PRESETS = [
  { label: 'XS', value: 0.8  },
  { label: 'S',  value: 0.9  },
  { label: 'M',  value: 1.0  },
  { label: 'L',  value: 1.15 },
  { label: 'XL', value: 1.3  },
  { label: 'XXL',value: 1.5  },
];

const FONT_LEVELS = [
  { labelKey: 'theme.typography.value',      cls: 'text-3xl', rem: 1.875 },
  { labelKey: 'theme.typography.heading',     cls: 'text-xl',  rem: 1.25  },
  { labelKey: 'theme.typography.subheading',  cls: 'text-lg',  rem: 1.125 },
  { labelKey: 'theme.typography.body',        cls: 'text-sm',  rem: 0.875 },
  { labelKey: 'theme.typography.small',       cls: 'text-xs',  rem: 0.75  },
] as const;

interface TypographySpacingSectionProps {
  contextId: string | null;
}

export function TypographySpacingSection({ contextId }: TypographySpacingSectionProps) {
  const t = useT();
  const { eff, set, clear, ls } = useLayoutSetting(contextId);

  const [fontScale] = eff('fontScale');
  const [gridGap]   = eff('gridGap');
  const [widgetPad] = eff('widgetPadding');

  const effectiveFontScale = (fontScale ?? 1) as number;
  const effectiveGridGap   = (gridGap ?? 10) as number;
  const effectiveWidgetPad = (widgetPad ?? 16) as number;

  return (
    <div className="rounded-xl p-6 space-y-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>{t('theme.typography.title')}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{t('theme.typography.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Font Scale */}
        <div className="lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('theme.typography.fontSize')}</p>
              {contextId && ls?.fontScale !== undefined && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>Layout</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {contextId && ls?.fontScale !== undefined && (
                <button onClick={() => clear('fontScale')} className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>↩ Global</button>
              )}
              <span className="text-sm font-mono font-bold px-2.5 py-1 rounded-lg"
                style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px solid var(--app-border)' }}>
                {Math.round(effectiveFontScale * 100)} %
              </span>
            </div>
          </div>
          <input
            type="range" min={0.7} max={1.6} step={0.05}
            value={effectiveFontScale}
            onChange={(e) => set('fontScale', Number(e.target.value))}
            className="w-full accent-[var(--accent)] mb-3"
          />
          <div className="flex gap-1.5 flex-wrap">
            {FONT_SCALE_PRESETS.map(({ label, value }) => {
              const active = Math.abs(effectiveFontScale - value) < 0.01;
              return (
                <button key={value} onClick={() => set('fontScale', value)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium hover:opacity-80"
                  style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                  {label} · {Math.round(value * 100)}%
                </button>
              );
            })}
          </div>
          {effectiveFontScale !== 1 && (
            <button onClick={() => set('fontScale', 1)}
              className="mt-3 text-xs hover:opacity-70"
              style={{ color: 'var(--text-secondary)' }}>
              {t('theme.typography.reset')}
            </button>
          )}
        </div>

        {/* Gap */}
        <SliderSetting
          label={t('theme.layout.gap')}
          value={effectiveGridGap}
          min={0} max={40} step={2} unit=" px"
          onChange={(v) => set('gridGap', v)}
          presets={[{ label: '0', value: 0 }, { label: '4', value: 4 }, { label: '8', value: 8 }, { label: '10', value: 10 }, { label: '16', value: 16 }, { label: '24', value: 24 }]}
          isOverridden={contextId !== null && ls?.gridGap !== undefined}
          onClearOverride={() => clear('gridGap')}
        />

        {/* Padding */}
        <SliderSetting
          label={t('theme.layout.padding')}
          value={effectiveWidgetPad}
          min={0} max={40} step={2} unit=" px"
          onChange={(v) => set('widgetPadding', v)}
          presets={[{ label: '0', value: 0 }, { label: '8', value: 8 }, { label: '12', value: 12 }, { label: '16', value: 16 }, { label: '24', value: 24 }]}
          isOverridden={contextId !== null && ls?.widgetPadding !== undefined}
          onClearOverride={() => clear('widgetPadding')}
        />
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-secondary)' }}>
          {t('theme.typography.reference', { percent: String(Math.round(effectiveFontScale * 100)) })}
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
          {FONT_LEVELS.map(({ labelKey, cls, rem }, i) => {
            const px = Math.round(rem * effectiveFontScale * 16);
            const remScaled = (rem * effectiveFontScale).toFixed(3).replace(/\.?0+$/, '');
            return (
              <div key={cls}
                className="flex items-center gap-4 px-4 py-2.5"
                style={{ background: i % 2 === 0 ? 'var(--app-bg)' : 'var(--app-surface)', borderBottom: i < FONT_LEVELS.length - 1 ? '1px solid var(--app-border)' : undefined }}>
                <span className="w-32 shrink-0 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{cls}</span>
                <span className="w-28 shrink-0 text-xs" style={{ color: 'var(--text-secondary)' }}>{t(labelKey as never)}</span>
                <span className="w-28 shrink-0 text-xs font-mono" style={{ color: 'var(--accent)' }}>{remScaled}rem · {px}px</span>
                <span style={{ fontSize: `${rem * effectiveFontScale}rem`, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {t('theme.typography.example')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
