import type { NextConfig } from "next";

// Standalone output is ONLY for self-hosted deployments (VPS / sandbox,
// where we run `bun .next/standalone/server.js` directly).
//
// Vercel requires its own output format — building with standalone there
// breaks Vercel's packaging step (ENOENT .next/next-server.js.nft.json).
//
// VERCEL is set automatically by Vercel's build system (it is NOT a
// variable anyone configures — the dashboard stays empty). Nothing to set.
const isVercelBuild = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  ...(!isVercelBuild && { output: "standalone" as const }),
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
