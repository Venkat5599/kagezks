// Live checks against a running Kage (default https://kageai.me) and the real Stellar
// networks. Not part of `npm test`: results depend on the chain and the network.
//   KAGE_URL=http://localhost:3000 npm run test:live
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: { environment: "node", include: ["tests/live/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
});
