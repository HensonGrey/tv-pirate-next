import { auth } from '@/auth';
import BrowseScreen from '@/components/browse/browse-screen';
import { signOutAction } from '@/lib/auth/actions';
import { list as listFavourites } from '@/lib/favourites/service';
import { genres as fetchGenres, trending } from '@/lib/tmdb/service';

/** The browse home. Genres, favourites and the first trending page are fetched
 * on the server, so the first paint already has content — the client takes over
 * for tab, filter and search changes. */
export default async function HomePage() {
    const session = await auth();
    const user = session!.user;

    const [initialPage, genreList, favourites] = await Promise.all([
        trending('day', 1),
        fetchGenres(),
        listFavourites(user.id),
    ]);

    return (
        <BrowseScreen
            user={{
                id: user.id,
                name: user.name ?? null,
                image: user.image ?? null,
                provider: user.provider,
            }}
            initialPage={initialPage}
            genreList={genreList}
            initialFavourites={favourites}
            onSignOut={signOutAction}
        />
    );
}
