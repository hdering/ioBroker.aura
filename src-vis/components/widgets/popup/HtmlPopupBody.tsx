import DOMPurify from 'dompurify';
import { useDatapoint } from '../../../hooks/useDatapoint';
import type { ClickAction } from '../../../types';
import { subAll } from '../../../utils/popupPlaceholders';

interface Props {
    action: Extract<ClickAction, { kind: 'popup-html' }>;
    /** The popup's {{key}} tokens — e.g. a JSON table row's {{row_<key>}} (#858). */
    vars?: Record<string, string>;
}

export function HtmlPopupBody({ action, vars }: Props) {
    const { value: dpValue } = useDatapoint(action.dp ?? '');

    const raw = (() => {
        if (action.dp && dpValue != null) return String(dpValue);
        // Only the configured markup is a template; a datapoint's HTML is shown as it comes.
        return vars ? subAll(action.html ?? '', vars) : (action.html ?? '');
    })();

    const clean = DOMPurify.sanitize(raw);

    return (
        <div
            style={{ maxHeight: '65vh', overflow: 'auto', padding: '4px' }}
            dangerouslySetInnerHTML={{ __html: clean }}
        />
    );
}
