import { useEffect, useState } from 'react';
import { getObjectViewDirect } from './useIoBroker';

export type McpMode = 'read' | 'write' | 'rename' | 'delete';

export interface McpStatus {
    /** null while the instance config has not been read yet. */
    enabled: boolean | null;
    mode: McpMode;
}

/**
 * Reads the aura instance's MCP switches from its native config, so the overview
 * can show the full setup guide only as long as MCP is not configured yet and
 * shrink to a status line afterwards.
 *
 * `mcpToken` is protectedNative and therefore never readable from here — the
 * enabled flag alone decides, which is what the endpoint itself gates on too.
 */
export function useMcpStatus(): McpStatus {
    const [status, setStatus] = useState<McpStatus>({ enabled: null, mode: 'read' });

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await getObjectViewDirect('instance', 'system.adapter.aura.', 'system.adapter.aura.香');
                const native = (res.rows?.[0]?.value as unknown as { native?: Record<string, unknown> })?.native ?? {};
                if (cancelled) return;
                setStatus({
                    enabled: native.mcpEnabled === true,
                    mode: (native.mcpMode as McpMode) || 'read',
                });
            } catch {
                // Config unreadable — assume "not set up" and keep showing the guide.
                if (!cancelled) setStatus({ enabled: false, mode: 'read' });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    return status;
}
