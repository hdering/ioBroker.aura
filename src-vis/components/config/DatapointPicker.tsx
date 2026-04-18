import { useState, useEffect, useMemo, useRef } from 'react';
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
}

const MAX_DISPLAY = 250;

export function DatapointPicker({ currentValue, onSelect, onClose, multiSelect, onMultiSelect }: DatapointPickerProps) {
  const t = useT();
  const { datapoints, loading, loaded, load } = useDatapointList();
  const [search, setSearch] = useState('');
  const [adapter, setAdapter] = useState(() => currentValue ? currentValue.split('.')[0] : '');
  const [room, setRoom] = useState('');
  const [func, setFunc] = useState('');
  const [role, setRole] = useState('');
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  useEffect(() => {
    if (loaded && selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }, [loaded]);

  const adapters = useMemo(
    () => Array.from(new Set(datapoints.map((dp) => dp.id.split('.')[0]))).sort(),
    [datapoints],
  );
  const rooms = useMemo(() => Array.from(new Set(datapoints.flatMap((dp) => dp.rooms))).sort(), [datapoints]);
  const funcs = useMemo(() => Array.from(new Set(datapoints.flatMap((dp) => dp.funcs))).sort(), [datapoints]);
  const roles = useMemo(() => Array.from(new Set(datapoints.map((dp) => dp.role).filter(Boolean) as string[])).sort(), [datapoints]);

  const filtered = useMemo(() => {
    let list = datapoints;
    if (adapter) list = list.filter((dp) => dp.id.startsWith(adapter + '.'));
    if (room) list = list.filter((dp) => dp.rooms.includes(room));
    if (func) list = list.filter((dp) => dp.funcs.includes(func));
    if (role) list = list.filter((dp) => dp.role === role);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((dp) => dp.id.toLowerCase().includes(q) || dp.name.toLowerCase().includes(q));
    }
    return list;
  }, [datapoints, search, adapter, room, func, role]);

  const shown = filtered.slice(0, MAX_DISPLAY);
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
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4"
    >
      <div
        className="rounded-xl w-full max-w-2xl flex flex-col shadow-2xl"
        style={{
          background: 'var(--app-surface)',
          border: '1px solid var(--app-border)',
          maxHeight: 'min(80vh, 640px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--app-border)' }}
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

        {/* Filter bar */}
        <div className="px-5 py-3 shrink-0 space-y-2" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div className="flex gap-2">
            <div
              className="flex items-center gap-2 flex-1 rounded-lg px-3 py-2"
              style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
            >
              <Search size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('dp.picker.search')}
                className="flex-1 text-sm bg-transparent focus:outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              {search && (
                <button onClick={() => setSearch('')} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
                  <X size={12} />
                </button>
              )}
            </div>
            {adapters.length > 0 && (
              <select
                value={adapter}
                onChange={(e) => setAdapter(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              >
                <option value="">{t('dp.picker.allAdapters')}</option>
                {adapters.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}
          </div>
          {(rooms.length > 0 || funcs.length > 0 || roles.length > 0) && (
            <div className="flex gap-2 flex-wrap">
              {rooms.length > 0 && (
                <select value={room} onChange={(e) => setRoom(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                  <option value="">{t('dp.picker.allRooms')}</option>
                  {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              {funcs.length > 0 && (
                <select value={func} onChange={(e) => setFunc(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                  <option value="">{t('dp.picker.allFuncs')}</option>
                  {funcs.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              )}
              {roles.length > 0 && (
                <select value={role} onChange={(e) => setRole(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                  <option value="">{t('dp.picker.allRoles')}</option>
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
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
                  ref={isSelected ? selectedRef : undefined}
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
                      className="font-mono text-xs truncate"
                      style={{ color: (multiSelect ? isChecked : isSelected) ? 'var(--accent)' : 'var(--text-primary)' }}
                    >
                      {dp.id}
                    </p>
                    {dp.name && dp.name !== dp.id.split('.').pop() && (
                      <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {dp.name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {dp.unit && (
                      <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{dp.unit}</span>
                    )}
                    {dp.type && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                      >
                        {dp.type}
                      </span>
                    )}
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
      </div>
    </div>,
    document.body,
  );
}
