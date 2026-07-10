import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests hit the local Postgres from docker-compose
    setupFiles: ["dotenv/config"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // next-auth imports "next/server" (extensionless); Node ESM in vitest
      // needs the explicit .js entry
      
    },
  },
});
