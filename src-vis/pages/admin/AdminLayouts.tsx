import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Copy, Trash2, Check, X, ExternalLink, LayoutDashboard, Star } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import type { DashboardLayout } from '../../store/dashboardStore';
import { useT } from '../../i18n';

function layoutUrl(layout: DashboardLayout, isFirst: boolean): string {
  return isFirst ? '#/' : `#/view/${layout.slug}`;
}

const inputCls = 'text-sm rounded-xl px-3 py-2 focus:outline-none w-full';
const inputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

// ── Layout row ────────────────────────────────────────────────────────────────

function LayoutRow({
  layout,
  isOnly,
  isFirst,
}: {
  layout: DashboardLayout;
  isOnly: boolean;
  isFirst: boolean;
}) {
  const t = useT();
  const { renameLayout, setLayoutSlug, duplicateLayout, removeLayout, setActiveLayout, setDefaultTab } = useDashboardStore();
  const navigate = useNavigate();

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(layout.name);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugVal, setSlugVal] = useState(layout.slug);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dupName, setDupName] = useState(`${layout.name} (Kopie)`);
  const [showDup, setShowDup] = useState(false);

  const widgetCount = layout.tabs.reduce((n, tab) => n + tab.widgets.length, 0);
  const hash = layoutUrl(layout, isFirst);

  const commitName = () => {
    if (nameVal.trim()) renameLayout(layout.id, nameVal.trim());
    else setNameVal(layout.name);
    setEditingName(false);
  };

  const commitSlug = () => {
    const s = slugVal.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (s) setLayoutSlug(layout.id, s);
    else setSlugVal(layout.slug);
    setEditingSlug(false);
  };

  const openInEditor = () => {
    setActiveLayout(layout.id);
    navigate('/admin/editor');
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--app-surface)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
          <LayoutDashboard size={16} />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setNameVal(layout.name); setEditingName(false); } }}
                className="text-sm rounded-lg px-2 py-1 focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
              />
              <button onClick={commitName} className="hover:opacity-70" style={{ color: 'var(--accent-green)' }}><Check size={14} /></button>
              <button onClick={() => { setNameVal(layout.name); setEditingName(false); }} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>{layout.name}</span>
              <button onClick={() => setEditingName(true)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                <Pencil size={12} />
              </button>
            </div>
          )}

          {/* Slug / URL */}
          {!isFirst && editingSlug ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>#/view/</span>
              <input
                autoFocus
                value={slugVal}
                onChange={(e) => setSlugVal(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                onKeyDown={(e) => { if (e.key === 'Enter') commitSlug(); if (e.key === 'Escape') { setSlugVal(layout.slug); setEditingSlug(false); } }}
                onBlur={commitSlug}
                className="text-[10px] font-mono rounded px-1.5 py-0.5 focus:outline-none w-32"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-0.5">
              <a
                href={hash}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                {hash}
              </a>
              {!isFirst && (
                <button onClick={() => { setSlugVal(layout.slug); setEditingSlug(true); }}
                  className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  <Pencil size={10} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="text-right shrink-0">
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{layout.tabs.length} Tab{layout.tabs.length !== 1 ? 's' : ''}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{widgetCount} Widget{widgetCount !== 1 ? 's' : ''}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={hash}
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title={t('layouts.open')}
          >
            <ExternalLink size={13} />
          </a>
          <button
            onClick={openInEditor}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium hover:opacity-80"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Pencil size={12} /> {t('layouts.edit')}
          </button>
          <button
            onClick={() => setShowDup(!showDup)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title={t('common.duplicate')}
          >
            <Copy size={13} />
          </button>
          {!isOnly && (
            confirmDelete ? (
              <>
                <button onClick={() => removeLayout(layout.id)}
                  className="px-2 h-7 text-xs text-white rounded-lg hover:opacity-80"
                  style={{ background: 'var(--accent-red)' }}>{t('common.delete')}</button>
                <button onClick={() => setConfirmDelete(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                  <X size={13} />
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                style={{ background: 'var(--app-bg)', color: 'var(--accent-red)', border: '1px solid var(--app-border)' }}
                title={t('layouts.delete')}
              >
                <Trash2 size={13} />
              </button>
            )
          )}
        </div>
      </div>

      {/* Duplicate panel */}
      {showDup && (
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'var(--app-bg)', borderTop: '1px solid var(--app-border)' }}>
          <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('layouts.duplicateName')}</span>
          <input
            value={dupName}
            onChange={(e) => setDupName(e.target.value)}
            className={`${inputCls} flex-1`}
            style={inputStyle}
            onKeyDown={(e) => { if (e.key === 'Enter') { duplicateLayout(layout.id, dupName); setShowDup(false); } }}
          />
          <button
            onClick={() => { duplicateLayout(layout.id, dupName); setShowDup(false); }}
            className="px-3 py-2 rounded-xl text-xs font-medium text-white hover:opacity-80 shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            {t('layouts.duplicate')}
          </button>
          <button onClick={() => setShowDup(false)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tab list */}
      <div className="px-4 py-2 flex flex-wrap gap-1.5 items-center" style={{ borderTop: '1px solid var(--app-border)' }}>
        <span className="text-[10px] shrink-0 mr-1" style={{ color: 'var(--text-secondary)' }}>{t('layouts.defaultTab')}:</span>
        {layout.tabs.map((tab) => {
          const isDefault = (layout.defaultTabId ?? layout.tabs[0]?.id) === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setDefaultTab(layout.id, tab.id)}
              title={t('layouts.setDefaultTab')}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors"
              style={{
                background: isDefault ? 'var(--accent)22' : 'var(--app-surface)',
                color: isDefault ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${isDefault ? 'var(--accent)' : 'var(--app-border)'}`,
              }}
            >
              {isDefault && <Star size={9} fill="currentColor" />}
              {tab.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AdminLayouts() {
  const t = useT();
  const { layouts, addLayout } = useDashboardStore();
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const handleCreate = () => {
    const name = newName.trim() || t('layouts.newLayout');
    addLayout(name);
    setNewName('');
    setShowNew(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{t('layouts.title')}</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {t('layouts.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white hover:opacity-80"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={14} /> {t('layouts.newLayout')}
        </button>
      </div>

      {/* New layout form */}
      {showNew && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false); }}
            placeholder={t('layouts.placeholder')}
            className={`${inputCls} flex-1`}
            style={inputStyle}
          />
          <button onClick={handleCreate}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white hover:opacity-80 shrink-0"
            style={{ background: 'var(--accent)' }}>
            {t('layouts.create')}
          </button>
          <button onClick={() => setShowNew(false)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Layout list */}
      <div className="space-y-3">
        {layouts.map((layout) => (
          <LayoutRow key={layout.id} layout={layout} isOnly={layouts.length === 1} isFirst={layouts[0]?.id === layout.id} />
        ))}
      </div>

      {/* URL reference */}
      <div className="rounded-xl p-4 text-xs space-y-1" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--text-secondary)' }}>
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('layouts.urlSchema')}</p>
        <p><span className="font-mono" style={{ color: 'var(--accent)' }}>#/</span> — {t('layouts.default')}</p>
        <p><span className="font-mono" style={{ color: 'var(--accent)' }}>#/view/:slug</span> — {t('layouts.specific')}</p>
        <p><span className="font-mono" style={{ color: 'var(--accent)' }}>#/view/:slug/tab/:tabSlug</span> — {t('layouts.specificTab')}</p>
      </div>
    </div>
  );
}
