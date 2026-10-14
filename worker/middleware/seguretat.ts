import type { MiddlewareHandler } from "hono";
import type { Entorn } from "../app";
import { ErrorAplicacio, respostaError } from "../http/errors";

/** Assigna un identificador a cada petició per correlacionar errors i auditoria sense dades personals. */
export const idPeticio: MiddlewareHandler<Entorn> = async (c, next) => {
  const id = c.req.header("cf-ray") ?? crypto.randomUUID();
  c.set("idPeticio", id);
  await next();
  c.header("X-Request-Id", id);
};

/** Capçaleres de seguretat per a totes les respostes de l'API. */
export const capcaleresSeguretat: MiddlewareHandler<Entorn> = async (c, next) => {
  await next();
  c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
};

function originsPermesos(c: Parameters<MiddlewareHandler<Entorn>>[0]): Set<string> {
  const propi = new URL(c.req.url).origin;
  const addicionals = (c.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([propi, ...addicionals]);
}

/**
 * Política CORS restrictiva i protecció CSRF.
 * - Per defecte només s'accepta el mateix origen (frontend i API al mateix domini).
 * - Les peticions que modifiquen dades amb una capçalera Origin d'un altre domini es rebutgen.
 */
export const politicaOrigen: MiddlewareHandler<Entorn> = async (c, next) => {
  const origen = c.req.header("Origin");
  const permesos = originsPermesos(c);
  const permes = origen !== undefined && permesos.has(origen);

  if (c.req.method === "OPTIONS") {
    if (!permes) return c.body(null, 403);
    return c.body(null, 204, {
      "Access-Control-Allow-Origin": origen!,
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    });
  }

  const modifica = !["GET", "HEAD"].includes(c.req.method);
  if (modifica && origen !== undefined && !permes) {
    return respostaError(c, new ErrorAplicacio(403, "origen_no_permes", "Origen de la petició no permès."));
  }

  await next();
  if (permes) {
    c.header("Access-Control-Allow-Origin", origen!);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Vary", "Origin");
  }
};

/** Mida màxima del cos d'una petició. */
export const MIDA_MAXIMA_COS = 256 * 1024;

/**
 * Limita la mida del cos de les peticions (protecció bàsica contra abusos). Si no hi ha
 * `Content-Length` (enviament fragmentat), el límit s'aplica en llegir el cos (`cosValidat`).
 */
export function midaMaximaCos(bytes: number): MiddlewareHandler<Entorn> {
  return async (c, next) => {
    const longitud = Number(c.req.header("Content-Length") ?? "0");
    if (!Number.isFinite(longitud) || longitud > bytes) {
      return respostaError(c, new ErrorAplicacio(413, "peticio_massa_gran", "La petició és massa gran."));
    }
    await next();
  };
}
