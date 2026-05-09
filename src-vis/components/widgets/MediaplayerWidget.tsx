import { useMemo, useState } from 'react';
import {
  Music, Play, Pause, SkipBack, SkipForward,
  Shuffle, Repeat, Volume2, VolumeX, Speaker,
} from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import type { WidgetProps } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { CustomGridView } from './CustomGridView';
import { StatusBadges } from './StatusBadges';
import { useStatusFields } from '../../hooks/useStatusFields';
import { useDashboardMobile } from '../../contexts/DashboardMobileContext';
import type { CustomGrid } from '../../types';

// ── Types ─────────────────────────────────────────────────────────────────────

type MediaChip = {
  id: string;
  label: string;
  icon?: string;
  dp: string;
  value?: string | number | boolean;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CoverImage({ src, Icon, iconSize }: { src: string; Icon: React.ElementType | null; iconSize: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="w-full h-full rounded-xl object-cover"
      />
    );
  }
  return (
    <div
      className="w-full h-full rounded-xl flex items-center justify-center"
      style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
    >
      {Icon && <Icon size={iconSize} style={{ color: 'var(--text-secondary)' }} />}
    </div>
  );
}

function IconBtn({ icon: Icon, size = 'sm', onClick, active }: {
  icon: React.ElementType;
  size?: 'sm' | 'md';
  onClick: () => void;
  active?: boolean;
}) {
  const sz = size === 'sm' ? 14 : 17;
  const pad = size === 'sm' ? 'p-1.5' : 'p-2';
  return (
    <button
      onClick={onClick}
      className={`${pad} rounded-full hover:opacity-80 transition-opacity`}
      style={{
        background: active ? 'var(--accent)22' : 'var(--app-bg)',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        border: `1px solid ${active ? 'var(--accent)44' : 'var(--app-border)'}`,
      }}
    >
      <Icon size={sz} />
    </button>
  );
}

function PlayPauseBtn({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  const Icon = playing ? Pause : Play;
  return (
    <button
      onClick={onClick}
      className="p-2.5 rounded-full hover:opacity-80 transition-opacity"
      style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
    >
      <Icon size={18} fill="currentColor" />
    </button>
  );
}

function VolumeSlider({ pct, step, onChange, compact }: {
  pct: number;
  step: number;
  onChange: (p: number) => void;
  compact?: boolean;
}) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={step}
      value={pct}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ accentColor: 'var(--accent)', width: compact ? '72px' : '100%' }}
      className="nodrag h-1.5 rounded-full appearance-none cursor-pointer"
    />
  );
}

function ChipRow({ chips, onTrigger }: {
  chips: MediaChip[];
  onTrigger: (chip: MediaChip) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto nodrag" style={{ scrollbarWidth: 'none', paddingBottom: '2px' }}>
      {chips.map((chip) => {
        const ChipIcon = getWidgetIcon(chip.icon, Music);
        return (
          <button
            key={chip.id}
            onClick={() => onTrigger(chip)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap hover:opacity-80 transition-opacity shrink-0"
            style={{
              background: 'var(--app-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--app-border)',
              fontSize: '11px',
            }}
          >
            <ChipIcon size={12} />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

function ProgressBar({ pct, progressStr, durationStr }: {
  pct: number;
  progressStr?: string;
  durationStr?: string;
}) {
  const hasText = !!(progressStr || durationStr);
  return (
    <div className="space-y-0.5">
      <div className="relative h-1 rounded-full overflow-hidden" style={{ background: 'var(--app-border)' }}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width]" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: 'var(--accent)' }} />
      </div>
      {hasText && (
        <div className="flex justify-between" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
          <span>{progressStr ?? ''}</span>
          <span>{durationStr ?? ''}</span>
        </div>
      )}
    </div>
  );
}

// ── Default custom grid for layout='custom' ───────────────────────────────────

export const DEFAULT_MEDIAPLAYER_GRID: CustomGrid = [
  { type: 'component', componentKey: 'cover',     align: 'center', valign: 'middle' },
  { type: 'title',     fontSize: 14, bold: true,   align: 'left',   valign: 'top' },
  { type: 'component', componentKey: 'play-pause', align: 'center', valign: 'middle' },
  { type: 'empty' },
  { type: 'field',     fieldKey: 'artist',          align: 'left',   valign: 'middle' },
  { type: 'component', componentKey: 'volume-slider', align: 'right', valign: 'middle' },
  { type: 'empty' },
  { type: 'component', componentKey: 'chips',       align: 'left',   valign: 'bottom' },
  { type: 'empty' },
];

// ── Main widget ───────────────────────────────────────────────────────────────

export function MediaplayerWidget({ config }: WidgetProps) {
  const o = config.options ?? {};
  const layout = config.layout ?? 'default';
  const { setState } = useIoBroker();
  const isMobile = useDashboardMobile();

  const { value: title }       = useDatapoint((o.titleDp          as string) ?? '');
  const { value: artist }      = useDatapoint((o.artistDp         as string) ?? '');
  const { value: album }       = useDatapoint((o.albumDp          as string) ?? '');
  const { value: cover }       = useDatapoint((o.coverDp          as string) ?? '');
  const { value: source }      = useDatapoint((o.sourceDp         as string) ?? '');
  const { value: playState }   = useDatapoint((o.playStateDp      as string) ?? '');
  const { value: rawVol }      = useDatapoint((o.volumeDp         as string) ?? '');
  const { value: muted }       = useDatapoint((o.muteDp           as string) ?? '');
  const { value: mediaProgress } = useDatapoint((o.mediaProgressDp as string) ?? '');
  const { value: mediaLength }   = useDatapoint((o.mediaLengthDp   as string) ?? '');
  const { value: mediaProgressStr } = useDatapoint((o.mediaProgressStrDp as string) ?? '');
  const { value: mediaLengthStr }   = useDatapoint((o.mediaLengthStrDp   as string) ?? '');

  const isPlaying = useMemo(
    () => playState === true || playState === 1 || playState === 'play' || playState === 'playing',
    [playState],
  );

  const progressPct = useMemo(() => {
    if (typeof mediaLength === 'number' && mediaLength > 0 && typeof mediaProgress === 'number') {
      return Math.min(100, Math.max(0, (mediaProgress / mediaLength) * 100));
    }
    if (typeof mediaProgress === 'number' && mediaProgress >= 0 && mediaProgress <= 100) {
      return mediaProgress;
    }
    return 0;
  }, [mediaProgress, mediaLength]);

  const showProgress = !!(o.mediaProgressDp || o.mediaLengthDp);

  const volMin  = (o.volumeMin  as number) ?? 0;
  const volMax  = (o.volumeMax  as number) ?? 100;
  const volStep = (o.volumeStep as number) ?? 1;
  const volRange = volMax - volMin || 1;

  const volPct = typeof rawVol === 'number'
    ? Math.min(100, Math.max(0, Math.round(((rawVol - volMin) / volRange) * 100)))
    : 0;

  const writeVol = (pct: number) => {
    if (!o.volumeDp) return;
    const raw = volMin + (pct / 100) * volRange;
    const stepped = Math.round(raw / volStep) * volStep;
    setState(o.volumeDp as string, stepped);
  };

  const trigger = (dp?: unknown) => {
    if (typeof dp === 'string' && dp) setState(dp, true);
  };

  const handlePlayPause = () => {
    if (isPlaying) trigger(o.pauseDp);
    else           trigger(o.playDp);
  };

  const handleChip = (chip: MediaChip) => {
    if (!chip.dp) return;
    setState(chip.dp, chip.value !== undefined ? chip.value : true);
  };

  // muteViaVolume: Mute durch Volume=0 (z.B. Alexa unterstützt kein echtes Mute-Write)
  const muteViaVolume = !!(o.muteViaVolume);
  const [savedVolPct, setSavedVolPct] = useState<number | null>(null);
  const isActuallyMuted = muteViaVolume ? volPct === 0 : Boolean(muted);

  const handleMute = () => {
    if (muteViaVolume) {
      if (volPct === 0) {
        writeVol(savedVolPct ?? 50);
        setSavedVolPct(null);
      } else {
        setSavedVolPct(volPct);
        writeVol(0);
      }
    } else if (typeof o.muteDp === 'string' && o.muteDp) {
      setState(o.muteDp, !muted);
    }
  };

  // Sichtbarkeits-Defaults (konfigurierbar via options.show*)
  const showCover    = o.showCover    !== false;
  const showSubtitle = o.showSubtitle !== false;
  const showSource   = o.showSource   !== false && !!(o.sourceDp);
  const showShuffle  = o.showShuffle  !== false && !!(o.shuffleDp);
  const showRepeat   = o.showRepeat   !== false && !!(o.repeatDp);
  const showPrev     = o.showPrev     !== false && !!(o.prevDp);
  const showNext     = o.showNext     !== false && !!(o.nextDp);
  const showVolume   = o.showVolume   !== false && !!(o.volumeDp);
  const showMute     = o.showMute     !== false && (!!(o.muteDp) || muteViaVolume);
  const chips        = (o.chips as MediaChip[] | undefined) ?? [];
  const showChips    = o.showChips    !== false && chips.length > 0;

  const titleStr  = String(title  ?? '');
  const artistStr = String(artist ?? '');
  const albumStr  = String(album  ?? '');
  const sourceStr = String(source ?? '');
  const coverStr  = String(cover  ?? '');
  const subtitle  = [artistStr, albumStr].filter(Boolean).join(' · ');

  const { battery, reach, batteryIcon, reachIcon, statusBadges } = useStatusFields(config);

  const showIcon   = o.showIcon   !== false;
  const WidgetIcon = getWidgetIcon(o.icon as string | undefined, Music);
  const iconSize   = (o.iconSize  as number) || 36;

  // ── CUSTOM ───────────────────────────────────────────────────────────────────
  if (layout === 'custom') {
    const customGrid = (o.customGrid as CustomGrid | undefined) ?? DEFAULT_MEDIAPLAYER_GRID;
    return (
      <CustomGridView
        config={{ ...config, options: { ...o, customGrid } }}
        value={titleStr}
        extraFields={{ title: titleStr, artist: artistStr, album: albumStr, source: sourceStr, volume: `${volPct}%`, battery, reach }}
        extraComponents={{
          cover:           <CoverImage src={coverStr} Icon={showIcon ? WidgetIcon : null} iconSize={iconSize} />,
          'play-pause':    <PlayPauseBtn playing={isPlaying} onClick={handlePlayPause} />,
          prev:            <IconBtn icon={SkipBack}    onClick={() => trigger(o.prevDp)} />,
          next:            <IconBtn icon={SkipForward} onClick={() => trigger(o.nextDp)} />,
          shuffle:         <IconBtn icon={Shuffle}     onClick={() => trigger(o.shuffleDp)} />,
          repeat:          <IconBtn icon={Repeat}      onClick={() => trigger(o.repeatDp)} />,
          mute:            <IconBtn icon={isActuallyMuted ? VolumeX : Volume2} onClick={handleMute} />,
          'volume-slider': <VolumeSlider pct={volPct} step={volStep} onChange={writeVol} />,
          chips:           showChips ? <ChipRow chips={chips} onTrigger={handleChip} /> : null,
          'status-badges': statusBadges,
          'battery-icon':  batteryIcon,
          'reach-icon':    reachIcon,
        }}
      />
    );
  }

  // ── MOBILE: vertikaler Aufbau ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex flex-col gap-3 w-full">
        {/* Cover: halbe Widget-Breite, quadratisch, zentriert */}
        {showCover && (
          <div className="rounded-xl overflow-hidden self-center shrink-0" style={{ width: '50%', aspectRatio: '1 / 1' }}>
            <CoverImage src={coverStr} Icon={showIcon ? WidgetIcon : null} iconSize={iconSize} />
          </div>
        )}

        {/* Titel + Untertitel */}
        <div className="shrink-0 space-y-0.5 text-center min-w-0">
          <p className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {titleStr || '–'}
          </p>
          {showSubtitle && subtitle && (
            <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
              {subtitle}
            </p>
          )}
          {showSource && sourceStr && (
            <p className="flex items-center justify-center gap-1 text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              <Speaker size={12} />
              {sourceStr}
            </p>
          )}
        </div>

        {/* Fortschritt */}
        {showProgress && (
          <div className="shrink-0 px-1">
            <ProgressBar
              pct={progressPct}
              progressStr={mediaProgressStr != null ? String(mediaProgressStr) : undefined}
              durationStr={mediaLengthStr   != null ? String(mediaLengthStr)   : undefined}
            />
          </div>
        )}

        {/* Steuerung */}
        <div className="shrink-0 flex items-center justify-center gap-2">
          {showShuffle && <IconBtn icon={Shuffle}     onClick={() => trigger(o.shuffleDp)} />}
          {showPrev    && <IconBtn icon={SkipBack}    size="md" onClick={() => trigger(o.prevDp)} />}
          <PlayPauseBtn playing={isPlaying} onClick={handlePlayPause} />
          {showNext    && <IconBtn icon={SkipForward} size="md" onClick={() => trigger(o.nextDp)} />}
          {showRepeat  && <IconBtn icon={Repeat}      onClick={() => trigger(o.repeatDp)} />}
        </div>

        {/* Lautstärke */}
        {(showVolume || showMute) && (
          <div className="shrink-0 space-y-1.5 px-1">
            <div className="flex items-center gap-2">
              {showMute && (
                <IconBtn
                  icon={isActuallyMuted ? VolumeX : Volume2}
                  onClick={handleMute}
                />
              )}
              {showVolume && <VolumeSlider pct={volPct} step={volStep} onChange={writeVol} />}
              {showVolume && (
                <span className="shrink-0 text-[11px] tabular-nums" style={{ color: 'var(--text-secondary)', minWidth: '28px', textAlign: 'right' }}>
                  {volPct} %
                </span>
              )}
            </div>
            {showVolume && (
              <div className="flex gap-1.5">
                {[25, 50, 75, 100].map((p) => (
                  <button
                    key={p}
                    onClick={() => writeVol(p)}
                    className="flex-1 text-[11px] py-1 rounded-lg hover:opacity-80 transition-opacity"
                    style={{
                      background: volPct === p ? 'var(--accent)22' : 'var(--app-bg)',
                      color: volPct === p ? 'var(--accent)' : 'var(--text-secondary)',
                      border: `1px solid ${volPct === p ? 'var(--accent)44' : 'var(--app-border)'}`,
                    }}
                  >{p}%</button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Schnellzugriff-Chips */}
        {showChips && <div className="shrink-0"><ChipRow chips={chips} onTrigger={handleChip} /></div>}

        <div className="shrink-0"><StatusBadges config={config} /></div>
      </div>
    );
  }

  // ── COMPACT ──────────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex flex-col h-full gap-1 justify-center">
        <div className="flex items-center gap-2 min-w-0">
          {/* Cover thumbnail */}
          {showCover && (
            <div className="shrink-0 rounded-md overflow-hidden" style={{ width: 36, height: 36 }}>
              <CoverImage src={coverStr} Icon={showIcon ? WidgetIcon : null} iconSize={iconSize} />
            </div>
          )}

          {/* Title + Artist */}
          <div className="flex flex-col flex-1 min-w-0 leading-tight">
            <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {titleStr || '–'}
            </p>
            {showSubtitle && subtitle && (
              <p className="text-[10px] truncate" style={{ color: 'var(--text-secondary)' }}>
                {subtitle}
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="shrink-0 flex items-center gap-0.5">
            {showPrev  && <IconBtn icon={SkipBack}    onClick={() => trigger(o.prevDp)} />}
            <PlayPauseBtn playing={isPlaying} onClick={handlePlayPause} />
            {showNext  && <IconBtn icon={SkipForward} onClick={() => trigger(o.nextDp)} />}
          </div>

          {/* Volume */}
          {(showMute || showVolume) && (
            <div className="shrink-0 flex items-center gap-1">
              {showMute && (
                <IconBtn icon={isActuallyMuted ? VolumeX : Volume2} onClick={handleMute} />
              )}
              {showVolume && (
                <VolumeSlider pct={volPct} step={volStep} onChange={writeVol} compact />
              )}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {showProgress && (
          <ProgressBar
            pct={progressPct}
            progressStr={mediaProgressStr != null ? String(mediaProgressStr) : undefined}
            durationStr={mediaLengthStr   != null ? String(mediaLengthStr)   : undefined}
          />
        )}

        <StatusBadges config={config} />
      </div>
    );
  }

  // ── DEFAULT ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-2" style={{ position: 'relative' }}>
      {/* Main row: cover füllt volle Höhe, rechts alle Elemente */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Cover: self-stretch + aspect-ratio → quadratisch, so groß wie die Zeile */}
        {showCover && (
          <div className="shrink-0 self-stretch rounded-xl overflow-hidden" style={{ aspectRatio: '1 / 1' }}>
            <CoverImage src={coverStr} Icon={showIcon ? WidgetIcon : null} iconSize={iconSize} />
          </div>
        )}

        {/* Rechte Spalte */}
        <div className="flex flex-col flex-1 min-w-0 gap-1 min-h-0">
          {/* Track info */}
          <div className="shrink-0 space-y-0.5 min-w-0">
            <p className="text-sm font-semibold truncate leading-snug" style={{ color: 'var(--text-primary)' }}>
              {titleStr || '–'}
            </p>
            {showSubtitle && subtitle && (
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {subtitle}
              </p>
            )}
            {showSource && sourceStr && (
              <p className="flex items-center gap-1 text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
                <Speaker size={11} />
                {sourceStr}
              </p>
            )}
          </div>

          {/* Flex-Spacer: schiebt Steuerung nach unten */}
          <div className="flex-1 min-h-0" />

          {/* Fortschrittsbalken */}
          {showProgress && (
            <div className="shrink-0">
              <ProgressBar
                pct={progressPct}
                progressStr={mediaProgressStr != null ? String(mediaProgressStr) : undefined}
                durationStr={mediaLengthStr   != null ? String(mediaLengthStr)   : undefined}
              />
            </div>
          )}

          {/* Steuerung */}
          <div className="shrink-0 flex items-center gap-1">
            {showShuffle && <IconBtn icon={Shuffle}     onClick={() => trigger(o.shuffleDp)} />}
            {showPrev    && <IconBtn icon={SkipBack}    onClick={() => trigger(o.prevDp)} />}
            <PlayPauseBtn playing={isPlaying} onClick={handlePlayPause} />
            {showNext    && <IconBtn icon={SkipForward} onClick={() => trigger(o.nextDp)} />}
            {showRepeat  && <IconBtn icon={Repeat}      onClick={() => trigger(o.repeatDp)} />}
          </div>

          {/* Lautstärke: Mute + voller Slider + Zahl */}
          {(showMute || showVolume) && (
            <div className="shrink-0 flex items-center gap-1.5">
              {showMute && (
                <IconBtn
                  icon={isActuallyMuted ? VolumeX : Volume2}
                  onClick={handleMute}
                />
              )}
              {showVolume && (
                <>
                  <VolumeSlider pct={volPct} step={volStep} onChange={writeVol} />
                  <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--text-secondary)', minWidth: '24px' }}>
                    {volPct}%
                  </span>
                </>
              )}
            </div>
          )}

          {/* Lautstärke-Schnellwahl */}
          {showVolume && (
            <div className="shrink-0 flex gap-1">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => writeVol(p)}
                  className="flex-1 text-[10px] py-0.5 rounded hover:opacity-80 transition-opacity"
                  style={{
                    background: volPct === p ? 'var(--accent)22' : 'var(--app-bg)',
                    color:      volPct === p ? 'var(--accent)'   : 'var(--text-secondary)',
                    border:     `1px solid ${volPct === p ? 'var(--accent)44' : 'var(--app-border)'}`,
                  }}
                >{p}%</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chip-Zeile (volle Breite) */}
      {showChips && <ChipRow chips={chips} onTrigger={handleChip} />}

      <StatusBadges config={config} />
    </div>
  );
}
