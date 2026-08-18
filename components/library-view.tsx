'use client';

import { Skull, WifiOff } from 'lucide-react';
import MediaCard from '@/components/media-card';
import { Button } from '@/components/ui/button';
import type { MediaItem } from '@/lib/tmdb/types';

interface ContinueCard {
    item: MediaItem;
    progressPct: number | null;
    badge: string | null;
}

interface LibraryViewProps {
    loading: boolean;
    error: boolean;
    onRetry: () => void;
    /** Continue-watching cards, newest first. */
    continueCards: ContinueCard[];
    /** Favourite cards, oldest first. */
    favouriteCards: MediaItem[];
    /** Every card opens the detail modal — the reminder of what it was, with
     * Continue watching / Start over right there. */
    onSelect: (item: MediaItem) => void;
    onBrowse: () => void;
}

const GRID_CLASSES =
    'mt-3 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

/** Section title for the light library screen — big and bold reads as a
 * heading; the gold kicker style stays on the dark watch page. */
function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="font-heading text-xl font-bold tracking-tight">{children}</h3>;
}

/** The library tab: the user's saved watch progress and favourites, rendered
 * from the two server lists. One tab holds both so the header stays lean. */
export default function LibraryView({
    loading,
    error,
    onRetry,
    continueCards,
    favouriteCards,
    onSelect,
    onBrowse,
}: LibraryViewProps) {
    if (loading) {
        return (
            <div role="status" aria-label="Loading library" className="space-y-8">
                <section aria-hidden>
                    <SectionTitle>Continue watching</SectionTitle>
                    <div className={GRID_CLASSES}>
                        {Array.from({ length: 6 }, (_, index) => (
                            <div
                                key={index}
                                className="aspect-2/3 animate-pulse rounded-xl bg-muted/60"
                            />
                        ))}
                    </div>
                </section>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
                <WifiOff aria-hidden className="size-10 text-muted-foreground" />
                <p className="font-heading text-lg font-semibold">
                    Shore leave — the signal's down
                </p>
                <p className="max-w-sm text-base text-muted-foreground">
                    Couldn't load your library. Try again in a moment.
                </p>
                <Button variant="outline" onClick={onRetry}>
                    Try again
                </Button>
            </div>
        );
    }

    if (continueCards.length === 0 && favouriteCards.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
                <Skull aria-hidden className="size-10 text-muted-foreground" />
                <p className="font-heading text-lg font-semibold">No treasure yet</p>
                <p className="max-w-sm text-base text-muted-foreground">
                    Start watching something or heart a title and it lands here — ready on any
                    device.
                </p>
                <Button variant="outline" onClick={onBrowse}>
                    Start browsing
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {continueCards.length > 0 && (
                <section aria-label="Continue watching">
                    <SectionTitle>Continue watching</SectionTitle>
                    <div className={GRID_CLASSES}>
                        {continueCards.map((card) => (
                            <MediaCard
                                key={`${card.item.mediaType}:${card.item.id}`}
                                item={card.item}
                                progressPct={card.progressPct ?? undefined}
                                badge={card.badge ?? undefined}
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                </section>
            )}
            <section
                aria-label="Favourites"
                // Hairline between the two sections; skipped when Continue
                // watching is empty so no stray line floats at the top.
                className={continueCards.length > 0 ? 'border-t border-border pt-8' : undefined}
            >
                <SectionTitle>Favourites</SectionTitle>
                {favouriteCards.length > 0 ? (
                    <div className={GRID_CLASSES}>
                        {favouriteCards.map((item) => (
                            <MediaCard
                                key={`${item.mediaType}:${item.id}`}
                                item={item}
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                        No favourites yet — click the heart on anything you like and it shows up
                        here.
                    </p>
                )}
            </section>
        </div>
    );
}
