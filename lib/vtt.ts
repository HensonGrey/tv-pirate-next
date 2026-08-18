/** One caption cue: the time window and the text to show inside it. */
export interface VttCue {
    start: number;
    end: number;
    text: string;
}

/** Minimal WebVTT parser — cue blocks only, no styles/regions/chapters.
 * Enough for OpenSubtitles output (and it strips inline tags, which React
 * would render as literal text). */
export function parseVtt(vtt: string): VttCue[] {
    const cues: VttCue[] = [];
    const blocks = vtt.replace(/\r/g, '').split('\n\n');
    for (const block of blocks) {
        const lines = block.split('\n');
        const timeLine = lines.findIndex((l) => l.includes('-->'));
        if (timeLine === -1) continue;
        const [start, rest] = lines[timeLine].split('-->');
        const text = lines
            .slice(timeLine + 1)
            .join('\n')
            .replace(/<[^>]+>/g, '')
            .trim();
        if (!text) continue;
        // The end timestamp may carry cue settings ("00:00:05.000 position:50%").
        const end = rest.trim().split(/\s+/)[0];
        cues.push({ start: parseTimestamp(start.trim()), end: parseTimestamp(end), text });
    }
    return cues.sort((a, b) => a.start - b.start);
}

/** "HH:MM:SS.mmm" or "MM:SS.mmm" → seconds. */
function parseTimestamp(ts: string): number {
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parts[0] * 60 + parts[1];
}
