// Doppelklick im HTML-Template-Feld des Werte-Widgets (Issue #670).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/html-template-dblclick.mjs
//
// Das Feld hatte ein onDoubleClick, das die ganze textarea markiert hat - ein
// Notnagel aus der Zeit, als der haeufige Parent-Re-Render jede Selektion sofort
// wieder geloescht hat. Seit HtmlTemplateInput memoisiert ist, markiert der
// Browser von allein das angeklickte Wort; der Notnagel hat das nur noch kaputt
// gemacht. Geprueft wird beides: dass ein Doppelklick genau EIN Wort markiert -
// und dass diese Markierung die naechsten Re-Render-Runden ueberlebt, damit der
// alte Fehler nicht durch die Hintertuer zurueckkommt.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DESKTOP = { width: 1400, height: 950 };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

// Genau die Vorlage aus dem Issue - mehrere Zeilen, mehrere Woerter.
const TEMPLATE = [
    '<span>',
    '  {{ Math.floor(Number(dp) / 24) }}',
    "  {{ Math.floor(Number(dp) / 24) === 1 ? 'Tag' : 'Tage' }}",
    '',
    '  {{ Math.floor(Number(dp) % 24) }}',
    "  {{ Math.floor(Number(dp) % 24) === 1 ? 'Stunde' : 'Stunden' }}",
    '</span>',
].join('\n');

const browser = await chromium.launch();
const pageErrors = [];
const ctx = await browser.newContext({ viewport: DESKTOP, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

await page.evaluate((html) => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-html-dbl',
                type: 'value',
                title: 'Restlaufzeit',
                datapoint: 'demo.0.hours',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 16, h: 8 },
                options: { htmlTemplate: html },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
}, TEMPLATE);
await page.waitForTimeout(450);

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();

const area = page.locator('textarea[data-html-template]');
await area.waitFor({ timeout: 10000 });
check('das HTML-Feld ist im Panel', await area.isVisible());
check('die Vorlage steht drin', (await area.inputValue()) === TEMPLATE);

/** Was die textarea gerade markiert hat. */
const selection = () =>
    area.evaluate((el) => ({
        start: el.selectionStart,
        end: el.selectionEnd,
        text: el.value.slice(el.selectionStart, el.selectionEnd),
    }));

/**
 * Doppelklick mitten auf das n-te Vorkommen eines Wortes.
 *
 * Eine textarea hat keine Textknoten, an denen man ein Wort messen koennte, und
 * sie bricht lange Zeilen weich um - Zeile/Spalte aus dem Rohtext zu rechnen
 * geht daneben. Also wird ein Spiegel-DIV mit denselben Schrift- und
 * Umbruchregeln aufgebaut, das Wort darin in ein span gelegt und dessen Rechteck
 * gemessen.
 */
async function dblclickWord(word, nth = 0) {
    const point = await area.evaluate(
        (el, { word, nth }) => {
            let at = -1;
            for (let i = 0; i <= nth; i++) {
                at = el.value.indexOf(word, at + 1);
            }
            if (at < 0) {
                throw new Error(`Wort nicht in der Vorlage: ${word}`);
            }

            const st = getComputedStyle(el);
            const mirror = document.createElement('div');
            for (const k of [
                'fontFamily',
                'fontSize',
                'fontWeight',
                'fontStyle',
                'letterSpacing',
                'lineHeight',
                'textTransform',
                'wordSpacing',
                'tabSize',
                'paddingTop',
                'paddingRight',
                'paddingBottom',
                'paddingLeft',
                'borderTopWidth',
                'borderRightWidth',
                'borderBottomWidth',
                'borderLeftWidth',
                'boxSizing',
            ]) {
                mirror.style[k] = st[k];
            }
            mirror.style.position = 'absolute';
            mirror.style.visibility = 'hidden';
            mirror.style.whiteSpace = 'pre-wrap';
            mirror.style.overflowWrap = 'break-word';
            mirror.style.width = `${el.clientWidth + parseFloat(st.paddingLeft) + parseFloat(st.paddingRight)}px`;
            mirror.style.left = '0';
            mirror.style.top = '0';
            const head = document.createTextNode(el.value.slice(0, at));
            const mark = document.createElement('span');
            mark.textContent = word;
            mirror.append(head, mark, document.createTextNode(el.value.slice(at + word.length)));
            document.body.appendChild(mirror);
            const m = mirror.getBoundingClientRect();
            const w = mark.getBoundingClientRect();
            const offsetX = w.left - m.left + w.width / 2;
            const offsetY = w.top - m.top + w.height / 2;
            mirror.remove();

            // Das Wort in Sicht scrollen - die textarea ist nur drei Zeilen hoch.
            el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, offsetY - el.clientHeight / 2));
            const r = el.getBoundingClientRect();
            return { x: r.left + offsetX - el.scrollLeft, y: r.top + offsetY - el.scrollTop };
        },
        { word, nth },
    );
    await page.mouse.dblclick(point.x, point.y);
    await page.waitForTimeout(120);
}

// ── 1. Ein Doppelklick markiert ein Wort, nicht alles ────────────────────────
await dblclickWord('Stunden');
const first = await selection();
check(
    'der Doppelklick markiert nur das angeklickte Wort',
    first.text === 'Stunden',
    `markiert: ${JSON.stringify(first.text)}`,
);
check(
    'nicht die ganze Vorlage',
    first.end - first.start < TEMPLATE.length,
    `${first.end - first.start} von ${TEMPLATE.length} Zeichen`,
);

// ── 2. Die Markierung ueberlebt die Re-Render-Runden ─────────────────────────
// WidgetFrame rendert im Editor staendig neu (subscribeStateDirect, Intervalle).
// Frueher hat das die Selektion sofort geloescht - genau dagegen war das
// select() eingebaut. Ohne den Memo-Schutz faellt dieser Test wieder um.
await page.waitForTimeout(1800);
const later = await selection();
check(
    'die Markierung steht nach zwei Sekunden noch',
    later.text === 'Stunden',
    `markiert: ${JSON.stringify(later.text)}`,
);

// ── 3. Ein zweites Wort in einer anderen Zeile ───────────────────────────────
await dblclickWord('Tage');
const second = await selection();
check('auch ein Wort weiter oben wird einzeln markiert', second.text === 'Tage', JSON.stringify(second.text));

// ── 4. Strg+A markiert weiterhin alles ───────────────────────────────────────
await page.keyboard.press('Control+a');
const all = await selection();
check('Strg+A markiert weiterhin die ganze Vorlage', all.text === TEMPLATE, `${all.text.length} Zeichen`);

// ── 5. Tippen kommt beim Widget an ───────────────────────────────────────────
await dblclickWord('Stunden');
await page.keyboard.type('Std.');
await page.waitForTimeout(350);
const stored = await page.evaluate(() => window.__auraShot.widgetOptions('w-html-dbl').htmlTemplate);
check(
    'das ersetzte Wort landet in der Konfiguration',
    stored === TEMPLATE.replace('Stunden', 'Std.'),
    JSON.stringify(stored?.slice(-40)),
);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
