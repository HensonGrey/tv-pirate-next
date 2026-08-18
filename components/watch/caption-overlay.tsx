'use client';

import { useMediaState } from '@vidstack/react';
import type { VttCue } from '@/lib/vtt';

/** Renders the active cue over the player. Self-owned instead of vidstack's
 * track pipeline — that one gates on media load state and its store kept
 * forcing tracks back to disabled, while this overlay is deterministic.
 * Must live inside MediaPlayer: useMediaState reads the player context.
 * delaySeconds shifts the whole track later (positive) — every subtitle
 * file is timed to its own release, so a constant offset is expected. */
export default function CaptionOverlay({
    cues,
    delaySeconds,
}: {
    cues: VttCue[];
    delaySeconds: number;
}) {
    const currentTime = useMediaState('currentTime');
    const shifted = currentTime + delaySeconds;
    const cue = cues.find((c) => shifted >= c.start && shifted < c.end);
    if (!cue) return null;
    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-6">
            <p className="max-w-[80%] rounded-md bg-black/70 px-4 py-2 text-center text-lg leading-snug font-medium text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.9)] sm:text-xl">
                {cue.text}
            </p>
        </div>
    );
}
