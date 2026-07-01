import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
