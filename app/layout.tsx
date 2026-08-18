import type { Metadata } from 'next';
import HlsBootstrap from '@/components/hls-bootstrap';
import ThemeProvider from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
    title: 'tv-pirate',
    description: 'Watch together. No account needed.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
    return (
        // suppressHydrationWarning: next-themes sets the class attribute before React hydrates.
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* Inert: vidstack's hls loader skips its CDN fetch when a tag with
                    this exact src exists, and takes window.Hls instead — which
                    HlsBootstrap sets from our bundle. type="application/json" means
                    the browser never fetches it.
                    see: docs/local/streaming-providers.md#architecture */}
                <script
                    type="application/json"
                    src="https://cdn.jsdelivr.net/npm/hls.js@^1.5.0/dist/hls.js"
                />
            </head>
            <body>
                <HlsBootstrap />
                {/* attribute="class" drives the dark variant; system follows the OS until the user picks. */}
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    {children}
                    <Toaster position="bottom-right" />
                </ThemeProvider>
            </body>
        </html>
    );
}
