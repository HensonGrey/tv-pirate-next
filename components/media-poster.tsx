'use client';

import { Film, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MediaItem } from '@/lib/tmdb/types';

interface MediaPosterProps {
    item: MediaItem;
    className?: string;
}

/** Poster gradients for titles with no artwork. Picked deterministically
 * from the title, so a title always gets the same placeholder. */
const PALETTE: readonly (readonly [string, string])[] = [
    ['oklch(0.52 0.18 262)', 'oklch(0.34 0.16 302)'],
    ['oklch(0.55 0.15 200)', 'oklch(0.36 0.14 240)'],
    ['oklch(0.58 0.19 28)', 'oklch(0.45 0.20 55)'],
    ['oklch(0.50 0.16 150)', 'oklch(0.38 0.14 190)'],
    ['oklch(0.55 0.19 330)', 'oklch(0.42 0.17 290)'],
    ['oklch(0.56 0.15 85)', 'oklch(0.42 0.13 120)'],
    ['oklch(0.48 0.12 220)', 'oklch(0.30 0.12 260)'],
    ['oklch(0.60 0.17 15)', 'oklch(0.48 0.19 350)'],
];

function gradientFor(title: string): readonly [string, string] {
    let hash = 0;
    for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Poster artwork: a real img from TMDB's CDN, or a gradient placeholder
 * with watermark letter + type badge. The aspect box exists in both modes
 * so swapping never shifts layout. */
export default function MediaPoster({ item, className }: MediaPosterProps) {
    if (item.posterUrl != null) {
        return (
            <img
                src={item.posterUrl}
                alt={item.title ?? 'Poster'}
                loading="lazy"
                decoding="async"
                className={cn('aspect-2/3 w-full rounded-xl object-cover', className)}
            />
        );
    }

    const TypeIcon = item.mediaType === 'tv' ? Tv : Film;
    const [from, to] = gradientFor(item.title ?? 'Untitled');
    return (
        <div
            role="img"
            aria-label={`${item.title ?? 'Untitled'} poster placeholder`}
            className={cn(
                'relative flex aspect-2/3 w-full select-none items-center justify-center overflow-hidden rounded-xl',
                className,
            )}
            style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
        >
            <span
                aria-hidden
                className="font-heading absolute text-[7rem] leading-none font-black tracking-tighter text-white/10"
            >
                {(item.title ?? '?').charAt(0)}
            </span>
            <TypeIcon aria-hidden className="absolute top-3 right-3 size-6 text-white/20" />
            <span className="absolute bottom-2 left-2 inline-flex items-center rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white/90 uppercase backdrop-blur-sm">
                {item.mediaType === 'tv' ? 'Series' : 'Movie'}
            </span>
        </div>
    );
}
