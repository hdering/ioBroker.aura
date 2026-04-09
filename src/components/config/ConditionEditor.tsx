import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Database } from 'lucide-react';
import { DatapointPicker } from './DatapointPicker';
import type { WidgetCondition, ConditionClause, ConditionOperator, ConditionStyle } from '../../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const OPERATORS: { value: ConditionOperator; label: string; noValue?: boolean }[] = [
  { value: '==',       label: '= Gleich' },
  { value: '!=',       label: '≠ Ungleich' },
  { value: '>',        label: '> Größer' },
  { value: '>=',       label: '≥ Größer/gleich' },
  { value: '<',        label: '< Kleiner' },
  { value: '<=',       label: '≤ Kleiner/gleich' },
  { value: 'contains', label: '∋ Enthält' },
  { value: 'true',     label: '✓ Ist wahr', noValue: true },
  { value: 'false',    label: '✗ Ist falsch', noValue: true },
];

const STYLE_FIELDS: { key: keyof ConditionStyle; label: string }[] = [
  { key: 'accent',        label: 'Akzent' },
  { key: 'bg',            label: 'Hintergrund' },
  { key: 'border',        label: 'Rahmen' },
  { key: 'textPrimary',   label: 'Text' },
  { key: 'textSecondary', label: 'Text 2' },
];

const inputStyle: React.CSSProperties = {
  background: 'var(--app-bg)',
  color: 'var(--text-primary)',
  border: '1px solid var(--app-border)',
};
const cls = 'text-xs rounded-lg px-2 py-1.5 focus:outline-none';

function newClause(): ConditionClause {
  return { datapoint: '', operator: '==', value: '' };
}

function newCondition(): WidgetCondition {
  return {
    id: `cond-${Date.now()}`,
    label: '',
    logic: 'AND',
    clauses: [newClause()],
    style: {},
    effect: 'none',
  };
}

// ── Clause row ────────────────────────────────────────────────────────────────

function ClauseRow({
  clause,
  isFirst,
  logic,
  onLogicToggle,
  onChange,
  onDelete,
}: {
  clause: ConditionClause;
  isFirst: boolean;
  logic: 'AND' | 'OR';
  onLogicToggle: () => void;
  onChange: (c: ConditionClause) => void;
  onDelete: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const op = OPERATORS.find((o) => o.value === clause.operator)!;

  return (
    <div className="flex items-center gap-1.5">
      {/* AND/OR toggle or "WENN" label */}
      {isFirst ? (
        <span className="text-[10px] font-semibold w-8 shrink-0 text-center" style={{ color: 'var(--text-secondary)' }}>WENN</span>
      ) : (
        <button
          onClick={onLogicToggle}
          className="text-[10px] font-bold w-8 h-6 rounded shrink-0 hover:opacity-80"
          style={{ background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}
        >
          {logic}
        </button>
      )}

      {/* Datapoint input + picker */}
      <div className="flex gap-0.5 flex-1 min-w-0">
        <input
          type="text"
          value={clause.datapoint}
          onChange={(e) => onChange({ ...clause, datapoint: e.target.value })}
          placeholder="Datenpunkt-ID"
          className={`${cls} flex-1 font-mono min-w-0`}
          style={inputStyle}
        />
        <button
          onClick={() => setShowPicker(true)}
          className="px-1.5 rounded-lg hover:opacity-80 shrink-0"
          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
          title="Aus ioBroker wählen"
        >
          <Database size={11} />
        </button>
      </div>

      {/* Operator */}
      <select
        value={clause.operator}
        onChange={(e) => onChange({ ...clause, operator: e.target.value as ConditionOperator, value: '' })}
        className={`${cls} shrink-0`}
        style={{ ...inputStyle, width: '112px' }}
      >
        {OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Value (hidden for true/false operators) */}
      {!op?.noValue ? (
        <input
          type="text"
          value={clause.value}
          onChange={(e) => onChange({ ...clause, value: e.target.value })}
          placeholder="Wert"
          className={`${cls} w-20 shrink-0`}
          style={inputStyle}
        />
      ) : (
        <div className="w-20 shrink-0" />
      )}

      <button
        onClick={onDelete}
        className="shrink-0 hover:opacity-70"
        style={{ color: 'var(--accent-red)' }}
        title="Klausel entfernen"
      >
        <Trash2 size={12} />
      </button>

      {showPicker && (
        <DatapointPicker
          currentValue={clause.datapoint}
          onSelect={(id) => { onChange({ ...clause, datapoint: id }); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ── Color field ───────────────────────────────────────────────────────────────

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-[10px] w-16 shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type="color"
        value={value ?? '#3b82f6'}
        onChange={(e) => onChange(e.target.value)}
        className="w-6 h-6 rounded cursor-pointer border-0 p-0 shrink-0"
        title={label}
      />
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder="auto"
        className="flex-1 text-[10px] rounded px-1.5 py-1 focus:outline-none min-w-0 font-mono"
        style={inputStyle}
      />
      {value && (
        <button onClick={() => onChange(undefined)} className="shrink-0 hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
          <Trash2 size={10} />
        </button>
      )}
    </div>
  );
}

// ── Single condition rule ─────────────────────────────────────────────────────

function ConditionRule({
  condition,
  onChange,
  onDelete,
}: {
  condition: WidgetCondition;
  onChange: (c: WidgetCondition) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);

  const setStyle = (patch: Partial<ConditionStyle>) =>
    onChange({ ...condition, style: { ...condition.style, ...patch } });

  const updateClause = (i: number, c: ConditionClause) =>
    onChange({ ...condition, clauses: condition.clauses.map((cl, j) => (j === i ? c : cl)) });

  const deleteClause = (i: number) =>
    onChange({ ...condition, clauses: condition.clauses.filter((_, j) => j !== i) });

  const addClause = () =>
    onChange({ ...condition, clauses: [...condition.clauses, newClause()] });

  const toggleLogic = () =>
    onChange({ ...condition, logic: condition.logic === 'AND' ? 'OR' : 'AND' });

  const hasActiveStyle = Object.values(condition.style).some(Boolean);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:opacity-80"
        style={{ background: 'var(--app-surface)' }}
        onClick={() => setOpen(!open)}
      >
        <span style={{ color: 'var(--text-secondary)' }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <input
          type="text"
          value={condition.label ?? ''}
          onChange={(e) => onChange({ ...condition, label: e.target.value })}
          placeholder="Regelname (optional)"
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-xs bg-transparent focus:outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
        {hasActiveStyle && (
          <div className="flex gap-1 shrink-0">
            {Object.entries(condition.style).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="w-3 h-3 rounded-full border" style={{ background: v as string, borderColor: 'var(--app-border)' }} />
            ))}
          </div>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="hover:opacity-70 shrink-0"
          style={{ color: 'var(--accent-red)' }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {open && (
        <div className="p-3 space-y-3" style={{ background: 'var(--app-bg)' }}>
          {/* Clauses */}
          <div className="space-y-1.5">
            {condition.clauses.map((clause, i) => (
              <ClauseRow
                key={i}
                clause={clause}
                isFirst={i === 0}
                logic={condition.logic}
                onLogicToggle={toggleLogic}
                onChange={(c) => updateClause(i, c)}
                onDelete={() => deleteClause(i)}
              />
            ))}
          </div>
          <button
            onClick={addClause}
            className="flex items-center gap-1 text-[10px] hover:opacity-80"
            style={{ color: 'var(--accent)' }}
          >
            <Plus size={11} /> Klausel hinzufügen
          </button>

          {/* Separator */}
          <div className="h-px" style={{ background: 'var(--app-border)' }} />

          {/* Style — label */}
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Stil wenn aktiv
          </p>

          {/* Color pickers */}
          <div className="space-y-1.5">
            {STYLE_FIELDS.map(({ key, label }) => (
              <ColorField
                key={key}
                label={label}
                value={condition.style[key]}
                onChange={(v) => setStyle({ [key]: v })}
              />
            ))}
          </div>

          {/* Effect */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>Effekt</label>
            <select
              value={condition.effect ?? 'none'}
              onChange={(e) => onChange({ ...condition, effect: e.target.value as WidgetCondition['effect'] })}
              className={`${cls} flex-1`}
              style={inputStyle}
            >
              <option value="none">Kein Effekt</option>
              <option value="pulse">Pulsieren</option>
              <option value="blink">Blinken</option>
            </select>
          </div>

          {/* Hide widget */}
          <div className="h-px" style={{ background: 'var(--app-border)' }} />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>Widget verstecken</p>
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>Widget wird unsichtbar wenn Bedingung erfüllt ist</p>
            </div>
            <button
              onClick={() => onChange({ ...condition, hideWidget: !condition.hideWidget, reflow: condition.hideWidget ? false : condition.reflow })}
              className="relative w-9 h-5 rounded-full transition-colors shrink-0"
              style={{ background: condition.hideWidget ? 'var(--accent)' : 'var(--app-border)' }}
            >
              <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: condition.hideWidget ? '18px' : '2px' }} />
            </button>
          </div>
          {condition.hideWidget && (
            <div className="flex items-center justify-between pl-3 border-l-2" style={{ borderColor: 'var(--accent)44' }}>
              <div>
                <p className="text-[10px] font-medium" style={{ color: 'var(--text-primary)' }}>Andere Widgets hochschieben</p>
                <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>Widget wird aus dem Raster entfernt, andere füllen den Platz</p>
              </div>
              <button
                onClick={() => onChange({ ...condition, reflow: !condition.reflow })}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: condition.reflow ? 'var(--accent)' : 'var(--app-border)' }}
              >
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ left: condition.reflow ? '18px' : '2px' }} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

interface ConditionEditorProps {
  conditions: WidgetCondition[];
  onChange: (conditions: WidgetCondition[]) => void;
}

export function ConditionEditor({ conditions, onChange }: ConditionEditorProps) {
  const update = (i: number, c: WidgetCondition) =>
    onChange(conditions.map((x, j) => (j === i ? c : x)));

  const remove = (i: number) =>
    onChange(conditions.filter((_, j) => j !== i));

  return (
    <div className="p-3 space-y-2.5" style={{ width: '480px' }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Bedingungsregeln</p>
        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
          Farben ändern sich wenn Bedingungen erfüllt sind
        </p>
      </div>

      {conditions.length === 0 && (
        <p className="text-xs text-center py-3" style={{ color: 'var(--text-secondary)' }}>
          Noch keine Regeln. Erstelle eine Regel um loszulegen.
        </p>
      )}

      {conditions.map((cond, i) => (
        <ConditionRule
          key={cond.id}
          condition={cond}
          onChange={(c) => update(i, c)}
          onDelete={() => remove(i)}
        />
      ))}

      <button
        onClick={() => onChange([...conditions, newCondition()])}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-xl hover:opacity-80"
        style={{ background: 'var(--app-surface)', color: 'var(--accent)', border: '1px dashed var(--accent)55' }}
      >
        <Plus size={13} /> Neue Regel
      </button>
    </div>
  );
}
