import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Search, X, Check } from 'lucide-react';
import { useDatapointList, type DatapointEntry } from '../../hooks/useDatapointList';
import { useT } from '../../i18n';
import { isRelevantDp } from '../../utils/dpRelevance';

interface DatapointPickerProps {
  currentValue: string;
  onSelect: (id: string, unit?: string, name?: string, role?: string, dpType?: string) => void;
  onClose: () => void;
  /** When true: show checkboxes + confirm button instead of immediate single-select */
  multiSelect?: boolean;
  onMultiSelect?: (picks: DatapointEntry[]) => void;
  /** Restrict selectable datapoints to these types (e.g. ['boolean']) */
  allowedTypes?: string[];
}

const MAX_DISPLAY = 250;

export function DatapointPicker({ currentValue, onSelect, onClose, multiSelect, onMultiSelect, allowedTypes }: DatapointPickerProps) {
  const t = useT();
  const { datapoints, loading, loaded, load } = useDatapointList();
  // Pre-fill search with the current value so the DP is immediately visible.
  // The user can delete characters from the end to broaden the search.
  const [search, setSearch] = useState(() => currentValue ?? '');
  const [adapter, setAdapter] = useState('');
  const [room, setRoom] = useState('');
  const [func, setFunc] = useState('');
  const [role, setRole] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [size, setSize] = useState({ w: 1080, h: 600 });
  const [pos, setPos] = useState(() => ({
    x: Math.round((window.innerWidth  - 1080) / 2),
    y: Math.round((window.innerHeight - 600) / 2),
  }));
  // Refs hold snapshot values captured at drag/resize start to avoid stale closures.
  const posRef  = useRef(pos);
  const sizeRef = useRef(size);
  const dragOrigin   = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const resizeOrigin = useRef<{ mx: number; my: number; pw: number; ph: number } | null>(null);

  const onDragMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: posRef.current.x, py: posRef.current.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragOrigin.current) return;
      const { mx, my, px, py } = dragOrigin.current;
      const next = {
        x: Math.max(0, Math.min(window.innerWidth  - sizeRef.current.w, px + ev.clientX - mx)),
        y: Math.max(0, Math.min(window.innerHeight - sizeRef.current.h, py + ev.clientY - my)),
      };
      posRef.current = next;
      setPos(next);
    };
    const onUp = () => {
      dragOrigin.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeOrigin.current = { mx: e.clientX, my: e.clientY, pw: sizeRef.current.w, ph: sizeRef.current.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeOrigin.current) return;
      const { mx, my, pw, ph } = resizeOrigin.current;
      const next = {
        w: Math.max(480, Math.min(window.innerWidth  - posRef.current.x - 16, pw + ev.clientX - mx)),
        h: Math.max(300, Math.min(window.innerHeight - posRef.current.y - 16, ph + ev.clientY - my)),
      };
      sizeRef.current = next;
      setSize(next);
    };
    const onUp = () => {
      resizeOrigin.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // Cancel any drag active in underlying RGL when the picker opens.
  // react-draggable listens on document, not window.
  useEffect(() => {
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, []);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const adapters = useMemo(
    () => Array.from(new Set(datapoints.map((dp) => dp.id.split('.')[0]))).sort(),
    [datapoints],
  );
  const rooms = useMemo(() => Array.from(new Set(datapoints.flatMap((dp) => dp.rooms))).sort(), [datapoints]);
  const funcs = useMemo(() => Array.from(new Set(datapoints.flatMap((dp) => dp.funcs))).sort(), [datapoints]);
  const roles = useMemo(() => Array.from(new Set(datapoints.map((dp) => dp.role).filter(Boolean) as string[])).sort(), [datapoints]);
  const types = useMemo(() => {
    const all = Array.from(new Set(datapoints.map((dp) => dp.type).filter(Boolean) as string[])).sort();
    return allowedTypes?.length ? all.filter((ty) => allowedTypes.includes(ty)) : all;
  }, [datapoints, allowedTypes]);

  const filtered = useMemo(() => {
    let list = datapoints;
    if (allowedTypes?.length) list = list.filter((dp) => dp.type != null && allowedTypes.includes(dp.type));
    if (adapter) list = list.filter((dp) => dp.id.startsWith(adapter + '.'));
    if (room) list = list.filter((dp) => dp.rooms.includes(room));
    if (func) list = list.filter((dp) => dp.funcs.includes(func));
    if (role) list = list.filter((dp) => dp.role === role);
    if (typeFilter) list = list.filter((dp) => dp.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((dp) => dp.id.toLowerCase().includes(q) || dp.name.toLowerCase().includes(q));
    }
    return list;
  }, [datapoints, search, adapter, room, func, role, typeFilter, allowedTypes]);

  const shown = useMemo(() => filtered.slice(0, MAX_DISPLAY), [filtered]);

  const countLabel = filtered.length > MAX_DISPLAY
    ? t('dp.picker.showing', { max: MAX_DISPLAY, count: filtered.length })
    : t('dp.picker.count', { count: filtered.length });

  const toggleCheck = (dp: DatapointEntry) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(dp.id) ? next.delete(dp.id) : next.add(dp.id);
      return next;
    });
  };
  const selectAllShown = () => setCheckedIds(prev => {
    const next = new Set(prev);
    shown.forEach(dp => next.add(dp.id));
    return next;
  });
  const selectRelevantShown = () => setCheckedIds(prev => {
    const next = new Set(prev);
    shown.filter(dp => isRelevantDp(dp.role, dp.type)).forEach(dp => next.add(dp.id));
    return next;
  });
  const clearAll = () => setCheckedIds(new Set());
  const confirmMulti = () => {
    const picks = datapoints.filter(dp => checkedIds.has(dp.id));
    onMultiSelect?.(picks);
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 z-[9999]"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div
        className="rounded-xl flex flex-col shadow-2xl"
        style={{
          background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
          border: '1px solid var(--app-border)',
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: size.w,
          height: size.h,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header – drag handle */}
        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--app-border)', cursor: 'move', userSelect: 'none' }}
          onMouseDown={onDragMouseDown}
        >
          <h2 className="font-bold flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>
            {t('dp.picker.title')}
          </h2>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs hover:opacity-80 disabled:opacity-40 transition-opacity"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {t('dp.picker.refresh')}
          </button>
          <button onClick={onClose} className="hover:opacity-60 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Filter bar – row 1: search (full width); row 2: all dropdowns */}
        <div className="px-5 py-3 shrink-0 space-y-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
          {/* Row 1 – search */}
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
          >
            <Search size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('dp.picker.search')}
              className="flex-1 min-w-0 text-sm bg-transparent focus:outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
                <X size={12} />
              </button>
            )}
          </div>
          {/* Row 2 – filter dropdowns */}
          {(adapters.length > 0 || rooms.length > 0 || funcs.length > 0 || roles.length > 0 || types.length > 1 || allowedTypes?.length === 1) && (
            <div className="flex items-center gap-2">
          {adapters.length > 0 && (
            <select
              value={adapter}
              onChange={(e) => setAdapter(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
            >
              <option value="">{t('dp.picker.allAdapters')}</option>
              {adapters.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}
          {rooms.length > 0 && (
            <select value={room} onChange={(e) => setRoom(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
              <option value="">{t('dp.picker.allRooms')}</option>
              {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {funcs.length > 0 && (
            <select value={func} onChange={(e) => setFunc(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
              <option value="">{t('dp.picker.allFuncs')}</option>
              {funcs.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          {roles.length > 0 && (
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
              <option value="">{t('dp.picker.allRoles')}</option>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {types.length > 1 && (
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg px-3 py-1.5 text-xs focus:outline-none shrink-0"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
              <option value="">{t('dp.picker.allTypes')}</option>
              {types.map((ty) => {
                const tc = ty === 'boolean' ? '#f59e0b' : ty === 'number' ? '#3b82f6' : ty === 'string' ? '#8b5cf6' : 'var(--text-primary)';
                return <option key={ty} value={ty} style={{ color: tc }}>{ty}</option>;
              })}
            </select>
          )}
          {allowedTypes?.length === 1 && (() => {
            const ty = allowedTypes[0];
            const tc = ty === 'boolean' ? '#f59e0b' : ty === 'number' ? '#3b82f6' : ty === 'string' ? '#8b5cf6' : 'var(--accent)';
            return (
              <span className="text-[10px] px-2 py-1 rounded font-medium shrink-0"
                style={{ background: tc + '22', color: tc }}>
                {t('dp.picker.typeHint', { type: ty })}
              </span>
            );
          })()}
            </div>
          )}
        </div>

        {/* Count + multi-select controls */}
        {loaded && (
          <div className="px-5 py-1.5 shrink-0 flex items-center gap-3" style={{ borderBottom: '1px solid var(--app-border)' }}>
            <p className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>
              {countLabel}
              {multiSelect && checkedIds.size > 0 && (
                <span className="ml-2 font-medium" style={{ color: 'var(--accent)' }}>
                  · {checkedIds.size} ausgewählt
                </span>
              )}
            </p>
            {multiSelect && (
              <div className="flex gap-2">
                <button onClick={selectRelevantShown}
                  className="text-[10px] hover:opacity-70 px-2 py-0.5 rounded"
                  style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                  Relevante
                </button>
                <button onClick={selectAllShown}
                  className="text-[10px] hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                  Alle
                </button>
                <button onClick={clearAll}
                  className="text-[10px] hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                  Keine
                </button>
              </div>
            )}
          </div>
        )}

        {/* List */}
        <div className="aura-scroll flex-1 overflow-y-auto">
          {!loaded && loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <div
                className="w-5 h-5 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('dp.picker.loading')}</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('dp.picker.noResults')}</p>
            </div>
          ) : (
            shown.map((dp) => {
              const isSelected = dp.id === currentValue;
              const isChecked  = checkedIds.has(dp.id);
              const relevant   = isRelevantDp(dp.role, dp.type);
              return (
                <button
                  key={dp.id}
                  onClick={() => multiSelect ? toggleCheck(dp) : (onSelect(dp.id, dp.unit, dp.name, dp.role, dp.type), onClose())}
                  className="w-full text-left px-5 py-2.5 flex items-center gap-3 hover:opacity-80 transition-opacity"
                  style={{
                    background: (multiSelect ? isChecked : isSelected)
                      ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                    borderBottom: '1px solid var(--app-border)',
                    opacity: multiSelect && !relevant ? 0.55 : 1,
                  }}
                >
                  {multiSelect && (
                    <div className="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center"
                      style={{ background: isChecked ? 'var(--accent)' : 'var(--app-border)', flexShrink: 0 }}>
                      {isChecked && <Check size={9} color="#fff" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: (multiSelect ? isChecked : isSelected) ? 'var(--accent)' : 'var(--text-primary)' }}
                    >
                      {dp.name || dp.id.split('.').pop() || dp.id}
                    </p>
                    <p className="font-mono text-[11px] truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {dp.id}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {dp.unit && (
                      <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{dp.unit}</span>
                    )}
                    {dp.type && (() => {
                      const tc = dp.type === 'boolean' ? '#f59e0b'
                               : dp.type === 'number'  ? '#3b82f6'
                               : dp.type === 'string'  ? '#8b5cf6'
                               : 'var(--accent)';
                      return (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{ background: tc + '22', color: tc }}
                        >
                          {dp.type}
                        </span>
                      );
                    })()}
                    {dp.logging.map((adapterId) => {
                      const adapterName = adapterId.replace(/\.\d+$/, '');
                      const label = adapterName === 'history'  ? 'H'
                                  : adapterName === 'influxdb' ? 'flux'
                                  : adapterName === 'sql'      ? 'SQL'
                                  : adapterName.slice(0, 4);
                      return (
                        <span
                          key={adapterId}
                          title={adapterId}
                          className="text-[9px] px-1 py-0.5 rounded font-bold"
                          style={{ background: '#10b98122', color: '#10b981' }}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Multi-select confirm footer */}
        {multiSelect && (
          <div className="px-5 py-3 shrink-0 flex gap-2 justify-end"
            style={{ borderTop: '1px solid var(--app-border)' }}>
            <button onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
              Abbrechen
            </button>
            <button onClick={confirmMulti} disabled={checkedIds.size === 0}
              className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80 disabled:opacity-30 flex items-center gap-1.5"
              style={{ background: 'var(--accent-green, #22c55e)' }}>
              <Check size={14} /> {checkedIds.size} hinzufügen
            </button>
          </div>
        )}

        {/* Resize handle – bottom-right corner */}
        <div
          onMouseDown={onResizeMouseDown}
          title="Größe ändern"
          style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 18, height: 18,
            cursor: 'nwse-resize',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
            padding: '3px',
            borderBottomRightRadius: '0.75rem',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M9 1L1 9M9 5L5 9M9 9" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          </svg>
        </div>
      </div>
    </div>,
    document.body,
  );
}
