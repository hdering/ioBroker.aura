// Types of `this.config` — mirrors `native` in io-package.json. Keep both in sync.
// Only read by `npm run typecheck:backend`; nothing at runtime.

export {};

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            customUrl: string;
            port: number;
            socketPort: number;
            socketSecure: boolean;
            webInstance: string;
            socketInstance: string;
            backendCheckReport: string;
            socketUrl: string;
            secure: boolean;
            certPublic: string;
            certPrivate: string;
            certChained: string;
            fsRoots: { label: string; path: string }[];
            fsAllowWrite: boolean;
            timerTickSeconds: number;
            perfTracking: boolean;
            perfWidgetTracking: boolean;
            resetAdminPin: boolean;
            messageHistorySize: number;
            messageRetentionDays: number;
            statusHistorySize: number;
            statusHistoryDays: number;
            updateNotify: boolean;
            updateNotifyAck: boolean;
            mcpEnabled: boolean;
            mcpToken: string;
            mcpMode: string;
            mcpClientConfig: string;
            mcpDesktopConfig: string;
        }
    }
}
