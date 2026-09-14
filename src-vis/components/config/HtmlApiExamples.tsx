import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { CopyButton } from './MessageSnippets';

/**
 * Ready-made snippets for the HTML widget's write API (issue #649).
 *
 * Bindings are the read half and are documented right above in the panel; this is
 * the half that puts a value back. Nobody guesses `aura.setState` from an empty
 * textarea, so the panel offers the four shapes people actually build — switch,
 * toggle, slider, list of scenes — as one click each.
 */

interface Example {
    title: string;
    hint: string;
    code: string;
}

const EXAMPLES: Example[] = [
    {
        title: 'Schalter',
        hint: 'Zwei Knöpfe, ein fester Wert je Knopf.',
        code: `<button onclick="aura.setState('0_userdata.0.Licht', true)">An</button>
<button onclick="aura.setState('0_userdata.0.Licht', false)">Aus</button>`,
    },
    {
        title: 'Umschalten',
        hint: 'Liest den aktuellen Wert und schreibt das Gegenteil. Der Text kommt aus einem Binding.',
        code: `<button onclick="aura.toggle('0_userdata.0.Licht')">
  Licht ist {{ 0_userdata.0.Licht ? 'an' : 'aus' }}
</button>`,
    },
    {
        title: 'Schieberegler',
        hint: 'Startwert per Binding, geschrieben wird beim Loslassen.',
        code: `<input type="range" min="0" max="100" value="{0_userdata.0.Dimmer}"
       onchange="aura.setState('0_userdata.0.Dimmer', Number(this.value))">
<span>{0_userdata.0.Dimmer} %</span>`,
    },
    {
        title: 'Szenen-Knöpfe',
        hint: 'Ein Klick-Handler für beliebig viele Werte.',
        code: `<div onclick="if (event.target.dataset.v) aura.setState('0_userdata.0.Szene', event.target.dataset.v)">
  <button data-v="morgen">Morgen</button>
  <button data-v="abend">Abend</button>
  <button data-v="nacht">Nacht</button>
</div>`,
    },
    {
        title: 'Live ohne Neuaufbau',
        hint: 'Ein Binding baut den Rahmen bei jeder Änderung neu auf. aura.subscribe schreibt nur den Text — nötig, wenn im HTML etwas laufen soll (Eingaben, Animationen, Canvas).',
        code: `<span id="t">–</span> °C
<script>
  aura.subscribe('0_userdata.0.Temperatur', function (val) {
    document.getElementById('t').textContent = val;
  });
</script>`,
    },
];

export function HtmlApiExamples({ onInsert }: { onInsert: (code: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--text-secondary)' }}
            >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                Beispiele zum Einfügen
            </button>
            {open && (
                <div className="mt-1.5 space-y-2">
                    {EXAMPLES.map((ex) => (
                        <div key={ex.title}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {ex.title}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => onInsert(ex.code)}
                                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                                        style={{
                                            background: 'var(--app-bg)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    >
                                        <Plus size={11} />
                                        Einfügen
                                    </button>
                                    <CopyButton text={ex.code} />
                                </div>
                            </div>
                            <p className="text-[10px] mb-1 opacity-70" style={{ color: 'var(--text-secondary)' }}>
                                {ex.hint}
                            </p>
                            <pre
                                className="text-[10px] font-mono rounded-lg p-2 overflow-auto whitespace-pre"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                    maxHeight: 160,
                                }}
                            >
                                {ex.code}
                            </pre>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
