import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // The Docker image runs .next/standalone/server.js, supervised by the Go binary.
  output: "standalone",
  // The share card reads its TrueType font from disk at run time, so the trace must carry it.
  outputFileTracingIncludes: { "/changelog-card/[slug]": ["./app/fonts/BricolageGrotesque-ExtraBold.ttf"] },
  // The Dockerfile sets NEXT_BUILD_CPUS=1 so a 1 GB server builds with one worker.
  ...(process.env.NEXT_BUILD_CPUS ? { experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) } } : {}),
}

export default nextConfig
