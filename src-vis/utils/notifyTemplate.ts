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
 * The `[[dp]]` layer runs one step later, in freezeDraftTokens: `{{parent}}` turns
 * `[[{{parent}}.NAME]]` into `[[hm-rpc.0.Melder1.NAME]]`, and that reference is
 * then read ONCE, at the moment the rule fires. A message is a record of something
 * that happened, so its text must not drift with the datapoint afterwards.
 */
import { substituteItemVars } from './nameFilter';
import { dpTokenRefs, dpValueText, hasDpToken, replaceDpTokens } from './dpTokens';
import { splitDpRef, resolveDpValue } from './dpRef';
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

/** Draft fields whose `[[dp]]` tokens are display text and get frozen — an action's
 *  label joins them below. `dp`, `ackDp`, an action's `dp`/`value` and the popup
 *  `view` are references, not text: freezing one would turn it into a value and
 *  break what reads it. */
const TOKEN_FIELDS = ['title', 'text', 'html', 'image', 'icon'] as const;

/**
 * The draft with its `[[dp]]` tokens replaced by the values those datapoints hold
 * right now — the moment the condition fired (issue #605).
 *
 * `Bewegung [[…Melder.Bewegung]]` frozen on the rising edge reads "Bewegung AN"
 * forever, where the live layer would show whatever the melder says today. That
 * live layer stays in place for everyone else: a script writing a token to
 * `messages.send` still gets a message that follows its datapoint.
 *
 * A reference that cannot be read keeps its token rather than collapsing to
 * nothing — the value may simply not have arrived yet, and the display layer gets
 * its chance further down the line.
 *
 * `read` answers with the raw value of one datapoint id — hooks/useIoBroker's
 * readValueDirect in the app, a plain map in the tests. Injected rather than
 * imported so this module stays framework-free: its callers are two React hooks,
 * its tests are plain node.
 */
export async function freezeDraftTokens(
    draft: MessageDraft,
    read: (id: string) => Promise<unknown>,
): Promise<MessageDraft> {
    const texts = [...TOKEN_FIELDS.map((k) => draft[k]), ...(draft.actions ?? []).map((a) => a?.label)];
    const refs = new Set<string>();
    for (const text of texts) if (text) for (const ref of dpTokenRefs(text)) refs.add(ref);
    if (refs.size === 0) return draft;

    const frozen = new Map<string, string>();
    await Promise.all(
        [...refs].map(async (ref) => {
            const { id, path } = splitDpRef(ref);
            if (!id) return;
            const val = resolveDpValue(await read(id), path);
            if (val !== undefined && val !== null) frozen.set(ref, dpValueText(val));
        }),
    );
    if (frozen.size === 0) return draft;

    const apply = (text: string | undefined) =>
        text && hasDpToken(text) ? replaceDpTokens(text, (ref) => frozen.get(ref)) : text;
    const out: MessageDraft = { ...draft };
    for (const key of TOKEN_FIELDS) {
        const next = apply(draft[key]);
        if (next !== undefined) out[key] = next;
    }
    if (draft.actions?.length) out.actions = draft.actions.map((a) => ({ ...a, label: apply(a?.label) ?? a?.label }));
    return out;
}
