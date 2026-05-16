import { createPortal } from 'react-dom';
import { useT } from '../../i18n';
import { usePortalTarget } from '../../contexts/PortalTargetContext';

export function ConfirmOverlay({
  text,
  onConfirm,
  onCancel,
  popup,
}: {
  text?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Render as centered modal via portal — for use in small containers (e.g. universal-widget cells). */
  popup?: boolean;
}) {
  const t = useT();
  const portalTarget = usePortalTarget();
  const prompt = text || t('widget.confirm.defaultPrompt');

  if (popup) {
    return createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center z-[400] p-4"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={(e) => { e.stopPropagation(); onCancel(); }}
      >
        <div
          className="rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-4 max-w-xs"
          style={{ background: 'var(--app-card)', border: '1px solid var(--app-border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm text-center font-medium" style={{ color: 'var(--text-primary)' }}>
            {prompt}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              {t('common.yes')}
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>,
      portalTarget,
    );
  }

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-widget z-10"
      style={{ background: 'color-mix(in srgb, var(--app-card) 92%, transparent)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs text-center px-3 font-medium" style={{ color: 'var(--text-primary)' }}>
        {prompt}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
        >
          {t('common.yes')}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
