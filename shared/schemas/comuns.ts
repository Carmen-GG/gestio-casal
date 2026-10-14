import { z } from "zod";

const esDataValida = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(a!, m! - 1, d!));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
};

/** Data AAAA-MM-DD vàlida. */
export const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format de data no vàlid (AAAA-MM-DD).")
  .refine(esDataValida, "La data no existeix.");

/** Data i hora ISO 8601 amb zona; es normalitza a UTC. */
export const dataHora = z
  .string()
  .refine((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && /(Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)),
    "Data i hora no vàlides.")
  .transform((s) => new Date(s).toISOString());

export const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format d'hora no vàlid (HH:MM).");

export const textCurt = (max: number) => z.string().trim().min(1, "Aquest camp és obligatori.").max(max, `Màxim ${max} caràcters.`);
export const textOpcional = (max: number) =>
  z.string().trim().max(max, `Màxim ${max} caràcters.`).transform((s) => (s === "" ? null : s)).nullable();

export const versio = z.number().int().min(1);
export const motiu = z.string().trim().max(500).optional();

/** Converteix els errors de zod en un mapa camp → missatge per mostrar-los als formularis. */
export function errorsPerCamp(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const clau = issue.path.join(".") || "_";
    if (!(clau in errors)) {
      errors[clau] = issue.code === "unrecognized_keys" ? `Camps no permesos: ${issue.keys.join(", ")}` : issue.message;
    }
  }
  return errors;
}
