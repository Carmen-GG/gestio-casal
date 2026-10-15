/**
 * Esquemes de les operacions de gestió de sol·licituds, importacions i
 * exportacions. Compartits entre el panell i el servidor. Objectes estrictes.
 */
import { z } from "zod";
import { versio } from "./comuns";
import { dadesPersonalsSollicitud, preferenciaSollicitud } from "./public";

export const ESTATS_SOLLICITUD = ["rebuda", "validada", "pendent_revisio", "anullada"] as const;
export type EstatSollicitud = (typeof ESTATS_SOLLICITUD)[number];

export const ETIQUETES_ESTAT_SOLLICITUD: Record<EstatSollicitud, string> = {
  rebuda: "Rebuda",
  validada: "Validada",
  pendent_revisio: "Pendent de revisió",
  anullada: "Anul·lada",
};

export const ETIQUETES_ESTAT_ADJUDICACIO = {
  pendent: "Sense adjudicar",
  admesa: "Admesa",
  llista_espera: "Llista d'espera",
  sense_placa: "Sense plaça",
} as const;

/** Motiu obligatori per a qualsevol modificació des del panell (queda a l'historial). */
export const motiuObligatori = z.string().trim().min(3, "Indiqueu el motiu del canvi (mínim 3 caràcters).").max(500);

export const ORDRES_LLISTAT = ["inscripcio", "alfabetic", "preferencies", "estat"] as const;
export const VISTES_LLISTAT = ["inscripcio", "alfabetic", "activitat"] as const;

/** Paràmetres de consulta del llistat (arriben com a text a la URL). */
export const consultaSollicituds = z.object({
  vista: z.enum(VISTES_LLISTAT).default("inscripcio"),
  ordre: z.enum(ORDRES_LLISTAT).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().trim().max(100).optional(),
  activitat: z.uuid().optional(),
  estat: z.enum(ESTATS_SOLLICITUD).optional(),
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
  mida: z.coerce.number().int().min(10).max(200).default(50),
});

/** Edició de dades personals: només els camps enviats es modifiquen. */
export const sollicitudActualitzarDades = z.strictObject({
  versio_participant: versio,
  dades: dadesPersonalsSollicitud.partial().extend({
    codi_participant_intern: z.string().trim().max(40).transform((s) => (s === "" ? null : s)).nullable().optional(),
  }),
  motiu: motiuObligatori,
});

export const sollicitudCanviEstat = z.strictObject({
  versio,
  estat: z.enum(ESTATS_SOLLICITUD),
  motiu: motiuObligatori,
});

export const sollicitudPreferencies = z.strictObject({
  versio,
  preferencies: z.array(preferenciaSollicitud).max(30),
  motiu: motiuObligatori,
});

export const revisioDuplicat = z.strictObject({
  a: z.uuid(),
  b: z.uuid(),
  decisio: z.enum(["no_duplicat", "duplicat"]),
  motiu: z.string().trim().max(500).optional(),
});

// ---------- Importacions ----------
export const MAX_FILES_IMPORTACIO = 2000;
export const MAX_PREFERENCIES_IMPORTACIO = 10;

/** Columnes de destinació d'una importació de sol·licituds. */
export const CAMPS_IMPORTACIO_SOLLICITUDS = [
  "nom", "cognom1", "cognom2", "data_naixement", "document_identitat", "telefon", "email", "adreca",
  "codi_postal", "municipi", "lloc_naixement", "barri", "codi_participant_intern", "data_registre",
  ...Array.from({ length: MAX_PREFERENCIES_IMPORTACIO }, (_, i) => `preferencia_${i + 1}` as const),
] as const;

export const CAMPS_IMPORTACIO_ACTIVITATS = [
  "nom", "descripcio", "categoria", "dies", "hora_inici", "hora_fi", "horari_text", "data_inici", "data_fi",
  "espai", "capacitat", "nombre_sessions", "codi_extern", "destinataris", "dates",
] as const;

export const OBLIGATORIS_IMPORTACIO = {
  sollicituds: ["nom", "cognom1", "preferencia_1"],
  activitats: ["nom", "capacitat"],
} as const;

const filaImportacio = z.record(z.string().max(60), z.string().max(4000));

export const importacioPeticio = z.strictObject({
  nom_fitxer: z.string().trim().max(200).optional(),
  files: z.array(filaImportacio).min(1, "El fitxer no té files.").max(MAX_FILES_IMPORTACIO, `Màxim ${MAX_FILES_IMPORTACIO} files per importació.`),
});

export const importacioConfirmacio = importacioPeticio.extend({
  /** Clau única de la importació (evita confirmar-la dues vegades). */
  clau: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  confirmacio: z.literal(true),
  /** Nombre de files vàlides que la persona ha vist a la previsualització. */
  files_esperades: z.number().int().min(0),
});
