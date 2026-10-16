/**
 * Esquemes de WhatsApp Business (configuració per casal i enviaments).
 */
import { z } from "zod";

export const configWhatsapp = z.strictObject({
  phone_number_id: z.string().trim().regex(/^\d{5,40}$/, "És un número llarg que trobareu a WhatsApp Manager (Identificador del número de telèfon)."),
  numero_visible: z.string().trim().max(30).nullable().optional(),
  idioma: z.enum(["ca", "es"]),
  actiu: z.boolean(),
  ofertes_automatiques: z.boolean(),
});

const ids = z.array(z.string().min(1).max(64)).max(500);

export const enviamentActivitat = z.strictObject({
  activitat_ids: ids.optional(),
  placa_ids: ids.optional(),
  nomes_pendents: z.boolean().default(true),
});

export const enviamentGeneral = z.strictObject({
  text: z.string().trim().min(5, "Escriviu el missatge.").max(900, "Màxim 900 caràcters."),
  activitat_ids: ids.optional(),
  situacions: z.array(z.enum(["admesa", "espera"])).min(1, "Trieu a qui s'envia."),
});
