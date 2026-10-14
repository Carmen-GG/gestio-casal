export interface Env {
  DB: D1Database;
  /** "local" | "staging" | "production" */
  APP_ENV: string;
  /** Orígens addicionals permesos per CORS, separats per comes. Buit = només el mateix origen. */
  ALLOWED_ORIGINS: string;
  /**
   * Limitador de peticions per a l'enviament de sol·licituds (Workers Rate Limiting).
   * Opcional: si no està configurat, no es limita (p. ex. en algunes proves).
   */
  LIMIT_SOLLICITUDS?: RateLimit;
}
