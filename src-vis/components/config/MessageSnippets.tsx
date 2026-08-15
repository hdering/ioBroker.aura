import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { NS } from '../../utils/namespace';

/**
 * "How do I actually send this" — the payload from the builder rendered as the
 * three calls people reach for (issue #429).
 *
 * Deliberately built from the live draft rather than shown as a generic snippet:
 * copying a line that already carries your own title and colours is the whole
 * point, and it doubles as documentation of the datapoint names.
 */

/** Small copy-to-clipboard button with a short confirmation. */
export function CopyButton({ text, label = 'Kopieren' }: { text: string; label?: string }) {
    const [done, setDone] = useState(false);
    return (
        <button
            onClick={() =>
                void navigator.clipboard?.writeText(text).then(
                    () => {
                        setDone(true);
                        window.setTimeout(() => setDone(false), 1500);
                    },
                    () => setDone(false),
                )
            }
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full shrink-0"
            style={{
                background: 'var(--app-bg)',
                color: done ? 'var(--accent)' : 'var(--text-secondary)',
                border: '1px solid var(--app-border)',
            }}
        >
            {done ? <Check size={11} /> : <Copy size={11} />}
            {done ? 'Kopiert' : label}
        </button>
    );
}

function Snippet({ title, hint, code }: { title: string; hint?: string; code: string }) {
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {title}
                </span>
                <CopyButton text={code} />
            </div>
            {hint && (
                <p className="text-[10px] mb-1 opacity-70" style={{ color: 'var(--text-secondary)' }}>
                    {hint}
                </p>
            )}
            <pre
                className="text-[11px] font-mono rounded-lg p-2.5 overflow-auto whitespace-pre"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                    maxHeight: 220,
                }}
            >
                {code}
            </pre>
        </div>
    );
}

/** JS string literal for a JSON payload — single quotes, so it pastes into a script. */
function asJsArg(payload: Record<string, unknown>): string {
    const json = JSON.stringify(payload);
    return json.length > 60 ? `JSON.stringify(${JSON.stringify(payload, null, 4)})` : `'${json.replace(/'/g, "\\'")}'`;
}

export function MessageSnippets({ payload }: { payload: Record<string, unknown> }) {
    const hasContent = Object.keys(payload).length > 0;
    const example: Record<string, unknown> = hasContent
        ? payload
        : { severity: 'warning', title: 'Waschmaschine', text: 'Programm fertig' };

    const setStateCode = `setState('${NS}.messages.send', ${asJsArg(example)});`;
    const sendToCode = `sendTo('${NS}', 'notify', ${JSON.stringify(example, null, 4)}, (res) => {\n    log('Meldung ' + res.id);\n});`;
    const plainCode = `setState('${NS}.messages.send', 'Waschmaschine fertig');`;

    return (
        <div className="flex flex-col gap-3">
            {!hasContent && (
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                    Noch nichts eingetragen — die Beispiele zeigen eine Muster-Meldung. Sobald du oben etwas
                    zusammenstellst, stehen hier deine eigenen Werte.
                </p>
            )}
            <Snippet
                title="Datenpunkt beschreiben"
                hint="Aus einem Skript, aus Blockly oder aus jedem anderen Adapter."
                code={setStateCode}
            />
            <Snippet
                title="sendTo"
                hint="Antwortet mit der vergebenen ID — damit lässt sich die Meldung später bestätigen oder schließen."
                code={sendToCode}
            />
            <Snippet
                title="Nur ein Text"
                hint="Ohne geschweifte Klammer wird der ganze Wert zur Info-Meldung."
                code={plainCode}
            />
        </div>
    );
}
