import { ElementConditionEditor } from './ElementConditionEditor';
import { OWN_VALUE_TOKEN } from '../../hooks/useCellConditionStyle';
import type { CellConditionRule } from '../../types';

// Per-cell conditional formatting for the Universal Widget's custom grid.
//
// A cell has exactly one paintable part, so it passes no targets and the shared
// editor hides the target select. Everything else — clauses, colours, bold/italic,
// icon, the text override — is the same editor the list rows use.

export function CellConditionEditor({
    rules,
    onChange,
}: {
    rules: CellConditionRule[];
    /** The cell's own DP id — shown as a hint for "own value" clauses. */
    ownDpId?: string;
    onChange: (next: CellConditionRule[]) => void;
}) {
    return (
        <ElementConditionEditor
            rules={rules}
            onChange={onChange}
            ownHint={`${OWN_VALUE_TOKEN} = eigener Zellwert (kein erneutes Eintragen des DP); Pille umschalten für einen anderen Datenpunkt.`}
            intro="Noch keine Regel. Regeln reagieren auf den Zellwert (oder einen fremden Datenpunkt) und ändern Farbe, Hintergrund, Schrift, Icon oder blenden die Zelle aus."
        />
    );
}
