/**
 * Esquemes dels comunicats de la superadministració (petició de 2026-10-16).
 */
import { z } from "zod";
import { analitzaTelefon } from "../domain/whatsapp";

export const configWhatsappCentral = z.strictObject({
  phone_number_id: z.string().trim().regex(/^\d{5,40}$/, "És un número llarg que trobareu a WhatsApp Manager (Identificador del número de telèfon)."),
  numero_visible: z.string().trim().max(30).nullable().optional(),
  idioma: z.enum(["ca", "es"]),
  remitent: z.string().trim().min(2, "Escriviu com se signa el missatge.").max(120),
  actiu: z.boolean(),
});

export const comunicat = z.strictObject({
  assumpte: z.string().trim().min(3, "Escriviu l'assumpte.").max(150, "Màxim 150 caràcters."),
  text: z.string().trim().min(5, "Escriviu el missatge.").max(900, "Màxim 900 caràcters."),
  casal_ids: z.array(z.string().min(1).max(64)).min(1, "Trieu almenys un casal.").max(500),
  correu_responsables: z.boolean(),
  whatsapp_responsables: z.boolean(),
  whatsapp_persones: z.boolean(),
}).refine((d) => d.correu_responsables || d.whatsapp_responsables || d.whatsapp_persones, {
  message: "Trieu almenys una manera d'enviar-lo.", path: ["canals"],
});

/** Mòbil de l'equip per als avisos: buit per treure'l. */
export const telefonUsuari = z.strictObject({
  telefon: z.string().trim().max(30).nullable().transform((t) => (t ? t : null))
    .refine((t) => t === null || ["mobil", "estranger"].includes(analitzaTelefon(t).tipus), "Ha de ser un mòbil (per rebre WhatsApp)."),
});
