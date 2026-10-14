/**
 * Esquemes del control d'assistència. Compartits entre el panell i el servidor.
 */
import { z } from "zod";
import { ESTATS_ASSISTENCIA } from "../domain/assistencia";
import { data, hora, versio } from "./comuns";
import { motiuObligatori } from "./sollicituds";

/** Màxim de marques en una sola petició (una sessió). */
export const MAXIM_MARQUES = 300;

export const novaSessio = z.strictObject({
  data,
  hora_inici: hora.nullable().optional(),
  hora_fi: hora.nullable().optional(),
}).refine((s) => !s.hora_inici || !s.hora_fi || s.hora_fi > s.hora_inici, { path: ["hora_fi"], message: "L'hora de fi ha de ser posterior a la d'inici." });

export const cancellarSessio = z.strictObject({ versio, motiu: motiuObligatori });

export const registrarAssistencia = z.strictObject({
  marques: z.array(z.strictObject({
    placa_id: z.uuid(),
    estat: z.enum(ESTATS_ASSISTENCIA),
    /** Versió de la marca que s'ha vist (null si encara no n'hi havia). */
    versio: versio.nullable(),
  })).min(1, "No hi ha cap marca per desar.").max(MAXIM_MARQUES)
    .refine((l) => new Set(l.map((m) => m.placa_id)).size === l.length, "Hi ha persones repetides."),
  /** Obligatori si es modifica alguna marca ja registrada. */
  motiu: z.string().trim().max(500).optional(),
});
