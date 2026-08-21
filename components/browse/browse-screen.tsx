'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skull, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import TopNav, { type TabId } from '@/components/top-nav';
import FeaturedBanner from '@/components/featured-banner';
import LibraryView from '@/components/library-view';
import MediaCard from '@/components/media-card';
import MediaModal from '@/components/media-modal';
import Pagination from '@/components/pagination';
import { Button } from '@/components/ui/button';
import {
    addFavourite,
    clearProgress,
    fetchDiscover,
    fetchTitleDetail,
    fetchTrending,
    removeFavourite,
    searchTitles,
} from '@/lib/api/browser';
import type { FavouriteRow } from '@/lib/favourites/service';
import type { ProgressRow } from '@/lib/progress/service';
import { isFinished, newestPerTitle, progressPercent } from '@/lib/progress/shared';
import type { GenreInfo, MediaItem, MediaType, PageResponse } from '@/lib/tmdb/types';
import type { SessionUser } from '@/lib/session-user';
import { cn } from '@/lib/utils';
import { slugify } from '@/lib/slug';

interface BrowseScreenProps {
    user: SessionUser;
    /** Rendered on the server so the first paint already has data. */
    initialPage: PageResponse<MediaItem>;
    genreList: GenreInfo[];
    initialFavourites: FavouriteRow[];
    /** Saved positions, newest first — feeds the modal bar and Continue watching. */
    initialProgress: ProgressRow[];
    onSignOut: () => void;
}

type TypeFilter = 'all' | MediaType;

/** Search only kicks in from 3 characters — shorter queries are noise (and,
 * against TMDB, wasted requests). */
const MIN_SEARCH_LENGTH = 3;
/** TMDB serves 20 results per page. */
const PAGE_SIZE = 20;
/** Keystrokes are debounced so a fetch fires only when typing pauses. */
const SEARCH_DEBOUNCE_MS = 350;

/** Stable key for a title across both id spaces — movie 123 is not tv 123. */
function favouriteKey(mediaType: string, id: number) {
    return `${mediaType}:${id}`;
}

function headingFor(tab: TabId, query: string, genres: Set<string>) {
    if (query) return `Results for “${query}”`;
    if (tab === 'library') return 'Library';
    if (tab === 'genres') {
        return genres.size > 0 ? `Genres: ${[...genres].join(' + ')}` : 'Browse genres';
    }
    if (tab === 'shows') return 'TV shows';
    if (tab === 'movies') return 'Movies';
    return 'Trending now';
}

// --- Browse state: one reducer instead of a dozen useStates. ---
// Filter changes rewind the page, responses update items + loading + error
// together — every rule about how state moves lives in exactly one place.

interface BrowseState {
    tab: TabId;
    query: string;
    debouncedQuery: string;
    typeFilter: TypeFilter;
    genres: Set<string>;
    page: number;
    items: MediaItem[];
    totalPages: number;
    totalResults: number;
    loading: boolean;
    error: string | null;
    reloadKey: number;
    selected: MediaItem | null;
    selectedDetail: MediaItem | null;
    /** Keyed mediaType:tmdbId — the two TMDB id spaces collide. */
    favourites: Set<string>;
    /** True until the first client-side fetch replaces the server-rendered page. */
    serverRendered: boolean;
}

type BrowseAction =
    | { type: 'tab'; tab: TabId }
    | { type: 'query'; query: string }
    | { type: 'query-debounced'; query: string }
    | { type: 'type-filter'; typeFilter: TypeFilter }
    | { type: 'toggle-genre'; name: string }
    | { type: 'clear-genres' }
    | { type: 'page'; page: number }
    | { type: 'request-started' }
    | { type: 'request-skipped' }
    | { type: 'page-loaded'; items: MediaItem[]; totalPages: number; totalResults: number }
    | { type: 'request-failed'; message: string }
    | { type: 'retry' }
    | { type: 'select'; item: MediaItem | null }
    | { type: 'detail'; item: MediaItem }
    | { type: 'toggle-favourite'; key: string };

function browseReducer(state: BrowseState, action: BrowseAction): BrowseState {
    switch (action.type) {
        case 'tab':
            // Re-selecting the active tab is a no-op — otherwise items clear
            // while the fetch effect sees no changed deps.
            // see: docs/decisions/tmdb.md#tab-noop
            if (action.tab === state.tab) return state;
            return { ...state, tab: action.tab, page: 1, items: [], serverRendered: false };
        case 'query':
            // Search changes keep old results dimmed while the new ones load.
            return { ...state, query: action.query, page: 1 };
        case 'query-debounced':
            return { ...state, debouncedQuery: action.query };
        case 'type-filter':
            return { ...state, typeFilter: action.typeFilter, page: 1 };
        case 'toggle-genre': {
            const genres = new Set(state.genres);
            if (genres.has(action.name)) genres.delete(action.name);
            else genres.add(action.name);
            return { ...state, genres, page: 1, items: [], serverRendered: false };
        }
        case 'clear-genres':
            return { ...state, genres: new Set(), page: 1, items: [], serverRendered: false };
        case 'page':
            return { ...state, page: action.page, serverRendered: false };
        case 'request-started':
            return { ...state, loading: true, error: null };
        case 'request-skipped':
            return { ...state, loading: false };
        case 'page-loaded':
            return {
                ...state,
                items: action.items,
                totalPages: action.totalPages,
                totalResults: action.totalResults,
                loading: false,
            };
        case 'request-failed':
            return { ...state, error: action.message, loading: false };
        case 'retry':
            return { ...state, reloadKey: state.reloadKey + 1 };
        case 'select':
            // The list item opens the modal instantly; details arrive separately.
            return { ...state, selected: action.item, selectedDetail: null };
        case 'detail':
            return { ...state, selectedDetail: action.item };
        case 'toggle-favourite': {
            const favourites = new Set(state.favourites);
            if (favourites.has(action.key)) favourites.delete(action.key);
            else favourites.add(action.key);
            return { ...state, favourites };
        }
        default:
            return state;
    }
}

/** One fetch for the current tab + filters; the genres tab with the "All"
 * toggle merges two discovers (movies + shows) into one page. */
async function loadPage(
    tab: TabId,
    typeFilter: TypeFilter,
    genres: string[],
    query: string,
    page: number,
) {
    const toPage = (res: PageResponse<MediaItem>) => ({
        items: res.results,
        totalPages: res.totalPages,
        totalResults: res.totalResults,
    });
    if (query) return toPage(await searchTitles(query, page));
    if (tab === 'trending') return toPage(await fetchTrending('day', page));
    if (tab === 'movies') return toPage(await fetchDiscover('movie', [], page));
    if (tab === 'shows') return toPage(await fetchDiscover('tv', [], page));
    if (typeFilter !== 'all') return toPage(await fetchDiscover(typeFilter, genres, page));
    const [movies, shows] = await Promise.all([
        fetchDiscover('movie', genres, page),
        fetchDiscover('tv', genres, page),
    ]);
    return {
        items: [...movies.results, ...shows.results],
        totalPages: Math.max(movies.totalPages, shows.totalPages),
        totalResults: movies.totalResults + shows.totalResults,
    };
}

/** The browse home, fed by the TMDB proxy: one call per tab, debounced search,
 * pagination from the response. While loading, previous results stay dimmed;
 * the skeleton only shows when there is nothing yet. */
export default function BrowseScreen({
    user,
    initialPage,
    genreList,
    initialFavourites,
    initialProgress,
    onSignOut,
}: BrowseScreenProps) {
    const router = useRouter();
    const [state, dispatch] = useReducer(browseReducer, {
        tab: 'trending' as TabId,
        query: '',
        debouncedQuery: '',
        typeFilter: 'all' as TypeFilter,
        genres: new Set<string>(),
        page: initialPage.page || 1,
        items: initialPage.results,
        totalPages: initialPage.totalPages,
        totalResults: initialPage.totalResults,
        loading: false,
        error: null,
        reloadKey: 0,
        selected: null,
        selectedDetail: null,
        favourites: new Set(
            initialFavourites.map((row) => favouriteKey(row.mediaType, row.tmdbId)),
        ),
        serverRendered: true,
    });
    const {
        tab,
        query,
        debouncedQuery,
        typeFilter,
        genres,
        page,
        items,
        totalPages,
        totalResults,
        loading,
        error,
        reloadKey,
        selected,
        selectedDetail,
        favourites,
        serverRendered,
    } = state;

    const [progress, setProgress] = useState<ProgressRow[]>(initialProgress);

    // Library cards come from their own detail lookups, keyed mediaType:tmdbId.
    // A failed lookup is stored as null rather than left missing — otherwise it
    // never leaves `missing` below and the effect refetches it every render.
    const [libraryItems, setLibraryItems] = useState<Map<string, MediaItem | null>>(new Map());
    const [libraryLoading, setLibraryLoading] = useState(false);

    // Rapid like/unlike clicking: dismiss the previous toast so the stack
    // doesn't pile up three-deep.
    const favouriteToastId = useRef<string | number | null>(null);
    // Monotonic request token: a response only lands if no newer request
    // started while it was in flight (fast tab/filter flipping).
    const requestId = useRef(0);
    // The modal's detail fetch may only deliver into the modal that asked.
    const selectedRef = useRef<MediaItem | null>(null);
    selectedRef.current = selected;

    const trimmed = query.trim();
    const debouncedTrimmed = debouncedQuery.trim();
    const searching = trimmed.length >= MIN_SEARCH_LENGTH;

    // Debounce the search box: the fetch reads debouncedTrimmed, so it only
    // fires once the user pauses.
    useEffect(() => {
        const timer = setTimeout(
            () => dispatch({ type: 'query-debounced', query: trimmed }),
            SEARCH_DEBOUNCE_MS,
        );
        return () => clearTimeout(timer);
    }, [trimmed]);

    // The library tab needs the full title for every favourite, not just the
    // ones on the current page — one detail call per unknown id (the proxy
    // caches those 24 h). A failed lookup just skips its card.
    useEffect(() => {
        if (tab !== 'library') return;
        const wanted = new Set([
            ...favourites,
            ...progress.map((row) => `${row.mediaType}:${row.tmdbId}`),
        ]);
        const missing = [...wanted].filter((key) => !libraryItems.has(key));
        if (missing.length === 0) return;
        let cancelled = false;
        setLibraryLoading(true);
        Promise.all(
            missing.map(async (key) => {
                const [mediaType, id] = key.split(':');
                const item = await fetchTitleDetail(mediaType as MediaType, Number(id)).catch(
                    () => null,
                );
                return [key, item] as const;
            }),
        )
            .then((entries) => {
                if (cancelled) return;
                setLibraryItems((current) => {
                    const next = new Map(current);
                    for (const [key, item] of entries) next.set(key, item);
                    return next;
                });
            })
            .finally(() => {
                if (!cancelled) setLibraryLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [tab, favourites, progress, libraryItems]);

    // The main fetch. Skipped on first render because the server already
    // supplied that page; re-runs on any tab/filter/page change after that.
    useEffect(() => {
        if (serverRendered) return;
        if (tab === 'library' && !debouncedTrimmed) {
            dispatch({ type: 'request-skipped' });
            return;
        }
        if (debouncedTrimmed && debouncedTrimmed.length < MIN_SEARCH_LENGTH) {
            dispatch({ type: 'request-skipped' });
            return;
        }
        const id = ++requestId.current;
        dispatch({ type: 'request-started' });
        loadPage(tab, typeFilter, [...genres], debouncedTrimmed, page)
            .then((result) => {
                if (requestId.current !== id) return;
                dispatch({ type: 'page-loaded', ...result });
            })
            .catch(() => {
                if (requestId.current !== id) return;
                dispatch({
                    type: 'request-failed',
                    message:
                        "Couldn't load titles. The server may be busy — try again in a moment.",
                });
            });
    }, [tab, typeFilter, genres, page, debouncedTrimmed, reloadKey, serverRendered]);

    // A typed query has to leave the server-rendered page behind.
    useEffect(() => {
        if (debouncedTrimmed.length >= MIN_SEARCH_LENGTH && serverRendered) {
            dispatch({ type: 'page', page: 1 });
        }
    }, [debouncedTrimmed, serverRendered]);

    // Modal enrichment: the list item opens instantly, the detail call fills in
    // runtime/seasons behind it, and a closed modal discards the late answer.
    useEffect(() => {
        if (!selected || selected.mediaType == null) return;
        fetchTitleDetail(selected.mediaType, selected.id)
            .then((detail) => {
                if (selectedRef.current?.id === selected.id) {
                    dispatch({ type: 'detail', item: detail });
                }
            })
            .catch(() => {
                if (selectedRef.current?.id === selected.id) {
                    toast.error('Could not load full details');
                }
            });
    }, [selected]);

    function toggleFavourite(item: MediaItem) {
        if (!item.mediaType) return;
        const mediaType = item.mediaType;
        const key = favouriteKey(mediaType, item.id);
        const isFavourite = favourites.has(key);
        dispatch({ type: 'toggle-favourite', key });
        // Local-first: the heart flips instantly and the request follows; only a
        // failure reverts the flip and says so.
        // see: docs/decisions/favourites.md#optimistic-revert
        const request = isFavourite
            ? removeFavourite(item.id, mediaType)
            : addFavourite(item.id, mediaType);
        request.catch(() => {
            dispatch({ type: 'toggle-favourite', key }); // revert
            toast.error(
                `Could not ${isFavourite ? 'remove' : 'add'} “${item.title ?? 'Untitled'}”`,
            );
        });
        if (favouriteToastId.current !== null) toast.dismiss(favouriteToastId.current);
        favouriteToastId.current = isFavourite
            ? toast(`Removed “${item.title ?? 'Untitled'}” from your list`)
            : toast.success(`Added “${item.title ?? 'Untitled'}” to your list`);
    }

    /** Title-level on purpose: clearing only the shown episode would make the
     * next visit resume a different one, which is not "start over".
     * see: docs/decisions/watch-progress.md#start-over */
    function startOver(target: MediaItem) {
        if (!target.mediaType) return;
        const mediaType = target.mediaType;
        const previous = progress;
        setProgress((rows) =>
            rows.filter((row) => !(row.tmdbId === target.id && row.mediaType === mediaType)),
        );
        clearProgress(mediaType, target.id).catch(() => {
            setProgress(previous);
            toast.error('Could not clear progress');
        });
        router.push(`/${mediaType}/${target.id}-${slugify(target.title)}`);
    }

    /** Clears the saved rows and closes, so the card leaves Continue watching
     * without the player opening. */
    function removeFromContinueWatching(target: MediaItem) {
        if (!target.mediaType) return;
        const mediaType = target.mediaType;
        const previous = progress;
        setProgress((rows) =>
            rows.filter((row) => !(row.tmdbId === target.id && row.mediaType === mediaType)),
        );
        dispatch({ type: 'select', item: null });
        clearProgress(mediaType, target.id).catch(() => {
            setProgress(previous);
            toast.error('Could not remove it from Continue watching');
        });
        toast(`Removed “${target.title ?? 'Untitled'}” from Continue watching`);
    }

    // Client-side narrowing of whatever page we hold: trending and search
    // return mixed pages, so the toggle can still slice them.
    const visibleItems =
        typeFilter === 'all' ? items : items.filter((m) => m.mediaType === typeFilter);
    const pageMovies = visibleItems.filter((m) => m.mediaType === 'movie');
    const pageShows = visibleItems.filter((m) => m.mediaType === 'tv');
    const showBanner = tab === 'trending' && !searching && page === 1 && visibleItems.length > 0;
    // 0 means "unknown" (TMDB can send null totals) — fall back to the page we hold.
    const pageCount = totalPages > 0 ? totalPages : 1;
    const totalShown = totalResults > 0 ? totalResults : items.length;
    const rangeStart = (page - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(page * PAGE_SIZE, totalShown);

    const mediaGrid = (gridItems: MediaItem[]) => (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {gridItems.map((item) => (
                <MediaCard
                    key={`${item.mediaType}:${item.id}`}
                    item={item}
                    onSelect={(picked) => dispatch({ type: 'select', item: picked })}
                />
            ))}
        </div>
    );

    // The library tab holds favourites for now; Continue watching arrives with
    // watch progress, which needs the player to produce rows.
    const favouriteCards = [...favourites]
        .map((key) => libraryItems.get(key))
        .filter((item): item is MediaItem => item != null);

    const progressByTitle = newestPerTitle(progress);
    const continueCards = [...progressByTitle.values()]
        // A finished row is not "continue watching" — it would resume at the credits.
        .filter((row) => !isFinished(row))
        .map((row) => {
            const item = libraryItems.get(`${row.mediaType}:${row.tmdbId}`);
            return item
                ? {
                      item,
                      progressPct: progressPercent(row),
                      badge:
                          row.season != null && row.episode != null
                              ? `S${row.season}E${row.episode}`
                              : null,
                  }
                : null;
        })
        .filter((card): card is NonNullable<typeof card> => card != null);

    // The modal's bar: the winning row for the selected title.
    const selectedRow =
        selected?.mediaType != null
            ? progressByTitle.get(`${selected.mediaType}:${selected.id}`)
            : undefined;
    const selectedPct =
        selectedRow && !isFinished(selectedRow) ? progressPercent(selectedRow) : null;

    return (
        <div className="min-h-dvh">
            <TopNav
                tab={tab}
                onTabChange={(next) => dispatch({ type: 'tab', tab: next })}
                query={query}
                onQueryChange={(next) => dispatch({ type: 'query', query: next })}
                user={user}
                onLogout={onSignOut}
            />

            <main className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
                {/* Heading row: section title + movie/show toggle. */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5">
                        <h2 className="font-heading text-lg font-semibold tracking-tight">
                            {headingFor(tab, searching ? trimmed : '', genres)}
                        </h2>
                        {(!trimmed || searching) && (
                            <span className="text-sm text-muted-foreground">
                                {totalShown} titles
                            </span>
                        )}
                    </div>
                    <div
                        role="group"
                        aria-label="Filter by type"
                        className="flex rounded-full border bg-muted/60 p-0.5"
                    >
                        {(
                            [
                                ['all', 'All'],
                                ['movie', 'Movies'],
                                ['tv', 'Shows'],
                            ] as const
                        ).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={typeFilter === value}
                                onClick={() => dispatch({ type: 'type-filter', typeFilter: value })}
                                className={cn(
                                    'h-7 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
                                    typeFilter === value
                                        ? 'bg-gold text-gold-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {showBanner && (
                    <FeaturedBanner
                        item={visibleItems[0]}
                        onDetails={(picked) => dispatch({ type: 'select', item: picked })}
                        onWatch={(target) => {
                            if (!target || target.mediaType == null) return;
                            router.push(
                                `/${target.mediaType}/${target.id}-${slugify(target.title)}`,
                            );
                        }}
                    />
                )}

                {/* Genre chips on the Genres tab (until a search narrows things).
                    Multi-select: click to toggle, several genres stack up. */}
                {tab === 'genres' && !searching && (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            aria-pressed={genres.size === 0}
                            onClick={() => dispatch({ type: 'clear-genres' })}
                            className={cn(
                                'rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
                                genres.size === 0
                                    ? 'border-gold bg-gold/15 text-gold'
                                    : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                            )}
                        >
                            All genres
                        </button>
                        {genreList.map((genre) => (
                            <button
                                key={genre.name}
                                type="button"
                                aria-pressed={genres.has(genre.name)}
                                onClick={() => dispatch({ type: 'toggle-genre', name: genre.name })}
                                className={cn(
                                    'rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
                                    genres.has(genre.name)
                                        ? 'border-gold bg-gold/15 text-gold'
                                        : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                                )}
                            >
                                {genre.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Content area. Previous results stay visible (dimmed) while a
                    refetch runs; a skeleton shows only when there's nothing yet. */}
                <div
                    aria-busy={loading}
                    className={cn('transition-opacity', loading && 'opacity-60')}
                >
                    {tab === 'library' && !trimmed ? (
                        <LibraryView
                            loading={libraryLoading && favouriteCards.length === 0}
                            error={false}
                            onRetry={() => dispatch({ type: 'retry' })}
                            continueCards={continueCards}
                            favouriteCards={favouriteCards}
                            onSelect={(picked) => dispatch({ type: 'select', item: picked })}
                            onBrowse={() => dispatch({ type: 'tab', tab: 'trending' })}
                        />
                    ) : !searching && trimmed ? (
                        <p className="py-24 text-center text-base text-muted-foreground">
                            Keep typing — search starts at {MIN_SEARCH_LENGTH} characters.
                        </p>
                    ) : error ? (
                        <div className="flex flex-col items-center gap-3 py-24 text-center">
                            <WifiOff aria-hidden className="size-10 text-muted-foreground" />
                            <p className="font-heading text-lg font-semibold">
                                Shore leave — the signal&apos;s down
                            </p>
                            <p className="max-w-sm text-base text-muted-foreground">{error}</p>
                            <Button variant="outline" onClick={() => dispatch({ type: 'retry' })}>
                                Try again
                            </Button>
                        </div>
                    ) : loading && items.length === 0 ? (
                        <>
                            <p role="status" className="sr-only">
                                Loading titles
                            </p>
                            <div
                                aria-hidden
                                className="mt-3 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                            >
                                {Array.from({ length: 12 }, (_, index) => (
                                    <div
                                        key={index}
                                        className="aspect-2/3 animate-pulse rounded-xl bg-muted/60"
                                    />
                                ))}
                            </div>
                        </>
                    ) : visibleItems.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-24 text-center">
                            <Skull aria-hidden className="size-10 text-muted-foreground" />
                            <p className="font-heading text-lg font-semibold">No treasure found</p>
                            <p className="max-w-sm text-base text-muted-foreground">
                                {searching
                                    ? `Nothing matches “${trimmed}”. Try a different title, or clear the filters.`
                                    : 'Nothing matches these filters. Loosen them up and cast another net.'}
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    dispatch({ type: 'query', query: '' });
                                    dispatch({ type: 'clear-genres' });
                                    dispatch({ type: 'type-filter', typeFilter: 'all' });
                                }}
                            >
                                Clear filters
                            </Button>
                        </div>
                    ) : typeFilter === 'all' ? (
                        <>
                            <section aria-label="Movies">
                                <h3 className="font-heading text-base font-semibold tracking-tight">
                                    Movies
                                </h3>
                                {pageMovies.length ? (
                                    mediaGrid(pageMovies)
                                ) : (
                                    <p className="mt-3 text-sm text-muted-foreground">
                                        No movies on this page — try the next one.
                                    </p>
                                )}
                            </section>
                            <section aria-label="Shows">
                                <h3 className="font-heading text-base font-semibold tracking-tight">
                                    Shows
                                </h3>
                                {pageShows.length ? (
                                    mediaGrid(pageShows)
                                ) : (
                                    <p className="mt-3 text-sm text-muted-foreground">
                                        No shows on this page — try the next one.
                                    </p>
                                )}
                            </section>
                        </>
                    ) : (
                        mediaGrid(visibleItems)
                    )}
                </div>

                {/* Pagination footer */}
                {visibleItems.length > 0 && (searching || !trimmed) && tab !== 'library' && (
                    <div className="flex flex-col items-center gap-2 pt-4">
                        <p className="text-xs text-muted-foreground">
                            Showing {rangeStart}–{rangeEnd} of {totalShown}
                        </p>
                        <Pagination
                            page={page}
                            pageCount={pageCount}
                            onPageChange={(next) => {
                                dispatch({ type: 'page', page: next });
                                // Scroll lives here, not in the reducer — reducers stay pure.
                                window.scrollTo(0, 0);
                            }}
                        />
                    </div>
                )}
            </main>

            {selected && (
                <MediaModal
                    item={{
                        ...(selectedDetail ?? selected),
                        progress: selectedPct ?? undefined,
                        progressSeason: selectedRow?.season ?? undefined,
                        progressEpisode: selectedRow?.episode ?? undefined,
                    }}
                    isFavourite={
                        selected.mediaType != null &&
                        favourites.has(favouriteKey(selected.mediaType, selected.id))
                    }
                    onToggleFavourite={() => toggleFavourite(selected)}
                    onWatch={() => {
                        const target = selectedDetail ?? selected;
                        if (!target || target.mediaType == null) return;
                        // The route carries the title's identity (id + slug);
                        // coordinates stay in the watch page's own state.
                        router.push(`/${target.mediaType}/${target.id}-${slugify(target.title)}`);
                    }}
                    onStartOver={() => startOver(selectedDetail ?? selected)}
                    onRemoveProgress={() => removeFromContinueWatching(selectedDetail ?? selected)}
                    onClose={() => dispatch({ type: 'select', item: null })}
                />
            )}
        </div>
    );
}
