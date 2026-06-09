import { Music, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useDatapoint } from '../../../hooks/useDatapoint';
import { useIoBroker } from '../../../hooks/useIoBroker';
import type { WidgetConfig } from '../../../types';

interface Props {
    widget: WidgetConfig;
}

export function MediaplayerPopupBody({ widget }: Props) {
    const o = widget.options ?? {};
    const { setState } = useIoBroker();

    const { value: title } = useDatapoint((o.titleDp as string) ?? widget.datapoint ?? '');
    const { value: artist } = useDatapoint((o.artistDp as string) ?? '');
    const { value: album } = useDatapoint((o.albumDp as string) ?? '');
    const { value: cover } = useDatapoint((o.coverDp as string) ?? '');
    const { value: playState } = useDatapoint((o.playStateDp as string) ?? '');
    const { value: rawVol } = useDatapoint((o.volumeDp as string) ?? '');
    const { value: muted } = useDatapoint((o.muteDp as string) ?? '');

    const isPlaying = playState === true || playState === 1 || playState === 'play' || playState === 'playing';
    const isMuted = Boolean(muted);

    const volMin = (o.volumeMin as number) ?? 0;
    const volMax = (o.volumeMax as number) ?? 100;
    const volStep = (o.volumeStep as number) ?? 1;
    const volRange = volMax - volMin || 1;
    const volPct =
        typeof rawVol === 'number' ? Math.min(100, Math.max(0, Math.round(((rawVol - volMin) / volRange) * 100))) : 0;

    const trigger = (dp?: unknown) => {
        if (typeof dp === 'string' && dp) setState(dp, true);
    };

    const writeVol = (pct: number) => {
        if (!o.volumeDp) return;
        const raw = volMin + (pct / 100) * volRange;
        setState(o.volumeDp as string, Math.round(raw / volStep) * volStep);
    };

    const handlePlayPause = () => (isPlaying ? trigger(o.pauseDp) : trigger(o.playDp));

    const coverSrc = cover ? String(cover) : '';
    const hasPrev = !!o.prevDp;
    const hasNext = !!o.nextDp;
    const hasVol = !!o.volumeDp;
    const hasMute = !!o.muteDp;

    const btnBase: React.CSSProperties = {
        background: 'var(--app-bg)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--app-border)',
    };

    return (
        <div className="flex flex-col gap-5 p-5" style={{ minWidth: 300 }}>
            {/* Cover + info */}
            <div className="flex gap-4 items-center">
                <div
                    className="shrink-0 w-20 h-20 rounded-xl overflow-hidden"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                >
                    {coverSrc ? (
                        <img src={coverSrc} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Music size={28} style={{ color: 'var(--text-secondary)' }} />
                        </div>
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                        {title ? String(title) : widget.title || '–'}
                    </p>
                    {artist && (
                        <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {String(artist)}
                        </p>
                    )}
                    {album && (
                        <p
                            className="text-[10px] truncate mt-0.5 opacity-60"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {String(album)}
                        </p>
                    )}
                </div>
            </div>

            {/* Transport controls */}
            <div className="flex items-center justify-center gap-3">
                {hasPrev && (
                    <button
                        onClick={() => trigger(o.prevDp)}
                        className="p-2 rounded-full hover:opacity-80 transition-opacity"
                        style={btnBase}
                    >
                        <SkipBack size={18} />
                    </button>
                )}
                <button
                    onClick={handlePlayPause}
                    className="p-3.5 rounded-full hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                >
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                {hasNext && (
                    <button
                        onClick={() => trigger(o.nextDp)}
                        className="p-2 rounded-full hover:opacity-80 transition-opacity"
                        style={btnBase}
                    >
                        <SkipForward size={18} />
                    </button>
                )}
            </div>

            {/* Volume */}
            {hasVol && (
                <div className="flex items-center gap-2">
                    {hasMute && (
                        <button
                            onClick={() => setState(o.muteDp as string, !isMuted)}
                            className="p-1.5 rounded-lg hover:opacity-80 transition-opacity shrink-0"
                            style={{
                                ...btnBase,
                                color: isMuted ? 'var(--accent-red, #ef4444)' : 'var(--text-secondary)',
                            }}
                        >
                            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                        </button>
                    )}
                    <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={isMuted ? 0 : volPct}
                        onChange={(e) => writeVol(Number(e.target.value))}
                        style={{ accentColor: 'var(--accent)', flex: 1 }}
                        className="h-1.5 rounded-full appearance-none cursor-pointer nodrag"
                    />
                    <span
                        className="text-xs tabular-nums shrink-0 w-9 text-right"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {isMuted ? 'Stumm' : `${volPct}%`}
                    </span>
                </div>
            )}
        </div>
    );
}
