import type { ProgressRow } from './service';

/** A row at or past 97% is finished: resuming would replay the credits.
 * see: docs/decisions/watch-progress.md#resume-seam */
export function isFinished(row: ProgressRow): boolean {
    return row.durationSeconds != null && row.progressSeconds >= row.durationSeconds * 0.97;
}

export function progressPercent(row: ProgressRow): number | null {
    if (row.durationSeconds == null) return null;
    return Math.round((row.progressSeconds / row.durationSeconds) * 100);
}

/** Rows arrive newest first, so the first per title is the winning one. */
export function newestPerTitle(rows: ProgressRow[]): Map<string, ProgressRow> {
    const winners = new Map<string, ProgressRow>();
    for (const row of rows) {
        const key = `${row.mediaType}:${row.tmdbId}`;
        if (!winners.has(key)) winners.set(key, row);
    }
    return winners;
}
