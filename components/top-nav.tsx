'use client';

import { useEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Film, Flame, LayoutGrid, Library, LogOut, Search, Skull, Tv } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import ConfirmDialog from '@/components/confirm-dialog';
import ThemeIconButton from '@/components/theme-icon-button';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/lib/session-user';

export type TabId = 'trending' | 'shows' | 'movies' | 'genres' | 'library';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
    { id: 'trending', label: 'Trending', icon: Flame },
    { id: 'shows', label: 'Shows', icon: Tv },
    { id: 'movies', label: 'Movies', icon: Film },
    { id: 'genres', label: 'Genres', icon: LayoutGrid },
    { id: 'library', label: 'Library', icon: Library },
];

interface TopNavProps {
    tab: TabId;
    onTabChange: (tab: TabId) => void;
    query: string;
    onQueryChange: (query: string) => void;
    /** Optional Enter handler — pages that aren't searchable (e.g. watch)
     *  use it to carry the query elsewhere instead of searching live. */
    onSubmit?: () => void;
    /** Watch pages render a wider content column than home — the nav follows
     *  it so the edges stay aligned. */
    wide?: boolean;
    user: SessionUser;
    onLogout: () => void;
}

const ICON_BUTTON =
    'flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-gold/60';

/**
 * App shell: brand + section tabs on the left, search + theme + account on
 * the right. On mobile the tabs become a scrollable strip and search collapses
 * behind an icon that expands a second row.
 */
export default function TopNav({
    tab,
    onTabChange,
    query,
    onQueryChange,
    onSubmit,
    wide = false,
    user,
    onLogout,
}: TopNavProps) {
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [signOutOpen, setSignOutOpen] = useState(false);
    const mobileSearchRef = useRef<HTMLInputElement>(null);

    // Guests get a confirmation before signing out — there's no way back in.
    const isGuest = user.provider === 'GUEST';

    useEffect(() => {
        if (mobileSearchOpen) mobileSearchRef.current?.focus();
    }, [mobileSearchOpen]);

    const searchInput = (inputRef: Ref<HTMLInputElement> | undefined, className: string) => (
        <div className={cn('relative', className)}>
            <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') setMobileSearchOpen(false);
                    if (event.key === 'Enter') onSubmit?.();
                }}
                placeholder="Search movies & shows"
                aria-label="Search movies and shows"
                className="h-9 w-full pl-8"
            />
        </div>
    );

    return (
        <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
            <div
                className={cn(
                    'mx-auto flex h-14 items-center gap-1 px-4 sm:gap-2 sm:px-6 lg:px-8',
                    wide ? 'max-w-384' : 'max-w-7xl',
                )}
            >
                {/* Brand — clicking it always leads home (trending). */}
                <button
                    type="button"
                    onClick={() => onTabChange('trending')}
                    className="flex items-center gap-2 rounded-lg px-1 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-gold/60"
                >
                    <Skull aria-hidden className="size-6 text-gold" />
                    <span className="font-heading text-lg font-bold tracking-tight">tv-pirate</span>
                </button>

                {/* Desktop tabs */}
                <nav
                    aria-label="Sections"
                    className="ml-2 hidden items-center gap-1 md:flex lg:ml-6"
                >
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            aria-current={tab === id ? 'page' : undefined}
                            onClick={() => onTabChange(id)}
                            className={cn(
                                'relative flex h-14 items-center gap-2 px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-gold/60',
                                tab === id
                                    ? 'text-gold'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Icon aria-hidden className="size-4" />
                            {label}
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gold transition-opacity',
                                    tab === id ? 'opacity-100' : 'opacity-0',
                                )}
                            />
                        </button>
                    ))}
                </nav>

                <div className="ml-auto flex items-center gap-1">
                    {/* Desktop search */}
                    {searchInput(undefined, 'hidden md:block')}
                    {/* Mobile search toggle */}
                    <button
                        type="button"
                        aria-label="Search"
                        aria-expanded={mobileSearchOpen}
                        onClick={() => setMobileSearchOpen((open) => !open)}
                        className={cn(ICON_BUTTON, 'md:hidden')}
                    >
                        <Search className="size-5" />
                    </button>
                    <ThemeIconButton />
                    {/* Account */}
                    <Avatar className="ml-1 size-8 ring-1 ring-border">
                        {user.image && (
                            <AvatarImage src={user.image} alt={user.name ?? 'Account'} />
                        )}
                        <AvatarFallback className="text-xs">
                            {(user.name ?? '?').charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <button
                        type="button"
                        aria-label="Sign out"
                        title="Sign out"
                        onClick={() => (isGuest ? setSignOutOpen(true) : onLogout())}
                        className={ICON_BUTTON}
                    >
                        <LogOut className="size-5" />
                    </button>
                </div>
            </div>

            {/* Mobile tab strip: icons only on narrow screens — five labelled
                tabs can't fit a phone width, and the strip's hidden scrollbar
                makes the cut-off ones look gone. Labels return from sm up. */}
            <nav
                aria-label="Sections"
                className="no-scrollbar flex gap-1 overflow-x-auto px-4 pb-2 md:hidden"
            >
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        aria-label={label}
                        title={label}
                        aria-current={tab === id ? 'page' : undefined}
                        onClick={() => onTabChange(id)}
                        className={cn(
                            // Icon-only phones: stretch across the full strip
                            // width (evenly spaced), labels from sm up go back
                            // to natural width.
                            'flex h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-gold/60 sm:flex-none sm:justify-start',
                            tab === id
                                ? 'bg-gold/15 text-gold'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                    >
                        <Icon aria-hidden className="size-4" />
                        <span className="hidden sm:inline">{label}</span>
                    </button>
                ))}
            </nav>

            {/* Mobile search row */}
            {mobileSearchOpen && (
                <div className="px-4 pt-1 pb-2 md:hidden">{searchInput(mobileSearchRef, '')}</div>
            )}

            <ConfirmDialog
                open={signOutOpen}
                onOpenChange={setSignOutOpen}
                title="Sign out?"
                confirmLabel="Sign out"
                variant="destructive"
                onConfirm={onLogout}
                description="You signed in as a guest. Logging out means losing this guest account permanently."
            />
        </header>
    );
}
