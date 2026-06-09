import DOMPurify from 'dompurify';
import { useDatapoint } from '../../../hooks/useDatapoint';
import type { ClickAction } from '../../../types';

interface Props {
    action: Extract<ClickAction, { kind: 'popup-html' }>;
}

export function HtmlPopupBody({ action }: Props) {
    const { value: dpValue } = useDatapoint(action.dp ?? '');

    const raw = (() => {
        if (action.dp && dpValue != null) return String(dpValue);
        return action.html ?? '';
    })();

    const clean = DOMPurify.sanitize(raw);

    return (
        <div
            style={{ maxHeight: '65vh', overflow: 'auto', padding: '4px' }}
            dangerouslySetInnerHTML={{ __html: clean }}
        />
    );
}
