import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

// Les proves s'executen dins del runtime real de Workers (Miniflare) amb una D1
// local i aïllada per a cada fitxer de proves. Les migracions s'apliquen a l'inici.
export default defineConfig(async () => {
  const migrations = await readD1Migrations("db/migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup/apply-migrations.ts"],
    },
  };
});
