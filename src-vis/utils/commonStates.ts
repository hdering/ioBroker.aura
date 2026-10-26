/**
 * common.states of a datapoint as value → text pairs, and how they turn into
 * Auswahlfeld entries. ioBroker knows two spellings: an object {"1": "an"} and the
 * legacy string "0:zu;1:auf". Shared by the Auswahlfeld import and the JSON table's
 * value mapping (#852).
 */
import { getObjectDirect } from '../hooks/useIoBroker';

/** Parses either spelling of common.states; null when there is nothing usable. */
export function parseCommonStates(states: unknown): Record<string, string> | null {
    let parsed: Record<string, string> | null = null;
    if (typeof states === 'object' && states && !Array.isArray(states)) {
        parsed = {};
        for (const [k, v] of Object.entries(states as Record<string, unknown>)) parsed[k] = String(v);
    } else if (typeof states === 'string') {
        parsed = {};
        for (const pair of states.split(';')) {
            const i = pair.indexOf(':');
            if (i > 0) parsed[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
        }
    }
    return parsed && Object.keys(parsed).length > 0 ? parsed : null;
}

/** Reads common.states of a datapoint; null when the object has none. */
export async function readCommonStates(dp: string): Promise<Record<string, string> | null> {
    const obj = await getObjectDirect(dp);
    return parseCommonStates((obj?.common as { states?: unknown } | undefined)?.states);
}

/**
 * Adds the states to existing entries without losing work: an entry whose value is
 * already listed keeps its icon and colour and only gets the text when it has none;
 * entries the states do not know stay; new values append in the states' order.
 */
export function mergeStatesIntoEntries<E extends { value: string; label: string }>(
    entries: E[],
    states: Record<string, string>,
    make: (value: string, label: string) => E,
): E[] {
    const out = entries.map((e) => {
        const label = states[String(e.value).trim()];
        return label !== undefined && !e.label ? { ...e, label } : e;
    });
    const known = new Set(entries.map((e) => String(e.value).trim()));
    for (const [value, label] of Object.entries(states)) {
        if (!known.has(value)) out.push(make(value, label));
    }
    return out;
}
