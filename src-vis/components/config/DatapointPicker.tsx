import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Search, X } from 'lucide-react';
import { useDatapointList } from '../../hooks/useDatapointList';
import { useT } from '../../i18n';

interface DatapointPickerProps {
  currentValue: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const MAX_DISPLAY = 250;

export function DatapointPicker({ currentValue, onSelect, onClose }: DatapointPickerProps) {
  const t = useT();
  const { datapoints, loading, loaded, load } = useDatapointList();
  const [search, setSearch] = useState('');
  const [adapter, setAdapter] = useState('');

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const adapters = useMemo(
    () => Array.from(new Set(datapoints.map((dp) => dp.id.split('.')[0]))).sort(),
    [datapoints],
  );

  const filtered = useMemo(() => {
    let list = datapoints;
    if (adapter) list = list.filter((dp) => dp.id.startsWith(adapter + '.'));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((dp) => dp.id.toLowerCase().includes(q) || dp.name.toLowerCase().includes(q));
    }
    return list;
  }, [datapoints, search, adapter]);

  const shown = filtered.slice(0, MAX_DISPLAY);
  const countLabel = filtered.length > MAX_DISPLAY
    ? t('dp.picker.showing', { max: MAX_DISPLAY, count: filtered.length })
    : t('dp.picker.count', { count: filtered.length });

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
        <div className="flex gap-2 px-5 py-3 shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
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

        {/* Count */}
        {loaded && (
          <div className="px-5 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{countLabel}</p>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
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
              return (
                <button
                  key={dp.id}
                  onClick={() => { onSelect(dp.id); onClose(); }}
                  className="w-full text-left px-5 py-2.5 flex items-center gap-3 hover:opacity-80 transition-opacity"
                  style={{
                    background: isSelected ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                    borderBottom: '1px solid var(--app-border)',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="font-mono text-xs truncate"
                      style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
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
      </div>
    </div>,
    document.body,
  );
}
