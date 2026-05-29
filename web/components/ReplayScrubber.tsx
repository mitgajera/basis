"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

const SPEED_OPTIONS = [1, 5, 30, 120] as const;

interface ReplayScrubberProps {
  startTs: number;
  endTs: number;
  currentTs: number;
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (ts: number) => void;
  onSpeedChange: (speed: number) => void;
  onSkipStart: () => void;
  onSkipEnd: () => void;
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function ReplayScrubber({
  startTs, endTs, currentTs, playing, speed,
  onPlay, onPause, onSeek, onSpeedChange, onSkipStart, onSkipEnd,
}: ReplayScrubberProps) {
  const progress = endTs > startTs
    ? Math.min((currentTs - startTs) / (endTs - startTs), 1)
    : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(startTs + pct * (endTs - startTs));
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4 space-y-3">
      {/* Controls row */}
      <div className="flex items-center gap-4">
        <button onClick={onSkipStart} className="text-text-tertiary hover:text-text-primary transition-colors">
          <SkipBack size={16} />
        </button>
        <button
          onClick={playing ? onPause : onPlay}
          className="w-8 h-8 rounded-md bg-accent text-bg-base flex items-center justify-center hover:bg-accent-hover transition-colors"
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={onSkipEnd} className="text-text-tertiary hover:text-text-primary transition-colors">
          <SkipForward size={16} />
        </button>

        <div className="flex items-center gap-1 ml-2">
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`text-xs px-2 py-1 rounded transition-colors duration-150 ${
                speed === s
                  ? "bg-bg-surface-2 text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>

        <span className="ml-auto tabular-mono text-xs text-text-secondary">
          {formatTs(currentTs)}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-1.5 rounded-full bg-bg-surface-2 cursor-pointer relative"
        onClick={handleProgressClick}
      >
        <div
          className="h-full rounded-full bg-accent transition-none"
          style={{ width: `${progress * 100}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent border-2 border-bg-surface cursor-pointer"
          style={{ left: `calc(${progress * 100}% - 6px)` }}
        />
      </div>

      <div className="flex justify-between text-[11px] text-text-tertiary tabular-mono">
        <span>{formatTs(startTs)}</span>
        <span>{formatTs(endTs)}</span>
      </div>
    </div>
  );
}
