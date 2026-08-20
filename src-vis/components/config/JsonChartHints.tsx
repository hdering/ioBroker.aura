import { t } from '../../i18n';

/**
 * The two explainers of the advanced chart's JSON source: which payload shapes chart, and where
 * the y-axis bounds may sit. Both were only described in one long sentence each, which is why
 * perfectly reasonable payloads were configured wrong (issue #550) — a worked example says it in
 * a glance. Rendered collapsed so the options panel stays short.
 */

interface JsonExample {
    /** Short note above the snippet — what this shape is good for. */
    note: string;
    json: string;
}

function ExampleList({ examples }: { examples: JsonExample[] }) {
    return (
        <ul className="mt-1.5 space-y-2">
            {examples.map((e) => (
                <li key={e.json}>
                    <p className="text-[10px] leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.85 }}>
                        {e.note}
                    </p>
                    <pre
                        className="text-[10px] font-mono mt-0.5 px-2 py-1 rounded overflow-x-auto"
                        style={{
                            background: 'var(--app-bg)',
                            border: '1px solid var(--app-border)',
                            color: 'var(--text-primary)',
                        }}
                    >
                        {e.json}
                    </pre>
                </li>
            ))}
        </ul>
    );
}

function HintBox({ summary, children }: { summary: string; children: React.ReactNode }) {
    return (
        <details>
            <summary
                className="text-[10px] cursor-pointer select-none"
                style={{ color: 'var(--text-secondary)', opacity: 0.8 }}
            >
                {summary}
            </summary>
            {children}
        </details>
    );
}

/** Accepted shapes of the data itself, shown under the "path to array" field. */
export function JsonShapeHint() {
    const examples: JsonExample[] = [
        {
            note: t('echart.jsonShapeFlat'),
            json: '[{ "label": "12:00", "value": 42 },\n { "label": "13:00", "value": 87 }]',
        },
        {
            note: t('echart.jsonShapeTime'),
            json: '[{ "ts": 1786990830338, "value": 10 },\n { "ts": 1787077230338, "value": 30 }]',
        },
        {
            note: t('echart.jsonShapeNested'),
            json: '{ "data": { "hours": [{ "label": "12:00", "value": 42 }] } }',
        },
        {
            note: t('echart.jsonShapeWrapped'),
            json: '[{ "yAxis": { "min": 0, "max": 20 },\n   "data": [{ "ts": 1786990830338, "value": 10 }] }]',
        },
    ];
    return (
        <HintBox summary={t('echart.jsonShapeHelp')}>
            <ExampleList examples={examples} />
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.75 }}>
                {t('echart.jsonShapeFields')}
            </p>
        </HintBox>
    );
}

/** Where the min/max block may sit, shown under the "path to the min/max block" field. */
export function JsonAxisBoundsHint() {
    const examples: JsonExample[] = [
        {
            note: t('echart.jsonAxisHelpBeside'),
            json: '{ "min": 0, "max": 100,\n  "data": [{ "label": "12:00", "value": 42 }] }',
        },
        {
            note: t('echart.jsonAxisHelpBlock'),
            json: '{ "yAxis": { "yMin": 0, "yMax": 20 },\n  "data": [{ "ts": 1786990830338, "value": 10 }] }',
        },
        {
            note: t('echart.jsonAxisHelpOne'),
            json: '{ "max": 100, "data": [{ "label": "12:00", "value": 42 }] }',
        },
    ];
    return (
        <HintBox summary={t('echart.jsonAxisHelp')}>
            <ExampleList examples={examples} />
            <ul className="mt-1.5 space-y-0.5">
                {[
                    t('echart.jsonAxisHelpKeys'),
                    t('echart.jsonAxisHelpWrappers'),
                    t('echart.jsonAxisHelpOrder'),
                    t('echart.jsonAxisHelpScale'),
                ].map((line) => (
                    <li
                        key={line}
                        className="text-[10px] leading-snug"
                        style={{ color: 'var(--text-secondary)', opacity: 0.75 }}
                    >
                        • {line}
                    </li>
                ))}
            </ul>
        </HintBox>
    );
}
