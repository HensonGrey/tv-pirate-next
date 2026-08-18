'use client';

import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import '@vidstack/react/player/styles/default/gestures.css';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Film, Heart, LoaderCircle, Play, Star, Tv, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { MediaPlayer, MediaProvider, Poster } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { Button } from '@/components/ui/button';
import TopNav from '@/components/top-nav';
import Kicker from '@/components/kicker';
import CaptionOverlay from '@/components/watch/caption-overlay';
import ProgressTracker from '@/components/watch/progress-tracker';
import SubtitleDelayMenu from '@/components/watch/subtitle-delay-menu';
import {
    addFavourite,
    fetchSeason,
    fetchSources,
    fetchStreamProviders,
    fetchSubtitleTrack,
    removeFavourite,
    type StreamSourceDto,
} from '@/lib/api/browser';
import { getPreferredProvider, setPreferredProvider } from '@/lib/provider-preference';
import type { ProgressRow } from '@/lib/progress/service';
import { isFinished } from '@/lib/progress/shared';
import { parseVtt, type VttCue } from '@/lib/vtt';
import type { MediaItem, MediaType, SeasonInfo } from '@/lib/tmdb/types';
import type { SessionUser } from '@/lib/session-user';
import { cn } from '@/lib/utils';

interface WatchScreenProps {
    /** Fixed by the route (/movie/… vs /tv/…) — never part of query state. */
    mediaType: MediaType;
    tmdbId: number;
    /** Fetched on the server so the header and pickers render immediately. */
    item: MediaItem | null;
    initialSeason: SeasonInfo | null;
    /** Saved positions for this title, newest first. */
    initialProgress: ProgressRow[];
    isFavourite: boolean;
    user: SessionUser;
    onSignOut: () => void;
}

/** Pick the row to play without asking: exact 720p wins, else the highest row
 * at or below 720p, else the lowest ("auto" sorts last, so it only wins when
 * nothing numeric exists). */
function pickDefaultSource(sources: StreamSourceDto[]): StreamSourceDto | null {
    if (sources.length === 0) return null;
    const numeric = sources.filter((s) => /^\d+p$/.test(s.quality));
    const exact = numeric.find((s) => s.quality === '720p');
    if (exact) return exact;
    const under = numeric.filter((s) => Number.parseInt(s.quality, 10) <= 720);
    if (under.length > 0) return under[under.length - 1];
    return sources[0];
}

/** Shared pill styling for season + provider chips — selected is solid gold, the
 * rest stay quiet outlines. */
function chipClasses(selected: boolean) {
    return cn(
        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
        selected
            ? 'border-gold bg-gold font-semibold text-gold-foreground shadow-sm'
            : 'border-border text-muted-foreground hover:border-gold/50 hover:text-foreground',
    );
}

/** Full-screen watch page. The URL carries only the title's identity; season and
 * episode live in component state (TV defaults to S1E1). Clicking the video
 * surface starts playback — no play button.
 * see: docs/local/streaming-providers.md#architecture */
export default function WatchScreen({
    mediaType,
    tmdbId,
    item,
    initialSeason,
    initialProgress,
    isFavourite: initialFavourite,
    user,
    onSignOut,
}: WatchScreenProps) {
    const router = useRouter();
    const isTv = mediaType === 'tv';

    // The nav's search doesn't filter this page — Enter carries the query home.
    const [query, setQuery] = useState('');

    // The newest unfinished row picks the season/episode and the seek target.
    // A finished one is left alone: it would replay the credits.
    const resumeRow = initialProgress.find((row) => !isFinished(row));

    const [providers, setProviders] = useState<string[]>([]);
    const [season, setSeason] = useState(resumeRow?.season ?? initialSeason?.seasonNumber ?? 1);
    const [episode, setEpisode] = useState(resumeRow?.episode ?? 1);
    /** Seek target for the player's next mount; null starts from zero. */
    const [resumeTarget, setResumeTarget] = useState<number | null>(
        resumeRow?.progressSeconds ?? null,
    );
    /** The coordinates the current sources were resolved for. The tracker renders
     * only while the stream matches the picker, so a heartbeat can never credit
     * the old stream's position to a newly picked episode.
     * see: docs/decisions/watch-progress.md#resume-seam */
    const [resolvedCoords, setResolvedCoords] = useState<{
        season: number;
        episode: number;
    } | null>(null);
    /** Live position, shared with the tracker: a provider switch remounts the
     * player and continues from here. */
    const lastPositionRef = useRef(0);
    const [provider, setProvider] = useState<string | null>(null);
    const [isFavourite, setIsFavourite] = useState(initialFavourite);

    const [seasonInfo, setSeasonInfo] = useState<SeasonInfo | null>(initialSeason);
    const [episodesLoading, setEpisodesLoading] = useState(false);

    const [resolving, setResolving] = useState(false);
    const [sources, setSources] = useState<StreamSourceDto[] | null>(null);
    /** Parsed caption cues for the current title/episode; empty means no captions. */
    const [subtitleCues, setSubtitleCues] = useState<VttCue[]>([]);
    /** Manual sync shift in half-second ticks: every subtitle file is timed to its
     * own release, so a constant offset against a different encode is normal.
     * Ticks keep the 0.5s steps free of float drift. */
    const [subtitleDelay, setSubtitleDelay] = useState(0);

    // Monotonic request tokens so a fast season-flip can't deliver stale episodes.
    const episodeRequestId = useRef(0);
    const providerRequestId = useRef(0);

    // Provider list loads once; the remembered one wins, else the first listed.
    useEffect(() => {
        const id = ++providerRequestId.current;
        fetchStreamProviders()
            .then((list) => {
                if (providerRequestId.current !== id) return;
                setProviders(list);
                // A remembered provider can vanish from the registry (removed, or a
                // burned upstream) — fall back to the first listed rather than
                // resolving a name the server rejects.
                const remembered = getPreferredProvider();
                setProvider(
                    remembered && list.includes(remembered) ? remembered : (list[0] ?? null),
                );
            })
            .catch(() => toast.error('Could not load the provider list'));
    }, []);

    // Season data follows the selected season. The server supplied the first one.
    useEffect(() => {
        if (!isTv) return;
        if (initialSeason && season === initialSeason.seasonNumber) return;
        const id = ++episodeRequestId.current;
        setEpisodesLoading(true);
        fetchSeason(tmdbId, season)
            .then((info) => {
                if (episodeRequestId.current !== id) return;
                setSeasonInfo(info);
                if (!info.episodes.some((ep) => ep.episodeNumber === episode)) setEpisode(1);
            })
            .catch(() => {
                if (episodeRequestId.current !== id) return;
                toast.error('Could not load the episode list');
            })
            .finally(() => {
                if (episodeRequestId.current === id) setEpisodesLoading(false);
            });
        // episode intentionally not a dep: changing it must not refetch the season.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTv, tmdbId, season, initialSeason]);

    // Resolve-on-change, not resolve-on-play: sources follow provider/season/
    // episode automatically. Cancelled runs stay silent, which is what keeps a
    // fast chip-flip from spamming toasts.
    useEffect(() => {
        if (!provider || !item) {
            setSources(null);
            return;
        }
        let cancelled = false;
        setResolving(true);
        fetchSources(
            provider,
            mediaType,
            tmdbId,
            isTv ? season : undefined,
            isTv ? episode : undefined,
        )
            .then((result) => {
                if (cancelled) return;
                setSources(result);
                setResolvedCoords(isTv ? { season, episode } : null);
            })
            .catch(() => {
                if (!cancelled) toast.error(`Could not resolve sources from ${provider}`);
            })
            .finally(() => {
                if (!cancelled) setResolving(false);
            });
        return () => {
            cancelled = true;
        };
    }, [provider, item, mediaType, tmdbId, isTv, season, episode]);

    // Subtitles are an enhancement: the player just runs caption-less on a miss,
    // so this never raises a toast. see: docs/decisions/subtitles.md
    useEffect(() => {
        if (!item) return;
        let cancelled = false;
        setSubtitleCues([]);
        setSubtitleDelay(0); // a new file is a new release, with its own offset
        fetchSubtitleTrack(mediaType, tmdbId, isTv ? season : undefined, isTv ? episode : undefined)
            .then((vtt) => {
                if (!cancelled && vtt) setSubtitleCues(parseVtt(vtt));
            })
            .catch(() => {
                // No captions is a graceful state.
            });
        return () => {
            cancelled = true;
        };
    }, [item, mediaType, tmdbId, isTv, season, episode]);

    function selectProvider(next: string) {
        setProvider(next);
        setPreferredProvider(next);
    }

    function toggleFavourite() {
        const wasFavourite = isFavourite;
        setIsFavourite(!wasFavourite);
        // Local-first: the heart flips instantly and the request follows; only a
        // failure reverts it. see: docs/decisions/favourites.md#optimistic-revert
        const request = wasFavourite
            ? removeFavourite(tmdbId, mediaType)
            : addFavourite(tmdbId, mediaType);
        request.catch(() => {
            setIsFavourite(wasFavourite);
            toast.error(
                wasFavourite ? 'Could not remove from favourites' : 'Could not add to favourites',
            );
        });
    }

    function selectSeason(next: number) {
        setSeason(next);
        setEpisode(1); // a new season starts at its first episode
        // Resume in-session too: a saved S4E1 continues, anything else starts at 0.
        setResumeTarget(resumeFor(next, 1));
        lastPositionRef.current = 0;
    }

    function selectEpisode(next: number) {
        setEpisode(next);
        setResumeTarget(resumeFor(season, next));
        lastPositionRef.current = 0;
    }

    function resumeFor(seasonNumber: number, episodeNumber: number): number | null {
        const row = initialProgress.find(
            (candidate) => candidate.season === seasonNumber && candidate.episode === episodeNumber,
        );
        return row && !isFinished(row) ? row.progressSeconds : null;
    }

    const selectedEpisode = isTv
        ? seasonInfo?.episodes.find((ep) => ep.episodeNumber === episode)
        : null;
    const seasonCount = item?.seasons ?? 1;
    // Episode overview first, show overview as the fallback; movies show their own.
    const description = selectedEpisode?.overview ?? item?.overview;

    // The description shows a few lines and fades when clipped; clicking it opens
    // the block to its full height.
    const [descExpanded, setDescExpanded] = useState(false);
    const [descMaxH, setDescMaxH] = useState(0);
    const [descOverflows, setDescOverflows] = useState(false);
    const descRef = useRef<HTMLParagraphElement>(null);
    const playerRef = useRef<HTMLElement>(null);
    // Half the player's height. A description that fits inside that is shown whole —
    // clamping text that does not need clamping just adds a pointless "Read more".
    const [descCap, setDescCap] = useState<number | null>(null);

    useLayoutEffect(() => {
        const element = playerRef.current;
        if (!element) return;
        const measure = () => setDescCap(Math.round(element.getBoundingClientRect().height * 0.5));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    function toggleDescription() {
        if (!descExpanded) {
            // scrollHeight reports the full text even while the block is clamped.
            setDescMaxH(descRef.current?.scrollHeight ?? 600);
        }
        setDescExpanded((value) => !value);
    }

    useEffect(() => {
        setDescExpanded(false);
        setDescMaxH(0);
    }, [description]);

    // Keeps the expanded block sized to its content on resize, and tells the hint
    // whether the collapsed view actually clips.
    useEffect(() => {
        const element = descRef.current;
        if (!element) return;
        const check = () => {
            if (descExpanded) setDescMaxH(element.scrollHeight);
            setDescOverflows(element.scrollHeight > element.clientHeight + 4);
        };
        check();
        const observer = new ResizeObserver(check);
        observer.observe(element);
        return () => observer.disconnect();
    }, [description, descExpanded, descCap]);

    const activeSource = pickDefaultSource(sources ?? []);
    // The backdrop is wider than the poster — it suits the ambient glow and fills
    // the lg player surface, which is taller than 16:9.
    const playerThumb = item?.backdropUrl ?? item?.posterUrl;

    const descriptionBlock = description != null && (
        <>
            <p
                ref={descRef}
                onClick={descOverflows || descExpanded ? toggleDescription : undefined}
                style={{ maxHeight: descExpanded ? descMaxH : (descCap ?? undefined) }}
                className={cn(
                    'overflow-hidden text-base leading-relaxed text-muted-foreground transition-[max-height] duration-300 ease-out',
                    (descOverflows || descExpanded) && 'cursor-pointer',
                    !descExpanded &&
                        descOverflows &&
                        'mask-[linear-gradient(to_bottom,black_calc(100%-28px),transparent)]',
                )}
            >
                {description}
            </p>
            {(descOverflows || descExpanded) && (
                <button
                    type="button"
                    aria-expanded={descExpanded}
                    onClick={toggleDescription}
                    className="self-start text-xs font-semibold text-gold transition-colors outline-none hover:underline focus-visible:ring-2 focus-visible:ring-gold/60"
                >
                    {descExpanded ? 'Show less' : 'Read more'}
                </button>
            )}
        </>
    );

    let content: ReactNode;
    if (!item) {
        content = (
            <div className="flex min-h-[calc(100dvh-56px)] flex-col items-center justify-center gap-3 px-6 text-center">
                <WifiOff aria-hidden className="size-10 text-muted-foreground" />
                <p className="font-heading text-lg font-semibold">Title not found</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                    This link doesn&apos;t point at a title we can load.
                </p>
                <Button variant="outline" onClick={() => router.push('/')}>
                    Back to browsing
                </Button>
            </div>
        );
    } else {
        content = (
            <div>
                {/* --player-scale trims the surface to 80% of the viewport-derived cap:
                    the full-height version filled the window and read as oversized.
                    From sm up the picker card sits beside the player so the page height
                    is just nav + header + player. At lg the player surface is pinned to
                    the viewport so it is as large as the window allows; the column width
                    derives from that cap, which is what keeps the page from scrolling.
                    Phones stack the card below. */}
                <main className="relative mx-auto flex w-full max-w-[min(96rem,calc(44dvh*16/9+32px))] flex-col px-4 py-2 [--player-scale:0.8] sm:max-w-[min(96rem,calc((100dvh-210px)*var(--player-scale)*16/9+348px))] sm:px-6 lg:max-w-[min(96rem,calc((100dvh-230px)*var(--player-scale)*16/9+444px))] lg:px-8">
                    <header className="flex items-center gap-3 py-3 sm:py-4">
                        <button
                            type="button"
                            aria-label="Back to browsing"
                            onClick={() => router.back()}
                            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground backdrop-blur transition-colors outline-none hover:border-gold/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-gold/60"
                        >
                            <ArrowLeft className="size-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <h1 className="font-heading truncate text-2xl font-bold tracking-tight sm:text-3xl">
                                {item.title ?? 'Untitled'}
                            </h1>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">
                                    {isTv ? (
                                        <>
                                            <Tv aria-hidden className="size-3" />
                                            Series
                                        </>
                                    ) : (
                                        <>
                                            <Film aria-hidden className="size-3" />
                                            Movie
                                        </>
                                    )}
                                </span>
                                {item.year != null && (
                                    <span>
                                        {item.year}
                                        {isTv &&
                                            ` · ${seasonCount} season${seasonCount === 1 ? '' : 's'}`}
                                    </span>
                                )}
                                {item.rating != null && (
                                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                        <Star
                                            aria-hidden
                                            className="size-3.5 fill-gold text-gold"
                                        />
                                        {item.rating.toFixed(1)}
                                    </span>
                                )}
                                {item.genres.length > 0 && (
                                    <span className="hidden truncate md:inline">
                                        {item.genres.join(' · ')}
                                    </span>
                                )}
                            </p>
                        </div>
                        <button
                            type="button"
                            aria-label={
                                isFavourite ? 'Remove from favourites' : 'Add to favourites'
                            }
                            aria-pressed={isFavourite}
                            onClick={toggleFavourite}
                            className={cn(
                                'flex size-11 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-all outline-none focus-visible:ring-2 focus-visible:ring-gold/60',
                                isFavourite
                                    ? 'border-gold bg-gold text-gold-foreground shadow-md'
                                    : 'border-gold bg-gold/10 text-gold hover:bg-gold/20 hover:shadow-md',
                            )}
                        >
                            <Heart
                                className={cn(
                                    'size-6 transition-transform active:scale-90',
                                    isFavourite && 'fill-gold-foreground',
                                )}
                            />
                        </button>
                    </header>

                    <div className="grid gap-5 sm:grid-cols-[1fr_280px] lg:grid-cols-[1fr_360px]">
                        {/* The player: 16:9 below lg, from lg up it fills a surface pinned
                            to the viewport height so the black box is exactly the panel's
                            size — the video letterboxes inside, the poster covers it all. */}
                        <section
                            ref={playerRef}
                            aria-label="Player"
                            className="relative lg:h-[calc((100dvh-230px)*var(--player-scale))]"
                        >
                            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black shadow-xl shadow-black/20 ring-1 ring-border lg:absolute lg:inset-0 lg:aspect-auto dark:shadow-black/60">
                                {activeSource ? (
                                    <MediaPlayer
                                        // Vidstack doesn't re-init a live player when src changes
                                        // mid-session (an mp4 → hls provider swap stays sourceless),
                                        // so keying by source remounts it — which also resets the
                                        // position, as a source switch should.
                                        key={activeSource.proxyUrl}
                                        className="vds-player size-full"
                                        src={{
                                            src: activeSource.proxyUrl,
                                            type:
                                                activeSource.format === 'hls'
                                                    ? 'application/x-mpegurl'
                                                    : 'video/mp4',
                                        }}
                                        playsInline
                                        title={`${item.title ?? 'Untitled'}${isTv ? ` · S${season}E${episode}` : ''}`}
                                    >
                                        <MediaProvider>
                                            {playerThumb && (
                                                <Poster
                                                    className="vds-poster"
                                                    src={playerThumb}
                                                    alt={item.title ?? ''}
                                                />
                                            )}
                                        </MediaProvider>
                                        {subtitleCues.length > 0 && (
                                            <CaptionOverlay
                                                cues={subtitleCues}
                                                delaySeconds={subtitleDelay / 2}
                                            />
                                        )}
                                        {(!isTv ||
                                            (resolvedCoords?.season === season &&
                                                resolvedCoords?.episode === episode)) && (
                                            <ProgressTracker
                                                key={isTv ? `s${season}e${episode}` : 'movie'}
                                                tmdbId={tmdbId}
                                                mediaType={mediaType}
                                                season={isTv ? season : undefined}
                                                episode={isTv ? episode : undefined}
                                                resumeTarget={resumeTarget}
                                                onResumeConsumed={() => setResumeTarget(null)}
                                                lastPositionRef={lastPositionRef}
                                            />
                                        )}
                                        <DefaultVideoLayout
                                            icons={defaultLayoutIcons}
                                            // The stepper goes through the slots PROP. A
                                            // slot-attribute child is not collected and
                                            // renders inline in the player flow, which
                                            // squishes the video.
                                            // see: docs/local/streaming-providers.md#subtitles
                                            slots={
                                                subtitleCues.length > 0
                                                    ? {
                                                          settingsMenuItemsEnd: (
                                                              <SubtitleDelayMenu
                                                                  delay={subtitleDelay}
                                                                  onChange={setSubtitleDelay}
                                                              />
                                                          ),
                                                      }
                                                    : undefined
                                            }
                                        />
                                    </MediaPlayer>
                                ) : (
                                    <div className="flex size-full flex-col items-center justify-center gap-3 text-muted-foreground">
                                        {playerThumb && (
                                            <img
                                                src={playerThumb}
                                                alt=""
                                                className="absolute inset-0 size-full object-cover opacity-40 blur-sm"
                                            />
                                        )}
                                        {resolving ? (
                                            <LoaderCircle
                                                aria-hidden
                                                className="relative size-12 animate-spin text-gold"
                                            />
                                        ) : (
                                            <Play aria-hidden className="relative size-12" />
                                        )}
                                        <p className="relative text-sm">
                                            {resolving
                                                ? 'Resolving sources…'
                                                : sources && sources.length === 0
                                                  ? `No playable sources on ${provider}`
                                                  : 'Loading…'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Picker card: sections split by hairlines; the panel fits its
                            content instead of stretching to the player surface. */}
                        <div className="flex self-start overflow-hidden rounded-2xl bg-card ring-1 ring-border sm:max-h-[calc(100dvh-210px)] sm:overflow-y-auto">
                            <div className="flex h-full w-full flex-col divide-y divide-border">
                                {isTv ? (
                                    <>
                                        <div className="space-y-2 p-4">
                                            <Kicker>Season</Kicker>
                                            <div className="flex flex-wrap gap-1.5">
                                                {Array.from(
                                                    { length: seasonCount },
                                                    (_, index) => index + 1,
                                                ).map((number) => (
                                                    <button
                                                        key={number}
                                                        type="button"
                                                        aria-pressed={season === number}
                                                        onClick={() => selectSeason(number)}
                                                        className={chipClasses(season === number)}
                                                    >
                                                        S{number}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2 p-4">
                                            <Kicker>Episodes</Kicker>
                                            {episodesLoading ? (
                                                <p className="text-sm text-muted-foreground">
                                                    Loading episodes…
                                                </p>
                                            ) : (
                                                <div className="grid grid-cols-[repeat(auto-fill,minmax(32px,1fr))] gap-1">
                                                    {(seasonInfo?.episodes ?? []).map(
                                                        (ep, index) => (
                                                            <button
                                                                key={ep.episodeNumber ?? index}
                                                                type="button"
                                                                aria-label={`Episode ${ep.episodeNumber}: ${ep.name ?? 'Untitled'}`}
                                                                aria-pressed={
                                                                    episode === ep.episodeNumber
                                                                }
                                                                title={ep.name ?? 'Untitled'}
                                                                onClick={() =>
                                                                    setEpisode(
                                                                        ep.episodeNumber ?? 1,
                                                                    )
                                                                }
                                                                className={cn(
                                                                    'grid aspect-square place-items-center rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60',
                                                                    episode === ep.episodeNumber
                                                                        ? 'border-gold bg-gold font-semibold text-gold-foreground shadow-sm'
                                                                        : 'border-border text-muted-foreground hover:border-gold/50 hover:text-foreground',
                                                                )}
                                                            >
                                                                {ep.episodeNumber}
                                                            </button>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-1.5 p-4">
                                            <Kicker>Now playing</Kicker>
                                            <h2 className="font-heading text-base font-semibold tracking-tight">
                                                {selectedEpisode
                                                    ? `S${season}E${episode} · ${selectedEpisode.name ?? 'Untitled'}`
                                                    : `Season ${season}`}
                                                {selectedEpisode?.runtimeMinutes != null && (
                                                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                                                        {selectedEpisode.runtimeMinutes} min
                                                    </span>
                                                )}
                                            </h2>
                                            {descriptionBlock}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col gap-1.5 p-4">
                                        <Kicker>About</Kicker>
                                        {descriptionBlock}
                                    </div>
                                )}

                                {/* Sources follow the provider selection automatically. */}
                                <div className="space-y-2 p-4">
                                    <Kicker>Provider</Kicker>
                                    <div className="flex flex-wrap gap-1.5">
                                        {providers.map((name) => (
                                            <button
                                                key={name}
                                                type="button"
                                                aria-pressed={provider === name}
                                                onClick={() => selectProvider(name)}
                                                className={chipClasses(provider === name)}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="relative min-h-dvh">
            {/* The backdrop doubles as page ambience: blurred and masked into the
                background so the header and player sit on atmosphere, not flat bg. */}
            {playerThumb && (
                <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-[calc(100dvh-60px)] overflow-hidden"
                >
                    <img
                        src={playerThumb}
                        alt=""
                        className="size-full scale-110 object-cover opacity-25 blur-3xl"
                    />
                    <div className="absolute inset-0 bg-linear-to-b from-transparent via-background/70 to-background" />
                </div>
            )}
            {/* Same app shell as home: tabs navigate back to the matching section,
                search runs on Enter with the query carried along. */}
            <TopNav
                wide
                tab={isTv ? 'shows' : 'movies'}
                onTabChange={() => router.push('/')}
                query={query}
                onQueryChange={setQuery}
                onSubmit={() => router.push(`/?q=${encodeURIComponent(query)}`)}
                user={user}
                onLogout={onSignOut}
            />
            {content}
        </div>
    );
}
