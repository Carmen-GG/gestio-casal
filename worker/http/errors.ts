import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorApi } from "../../shared/api/public";

/**
 * Error d'aplicació amb un codi estable i un missatge comprensible per a persones.
 * Mai inclou detalls tècnics interns ni dades personals.
 */
export class ErrorAplicacio extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly codi: string,
    readonly missatge: string,
    readonly detalls?: unknown,
  ) {
    super(codi);
  }
}

export const errors = {
  noTrobat: (missatge = "No s'ha trobat el recurs sol·licitat.") =>
    new ErrorAplicacio(404, "no_trobat", missatge),
  peticioInvalida: (missatge: string, detalls?: unknown) =>
    new ErrorAplicacio(400, "peticio_invalida", missatge, detalls),
  conflicte: (codi: string, missatge: string) => new ErrorAplicacio(409, codi, missatge),
  noAutenticat: () => new ErrorAplicacio(401, "no_autenticat", "Cal iniciar sessió."),
  sensePermis: () => new ErrorAplicacio(403, "sense_permis", "No teniu permís per fer aquesta operació."),
};

export function respostaError(c: Context, err: ErrorAplicacio) {
  const cos: ErrorApi = {
    error: {
      codi: err.codi,
      missatge: err.missatge,
      id_peticio: c.get("idPeticio" as never),
      ...(err.detalls === undefined ? {} : { detalls: err.detalls }),
    },
  };
  return c.json(cos, err.status);
}
