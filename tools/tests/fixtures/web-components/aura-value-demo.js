// A test web component for the value binding of the webcomponent widget
// (tools/tests/web-component-value-ui.mjs): shows `this.value` as a list and adds an
// entry with `changeValue()` - the way a schedule or a list editor reports its value.
// Bundled by the test with esbuild - it imports the base class of the package.
import { IobWebComponent, defineWebComponent } from '@iobroker/web-components/element';

const STYLE = `
:host { display: block; width: 100%; height: 100%; }
.box { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.list { display: flex; gap: 4px; flex-wrap: wrap; min-height: 24px; }
.list span { padding: 2px 8px; border-radius: var(--iob-border-radius); background: var(--iob-primary);
    color: var(--iob-primary-contrast); }
button { font: inherit; padding: 6px 12px; border: 1px solid var(--iob-primary); background: transparent;
    color: var(--iob-primary); border-radius: var(--iob-border-radius); cursor: pointer; }
output { color: var(--iob-text-secondary); font-size: 0.85em; }
`;

class AuraValueDemo extends IobWebComponent {
    /** What the last changeValue() returned: true if the host took the value */
    lastTaken = undefined;
    renders = 0;

    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>${STYLE}</style><div class="box">
            <div class="list"></div>
            <button id="add" type="button">Add</button>
            <output></output></div>`;
        root.getElementById('add').addEventListener('click', () => {
            const list = Array.isArray(this.value) ? this.value : [];
            this.lastTaken = this.changeValue([...list, list.length + 1]);
        });
    }

    render() {
        this.renders++;
        const list = Array.isArray(this.value) ? this.value : [];
        const box = this.shadowRoot.querySelector('.list');
        box.replaceChildren(
            ...list.map((item) => {
                const span = document.createElement('span');
                span.textContent = String(item);
                return span;
            }),
        );
        this.shadowRoot.querySelector('output').textContent =
            this.value === undefined ? 'no value' : `value: ${JSON.stringify(this.value)}`;
    }
}

defineWebComponent('aura-value-demo', AuraValueDemo);
