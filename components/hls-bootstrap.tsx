'use client';

import { useEffect } from 'react';
import Hls from 'hls.js';

declare global {
    interface Window {
        Hls: typeof Hls;
    }
}

/** Hands vidstack's HLS provider our bundled hls.js. Its default is a runtime
 * fetch from cdn.jsdelivr.net, which dies on networks that block the CDN — the
 * inert script tag in the layout makes its loader skip that fetch and take
 * window.Hls instead. see: docs/local/streaming-providers.md#architecture */
export default function HlsBootstrap() {
    useEffect(() => {
        window.Hls = Hls;
    }, []);
    return null;
}
