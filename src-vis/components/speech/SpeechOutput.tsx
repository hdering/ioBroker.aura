import { useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { getStateDirect, setStateDirect, subscribeDpValue, subscribeStateDirect } from '../../hooks/useIoBroker';
import { setMessageSpeaker, type MessageScope } from '../../store/messagesStore';
import {
    announce,
    configureSpeechDevice,
    expireBlockedSpeech,
    stopSpeech,
    unlockSpeech,
    useSpeechStore,
} from '../../store/speechStore';
import { isScreenshotMode } from '../../store/persistManager';
import { useT } from '../../i18n';
import { NS } from '../../utils/namespace';
import { messageSpeechText, parseSpeechPayload, toSpeechVolume } from '../../utils/speech';
import type { ioBrokerState } from '../../types';

/**
 * Speech output of this device (issue #834).
 *
 * Listens on `<ns>.speech.say` (every device) and `<ns>.clients.<id>.speech.say`
 * (this one), plays what arrives one after the other and clears the datapoint —
 * the same write-then-self-clear contract as popup.open. Messages with `speak`
 * come in through the messages store.
 *
 * A value that was already there when the page subscribed is never played: only
 * a write with a newer server timestamp counts, so a reload or a reconnect cannot
 * replay yesterday's announcement.
 */
function subscribeSay(id: string, clear: boolean): () => void {
    let baseline: number | null = null;
    let lastTs = 0;
    const early: ioBrokerState[] = [];

    const handle = (state: ioBrokerState) => {
        if (!state || !(state.ts > lastTs)) return;
        lastTs = state.ts;
        const req = parseSpeechPayload(state.val);
        if (!req) return;
        announce(req);
        if (clear && !isScreenshotMode()) setStateDirect(id, '');
    };

    const unsubscribe = subscribeStateDirect(id, (state) => {
        if (baseline === null) early.push(state);
        else handle(state);
    });
    let disposed = false;
    void getStateDirect(id).then((st) => {
        if (disposed) return;
        baseline = st?.ts ?? 0;
        lastTs = baseline;
        for (const s of early.splice(0)) handle(s);
    });
    return () => {
        disposed = true;
        unsubscribe();
    };
}

export function SpeechOutput({ scope, clientReady }: { scope: MessageScope; clientReady: boolean }) {
    const t = useT();
    const blocked = useSpeechStore((s) => s.blocked);
    const clientId = scope.clientId;

    useEffect(() => configureSpeechDevice({ scope }), [scope]);
    useEffect(() => configureSpeechDevice({ clientId, ready: clientReady }), [clientId, clientReady]);

    // Device settings.
    useEffect(() => {
        if (!clientId) return;
        const base = `${NS}.clients.${clientId}.speech`;
        const unMuted = subscribeDpValue(`${base}.muted`, (v) =>
            configureSpeechDevice({ muted: v === true || v === 'true' || v === 1 }),
        );
        const unVolume = subscribeDpValue(`${base}.volume`, (v) =>
            configureSpeechDevice({ volume: toSpeechVolume(v) }),
        );
        return () => {
            unMuted();
            unVolume();
            configureSpeechDevice({ muted: false, volume: 100 });
        };
    }, [clientId]);

    // The command datapoints.
    useEffect(() => {
        const unGlobal = subscribeSay(`${NS}.speech.say`, true);
        const unClient = clientId ? subscribeSay(`${NS}.clients.${clientId}.speech.say`, true) : () => {};
        return () => {
            unGlobal();
            unClient();
        };
    }, [clientId]);

    // Messages with `speak` (phase 3).
    useEffect(() => {
        setMessageSpeaker((msg) => {
            const text = messageSpeechText(msg);
            if (text) announce({ text });
        });
        return () => {
            setMessageSpeaker(null);
            stopSpeech();
        };
    }, []);

    // While an announcement waits: any tap on the page plays it (the button is the
    // hint, not the only way), and a stale one expires after a while.
    useEffect(() => {
        if (!blocked) return;
        const onGesture = () => unlockSpeech();
        window.addEventListener('pointerdown', onGesture, true);
        window.addEventListener('keydown', onGesture, true);
        const timer = window.setInterval(expireBlockedSpeech, 30_000);
        return () => {
            window.removeEventListener('pointerdown', onGesture, true);
            window.removeEventListener('keydown', onGesture, true);
            window.clearInterval(timer);
        };
    }, [blocked]);

    if (!blocked) return null;
    return (
        <button
            type="button"
            data-aura-speech-unlock=""
            onClick={unlockSpeech}
            className="aura-speech-unlock fixed bottom-3 right-3 z-[60] flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#fff' }}
            title={t('speech.unlockHint')}
        >
            <Volume2 size={16} className="shrink-0" />
            {t('speech.unlock')}
        </button>
    );
}
