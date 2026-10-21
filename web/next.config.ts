import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // The Docker image runs .next/standalone/server.js, supervised by the Go binary.
  output: "standalone",
  // The Dockerfile sets NEXT_BUILD_CPUS=1 so a 1 GB server builds with one worker.
  ...(process.env.NEXT_BUILD_CPUS ? { experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) } } : {}),
}

export default nextConfig
