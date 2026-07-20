import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app dir. Without it, Turbopack detects stray
  // lockfiles (repo bun.lock, ~/package-lock.json) and mis-resolves — crashing the
  // CSS worker ("Failed to write app endpoint /page ... globals.css").
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
  serverExternalPackages: ["@stellar/stellar-sdk", "snarkjs"],
  outputFileTracingExcludes: {
    "*": ["node_modules/snarkjs/**", "node_modules/web-worker/**"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
};

export default nextConfig;
