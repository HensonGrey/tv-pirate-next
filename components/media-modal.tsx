'use client';

import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Clock, Heart, Layers, Play, RotateCcw, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MediaPoster from '@/components/media-poster';
import { cn } from '@/lib/utils';
import type { MediaItem } from '@/lib/tmdb/types';

interface MediaModalProps {
    /** Real per-user watch progress (percent 0–100) plus the episode that
     * owns the row — home computes it from the saved positions.
     * docs/decisions/watch-progress.md#schema */
    item: MediaItem & { progress?: number; progressSeason?: number; progressEpisode?: number };
    isFavourite: boolean;
    onToggleFavourite: () => void;
    /** Opens the watch view; the modal itself stays as-is (reworked later). */
    onWatch: () => void;
    /** Clears the saved row and starts from zero (only shown with progress). */
    onStartOver: () => void;
    onClose: () => void;
}

function formatRuntime(minutes: number) {
    const h = Math.floor(minutes / 60);
    return `${h}h ${minutes % 60}m`;
}

/** Detail dialog for a selected title. Hand-rolled (no dialog primitive
 * yet): Esc/backdrop close, scroll lock, close button focused on open. */
export default function MediaModal({
    item,
    isFavourite,
    onToggleFavourite,
    onWatch,
    onStartOver,
    onClose,
}: MediaModalProps) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', onKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [onClose]);

    const progress = item.progress;
    // An episode you finished isn't "continue watching" — it replays from zero.
    const isFinished = progress != null && progress >= 97;
    const watchLabel = progress != null && !isFinished ? 'Continue watching' : 'Watch';
    const progressLabel =
        progress != null && !isFinished
            ? item.progressSeason != null
                ? `S${item.progressSeason}E${item.progressEpisode} · ${progress}% watched`
                : `${progress}% watched`
            : null;

    // Same pattern as the banner: the meta line only shows what exists.
    const metaParts: ReactNode[] = [];
    if (item.year != null) metaParts.push(<span key="year">{item.year}</span>);
    if (item.mediaType != null) {
        metaParts.push(<span key="type">{item.mediaType === 'tv' ? 'Series' : 'Movie'}</span>);
    }
    if (item.rating != null) {
        metaParts.push(
            <span
                key="rating"
                className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 font-medium text-gold"
            >
                <Star aria-hidden className="size-3 fill-gold" />
                {item.rating.toFixed(1)}
            </span>,
        );
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`${item.title ?? 'Untitled'} details`}
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
        >
            <button
                type="button"
                aria-label="Close details"
                onClick={onClose}
                className="animate-in fade-in absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            <div className="animate-in fade-in zoom-in-95 slide-in-from-bottom-6 sm:slide-in-from-bottom-0 relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border bg-popover shadow-2xl duration-200 sm:max-h-[85dvh] sm:rounded-2xl">
                {/* Top-right controls: heart for favourites, X to close. */}
                <div className="absolute top-3 right-3 z-10 flex gap-2">
                    <button
                        type="button"
                        aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
                        aria-pressed={isFavourite}
                        onClick={onToggleFavourite}
                        className="flex size-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors outline-none hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                        <Heart
                            className={cn(
                                'size-5 transition-transform active:scale-90',
                                isFavourite && 'fill-gold text-gold',
                            )}
                        />
                    </button>
                    <button
                        ref={closeRef}
                        type="button"
                        aria-label="Close details"
                        onClick={onClose}
                        className="flex size-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors outline-none hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/70"
                    >
                        <X className="size-5" />
                    </button>
                </div>

                <div className="grid md:grid-cols-[minmax(0,240px)_1fr]">
                    {/* Poster column on md+ */}
                    <div className="hidden md:block">
                        <MediaPoster
                            item={item}
                            className="aspect-auto h-full w-full rounded-none"
                        />
                    </div>
                    {/* Short poster banner on mobile */}
                    <div className="h-36 md:hidden">
                        <MediaPoster
                            item={item}
                            className="aspect-auto h-full w-full rounded-none"
                        />
                    </div>

                    <div className="flex flex-col gap-4 p-5 sm:p-6">
                        <div className="pr-24">
                            {metaParts.length > 0 && (
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                    {metaParts.map((part, index) => (
                                        <Fragment key={index}>
                                            {index > 0 && <span aria-hidden>·</span>}
                                            {part}
                                        </Fragment>
                                    ))}
                                </div>
                            )}
                            <h2 className="font-heading mt-1.5 text-2xl font-bold tracking-tight">
                                {item.title ?? 'Untitled'}
                            </h2>
                            {item.mediaType === 'tv' && item.seasons != null && (
                                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Layers aria-hidden className="size-3.5" />
                                    {item.seasons} season{item.seasons === 1 ? '' : 's'}
                                    {item.episodes != null && ` · ${item.episodes} episodes`}
                                    {progressLabel != null && ` · ${progressLabel}`}
                                </p>
                            )}
                            {item.mediaType === 'movie' && item.runtimeMinutes != null && (
                                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Clock aria-hidden className="size-3.5" />
                                    {formatRuntime(item.runtimeMinutes)}
                                    {progressLabel != null && ` · ${progressLabel}`}
                                </p>
                            )}
                            {progress != null && !isFinished && (
                                <div
                                    role="progressbar"
                                    aria-valuenow={progress}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-label="Watch progress"
                                    className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted"
                                >
                                    <div
                                        className="h-full rounded-full bg-gold"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            {item.genres.map((genre) => (
                                <span
                                    key={genre}
                                    className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
                                >
                                    {genre}
                                </span>
                            ))}
                        </div>

                        {item.overview != null && (
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {item.overview}
                            </p>
                        )}

                        <div className="mt-auto flex items-center gap-2 pt-2">
                            <Button
                                size="lg"
                                onClick={onWatch}
                                className="bg-gold font-semibold text-gold-foreground hover:bg-gold/85"
                            >
                                <Play />
                                {watchLabel}
                            </Button>
                            {progress != null && !isFinished && (
                                <Button variant="outline" size="lg" onClick={onStartOver}>
                                    <RotateCcw />
                                    Start over
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
