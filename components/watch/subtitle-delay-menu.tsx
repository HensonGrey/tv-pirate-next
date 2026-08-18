'use client';

import { Minus, Plus } from 'lucide-react';

interface SubtitleDelayMenuProps {
    /** Half-second ticks (0.5s step granularity, positive = delay the track). */
    delay: number;
    onChange: (delay: number) => void;
}

/** The subtitle-delay stepper, living inside the player's settings menu.
 * Rendered via DefaultVideoLayout's `slots` prop (settingsMenuItemsEnd) —
 * NOT as a slot-attribute child, which the layout renders inline in the
 * player flow (that squishes the video). */
export default function SubtitleDelayMenu({ delay, onChange }: SubtitleDelayMenuProps) {
    return (
        <div className="vds-menu-item flex items-center justify-between gap-3">
            <span className="vds-menu-item-label">Subtitle delay</span>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    aria-label="Delay subtitles 0.5 seconds less"
                    disabled={delay <= -20}
                    onClick={() => onChange(Math.max(delay - 1, -20))}
                    className="vds-menu-button vds-button flex size-8 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-40"
                >
                    <Minus className="size-4" />
                </button>
                <span className="vds-menu-item-hint w-10 text-center tabular-nums">
                    {formatDelay(delay)}
                </span>
                <button
                    type="button"
                    aria-label="Delay subtitles 0.5 seconds more"
                    disabled={delay >= 20}
                    onClick={() => onChange(Math.min(delay + 1, 20))}
                    className="vds-menu-button vds-button flex size-8 items-center justify-center rounded-md disabled:pointer-events-none disabled:opacity-40"
                >
                    <Plus className="size-4" />
                </button>
            </div>
        </div>
    );
}

/** Half-second ticks → a human label: 0 → "0s", 1 → "0.5s", -3 → "-1.5s". */
function formatDelay(ticks: number): string {
    return `${(ticks / 2).toFixed(1).replace(/\.0$/, '')}s`;
}
