/**
 * The triggering datapoint inside a condition's message (issue #605).
 *
 * A widget condition can send a message; with `{list:any}` as its value source it
 * fires for a whole list ("ein Bewegungsmelder meldet"). Which one is what the
 * message has to say, so the draft may address the row that triggered:
 *
 *   `{{dp}}`      the row's datapoint id
 *   `{{parent}}`  its strang (id without the last segment)
 *   `{{name}}`    its last segment
 *
 * Same tokens as the list's name pattern and the popup views — `substituteItemVars`
 * owns them, this module only decides *which* id they resolve against and *which*
 * fields they may appear in.
 *
 * The `[[dp]]` layer is deliberately NOT resolved here: a message renders its title
 * and text through MessageHtml, which reads those tokens live. Writing
 * `[[{{parent}}.NAME]]` therefore lands as `[[hm-rpc.0.Melder1.NAME]]` in the
 * archive and shows that datapoint's value wherever the message is displayed —
 * exactly like a widget title.
 */
import { substituteItemVars } from './nameFilter';
import type { MessageDraft } from '../types';

/** Draft fields that may address the triggering datapoint. `target*` is left out:
 *  a client / layout / tab is never a property of the row. */
const ROW_FIELDS = ['id', 'title', 'text', 'html', 'image', 'icon', 'view', 'dp', 'ackDp', 'ackValue'] as const;

const VAR = /\{\{\w+\}\}/;

/** True when the draft addresses the triggering datapoint anywhere. */
export function draftHasRowVars(draft: MessageDraft | undefined): boolean {
    if (!draft) return false;
    if (ROW_FIELDS.some((key) => VAR.test(draft[key] ?? ''))) return true;
    return (draft.actions ?? []).some(
        (a) => VAR.test(a?.label ?? '') || VAR.test(a?.dp ?? '') || VAR.test(a?.value ?? ''),
    );
}

/**
 * The draft with every `{{…}}` variable resolved against `rowDp`.
 *
 * `id` gets the row appended when it does not carry a variable itself: two rows
 * firing under the same message id would otherwise overwrite each other in the
 * archive (same id + a newer timestamp is an update), which is precisely what a
 * per-row message must not do. A draft without an id keeps it — the adapter then
 * generates a unique one anyway.
 */
export function resolveDraftForRow(draft: MessageDraft, rowDp: string | undefined): MessageDraft {
    if (!rowDp) return draft;
    const out: MessageDraft = { ...draft };
    for (const key of ROW_FIELDS) {
        const val = draft[key];
        if (typeof val === 'string' && val) out[key] = substituteItemVars(val, rowDp);
    }
    if (draft.actions?.length) {
        out.actions = draft.actions.map((a) => ({
            ...a,
            label: substituteItemVars(a?.label ?? '', rowDp),
            dp: substituteItemVars(a?.dp ?? '', rowDp),
            value: substituteItemVars(a?.value ?? '', rowDp),
        }));
    }
    if (draft.id && !VAR.test(draft.id)) out.id = `${draft.id}:${rowDp}`;
    return out;
}
