/**
 * Esquemes de la importació i la cerca de persones usuàries de la PGEc.
 */
import { z } from "zod";
import { LLISTA_CAMPS_PERSONA, MAX_FILES_BLOC_PERSONES, MAX_LLARGADA_VALOR } from "../domain/persones-plataforma";

export const ORIGENS_PERSONES = ["usuaris", "carnets", "altres"] as const;
export type OrigenPersones = (typeof ORIGENS_PERSONES)[number];

const filaPersona = z.partialRecord(z.enum(LLISTA_CAMPS_PERSONA as [string, ...string[]]), z.string().max(MAX_LLARGADA_VALOR * 2));

export const importacioPersones = z.strictObject({
  origen: z.enum(ORIGENS_PERSONES),
  nom_fitxer: z.string().trim().max(200).optional(),
  /** Número de fila del fitxer de la primera fila del bloc (per als missatges). */
  primera_fila: z.number().int().min(1).max(1_000_000),
  files: z.array(filaPersona).min(1, "El bloc no té files.").max(MAX_FILES_BLOC_PERSONES, `Màxim ${MAX_FILES_BLOC_PERSONES} files per bloc.`),
});

export const cercaPersones = z.object({
  q: z.string().trim().max(120).default(""),
  camp: z.enum(["tots", ...LLISTA_CAMPS_PERSONA] as [string, ...string[]]).default("tots"),
});
