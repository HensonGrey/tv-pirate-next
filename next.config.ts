import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // Hides the dev-only route indicator in the corner. Compile and runtime
    // errors are still surfaced.
    devIndicators: false,
};

export default nextConfig;
