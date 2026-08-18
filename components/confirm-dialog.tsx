'use client';

import type { ReactNode } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: ReactNode;
    /** destructive turns the confirm button red — for delete/deactivate actions. */
    variant?: 'default' | 'destructive';
    confirmLabel?: string;
    cancelLabel?: string;
    /** Greys both buttons, blocks clicks and shows a sweep on the confirm button. */
    loading?: boolean;
    onConfirm: () => void;
}

/**
 * Reusable confirmation modal (shadcn AlertDialog underneath). The parent
 * owns the open state and closes it inside onConfirm once the action
 * succeeds — on failure the dialog stays open so the user can retry.
 */
export default function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    variant = 'default',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    loading = false,
    onConfirm,
}: ConfirmDialogProps) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            {/* Wider than the max-w-md cards it covers, so it reads as on top of them. */}
            <AlertDialogContent className="data-[size=default]:max-w-sm data-[size=default]:sm:max-w-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {/* Description renders a <p> by default — callers pass block content
              (divs/paragraphs), which is invalid HTML inside a p. Rendering a
              div keeps the slot and styles but accepts any ReactNode. */}
                    {description && (
                        <AlertDialogDescription render={<div />}>
                            {description}
                        </AlertDialogDescription>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
                    <AlertDialogAction
                        variant={variant === 'destructive' ? 'destructive' : 'default'}
                        disabled={loading}
                        onClick={onConfirm}
                        className="relative overflow-hidden"
                    >
                        {loading && (
                            <span
                                aria-hidden="true"
                                className="absolute inset-0 -translate-x-full animate-[shimmer-sweep_1.4s_ease-in-out_infinite] bg-linear-to-r from-transparent via-white/30 to-transparent dark:via-black/20"
                            />
                        )}
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
