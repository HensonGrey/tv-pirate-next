import { auth } from '@/auth';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/auth/actions';

// Batch 1 placeholder: proves the server-resolved session and sign-out.
// Replaced by the browse screen in batch 3.
export default async function ScaffoldPage() {
    const session = await auth();

    return (
        <div className="min-h-dvh bg-background bg-linear-to-b from-muted/40 via-background to-background">
            <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-20">
                <div>
                    <p className="text-xs font-semibold tracking-widest text-gold uppercase">
                        Batch 1
                    </p>
                    <h1 className="font-heading mt-1 text-4xl font-bold tracking-tight">
                        tv-pirate
                    </h1>
                    <p className="mt-2 text-base text-muted-foreground">
                        Signed in as{' '}
                        <span className="font-medium text-foreground">{session?.user.name}</span>{' '}
                        via {session?.user.provider}. No probe, no localStorage — the session was
                        resolved on the server.
                    </p>
                </div>

                <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
                    <p className="font-heading text-base font-semibold">Session</p>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        <dt className="text-muted-foreground">User id</dt>
                        <dd className="font-mono text-xs">{session?.user.id}</dd>
                        <dt className="text-muted-foreground">Provider</dt>
                        <dd>{session?.user.provider}</dd>
                        <dt className="text-muted-foreground">Expires</dt>
                        <dd>{session?.expires}</dd>
                    </dl>
                    <form action={signOutAction} className="mt-4">
                        <Button type="submit" variant="outline">
                            Sign out
                        </Button>
                    </form>
                </div>
            </main>
        </div>
    );
}
