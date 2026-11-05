/**
 * Ansagen widget (#918): the sendTo calls to the Aura backend and what the widget
 * reads. The rules live in `config.announcements` and are run by the adapter
 * (lib/announcements.js); a dashboard changes only its own rules, through
 * `announcementEdit`, which checks the owner (applyAnnouncementClientEdit).
 */
import { sendToDirect } from '../../hooks/useIoBroker';
import { NS } from '../../utils/namespace';
import type { AnnouncementClientEdit, AnnouncementRule } from '../../utils/announcements';

export const ANNOUNCEMENTS_STATE = `${NS}.config.announcements`;

export type AnnouncementReply = { ok: boolean; error?: string; rule?: AnnouncementRule; text?: string };

/** sendTo, normalised to { ok, error } — timeouts and permission strings included. */
async function call(command: string, payload: Record<string, unknown>): Promise<AnnouncementReply> {
    const r = await sendToDirect<AnnouncementReply>(NS, command, payload, 10_000);
    if (r && typeof r === 'object' && '__timeout' in r) return { ok: false, error: 'timeout' };
    if (typeof r === 'string') return { ok: false, error: r };
    if (!r || typeof r !== 'object') return { ok: false, error: 'no reply' };
    return r as AnnouncementReply;
}

export function editAnnouncement(clientId: string, edit: AnnouncementClientEdit): Promise<AnnouncementReply> {
    return call('announcementEdit', { clientId, edit });
}

/** Speak a rule now, conditions and lock aside — Admin → Ansagen "Jetzt testen". */
export function testAnnouncement(rule: AnnouncementRule): Promise<AnnouncementReply> {
    return call('announcementTest', { rule });
}

/** A fresh rule id; the adapter rejects one that belongs to someone else. */
export function newAnnouncementId(clientId: string): string {
    return `dev-${clientId}-${Date.now().toString(36)}`;
}
