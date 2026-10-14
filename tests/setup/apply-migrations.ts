import { applyD1Migrations, env } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      APP_ENV: string;
      ALLOWED_ORIGINS: string;
      LIMIT_SOLLICITUDS?: RateLimit;
      FITXERS: R2Bucket;
      TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
