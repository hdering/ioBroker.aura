import { useDatapoint } from './useDatapoint';

/**
 * Value a writing widget shows: the optional read-back datapoint (`options.statusDp`)
 * when one is set, otherwise the main datapoint it writes to.
 *
 * For devices that split command and status (Tasmota/MQTT `cmnd.*` takes the write,
 * `stat.*` reports the result) — the widget keeps writing to the main datapoint but
 * displays what the device confirmed (issues #567, #828).
 */
export function useReadBackDatapoint(mainDp: string, statusDp: unknown) {
    const statusRef = typeof statusDp === 'string' ? statusDp.trim() : '';
    // The main DP stays subscribed either way, so clearing the status DP falls back
    // without a re-fetch.
    const main = useDatapoint(mainDp);
    const status = useDatapoint(statusRef);
    return statusRef ? status : main;
}
