import { useLayoutSetting } from '../shared/useLayoutSetting';
import { SliderSetting } from '../shared/SliderSetting';
import { ToggleRow } from '../shared/SettingControls';
import { OverrideState } from '../shared/OverrideState';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import type { LayoutSettings } from '../../../../store/dashboardStore';

const GUIDELINE_KEYS: (keyof LayoutSettings)[] = [
    'guidelinesEnabled',
    'guidelinesShowInFrontend',
    'guidelinesWidth',
    'guidelinesHeight',
];
const RESOLUTION_KEYS: (keyof LayoutSettings)[] = ['guidelinesShowResolution'];

interface GuidelinesSectionProps {
    contextId: string | null;
}

export function GuidelinesSection({ contextId }: GuidelinesSectionProps) {
    const { eff, set, resetKeys, isDirty, level } = useLayoutSetting(contextId);

    const [w, wOv] = eff('guidelinesWidth');
    const [h, hOv] = eff('guidelinesHeight');
    const [showFe, showFeOv] = eff('guidelinesShowInFrontend');
    const [enabled, enabledOv] = eff('guidelinesEnabled');
    const [showRes, showResOv] = eff('guidelinesShowResolution');

    const effectiveW = (w ?? 1280) as number;
    const effectiveH = (h ?? 800) as number;
    const effectiveShowFe = (showFe ?? true) as boolean;
    const effectiveEnabled = (enabled ?? true) as boolean;
    const effectiveShowRes = (showRes ?? true) as boolean;

    const cardStyle = { background: 'var(--app-surface)', border: '1px solid var(--app-border)' };

    return (
        <div className="space-y-4">
            {/* ── Guidelines ─────────────────────────────────────────────── */}
            <div className="rounded-xl p-6 space-y-4" style={cardStyle}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Hilfslinien
                        </h2>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Rote gestrichelte Linien für die Ziel-Bildschirmgröße. Breite und Höhe sind das ganze Gerät;
                            die waagerechte Linie berücksichtigt Header und Tab-/Bereichs-Leiste, damit Editor und
                            Frontend übereinstimmen.
                        </p>
                    </div>
                    <ResetDefaultsButton
                        onReset={() => resetKeys(GUIDELINE_KEYS)}
                        disabled={!isDirty(GUIDELINE_KEYS)}
                        scoped={level !== 'global'}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <ToggleRow
                        label="Aktiv"
                        value={effectiveEnabled}
                        isOverridden={enabledOv}
                        onChange={(v) => set('guidelinesEnabled', v)}
                        info={<OverrideState contextId={contextId} keys={['guidelinesEnabled']} label="Aktiv" />}
                    />
                    <ToggleRow
                        label="Im Frontend anzeigen"
                        value={effectiveShowFe}
                        isOverridden={showFeOv}
                        onChange={(v) => set('guidelinesShowInFrontend', v)}
                        info={
                            <OverrideState
                                contextId={contextId}
                                keys={['guidelinesShowInFrontend']}
                                label="Im Frontend anzeigen"
                            />
                        }
                    />

                    <SliderSetting
                        label="Breite"
                        value={effectiveW}
                        min={320}
                        max={3840}
                        step={10}
                        unit=" px"
                        onChange={(v) => set('guidelinesWidth', v)}
                        isOverridden={wOv}
                        info={
                            <OverrideState
                                contextId={contextId}
                                keys={['guidelinesWidth']}
                                label="Breite"
                                format={(_, v) => `${v} px`}
                            />
                        }
                        presets={[
                            { label: '768', value: 768 },
                            { label: '1024', value: 1024 },
                            { label: '1280', value: 1280 },
                            { label: '1920', value: 1920 },
                        ]}
                    />

                    <SliderSetting
                        label="Höhe"
                        value={effectiveH}
                        min={320}
                        max={2160}
                        step={10}
                        unit=" px"
                        onChange={(v) => set('guidelinesHeight', v)}
                        isOverridden={hOv}
                        info={
                            <OverrideState
                                contextId={contextId}
                                keys={['guidelinesHeight']}
                                label="Höhe"
                                format={(_, v) => `${v} px`}
                            />
                        }
                        presets={[
                            { label: '600', value: 600 },
                            { label: '768', value: 768 },
                            { label: '800', value: 800 },
                            { label: '1024', value: 1024 },
                            { label: '1080', value: 1080 },
                        ]}
                    />
                </div>
            </div>

            {/* ── Resolution ─────────────────────────────────────────────── */}
            <div className="rounded-xl p-6 space-y-4" style={cardStyle}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Auflösung
                        </h2>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Blendet die aktuelle Bildschirmauflösung des Geräts als Badge ein — unabhängig von den
                            Hilfslinien.
                        </p>
                    </div>
                    <ResetDefaultsButton
                        onReset={() => resetKeys(RESOLUTION_KEYS)}
                        disabled={!isDirty(RESOLUTION_KEYS)}
                        scoped={level !== 'global'}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <ToggleRow
                        label="Auflösung anzeigen"
                        value={effectiveShowRes}
                        isOverridden={showResOv}
                        onChange={(v) => set('guidelinesShowResolution', v)}
                        info={
                            <OverrideState
                                contextId={contextId}
                                keys={['guidelinesShowResolution']}
                                label="Auflösung anzeigen"
                            />
                        }
                    />
                </div>
            </div>
        </div>
    );
}
