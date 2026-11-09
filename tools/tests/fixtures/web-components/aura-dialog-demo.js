// A test web component for Aura's host dialogs (tools/tests/web-component-dialogs-ui.mjs):
// two buttons ask for a form dialog and an element dialog through `openDialog()` of
// the base class; the result lands in `lastResult` and in the output line.
// Bundled by the test with esbuild - it imports the base class of the package.
import { IobWebComponent, defineWebComponent } from '@iobroker/web-components/element';

const STYLE = `
:host { display: block; width: 100%; height: 100%; }
.box { display: flex; flex-direction: column; gap: 8px; padding: 8px; font: inherit; }
button { font: inherit; padding: 6px 12px; border-radius: var(--iob-border-radius); border: 0;
    background: var(--iob-primary); color: var(--iob-primary-contrast); cursor: pointer; }
output { color: var(--iob-text-secondary); font-size: 0.85em; word-break: break-all; }
`;

class AuraDialogDemo extends IobWebComponent {
    lastResult = undefined;

    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${STYLE}</style><div class="box">
            <button id="form" type="button">Form</button>
            <button id="element" type="button">Element</button>
            <output></output></div>`;
        root.getElementById('form').addEventListener('click', () => this.#show(this.openDialog(FORM)));
        root.getElementById('element').addEventListener('click', () => this.#show(this.openDialog(elementRequest())));
    }

    async #show(promise) {
        const result = await promise;
        this.lastResult = result;
        this.shadowRoot.querySelector('output').textContent = JSON.stringify(result);
    }

    render() {}
}

const FORM = {
    title: { en: 'Limits', de: 'Grenzen' },
    ok: { en: 'Apply', de: 'Übernehmen' },
    form: {
        type: 'panel',
        items: {
            head: { type: 'header', text: { en: 'Range', de: 'Bereich' } },
            max: { type: 'number', label: { en: 'Maximum', de: 'Maximum' }, min: 0, max: 100, default: 80 },
            step: { type: 'slider', label: 'Step', min: 1, max: 10, default: 2 },
            on: { type: 'checkbox', label: { en: 'Active', de: 'Aktiv' }, default: true },
            unit: { type: 'text', label: { en: 'Unit', de: 'Einheit' }, hidden: '!data.on' },
            mode: {
                type: 'select',
                label: 'Mode',
                options: [
                    { value: 'auto', label: { en: 'Automatic', de: 'Automatisch' } },
                    { value: 'manual', label: { en: 'Manual', de: 'Manuell' } },
                ],
                default: 'auto',
            },
            color: { type: 'color', label: { en: 'Color', de: 'Farbe' }, default: '#ff8800' },
            oid: { type: 'objectId', label: { en: 'State', de: 'Datenpunkt' }, help: 'Written on change' },
            line: { type: 'divider' },
            note: { type: 'staticText', text: { en: 'Values apply at once.', de: 'Werte gelten sofort.' } },
        },
    },
    data: { max: 42, unit: 'kW' },
};

/** A fresh content element per request: a chart-like picture and a Done button */
function elementRequest() {
    const content = document.createElement('div');
    content.className = 'aura-demo-content';
    const root = content.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
        :host { display: block; }
        .bars { display: flex; align-items: flex-end; gap: 6px; height: 120px; }
        .bars span { flex: 1; background: var(--iob-primary); border-radius: var(--iob-border-radius) var(--iob-border-radius) 0 0; }
        p { color: var(--iob-text-secondary); margin: 8px 0; }
        button { font: inherit; padding: 6px 16px; border: 0; border-radius: var(--iob-border-radius);
            background: var(--iob-primary); color: var(--iob-primary-contrast); }
        </style>
        <div class="bars"><span style="height:40%"></span><span style="height:70%"></span>
        <span style="height:55%"></span><span style="height:90%"></span><span style="height:30%"></span></div>
        <p>Rendered by the component, framed by the host.</p>
        <button id="done" type="button">Done</button>`;
    root.getElementById('done').addEventListener('click', () =>
        content.dispatchEvent(new CustomEvent('iob-dialog-close', { detail: 'done', bubbles: true, composed: true })),
    );
    return { title: { en: 'Battery', de: 'Batterie' }, element: content, width: 560 };
}

defineWebComponent('aura-dialog-demo', AuraDialogDemo);
