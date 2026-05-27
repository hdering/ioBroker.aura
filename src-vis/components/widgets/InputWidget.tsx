import { useEffect, useRef, useState } from 'react';
import { TextCursorInput, Send } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { CustomGridView } from './CustomGridView';

type SubmitMode = 'live' | 'submit';

export function InputWidget({ config }: WidgetProps) {
  const o      = config.options ?? {};
  const layout = config.layout ?? 'default';
  const { setState } = useIoBroker();

  const multiline    = !!o.multiline;
  const submitMode   = ((o.submitMode as SubmitMode) ?? 'submit');
  const placeholder  = (o.placeholder as string) ?? '';
  const maxLength    = (o.maxLength as number) || undefined;
  const readOnly     = !!o.readOnly;
  const showTitle    = o.showTitle  !== false;
  const showIcon     = o.showIcon   !== false;
  const showSubmit   = o.showSubmit !== false;
  const titleAlign   = (o.titleAlign as string) ?? 'left';
  const iconSize     = (o.iconSize as number) || 20;
  const WidgetIcon   = getWidgetIcon(o.icon as string | undefined, TextCursorInput);

  const { value: rawVal } = useDatapoint(config.datapoint);
  const dpString = rawVal == null ? '' : String(rawVal);

  // In submit mode we keep a local draft so the user can type without
  // every keystroke being written. In live mode we still keep a local
  // draft to avoid input-lag (controlled-component round-trip).
  const [draft, setDraft]   = useState<string>(dpString);
  const [dirty, setDirty]   = useState(false);
  const lastSeenDp          = useRef<string>(dpString);

  // Sync local draft when DP changes externally (unless the user is currently editing).
  useEffect(() => {
    if (dpString !== lastSeenDp.current) {
      lastSeenDp.current = dpString;
      if (!dirty) setDraft(dpString);
    }
  }, [dpString, dirty]);

  const writeValue = (v: string) => {
    setState(config.datapoint, v);
    lastSeenDp.current = v;
  };

  const commit = () => {
    if (draft === lastSeenDp.current) {
      setDirty(false);
      return;
    }
    writeValue(draft);
    setDirty(false);
  };

  const onChange = (v: string) => {
    setDraft(v);
    if (submitMode === 'live') {
      writeValue(v);
      setDirty(false);
    } else {
      setDirty(v !== lastSeenDp.current);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (readOnly || submitMode === 'live') return;
    // Enter submits in single-line mode; Ctrl/Cmd+Enter submits in multiline mode.
    if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(lastSeenDp.current);
      setDirty(false);
      (e.currentTarget as HTMLElement).blur();
    }
  };

  const inputClass = 'nodrag w-full text-sm rounded-lg px-2.5 py-1.5 focus:outline-none';
  const inputStyle: React.CSSProperties = {
    background: 'var(--app-bg)',
    color:      'var(--text-primary)',
    border:     '1px solid var(--app-border)',
  };

  const inputEl = multiline ? (
    <textarea
      className={`aura-widget-action ${inputClass} resize-none flex-1`}
      style={{ ...inputStyle, minHeight: 0 }}
      value={draft}
      placeholder={placeholder}
      readOnly={readOnly}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={submitMode === 'submit' ? commit : undefined}
    />
  ) : (
    <input
      type="text"
      className={`aura-widget-action ${inputClass}`}
      style={inputStyle}
      value={draft}
      placeholder={placeholder}
      readOnly={readOnly}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={submitMode === 'submit' ? commit : undefined}
    />
  );

  const renderSubmitButton = (alwaysActive = false, fillContainer = alwaysActive) => {
    if (readOnly) return null;
    if (!alwaysActive && !(submitMode === 'submit' && showSubmit)) return null;
    return (
      <button
        type="button"
        onClick={commit}
        disabled={!dirty}
        title="Senden"
        className={`nodrag shrink-0 ${fillContainer ? 'w-full h-full' : ''} min-h-[28px] px-2.5 py-1.5 rounded-lg transition-opacity disabled:opacity-40 hover:opacity-80 flex items-center justify-center`}
        style={{
          background: dirty ? 'var(--accent)' : 'var(--app-bg)',
          color:      dirty ? '#fff'          : 'var(--text-secondary)',
          border:     `1px solid ${dirty ? 'var(--accent)' : 'var(--app-border)'}`,
        }}
      >
        <Send size={14} />
      </button>
    );
  };

  const submitButton = renderSubmitButton();

  if (layout === 'custom') {
    // In custom mode the user freely places cells; the Senden-Button is
    // always available (even in live mode, in case the user wants it).
    const iconEl = showIcon ? (
      <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)' }} />
    ) : null;
    return (
      <CustomGridView
        config={config}
        value={draft}
        extraComponents={{
          input:  inputEl,
          submit: renderSubmitButton(true),
          icon:   iconEl,
        }}
      />
    );
  }

  return (
    <div className="aura-widget-row flex flex-col h-full gap-1.5">
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-2 shrink-0">
          {showIcon && (
            <WidgetIcon
              className="aura-widget-icon"
              size={iconSize}
              style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
            />
          )}
          {showTitle && (
            <p
              className="aura-widget-title text-xs truncate flex-1 min-w-0"
              style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}
            >
              {config.title}
            </p>
          )}
        </div>
      )}
      <div className={`flex ${multiline ? 'flex-1 min-h-0' : 'items-center'} gap-2`}>
        {multiline ? inputEl : <div className="flex-1 min-w-0">{inputEl}</div>}
        {!multiline && submitButton}
      </div>
      {multiline && submitButton && (
        <div className="flex justify-end shrink-0">{submitButton}</div>
      )}
    </div>
  );
}
