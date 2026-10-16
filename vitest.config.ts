import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

// Dos projectes de proves:
//  - "workers": dins del runtime real de Workers (Miniflare) amb una D1 local i
//    aïllada per a cada fitxer de proves. Les migracions s'apliquen a l'inici.
//  - "node": utilitats del navegador que no depenen de Workers (p. ex. XLSX).
export default defineConfig(async () => {
  const migrations = await readD1Migrations("db/migrations");
  return {
    test: {
      projects: [
        {
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: { bindings: { TEST_MIGRATIONS: migrations, INSTAGRAM_CLAU: "clau-de-proves-instagram" } },
            }),
          ],
          test: {
            name: "workers",
            include: ["tests/**/*.test.ts"],
            exclude: ["tests/node/**"],
            setupFiles: ["./tests/setup/apply-migrations.ts"],
          },
        },
        { test: { name: "node", environment: "node", include: ["tests/node/**/*.test.ts"] } },
      ],
    },
  };
});
