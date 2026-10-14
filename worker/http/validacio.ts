import type { Context } from "hono";
import type { z } from "zod";
import { errorsPerCamp } from "../../shared/schemas/comuns";
import { ErrorAplicacio, errors } from "./errors";

/**
 * Llegeix i valida el cos JSON d'una petició. Exigeix `Content-Type: application/json`
 * (un formulari d'un altre lloc no pot enviar-lo sense preflight CORS) i rebutja camps no previstos.
 */
export async function cosValidat<S extends z.ZodType>(c: Context, esquema: S): Promise<z.output<S>> {
  if (!c.req.header("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new ErrorAplicacio(415, "tipus_contingut_no_suportat", "La petició ha de ser JSON.");
  }
  let cos: unknown;
  try {
    cos = await c.req.json();
  } catch {
    throw errors.peticioInvalida("El cos de la petició no és un JSON vàlid.");
  }
  const resultat = esquema.safeParse(cos);
  if (!resultat.success) {
    throw errors.peticioInvalida("Hi ha dades no vàlides. Reviseu els camps marcats.", errorsPerCamp(resultat.error));
  }
  return resultat.data;
}

const PATRO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Valida un identificador de ruta abans de consultar la base de dades. */
export function idRuta(c: Context, nom: string): string {
  const valor = c.req.param(nom) ?? "";
  if (!PATRO_UUID.test(valor)) throw errors.noTrobat();
  return valor;
}
