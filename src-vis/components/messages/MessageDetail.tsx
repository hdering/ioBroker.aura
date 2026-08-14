import { Check } from 'lucide-react';
import { ConfigModal } from '../config/ConfigModal';
import { MessageToast } from './MessageToast';
import { useMessagesStore } from '../../store/messagesStore';
import { useT } from '../../i18n';
import type { AuraMessage } from '../../types';

/** Absolute timestamp for the detail view — the list itself shows relative times. */
function formatFull(ts: number): string {
    try {
        return new Date(ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'medium' });
    } catch {
        return String(ts);
    }
}

interface Props {
    msg: AuraMessage;
    onClose: () => void;
}

/**
 * Full view of one archived message. The card itself is the same MessageToast the
 * overlay renders (in `embedded` mode, so it neither counts down nor closes), so a
 * message always looks the same wherever it is read.
 */
export function MessageDetail({ msg, onClose }: Props) {
    const t = useT();
    const ack = useMessagesStore((s) => s.ack);

    const rows: [string, string][] = [
        ['Zeit', formatFull(msg.ts)],
        ['Schweregrad', t(`messages.severity.${msg.severity}` as 'messages.severity.info')],
        ['Status', msg.read ? `Bestätigt${msg.ackedAt ? ` — ${formatFull(msg.ackedAt)}` : ''}` : 'Ungelesen'],
        ['ID', msg.id],
    ];
    if (msg.target?.clients?.length) rows.push(['Nur für Clients', msg.target.clients.join(', ')]);
    if (msg.target?.layout) rows.push(['Nur für Layout', msg.target.layout]);
    if (msg.target?.tab) rows.push(['Nur für Tab', msg.target.tab]);
    if (msg.priority) rows.push(['Priorität', String(msg.priority)]);
    if (msg.dp) rows.push(['Datenpunkt', msg.dp]);

    return (
        // The card below carries the message's own title, so the bar stays generic
        // instead of printing it twice.
        <ConfigModal title={t('messages.one')} maxWidth={620} maxHeight={560} padded onClose={onClose}>
            <div className="flex flex-col gap-3">
                <MessageToast msg={msg} onClose={onClose} embedded />

                <table className="w-full text-[11px]">
                    <tbody>
                        {rows.map(([label, value]) => (
                            <tr key={label}>
                                <td
                                    className="py-1 pr-3 align-top whitespace-nowrap"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {label}
                                </td>
                                <td className="py-1 break-all" style={{ color: 'var(--text-primary)' }}>
                                    {value}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {!msg.read && (
                    <button
                        onClick={() => {
                            ack(msg);
                            onClose();
                        }}
                        className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                    >
                        <Check size={13} />
                        {t('messages.acknowledge')}
                    </button>
                )}
            </div>
        </ConfigModal>
    );
}
