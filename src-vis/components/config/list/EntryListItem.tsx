import { GripVertical, X } from 'lucide-react';
import { Icon } from '@iconify/react';
import { lucidePascalToIconify } from '../../../utils/iconifyLoader';

function toIconifyId(name: string): string {
    return name.includes(':') ? name : lucidePascalToIconify(name);
}

/** The subset of a list entry the master list needs to render a row. */
export interface ManagedEntry {
    id: string;
    label?: string;
    icon?: string;
    iconSize?: number;
    /** Static list: this row is a separator, not a datapoint (see ListWidget). The master
     *  list renders it as one, so the sections are visible where the order is changed. */
    divider?: boolean;
    dividerLabel?: string;
}

export interface DragProps {
    index: number;
    isDragging: boolean;
    isDragTarget: boolean;
    /** Undefined disables dragging (active sort order or a filtered list). */
    onDragStart?: (idx: number) => void;
    onDragOver: (idx: number) => void;
    onDragEnd: () => void;
    onDrop: (idx: number) => void;
}

/**
 * One row of the datapoint dialog's master list. Selecting it swaps the detail pane -
 * it carries no editing controls of its own beyond the delete button.
 */
export function EntryListItem({
    entry,
    displayName,
    selected,
    onSelect,
    onRemove,
    drag,
}: {
    entry: ManagedEntry;
    displayName: string;
    selected: boolean;
    onSelect: () => void;
    onRemove: () => void;
    drag?: DragProps;
}) {
    const draggable = !!drag?.onDragStart;
    // A separator row reads as what it renders: no border box, a rule instead of a name.
    // Same handles though — it is dragged, selected and deleted like a datapoint.
    const isDivider = entry.divider === true;
    return (
        <div
            className={`flex items-center gap-1.5 px-2 rounded-lg cursor-pointer transition-colors ${isDivider ? 'py-0.5' : 'py-1.5'}`}
            style={{
                background: selected
                    ? 'color-mix(in srgb, var(--accent) 16%, var(--app-bg))'
                    : isDivider
                      ? 'transparent'
                      : 'var(--app-bg)',
                border: `1px solid ${selected ? 'var(--accent)' : isDivider ? 'transparent' : 'var(--app-border)'}`,
                opacity: drag?.isDragging ? 0.4 : 1,
                ...(drag?.isDragTarget ? { boxShadow: '0 -2px 0 0 var(--accent)' } : {}),
            }}
            onClick={onSelect}
            onDragOver={
                drag
                    ? (e) => {
                          e.preventDefault();
                          drag.onDragOver(drag.index);
                      }
                    : undefined
            }
            onDragEnter={
                drag
                    ? (e) => {
                          e.preventDefault();
                          drag.onDragOver(drag.index);
                      }
                    : undefined
            }
            onDrop={
                drag
                    ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          drag.onDrop(drag.index);
                      }
                    : undefined
            }
        >
            {drag && (
                <span
                    draggable={draggable}
                    onDragStart={
                        draggable
                            ? (e) => {
                                  e.dataTransfer.effectAllowed = 'move';
                                  drag.onDragStart!(drag.index);
                              }
                            : undefined
                    }
                    onDragEnd={drag.onDragEnd}
                    title={draggable ? 'Ziehen zum Sortieren' : 'Sortierung aktiv – Reihenfolge wirkt nicht'}
                    className={`shrink-0 flex items-center ${draggable ? 'cursor-grab active:cursor-grabbing hover:opacity-80' : 'cursor-default'}`}
                    style={{ color: 'var(--text-secondary)', opacity: draggable ? 1 : 0.3 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical size={11} />
                </span>
            )}
            {!isDivider && entry.icon && (
                <span className="shrink-0 flex items-center" style={{ color: 'var(--text-secondary)' }}>
                    <Icon
                        icon={toIconifyId(entry.icon)}
                        width={Math.max(11, Math.min(20, entry.iconSize ?? 13))}
                        height={Math.max(11, Math.min(20, entry.iconSize ?? 13))}
                    />
                </span>
            )}
            {isDivider ? (
                <span className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="flex-1 h-px min-w-0" style={{ background: 'var(--app-border)' }} />
                    {entry.dividerLabel?.trim() && (
                        <span
                            className="text-[9px] uppercase tracking-wide shrink-0 truncate"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {entry.dividerLabel.trim()}
                        </span>
                    )}
                    <span className="flex-1 h-px min-w-0" style={{ background: 'var(--app-border)' }} />
                </span>
            ) : (
                <span className="flex-1 min-w-0 truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>
                    {displayName}
                </span>
            )}
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                }}
                title="Entfernen"
                className="shrink-0 hover:opacity-70"
                style={{ color: 'var(--text-secondary)' }}
            >
                <X size={11} />
            </button>
        </div>
    );
}
