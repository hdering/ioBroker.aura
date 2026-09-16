/**
 * Undo / redo arrows, the history menu and the "history trimmed" notice in the
 * admin save bar. Lives in its own component so that the history store's
 * version bump on every edit re-renders these few buttons — not the whole admin
 * shell around the editor.
 */
import { useEffect, useState } from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { useT } from '../../i18n';
import { useEditHistoryStore, undo, redo, peekUndo, peekRedo, clearHistoryNotice } from '../../store/editHistory';
import { describeEntry } from '../../store/editHistorySetup';
import { formatChangeDetails } from '../../utils/changeLabels';
import { EditHistoryMenu } from './EditHistoryMenu';

const chromeBtn: React.CSSProperties = {
    background: 'var(--app-bg)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
};

export function EditHistoryControls() {
    const t = useT();
    const { undoCount, redoCount, version, notice } = useEditHistoryStore();

    useEffect(() => {
        if (!notice) return;
        const id = setTimeout(clearHistoryNotice, 6000);
        return () => clearTimeout(id);
    }, [notice]);

    // Tooltips name the step: "Rückgängig (Strg+Z): Widget „Küche“ verschoben".
    // Computed a moment AFTER the change, not in the render that follows a grid
    // drop — the label is a tree diff, and the drop's paint must not wait for it.
    const baseUndo = t('admin.save.undoStep');
    const baseRedo = t('admin.save.redoStep');
    const [titles, setTitles] = useState<{ undo: string; redo: string }>({ undo: baseUndo, redo: baseRedo });
    useEffect(() => {
        const id = setTimeout(() => {
            const name = (base: string, entry: ReturnType<typeof peekUndo>) =>
                entry ? `${base}: ${formatChangeDetails(t, describeEntry(entry))}` : base;
            setTitles({ undo: name(baseUndo, peekUndo()), redo: name(baseRedo, peekRedo()) });
        }, 250);
        return () => clearTimeout(id);
    }, [version, baseUndo, baseRedo, t]);

    return (
        <>
            {notice === 'remote' && (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {t('admin.save.historyRemote')}
                </span>
            )}
            <div className="flex items-center gap-1 ml-auto" data-edit-history>
                <button
                    type="button"
                    onClick={() => undo()}
                    disabled={undoCount === 0}
                    title={titles.undo}
                    aria-label={baseUndo}
                    data-history-undo
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity disabled:opacity-30 disabled:hover:opacity-30"
                    style={chromeBtn}
                >
                    <Undo2 size={13} />
                </button>
                <button
                    type="button"
                    onClick={() => redo()}
                    disabled={redoCount === 0}
                    title={titles.redo}
                    aria-label={baseRedo}
                    data-history-redo
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80 transition-opacity disabled:opacity-30 disabled:hover:opacity-30"
                    style={chromeBtn}
                >
                    <Redo2 size={13} />
                </button>
                <EditHistoryMenu />
            </div>
        </>
    );
}
