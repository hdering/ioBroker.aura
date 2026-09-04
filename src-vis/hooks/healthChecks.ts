import { isScreenshotMode } from '../store/persistManager';

// The overview's health checks (orphaned DPs, widget references to missing DPs)
// query the real instance, so they stay silent in screenshot mode — a
// documentation shot must not show whatever the demo system happens to be
// missing. `__auraShot.healthChecks(true)` re-arms them for the test that
// exercises them on purpose, against a mocked sendTo.
let forced = false;

export function __devForceHealthChecks(on: boolean): void {
    forced = on;
}

export function healthChecksSuppressed(): boolean {
    return isScreenshotMode() && !forced;
}
