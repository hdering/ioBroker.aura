import { useState } from 'react';

export function useConfirmAction(action: () => void, enabled: boolean) {
    const [pending, setPending] = useState(false);

    const run = () => {
        if (!enabled) {
            action();
            return;
        }
        setPending(true);
    };

    const confirm = () => {
        setPending(false);
        action();
    };
    const cancel = () => setPending(false);

    return { run, pending, confirm, cancel };
}
