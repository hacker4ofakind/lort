import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // The Docker image runs .next/standalone/server.js, supervised by the Go binary.
  output: "standalone",
}

export default nextConfig
