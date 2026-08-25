/** "Sortierung" — the dialog wrapper around ListSortEditor. */
import { ConfigModal } from '../ConfigModal';
import { ListSortEditor } from './ListSortEditor';
import type { ListSortRule } from '../../../utils/listSort';
import type { EditorFilterRow } from './ListFilterEditor';

export function ListSortModal({
    rules,
    rows,
    storageKey,
    hint,
    onChange,
    onClose,
}: {
    rules: ListSortRule[];
    rows: EditorFilterRow[];
    storageKey: string;
    hint?: React.ReactNode;
    onChange: (next: ListSortRule[] | undefined) => void;
    onClose: () => void;
}) {
    return (
        <ConfigModal title="Sortierung" maxWidth={640} maxHeight={760} padded storageKey={storageKey} onClose={onClose}>
            <ListSortEditor rules={rules} rows={rows} hint={hint} onChange={onChange} />
        </ConfigModal>
    );
}
