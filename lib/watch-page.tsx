import { auth } from '@/auth';
import WatchScreen from '@/components/watch/watch-screen';
import { signOutAction } from '@/lib/auth/actions';
import { list as listFavourites } from '@/lib/favourites/service';
import { list as listProgress } from '@/lib/progress/service';
import { detail, seasonEpisodes } from '@/lib/tmdb/service';
import type { MediaItem, MediaType, SeasonInfo } from '@/lib/tmdb/types';

/** "1396-breaking-bad" — the leading digits are the tmdb id, the slug decorates. */
function tmdbIdFrom(slug: string): number {
    return Number(/^(\d+)/.exec(slug)?.[1] ?? 0);
}

/** Shared by the /movie and /tv routes: the title, its first season for shows,
 * and the heart state all resolve on the server so the page renders complete. */
export async function renderWatchPage(mediaType: MediaType, slug: string) {
    const session = await auth();
    const user = session!.user;
    const tmdbId = tmdbIdFrom(slug);

    let item: MediaItem | null = null;
    let initialSeason: SeasonInfo | null = null;
    if (tmdbId > 0) {
        item = await detail(mediaType, tmdbId).catch(() => null);
        if (item && mediaType === 'tv') {
            initialSeason = await seasonEpisodes(tmdbId, 1).catch(() => null);
        }
    }
    const [favourites, progress] = await Promise.all([
        listFavourites(user.id),
        listProgress(user.id),
    ]);
    // Only this title's rows travel to the client; they arrive newest first.
    const titleProgress = progress.filter(
        (row) => row.tmdbId === tmdbId && row.mediaType === mediaType,
    );

    return (
        <WatchScreen
            mediaType={mediaType}
            tmdbId={tmdbId}
            item={item}
            initialSeason={initialSeason}
            initialProgress={titleProgress}
            isFavourite={favourites.some(
                (row) => row.tmdbId === tmdbId && row.mediaType === mediaType,
            )}
            user={{
                id: user.id,
                name: user.name ?? null,
                image: user.image ?? null,
                provider: user.provider,
            }}
            onSignOut={signOutAction}
        />
    );
}
