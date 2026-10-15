/**
 * Esquemes de les comunicacions de l'assignació (WhatsApp i trucades).
 */
import { z } from "zod";

export const TIPUS_COMUNICACIO = ["admesa", "espera"] as const;
export const CANALS_COMUNICACIO = ["whatsapp_manual", "whatsapp_api", "telefon"] as const;
export const ESTATS_COMUNICACIO = ["enviat", "no_contactat", "contactat_telefon"] as const;
export const MOTIUS_NO_CONTACTE = ["telefon_fix", "sense_telefon", "telefon_invalid", "sense_whatsapp", "no_respon", "altres"] as const;

export type TipusComunicacio = (typeof TIPUS_COMUNICACIO)[number];
export type CanalComunicacio = (typeof CANALS_COMUNICACIO)[number];
export type EstatComunicacio = (typeof ESTATS_COMUNICACIO)[number];
export type MotiuNoContacte = (typeof MOTIUS_NO_CONTACTE)[number];

export const ETIQUETES_MOTIU_NO_CONTACTE: Record<MotiuNoContacte, string> = {
  telefon_fix: "Telèfon fix (sense WhatsApp)",
  sense_telefon: "Sense telèfon",
  telefon_invalid: "Telèfon no vàlid",
  sense_whatsapp: "No té WhatsApp",
  no_respon: "No respon",
  altres: "Altres",
};

export const registreComunicacio = z.strictObject({
  tipus: z.enum(TIPUS_COMUNICACIO),
  canal: z.enum(CANALS_COMUNICACIO),
  estat: z.enum(ESTATS_COMUNICACIO),
  motiu: z.enum(MOTIUS_NO_CONTACTE).nullable().optional(),
  nota: z.string().trim().max(300).nullable().optional(),
}).refine((d) => d.estat !== "no_contactat" || !!d.motiu, { path: ["motiu"], message: "Indiqueu per què no s'ha pogut contactar." });
