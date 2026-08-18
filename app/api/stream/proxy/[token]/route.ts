import type { NextRequest } from 'next/server';
import { proxyStream } from '@/lib/stream/proxy';
import { open } from '@/lib/stream/token';

/**
 * Playback passthrough. Deliberately unauthenticated: a <video> element cannot
 * carry the session cookie for its own segment requests, so the sealed token is
 * the credential (the signed-URL pattern). It only ever names one upstream URL
 * and expires. see: docs/decisions/auth.md
 */
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
    const { token } = await context.params;
    const target = open(token);
    if (!target) return new Response(null, { status: 404 });
    return proxyStream(target, request.headers.get('range'));
}
