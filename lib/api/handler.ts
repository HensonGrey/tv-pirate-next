import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { ApiError } from './errors';

const REASON: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    429: 'Too Many Requests',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
};

function toResponse(error: unknown): NextResponse {
    if (error instanceof ApiError) {
        return NextResponse.json(
            {
                status: error.status,
                error: REASON[error.status] ?? 'Error',
                message: error.message,
            },
            { status: error.status },
        );
    }
    console.error('unhandled route error', error);
    return NextResponse.json(
        { status: 500, error: 'Internal Server Error', message: 'Something went wrong' },
        { status: 500 },
    );
}

/**
 * JSON with a browser cache window. The payloads are user-agnostic (trending is
 * trending for everyone), but the route needs a session, so the directive is
 * `private`: only the user's own browser may store it, never a shared cache.
 */
export function cachedJson(data: unknown, maxAge: number, staleWhileRevalidate = 60) {
    return NextResponse.json(data, {
        headers: {
            'cache-control': `private, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
        },
    });
}

/** Wraps a public route so thrown ApiErrors become responses and anything else
 * becomes a 500 without leaking a stack. Replaces the Spring exception handler. */
export function route<T extends unknown[]>(
    handler: (...args: T) => Promise<NextResponse> | NextResponse,
) {
    return async (...args: T) => {
        try {
            return await handler(...args);
        } catch (error) {
            return toResponse(error);
        }
    };
}

/**
 * Same, but 401s without a session. The previous stack got this from
 * SecurityConfig's anyRequest().authenticated() — here every protected route
 * opts in explicitly, so a new route is never accidentally public.
 * see: docs/decisions/auth.md
 */
export function protectedRoute<T extends unknown[]>(
    handler: (session: Session, ...args: T) => Promise<NextResponse> | NextResponse,
) {
    return async (...args: T) => {
        try {
            const session = await auth();
            if (!session?.user) throw new ApiError(401, 'Sign in to use this endpoint');
            return await handler(session, ...args);
        } catch (error) {
            return toResponse(error);
        }
    };
}
