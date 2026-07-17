import path from "node:path";

const nextConfig = {
  output: "standalone",
  // Without this, Next.js walks up to the monorepo's pnpm-lock.yaml and
  // treats the repo root as the trace root, nesting the standalone build
  // under .next/standalone/web/ instead of .next/standalone/ - breaking the
  // Dockerfile's flat COPY + `node server.js`.
  outputFileTracingRoot: path.resolve(),
  experimental: {
    cpus: 1,
    workerThreads: false
  }
};

export default nextConfig;
