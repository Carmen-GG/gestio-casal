import type { Context } from "hono";
import type { z } from "zod";
import { errorsPerCamp } from "../../shared/schemas/comuns";
import { MIDA_MAXIMA_COS } from "../middleware/seguretat";
import { ErrorAplicacio, errors } from "./errors";

/**
 * Llegeix i valida el cos JSON d'una petició. Exigeix `Content-Type: application/json`
 * (un formulari d'un altre lloc no pot enviar-lo sense preflight CORS) i rebutja camps no previstos.
 */
export async function cosValidat<S extends z.ZodType>(c: Context, esquema: S): Promise<z.output<S>> {
  if (!c.req.header("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new ErrorAplicacio(415, "tipus_contingut_no_suportat", "La petició ha de ser JSON.");
  }
  const text = await llegeixLimitat(c.req.raw, MIDA_MAXIMA_COS);
  let cos: unknown;
  try {
    cos = JSON.parse(text);
  } catch {
    throw errors.peticioInvalida("El cos de la petició no és un JSON vàlid.");
  }
  const resultat = esquema.safeParse(cos);
  if (!resultat.success) {
    throw errors.peticioInvalida("Hi ha dades no vàlides. Reviseu els camps marcats.", errorsPerCamp(resultat.error));
  }
  return resultat.data;
}

/** Llegeix el cos com a text sense passar de `maxim` bytes, encara que no s'hagi indicat la mida. */
async function llegeixLimitat(peticio: Request, maxim: number): Promise<string> {
  if (!peticio.body) return "";
  const lector = peticio.body.getReader();
  const trossos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxim) {
      await lector.cancel();
      throw new ErrorAplicacio(413, "peticio_massa_gran", "La petició és massa gran.");
    }
    trossos.push(value);
  }
  const tot = new Uint8Array(total);
  let posicio = 0;
  for (const t of trossos) { tot.set(t, posicio); posicio += t.byteLength; }
  return new TextDecoder().decode(tot);
}

const PATRO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Valida un identificador de ruta abans de consultar la base de dades. */
export function idRuta(c: Context, nom: string): string {
  const valor = c.req.param(nom) ?? "";
  if (!PATRO_UUID.test(valor)) throw errors.noTrobat();
  return valor;
}
