import { create } from 'zustand';
import { setStateDirect } from '../hooks/useIoBroker';
import { isScreenshotMode } from './persistManager';
import { inMessageScope, type MessageScope } from './messagesStore';
import { useConfigStore } from './configStore';
import { NS } from '../utils/namespace';
import { resolveImageSource } from '../utils/assetUrl';
import type { SpeechRequest, SpeechResult } from '../utils/speech';
import { SpeechQueue, browserSpeechBackend, SPEECH_MAX_AGE_MS, type QueuedSpeech } from '../utils/speechPlayer';
import { ServerClock, claimAnnouncement } from '../utils/speechClaim';

/**
 * Runtime of the speech output (issue #834): one queue per page, the device
 * settings it plays with, and what it reports back to ioBroker.
 *
 *   clients.<id>.speech.playing     true while an announcement plays
 *   clients.<id>.speech.lastResult  played / blocked / muted / skipped / interrupted / error
 *
 * The SpeechOutput component feeds the device settings in and owns the
 * datapoint subscriptions; messages reach `announce` through setMessageSpeaker.
 */

interface SpeechState {
    /** An announcement waits for a tap (autoplay refused). Drives the "Ton aktivieren" button. */
    blocked: boolean;
    playing: boolean;
}

export const useSpeechStore = create<SpeechState>(() => ({ blocked: false, playing: false }));

interface SpeechDevice {
    clientId: string;
    /** The id is anchored — only then are the feedback datapoints this device's own. */
    ready: boolean;
    muted: boolean;
    /** Default volume 0..100 (speech.volume). */
    volume: number;
    scope: MessageScope;
}

const device: SpeechDevice = { clientId: '', ready: false, muted: false, volume: 100, scope: { clientId: '' } };

/** Created on the first announcement — a page that never speaks never touches the speech APIs. */
let queue: SpeechQueue | null = null;

export function configureSpeechDevice(patch: Partial<SpeechDevice>): void {
    const wasMuted = device.muted;
    Object.assign(device, patch);
    // Muting mid-sentence stops the sentence; that is what a mute button is for.
    if (!wasMuted && device.muted) queue?.clear();
}

/** Announcements the screenshot harness swallowed instead of playing. */
const devAnnounced: SpeechRequest[] = [];
export function __devAnnounced(): SpeechRequest[] {
    return [...devAnnounced];
}
export function __devClearAnnounced(): void {
    devAnnounced.length = 0;
}

function report(id: 'playing' | 'lastResult', val: boolean | string): void {
    if (!device.ready || !device.clientId || isScreenshotMode()) return;
    setStateDirect(`${NS}.clients.${device.clientId}.speech.${id}`, val, true);
}

function reportResult(result: SpeechResult): void {
    report('lastResult', result);
}

function getQueue(): SpeechQueue {
    if (!queue) {
        queue = new SpeechQueue(browserSpeechBackend(), {
            onPlaying: (playing) => {
                useSpeechStore.setState({ playing });
                report('playing', playing);
            },
            onResult: (result) => reportResult(result),
            onBlocked: (blocked) => useSpeechStore.setState({ blocked }),
        });
    }
    return queue;
}

/** Dashboard language as a speech language; a voice of that language is picked. */
function defaultLang(): string {
    return useConfigStore.getState().frontend.language === 'en' ? 'en' : 'de';
}

/** Server vs. device clock, fed by SpeechOutput with every server timestamp it sees. */
export const speechClock = new ServerClock();

export interface AnnounceMeta {
    /**
     * Identifies this one announcement across the tabs of the browser
     * (`<dp>@<ts>`, `msg:<id>@<ts>`). Tabs share the client id, so only one of
     * them plays it. Absent = this tab plays it without asking.
     */
    key?: string;
    /** Server time the announcement was sent; it expires SPEECH_MAX_AGE_MS later. */
    serverTs?: number;
}

/**
 * Play one announcement on this device, if it is meant for it and this tab is
 * the one of the device that plays it.
 */
export async function announce(req: SpeechRequest, meta: AnnounceMeta = {}): Promise<SpeechResult | undefined> {
    if (req.target && !inMessageScope(req.target, device.scope)) return undefined;
    if (isScreenshotMode()) {
        devAnnounced.push(req);
        return undefined;
    }
    if (meta.key && !(await claimAnnouncement(meta.key))) return undefined;
    if (device.muted) {
        reportResult('muted');
        return 'muted';
    }
    if (req.onlyVisible && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        reportResult('skipped');
        return 'skipped';
    }
    const now = Date.now();
    const sentAt = meta.serverTs !== undefined ? speechClock.toLocal(meta.serverTs) : undefined;
    const expiresAt = sentAt !== undefined ? sentAt + SPEECH_MAX_AGE_MS : undefined;
    if (expiresAt !== undefined && expiresAt < now) {
        // A tab that slept through it gets the old value on waking up.
        reportResult('skipped');
        return 'skipped';
    }
    const item: QueuedSpeech = {
        req: req.text && !req.lang ? { ...req, lang: defaultLang() } : req,
        volume: req.volume ?? device.volume,
        url: req.file ? resolveImageSource(req.file) : undefined,
        queuedAt: now,
        expiresAt,
    };
    getQueue().enqueue(item);
    return undefined;
}

/** "Ton aktivieren": call straight from the tap's event handler. */
export function unlockSpeech(): void {
    queue?.unlock();
}

/** Drop announcements that waited too long (for a tap, or behind a long one). */
export function expireBlockedSpeech(): void {
    queue?.dropExpired();
}

export function stopSpeech(): void {
    queue?.clear();
}
