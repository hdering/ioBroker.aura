import { ElementConditionEditor, ROW_TARGETS } from '../ElementConditionEditor';
import { subDpTokenMap } from '../../../utils/subDpTemplate';
import { subAll } from '../../../utils/popupPlaceholders';
import { OWN_DP_TOKEN } from '../../../utils/conditionEval';
import type { ElementConditionRule } from '../../../types';

/**
 * List-wide row conditions — the tab behind "Datenpunkte verwalten" (issue #572).
 *
 * The rules here apply to EVERY row. That is the only usable shape for the dynamic
 * list, whose rows come from a filter: nobody configures 40 discovered thermostats
 * one by one. The clause datapoint may therefore carry the same placeholders the
 * second line's template uses, resolved against each row's own datapoint.
 */
export function RowConditionsPanel({
    rules,
    sampleDp,
    onChange,
}: {
    rules?: ElementConditionRule[];
    /** A representative entry id, used to show what the placeholders resolve to. */
    sampleDp?: string;
    onChange: (next: ElementConditionRule[]) => void;
}) {
    const map = sampleDp ? subDpTokenMap(sampleDp) : {};
    const example = sampleDp ? subAll('{{parent}}.UNREACH', map) : '';

    return (
        <div className="space-y-2">
            <div
                className="rounded-lg px-3 py-2 text-[10px] leading-relaxed space-y-1"
                style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)' }}
            >
                <p>
                    Gilt für <strong>jede Zeile</strong>. Regeln am einzelnen Eintrag werden danach angewandt und
                    gewinnen je Eigenschaft.
                </p>
                <p>
                    Im Datenpunkt einer Bedingung stehen <code>{'{{parent}}'}</code>, <code>{'{{dp}}'}</code> und{' '}
                    <code>{'{{name}}'}</code> zur Verfügung — sie werden je Zeile aufgelöst. Zeilen, deren Datenpunkt
                    einen Platzhalter nicht beantworten kann, überspringen die Regel.
                </p>
                {example && (
                    <p>
                        Beispiel: <code>{'{{parent}}.UNREACH'}</code> → <code>{example}</code>
                    </p>
                )}
            </div>
            <ElementConditionEditor
                rules={rules ?? []}
                onChange={onChange}
                targets={ROW_TARGETS}
                allowIconSize
                ownHint={`${OWN_DP_TOKEN} = Wert der Zeile selbst; Pille umschalten für einen anderen Datenpunkt — dort sind {{parent}} & Co. erlaubt.`}
                intro="Noch keine Regel. Regeln reagieren auf den Zeilenwert (oder einen fremden Datenpunkt) und ändern Farbe, Icon, Text oder blenden die Zeile aus."
            />
        </div>
    );
}
