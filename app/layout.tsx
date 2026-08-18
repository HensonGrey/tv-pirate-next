import type { Metadata } from 'next';
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
            <body>
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
