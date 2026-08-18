'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
}

/** Window of page numbers around the current page, e.g. 1 … 4 5 6 … 12. */
function pageWindow(page: number, pageCount: number): (number | '…')[] {
    const pages: (number | '…')[] = [];
    for (let p = 1; p <= pageCount; p++) {
        if (p === 1 || p === pageCount || Math.abs(p - page) <= 1) {
            pages.push(p);
        } else if (pages[pages.length - 1] !== '…') {
            pages.push('…');
        }
    }
    return pages;
}

const BUTTON_BASE =
    'flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-gold/60 disabled:opacity-40';

export default function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
    if (pageCount <= 1) return null;

    return (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1.5">
            <button
                type="button"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
                className={cn(
                    BUTTON_BASE,
                    'hover:bg-muted hover:text-foreground text-muted-foreground',
                )}
            >
                <ChevronLeft className="size-4" />
            </button>
            {pageWindow(page, pageCount).map((p, index) =>
                p === '…' ? (
                    <span
                        key={`gap-${index}`}
                        className="px-1 text-sm text-muted-foreground"
                        aria-hidden
                    >
                        …
                    </span>
                ) : (
                    <button
                        key={p}
                        type="button"
                        aria-label={`Page ${p}`}
                        aria-current={p === page ? 'page' : undefined}
                        onClick={() => onPageChange(p)}
                        className={cn(
                            BUTTON_BASE,
                            p === page
                                ? 'bg-gold font-semibold text-gold-foreground'
                                : 'hover:bg-muted hover:text-foreground text-muted-foreground',
                        )}
                    >
                        {p}
                    </button>
                ),
            )}
            <button
                type="button"
                aria-label="Next page"
                disabled={page === pageCount}
                onClick={() => onPageChange(page + 1)}
                className={cn(
                    BUTTON_BASE,
                    'hover:bg-muted hover:text-foreground text-muted-foreground',
                )}
            >
                <ChevronRight className="size-4" />
            </button>
        </nav>
    );
}
