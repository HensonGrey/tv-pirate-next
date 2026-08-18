'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

// next-themes writes to the DOM before paint, so it has to be a client component.
export default function ThemeProvider({
    children,
    ...props
}: ComponentProps<typeof NextThemesProvider>) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
