'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
    CircleCheckIcon,
    InfoIcon,
    TriangleAlertIcon,
    OctagonXIcon,
    Loader2Icon,
} from 'lucide-react';

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = 'system' } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps['theme']}
            className="toaster group"
            icons={{
                success: <CircleCheckIcon className="size-5" />,
                info: <InfoIcon className="size-5" />,
                warning: <TriangleAlertIcon className="size-5" />,
                error: <OctagonXIcon className="size-5" />,
                loading: <Loader2Icon className="size-5 animate-spin" />,
            }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    '--border-radius': 'var(--radius)',
                    // Wider and roomier than sonner's 356px / 13px defaults.
                    '--width': '460px',
                } as React.CSSProperties
            }
            toastOptions={{
                classNames: {
                    toast: 'cn-toast gap-3.5 p-4.5',
                    title: 'text-base font-medium',
                    description: 'text-[0.9rem]',
                },
            }}
            {...props}
        />
    );
};

export { Toaster };
