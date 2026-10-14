/**
 * Esquema de la sol·licitud d'inscripció del formulari públic. El fan servir el
 * navegador (ajuda immediata) i el servidor (validació definitiva). L'objecte és
 * estricte: qualsevol camp no previst es rebutja.
 *
 * Aquí només es comprova el format de cada camp. Quins camps es demanen i quins
 * són obligatoris depèn del cicle (vegeu `errorsDadesSegonsConfiguracio`).
 */
import { z } from "zod";
import { data } from "./comuns";

/** Camp de text opcional: buit es converteix en null. */
const text = (max: number) =>
  z.string().trim().max(max, `Màxim ${max} caràcters.`).transform((s) => (s === "" ? null : s)).nullable().optional();

/** Camp opcional amb format: buit és vàlid (l'obligatorietat es comprova a part). */
const ambFormat = (max: number, valid: (s: string) => boolean, missatge: string) =>
  z.string().trim().max(max, `Màxim ${max} caràcters.`)
    .refine((s) => s === "" || valid(s), missatge)
    .transform((s) => (s === "" ? null : s)).nullable().optional();

const LLETRES_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";

/** DNI (8 xifres + lletra) o NIE (X/Y/Z + 7 xifres + lletra) amb la lletra de control correcta. */
export function esDocumentIdentitatValid(valor: string): boolean {
  const v = valor.toUpperCase().replace(/[\s-]/g, "");
  const m = /^([XYZ]|\d)(\d{7})([A-Z])$/.exec(v);
  if (!m) return false;
  const primer = { X: "0", Y: "1", Z: "2" }[m[1] as "X" | "Y" | "Z"] ?? m[1];
  return LLETRES_DNI[Number(primer + m[2]) % 23] === m[3];
}

const PATRO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATRO_TELEFON = /^\+?[0-9][0-9 ]{7,18}$/;

export const dadesPersonalsSollicitud = z.strictObject({
  nom: z.string().trim().min(1, "Aquest camp és obligatori.").max(80, "Màxim 80 caràcters."),
  cognom1: z.string().trim().min(1, "Aquest camp és obligatori.").max(80, "Màxim 80 caràcters."),
  cognom2: text(80),
  data_naixement: z.union([z.literal(""), data]).transform((s) => (s === "" ? null : s)).nullable().optional(),
  document_identitat: ambFormat(12, esDocumentIdentitatValid, "El DNI o NIE no és vàlid.")
    .transform((s) => (s ? s.toUpperCase().replace(/[\s-]/g, "") : s)),
  telefon: ambFormat(20, (s) => PATRO_TELEFON.test(s), "El telèfon no és vàlid."),
  email: ambFormat(254, (s) => PATRO_EMAIL.test(s), "El correu electrònic no és vàlid.")
    .transform((s) => (s ? s.toLowerCase() : s)),
  adreca: text(200),
  codi_postal: ambFormat(5, (s) => /^\d{5}$/.test(s), "El codi postal ha de tenir 5 xifres."),
  municipi: text(100),
  lloc_naixement: text(100),
  barri: text(100),
});

export const preferenciaSollicitud = z.strictObject({
  activitat_id: z.uuid("Activitat no vàlida."),
  ordre: z.number().int().min(1).max(50).nullable(),
});

export const MAX_PREFERENCIES = 30;

export const sollicitudPublica = z.strictObject({
  dades: dadesPersonalsSollicitud,
  preferencies: z.array(preferenciaSollicitud).max(MAX_PREFERENCIES, `Màxim ${MAX_PREFERENCIES} activitats.`),
  acceptacio_privacitat: z.literal(true, "Cal llegir i acceptar la informació sobre protecció de dades."),
  /** Camp parany per a robots: les persones no el veuen i ha d'arribar buit. */
  web: z.string().max(200).optional(),
});

export type SollicitudPublica = z.output<typeof sollicitudPublica>;
