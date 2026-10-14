/**
 * Esquemes de l'adjudicació (paràmetres, propostes, confirmació) i de la gestió
 * de places. Compartits entre el panell i el servidor. Objectes estrictes.
 */
import { z } from "zod";
import { CRITERIS_ORDRE, ESTATS_PARTICIPANTS, METODES } from "../domain/adjudicacio";
import { versio } from "./comuns";
import { motiuObligatori } from "./sollicituds";

export const parametresAdjudicacio = z.strictObject({
  criteri_ordre: z.enum(CRITERIS_ORDRE),
  metode: z.enum(METODES),
  maxim_activitats_per_persona: z.number().int().min(1).max(30).nullable(),
  prioritat_continuitat: z.boolean(),
  llista_espera: z.boolean(),
  estats_sollicitud: z.array(z.enum(ESTATS_PARTICIPANTS)).min(1, "Trieu almenys un estat de sol·licitud.")
    .refine((l) => new Set(l).size === l.length, "Estats repetits."),
});

export const desarParametres = z.strictObject({
  parametres: parametresAdjudicacio,
  /** Versió vigent que la persona ha vist (null si encara no n'hi ha cap). Evita sobreescriure canvis d'altri. */
  versio_actual: versio.nullable(),
  motiu: z.string().trim().max(500).optional(),
});

/** Calcular una proposta nova. La lletra només s'usa amb el criteri «lletra»; si no s'indica, el servidor la sorteja. */
export const novaProposta = z.strictObject({
  lletra: z.string().trim().regex(/^[A-Za-z]$/, "Indiqueu una sola lletra (A-Z).").optional(),
});

export const confirmarProposta = z.strictObject({
  confirmacio: z.literal(true),
  /** Obligatori quan substitueix una adjudicació ja confirmada. */
  motiu: z.string().trim().max(500).optional(),
});

export const ESTATS_PLACA = ["admesa", "llista_espera", "oferta_pendent", "renuncia", "baixa"] as const;
export type EstatPlaca = (typeof ESTATS_PLACA)[number];

export const ETIQUETES_ESTAT_PLACA: Record<EstatPlaca, string> = {
  admesa: "Admesa",
  llista_espera: "Llista d'espera",
  oferta_pendent: "Plaça oferta (pendent de resposta)",
  renuncia: "Renúncia",
  baixa: "Baixa",
};

/**
 * Accions sobre una plaça i transicions permeses. Cada acció exigeix un motiu,
 * queda als moviments de la plaça i a l'auditoria.
 */
export const ACCIONS_PLACA = {
  renunciar: { des: ["admesa", "llista_espera", "oferta_pendent"], cap: "renuncia", text: "Registrar renúncia" },
  donar_baixa: { des: ["admesa"], cap: "baixa", text: "Donar de baixa" },
  oferir: { des: ["llista_espera"], cap: "oferta_pendent", text: "Oferir la plaça vacant" },
  acceptar_oferta: { des: ["oferta_pendent"], cap: "admesa", text: "Acceptació de l'oferta" },
  retornar_espera: { des: ["oferta_pendent"], cap: "llista_espera", text: "Retornar a la llista d'espera" },
  admetre: { des: ["llista_espera"], cap: "admesa", text: "Admetre directament" },
} as const satisfies Record<string, { des: readonly EstatPlaca[]; cap: EstatPlaca; text: string }>;

export type AccioPlaca = keyof typeof ACCIONS_PLACA;
/** Accions que ocupen una plaça: només es poden fer si queda capacitat lliure. */
export const ACCIONS_OCUPEN_PLACA: AccioPlaca[] = ["oferir", "admetre"];

export const movimentPlaca = z.strictObject({
  accio: z.enum(Object.keys(ACCIONS_PLACA) as [AccioPlaca, ...AccioPlaca[]]),
  versio,
  motiu: motiuObligatori,
});

export const ETIQUETES_RESULTAT = {
  admesa: "Admesa",
  llista_espera: "Llista d'espera",
  no_adjudicada: "Sense plaça",
} as const;

export const ETIQUETES_MOTIU_NO_ADJUDICADA = {
  maxim_activitats: "Ja té el màxim d'activitats",
  activitat_no_disponible: "Activitat no disponible",
  exclosa: "Renúncia o baixa anterior",
  sense_llista_espera: "Sense llista d'espera",
} as const;

export const ETIQUETES_CRITERI = {
  inscripcio: "Ordre d'inscripció (data i hora de registre)",
  lletra: "Sorteig de lletra (ordre alfabètic a partir de la lletra)",
  aleatori: "Sorteig amb llavor registrada",
} as const;

export const ETIQUETES_METODE = {
  per_rondes: "Per rondes: primer la 1a preferència de tothom, després la 2a…",
  per_persona: "Per persona: cada persona, pel seu ordre, obté totes les preferències possibles",
} as const;

export const ETIQUETES_ESTAT_EXECUCIO = {
  proposta: "Proposta",
  confirmada: "Confirmada",
  substituida: "Substituïda",
  descartada: "Descartada",
} as const;
