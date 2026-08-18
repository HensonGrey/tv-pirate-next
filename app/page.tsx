import { Button } from '@/components/ui/button';

// Batch 0 placeholder: proves the ported design tokens, fonts and shadcn build render.
// Replaced by the browse screen in batch 3.
export default function ScaffoldPage() {
    return (
        <div className="min-h-dvh bg-background bg-linear-to-b from-muted/40 via-background to-background">
            <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-20">
                <div>
                    <p className="text-xs font-semibold tracking-widest text-gold uppercase">
                        Batch 0
                    </p>
                    <h1 className="font-heading mt-1 text-4xl font-bold tracking-tight">
                        tv-pirate
                    </h1>
                    <p className="mt-2 text-base text-muted-foreground">
                        Scaffold is up. Design tokens, Outfit + Manrope, and the shadcn build all
                        come from the previous app unchanged.
                    </p>
                </div>

                <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
                    <p className="font-heading text-base font-semibold">Next up</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Batch 1 — Auth.js sessions, guest login, and the first migration.
                    </p>
                    <div className="mt-4 flex gap-2">
                        <Button className="bg-gold text-gold-foreground hover:bg-gold/90">
                            Gold
                        </Button>
                        <Button variant="outline">Outline</Button>
                    </div>
                </div>
            </main>
        </div>
    );
}
