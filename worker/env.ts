export interface Env {
  DB: D1Database;
  /** Fitxers de PG-Cartells (plantilles, fotografies, logotips i materials generats). Privat. */
  FITXERS: R2Bucket;
  /** "local" | "staging" | "production" */
  APP_ENV: string;
  /** Orígens addicionals permesos per CORS, separats per comes. Buit = només el mateix origen. */
  ALLOWED_ORIGINS: string;
  /**
   * Limitador de peticions per a l'enviament de sol·licituds (Workers Rate Limiting).
   * Opcional: si no està configurat, no es limita (p. ex. en algunes proves).
   */
  LIMIT_SOLLICITUDS?: RateLimit;
  /** Limitador dels intents d'entrada amb contrasenya. Opcional com l'anterior. */
  LIMIT_ENTRADA?: RateLimit;
  /**
   * WhatsApp Business (API de Meta). Secrets: es configuren amb `wrangler secret put`, mai al repositori.
   * WHATSAPP_TOKEN: testimoni d'accés permanent d'un usuari del sistema de Meta Business.
   * WHATSAPP_APP_SECRET: secret de l'app de Meta (per comprovar la signatura dels avisos).
   * WHATSAPP_VERIFY_TOKEN: text que s'escriu a Meta en registrar el webhook.
   */
  WHATSAPP_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
  /**
   * Correu electrònic dels comunicats de la superadministració (servei Resend). Secrets:
   * RESEND_API_KEY: clau de l'API de Resend.
   * CORREU_REMITENT: adreça que envia, d'un domini verificat a Resend (p. ex. «Casals Cívics <avisos@domini.cat>»).
   * Sense aquests secrets, el panell prepara el correu perquè l'enviï la persona des del seu programa.
   */
  RESEND_API_KEY?: string;
  CORREU_REMITENT?: string;
}
