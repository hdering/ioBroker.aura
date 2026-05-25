import { useLayoutSetting } from '../shared/useLayoutSetting';
import { SliderSetting } from '../shared/SliderSetting';
import { LayoutContextSwitcher } from '../shared/LayoutContextSwitcher';
import { useDashboardStore } from '../../../../store/dashboardStore';
import { useT } from '../../../../i18n';

interface GridSectionProps {
  contextId: string | null;
  onContextChange: (id: string | null) => void;
}

export function GridSection({ contextId, onContextChange }: GridSectionProps) {
  const t = useT();
  const rescaleAllWidgetsX = useDashboardStore((s) => s.rescaleAllWidgetsX);
  const { eff, set, clear, frontend } = useLayoutSetting(contextId);

  const MARGIN = (frontend.gridGap ?? 10) as number;

  const [rowH, rowHOv] = eff('gridRowHeight');
  const [snapX, snapXOv] = eff('gridSnapX');
  const [mob, mobOv]   = eff('mobileBreakpoint');

  const effectiveRowH  = (rowH ?? 20) as number;
  const effectiveSnapX = (snapX ?? effectiveRowH) as number;
  const effectiveMob   = (mob ?? 600) as number;

  return (
    <div className="rounded-xl p-6 space-y-4" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {t('settings.grid.title')}
        </h2>
        <LayoutContextSwitcher selectedId={contextId} onChange={onContextChange} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <SliderSetting
          label={t('settings.grid.rowHeight')}
          value={effectiveRowH}
          min={10} max={160} step={10} unit=" px"
          onChange={(v) => set('gridRowHeight', v)}
          isOverridden={rowHOv}
          onClearOverride={() => clear('gridRowHeight')}
          presets={[{ label: '20', value: 20 }, { label: '40', value: 40 }, { label: '60', value: 60 }, { label: '80', value: 80 }, { label: '120', value: 120 }]}
        />
        <SliderSetting
          label={t('settings.grid.snapX')}
          value={effectiveSnapX}
          min={10} max={160} step={10} unit=" px"
          onChange={(v) => {
            const oldSnap = effectiveSnapX;
            const factor = (oldSnap + MARGIN) / (v + MARGIN);
            if (!contextId) rescaleAllWidgetsX(factor);
            set('gridSnapX', v);
          }}
          isOverridden={snapXOv}
          onClearOverride={() => clear('gridSnapX')}
          presets={[{ label: '20', value: 20 }, { label: '40', value: 40 }, { label: '60', value: 60 }, { label: '80', value: 80 }, { label: '120', value: 120 }]}
        />
        <SliderSetting
          label={t('settings.grid.mobileBreak')}
          value={effectiveMob}
          min={0} max={1024} step={10} unit=" px"
          onChange={(v) => set('mobileBreakpoint', v)}
          isOverridden={mobOv}
          onClearOverride={() => clear('mobileBreakpoint')}
          presets={[{ label: '480', value: 480 }, { label: '600', value: 600 }, { label: '768', value: 768 }, { label: t('settings.grid.mobileOff'), value: 0 }]}
        />
      </div>
    </div>
  );
}
