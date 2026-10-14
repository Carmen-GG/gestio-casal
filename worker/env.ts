export interface Env {
  DB: D1Database;
  /** "local" | "staging" | "production" */
  APP_ENV: string;
  /** Orígens addicionals permesos per CORS, separats per comes. Buit = només el mateix origen. */
  ALLOWED_ORIGINS: string;
}
