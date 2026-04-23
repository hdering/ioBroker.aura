interface Props {
  options: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  onOpenPicker: () => void;
}

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty: React.CSSProperties = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="relative w-9 h-5 rounded-full transition-colors shrink-0"
      style={{ background: value ? 'var(--accent)' : 'var(--app-border)' }}>
      <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
        style={{ left: value ? '18px' : '2px' }} />
    </button>
  );
}

export function HtmlConfig({ options: o, onChange, onOpenPicker }: Props) {
  const set = (patch: Record<string, unknown>) => onChange(patch);

  return (
    <>
      {/* Datenpunkt */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
          Datenpunkt (optional)
        </label>
        <div className="flex gap-1">
          <input
            type="text"
            value={(o.htmlDatapoint as string) ?? ''}
            onChange={(e) => set({ htmlDatapoint: e.target.value || undefined })}
            placeholder="z.B. javascript.0.myHtml"
            className={iCls + ' flex-1 font-mono min-w-0'}
            style={iSty}
          />
          <button type="button" onClick={onOpenPicker}
            className="px-2 rounded-lg shrink-0"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>…</button>
        </div>
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
          Wenn gesetzt, wird der DP-Wert als HTML angezeigt (überschreibt statisches HTML).
        </p>
      </div>

      {/* Static HTML */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
          Statisches HTML
        </label>
        <textarea
          value={(o.htmlContent as string) ?? ''}
          onChange={(e) => set({ htmlContent: e.target.value || undefined })}
          placeholder="<b>Hallo</b> <span style='color:red'>Welt</span>"
          rows={6}
          className={iCls}
          style={{ ...iSty, resize: 'vertical', fontFamily: 'monospace', lineHeight: 1.5 }}
        />
      </div>

      {/* Scrollable */}
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Scrollen erlauben</label>
        <Toggle
          value={(o.scrollable as boolean) ?? true}
          onToggle={() => set({ scrollable: !((o.scrollable as boolean) ?? true) })}
        />
      </div>
    </>
  );
}
