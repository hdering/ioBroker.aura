/** "Eigene Filter" — the dialog wrapper around ListFilterEditor. */
import { ConfigModal } from '../ConfigModal';
import { ListFilterEditor, type EditorFilterRow } from './ListFilterEditor';
import type { ListFilterPreset } from '../../../utils/listFilter';

export function ListFilterModal({
    presets,
    rows,
    storageKey,
    onChange,
    onClose,
}: {
    presets: ListFilterPreset[];
    rows: EditorFilterRow[];
    storageKey: string;
    onChange: (next: ListFilterPreset[] | undefined) => void;
    onClose: () => void;
}) {
    return (
        <ConfigModal
            title="Eigene Filter"
            maxWidth={640}
            maxHeight={760}
            padded
            storageKey={storageKey}
            onClose={onClose}
        >
            <ListFilterEditor presets={presets} rows={rows} onChange={onChange} />
        </ConfigModal>
    );
}
