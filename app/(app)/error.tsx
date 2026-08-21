'use client';

import { useEffect } from 'react';
import { redirect } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UNAUTHENTICATED_DIGEST } from '@/lib/auth/errors';

/** Shared boundary for every page under (app) — the one place that maps a
 * specific thrown error to specific handling instead of each page deciding.
 * Add another `if (error.digest === ...)` branch here for the next type.
 * see: docs/decisions/auth.md */
export default function AppError({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    if (error.digest === UNAUTHENTICATED_DIGEST) redirect('/login');

    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
            <WifiOff aria-hidden className="size-10 text-muted-foreground" />
            <p className="font-heading text-lg font-semibold">Something went wrong</p>
            <p className="max-w-sm text-sm text-muted-foreground">
                Give it another try — if it keeps happening, the server may be busy.
            </p>
            <Button variant="outline" onClick={() => retry()}>
                Try again
            </Button>
        </div>
    );
}
