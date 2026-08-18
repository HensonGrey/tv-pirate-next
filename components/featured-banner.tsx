'use client';

import { Fragment, type ReactNode } from 'react';
import { Film, Play, Star, TrendingUp, Tv } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MediaItem } from '@/lib/tmdb/types';

interface FeaturedBannerProps {
    item: MediaItem;
    onDetails: (item: MediaItem) => void;
    /** Same action as the card modal's Continue watching — straight to the player. */
    onWatch: (item: MediaItem) => void;
}

/** Hero banner on the Trending tab — the #1 title. Real backdrop under a
 * scrim; titles without one get a quiet dark gradient instead. */
export default function FeaturedBanner({ item, onDetails, onWatch }: FeaturedBannerProps) {
    const TypeIcon = item.mediaType === 'tv' ? Tv : Film;

    // The meta line only shows what TMDB has — missing pieces are skipped, not blank.
    const metaParts: ReactNode[] = [];
    if (item.rating != null) {
        metaParts.push(
            <span key="rating" className="inline-flex items-center gap-1 font-medium text-white">
                <Star aria-hidden className="size-4 fill-gold text-gold" />
                {item.rating.toFixed(1)}
            </span>,
        );
    }
    if (item.year != null) metaParts.push(<span key="year">{item.year}</span>);
    if (item.mediaType != null) {
        metaParts.push(<span key="type">{item.mediaType === 'tv' ? 'Series' : 'Movie'}</span>);
    }
    if (item.genres.length > 0) {
        metaParts.push(
            <span key="genres" className="hidden sm:inline">
                {item.genres.join(' · ')}
            </span>,
        );
    }

    return (
        <section
            aria-label="Featured today"
            className="relative overflow-hidden rounded-2xl ring-1 ring-border"
        >
            {item.backdropUrl != null && (
                <img
                    src={item.backdropUrl}
                    alt=""
                    aria-hidden
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover"
                />
            )}
            <div
                className="relative flex min-h-[380px] flex-col items-start justify-end gap-3 p-6 sm:min-h-[420px] sm:p-10"
                style={{
                    backgroundImage:
                        item.backdropUrl != null
                            ? 'linear-gradient(to top, rgb(0 0 0 / 0.88), rgb(0 0 0 / 0.15) 45%, rgb(0 0 0 / 0.3))'
                            : 'linear-gradient(to top, rgb(0 0 0 / 0.88), rgb(0 0 0 / 0.15) 45%, rgb(0 0 0 / 0.3)), linear-gradient(115deg, oklch(0.27 0.04 265), oklch(0.20 0.04 300))',
                }}
            >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs font-semibold tracking-wider text-gold uppercase backdrop-blur-sm">
                    <TrendingUp aria-hidden className="size-3.5" />
                    #1 Trending today
                </span>
                <h1 className="font-heading text-3xl font-black tracking-tight text-white [text-shadow:0_2px_14px_rgb(0_0_0/0.7)] sm:text-5xl">
                    {item.title ?? 'Untitled'}
                </h1>
                {metaParts.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/95">
                        {metaParts.map((part, index) => (
                            <Fragment key={index}>
                                {index > 0 && <span aria-hidden>·</span>}
                                {part}
                            </Fragment>
                        ))}
                    </div>
                )}
                {item.overview != null && (
                    <p className="max-w-xl text-sm leading-relaxed text-white/90 [text-shadow:0_1px_8px_rgb(0_0_0/0.6)] sm:text-base">
                        {item.overview}
                    </p>
                )}
                <div className="mt-2 flex items-center gap-3">
                    <Button
                        size="lg"
                        onClick={() => onWatch(item)}
                        className="bg-gold font-semibold text-gold-foreground hover:bg-gold/85"
                    >
                        <Play />
                        Watch
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={() => onDetails(item)}
                        className="border-white/40 bg-black/30 text-white backdrop-blur-sm hover:bg-black/50 hover:text-white dark:border-white/40 dark:bg-black/30"
                    >
                        More info
                    </Button>
                </div>
            </div>
            {item.mediaType != null && (
                <TypeIcon
                    aria-hidden
                    className="absolute -right-6 -bottom-8 size-48 rotate-12 text-white/5"
                />
            )}
        </section>
    );
}
