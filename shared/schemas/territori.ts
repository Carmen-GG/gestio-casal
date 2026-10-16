import { z } from "zod";
import { CATEGORIES_INCIDENCIA } from "../domain/territori";
import { data, textCurt, textOpcional } from "./comuns";

const email = z.string().trim().max(254).transform((s) => (s === "" ? null : s.toLowerCase()))
  .refine((s) => s === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "Adreça de correu no vàlida.").nullable();

export const referentNou = z.strictObject({ nom: textCurt(120), email: email.optional() });
export const referentCanvis = z.strictObject({ nom: textCurt(120), email: email.optional(), actiu: z.boolean() });

export const territoriCasal = z.strictObject({
  comarca: textOpcional(80),
  demarcacio: textOpcional(80),
  referent_id: z.uuid().nullable(),
});

export const faltaTallerista = z.strictObject({
  absent: z.boolean(),
  motiu: textOpcional(200).optional(),
});

export const incidenciaNova = z.strictObject({
  data,
  categoria: z.enum(CATEGORIES_INCIDENCIA, "Trieu una categoria."),
  descripcio: z.string().trim().min(3, "Descriviu la incidència (mínim 3 caràcters).").max(1000, "Màxim 1000 caràcters."),
  activitat_id: z.uuid().nullable().optional(),
});

export const incidenciaResolucio = z.strictObject({ resolucio: textOpcional(1000).optional() });
