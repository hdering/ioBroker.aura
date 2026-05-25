import { useLayoutSetting } from '../shared/useLayoutSetting';
import { LayoutContextSwitcher } from '../shared/LayoutContextSwitcher';
import { useDashboardStore } from '../../../../store/dashboardStore';
import { useT } from '../../../../i18n';

interface CustomJsSectionProps {
  contextId: string | null;
  onContextChange: (id: string | null) => void;
}

export function CustomJsSection({ contextId, onContextChange }: CustomJsSectionProps) {
  const t = useT();
  const { ls, updateFrontend, updateLayoutSettings } = useLayoutSetting(contextId);
  const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);
  const { frontend } = useLayoutSetting(contextId);

  const jsEnabled  = (ls?.customJSEnabled  ?? frontend.customJSEnabled)  ?? false;
  const jsInEditor = (ls?.customJSInEditor ?? frontend.customJSInEditor) ?? false;
  const jsValue    = ls?.customJS ?? frontend.customJS ?? '';

  function setJs(patch: Partial<{ customJS: string; customJSEnabled: boolean; customJSInEditor: boolean }>) {
    if (!contextId) updateFrontend(patch as never);
    else updateLayoutSettings(contextId, patch);
  }

  return (
    <div className="rounded-xl p-6" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('theme.js.title')}</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <LayoutContextSwitcher selectedId={contextId} onChange={onContextChange} />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('theme.js.enabled')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={jsEnabled}
              onClick={() => setJs({ customJSEnabled: !jsEnabled })}
              className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
              style={{ background: jsEnabled ? 'var(--accent)' : 'var(--app-border)' }}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5"
                style={{ transform: jsEnabled ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </button>
          </label>
        </div>
      </div>
      {contextId && (ls?.customJS !== undefined || ls?.customJSEnabled !== undefined || ls?.customJSInEditor !== undefined) && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}>
            Layout-JS aktiv
          </span>
          <button
            onClick={() => {
              clearLayoutSettings(contextId, 'customJS');
              clearLayoutSettings(contextId, 'customJSEnabled');
              clearLayoutSettings(contextId, 'customJSInEditor');
            }}
            className="text-[10px] hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
          >
            ↩ Auf Global zurücksetzen
          </button>
        </div>
      )}
      <label className="flex items-center gap-2 cursor-pointer select-none mb-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <button
          type="button"
          role="switch"
          aria-checked={jsInEditor}
          onClick={() => setJs({ customJSInEditor: !jsInEditor })}
          disabled={!jsEnabled}
          className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40"
          style={{ background: jsInEditor ? 'var(--accent)' : 'var(--app-border)' }}
        >
          <span
            className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5"
            style={{ transform: jsInEditor ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </button>
        {t('theme.js.inEditor')}
      </label>
      <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{t('theme.js.subtitle')}</p>
      <div
        className="text-[11px] mb-3 px-3 py-2 rounded-lg"
        style={{ background: 'color-mix(in srgb, var(--accent-red, #ef4444) 8%, transparent)', color: 'var(--text-secondary)', border: '1px solid color-mix(in srgb, var(--accent-red, #ef4444) 25%, transparent)' }}
      >
        {t('theme.js.warning')}
      </div>
      <div
        className="text-[11px] mb-3 px-3 py-2 rounded-lg"
        style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--text-secondary)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}
      >
        {t('theme.js.importHint')}
      </div>
      <textarea
        value={jsValue}
        onChange={(e) => setJs({ customJS: e.target.value })}
        disabled={!jsEnabled}
        rows={16}
        spellCheck={false}
        placeholder={`// Helfer-Funktionen, die von Widgets via onClick="test(state.id)" aufgerufen werden.\n// API: window.aura.setState(id, val), aura.getState(id), aura.subscribeState(id, cb)\n\n@import url('https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js');\n\nfunction removeMsg(id) {\n  window.aura.setState('0_userdata.0.messageHandler.removeMsgID', id);\n  console.log('removed: ' + id);\n}`}
        className="w-full rounded-xl px-4 py-3 text-xs font-mono focus:outline-none resize-none disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)', lineHeight: 1.7 }}
      />
      <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
        {jsValue.trim()
          ? t('theme.js.lines', { count: String(jsValue.split('\n').length) })
          : t('theme.js.empty')}
      </p>
    </div>
  );
}
