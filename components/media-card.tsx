'use client';

import { Play, Star } from 'lucide-react';
import MediaPoster from '@/components/media-poster';
import type { MediaItem } from '@/lib/tmdb/types';

interface MediaCardProps {
    item: MediaItem;
    onSelect: (item: MediaItem) => void;
    /** Watch progress as a percent — renders the gold bar (library cards). */
    progressPct?: number;
    /** Small badge chip on the poster, e.g. "S2E5" for tv progress. */
    badge?: string;
}

/** Poster card in a browse grid. The whole card is one button: the poster
 * zooms slightly and a play hint fades in on hover/focus. */
export default function MediaCard({ item, onSelect, progressPct, badge }: MediaCardProps) {
    const hasMeta = item.rating != null || item.year != null;
    return (
        <button
            type="button"
            onClick={() => onSelect(item)}
            className="group flex flex-col gap-2 rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-gold/60"
        >
            <div className="relative overflow-hidden rounded-xl ring-1 ring-border transition-all duration-300 group-hover:shadow-lg group-hover:shadow-black/30 group-hover:ring-gold/70">
                <MediaPoster
                    item={item}
                    className="transition-transform duration-300 ease-out group-hover:scale-105"
                />
                <span
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover:bg-black/30 group-focus-visible:bg-black/30"
                >
                    <Play className="size-10 text-white opacity-0 drop-shadow-lg transition-all duration-300 group-focus-visible:opacity-100 group-hover:opacity-100" />
                </span>
                {badge != null && (
                    <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
                        {badge}
                    </span>
                )}
                {progressPct != null && (
                    <div
                        aria-hidden
                        className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-black/50"
                    >
                        <div
                            className="h-full rounded-full bg-gold"
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                )}
            </div>
            <span className="w-full truncate text-sm font-medium">{item.title ?? 'Untitled'}</span>
            {hasMeta && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {item.rating != null && (
                        <>
                            <Star aria-hidden className="size-3 fill-gold text-gold" />
                            {item.rating.toFixed(1)}
                        </>
                    )}
                    {item.rating != null && item.year != null && <span aria-hidden>·</span>}
                    {item.year}
                </span>
            )}
        </button>
    );
}
