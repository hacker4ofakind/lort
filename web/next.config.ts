import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The Go server runs `node server.js` from .next/standalone inside the container.
  output: 'standalone',
};

export default nextConfig;
