'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmDialog from '@/components/confirm-dialog';
import ThemeIconButton from '@/components/theme-icon-button';

/** Official Google "G" mark as inline SVG — no external assets needed. */
function GoogleIcon() {
    return (
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
            <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
            />
            <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
            />
            <path
                fill="#FBBC05"
                d="M5.27 14.29A7.14 7.14 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z"
            />
            <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
            />
        </svg>
    );
}

/** Entry screen: Google above, guest below the divider. The guest path asks for confirmation first — the session is browser-bound and can't be upgraded. */
export default function GuestView() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [, startTransition] = useTransition();

    async function handleGuestLogin() {
        setLoading(true);
        try {
            const response = await fetch('/api/auth/guest', { method: 'POST' });
            if (!response.ok) throw new Error(`guest login failed: ${response.status}`);
            setConfirmOpen(false);
            // refresh() re-runs the server layout so it picks up the new session cookie.
            startTransition(() => {
                router.refresh();
                router.replace('/');
            });
        } catch (error) {
            console.error(error);
            toast.error('Could not create a guest session. Try again in a moment.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="relative flex min-h-dvh items-center justify-center p-4">
            <ThemeIconButton className="absolute top-4 right-4 bg-background/50 backdrop-blur-sm" />

            {/* ring-border: a soft edge in both themes — foreground/25 read as a hard outline. */}
            <Card className="w-full max-w-md shadow-xl ring-border [--card-spacing:--spacing(7)]">
                <CardHeader className="items-center gap-1.5 text-center">
                    <CardTitle className="font-heading text-2xl font-bold tracking-tight">
                        tv-pirate
                    </CardTitle>
                    <CardDescription className="text-base">
                        Watch together. No account needed.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <Button
                        variant="outline"
                        aria-label="Continue with Google"
                        className="mx-auto size-12 border-foreground/20 dark:border-foreground/25"
                        onClick={() =>
                            toast.info('Google login is not wired up yet — coming soon.')
                        }
                    >
                        <GoogleIcon />
                    </Button>

                    {/* Divider between providers and guest. */}
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />
                        or
                        <span className="h-px flex-1 bg-border" />
                    </div>

                    <Button size="lg" className="h-11 w-full" onClick={() => setConfirmOpen(true)}>
                        Continue as guest
                    </Button>
                </CardContent>
            </Card>

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Continue as guest?"
                confirmLabel="Continue"
                loading={loading}
                onConfirm={handleGuestLogin}
                description={
                    <div className="flex flex-col gap-1.5">
                        <p>
                            Your session is tied to this browser — clearing cookies starts you over.
                        </p>
                        <p>It can't be upgraded to a full account later.</p>
                    </div>
                }
            />
        </div>
    );
}
