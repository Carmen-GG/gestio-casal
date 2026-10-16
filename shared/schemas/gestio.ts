/**
 * Esquemes de validació de les peticions de gestió. Es fan servir al servidor
 * (validació definitiva) i als formularis del panell (ajuda immediata).
 * Els objectes són estrictes: qualsevol camp no previst es rebutja.
 */
import { z } from "zod";
import { ESTATS_CICLE } from "../domain/cicles";
import { CAMPS_PERSONALS, MIDA_MAXIMA_PRIVACITAT } from "../domain/formulari";
import { data, dataHora, hora, motiu, textCurt, textOpcional, versio } from "./comuns";

export const ESTATS_ACTIVITAT = ["esborrany", "activa", "inactiva", "arxivada"] as const;

const configCamp = z.strictObject({ actiu: z.boolean(), obligatori: z.boolean() });
export const configuracioFormulari = z.strictObject({
  camps: z.partialRecord(z.enum(CAMPS_PERSONALS), configCamp),
  informacio_privacitat: z.string().trim().max(MIDA_MAXIMA_PRIVACITAT, `Màxim ${MIDA_MAXIMA_PRIVACITAT} caràcters.`).optional(),
});

// ---------- Casals ----------
export const casalActualitzar = z.strictObject({
  nom: textCurt(200).optional(),
  municipi: textCurt(100).optional(),
  adreca: textOpcional(250).optional(),
  actiu: z.boolean().optional(),
  motiu,
});

// ---------- Cicles ----------
const campsCicle = {
  nom: textCurt(150),
  any: z.number().int().min(2000).max(2100),
  data_inici: data,
  data_fi: data,
  obertura_inscripcions: dataHora,
  tancament_inscripcions: dataHora,
  data_resolucio_prevista: data,
  configuracio_formulari: configuracioFormulari.optional(),
  /** Percentatge mínim d'assistència per identificar persones per sota (sense cap acció automàtica). */
  llindar_assistencia: z.number().int().min(1, "Mínim 1%.").max(100, "Màxim 100%.").nullable().optional(),
  /** Màxim d'activitats de cada grup per persona ({"1": 1, "2": 3}). */
  limits_grups: z.record(z.string().regex(/^[1-9][0-9]?$/, "Grup no vàlid."), z.number().int().min(1, "Mínim 1.").max(20, "Màxim 20."))
    .refine((r) => Object.keys(r).length <= 99).optional(),
};

type DatesCicle = Partial<Record<"data_inici" | "data_fi" | "obertura_inscripcions" | "tancament_inscripcions", string>>;
export function validaDatesCicle(v: DatesCicle, ctx: z.RefinementCtx) {
  if (v.data_inici && v.data_fi && v.data_fi < v.data_inici) {
    ctx.addIssue({ code: "custom", path: ["data_fi"], message: "La data de finalització ha de ser posterior a la d'inici." });
  }
  if (v.obertura_inscripcions && v.tancament_inscripcions && v.tancament_inscripcions <= v.obertura_inscripcions) {
    ctx.addIssue({ code: "custom", path: ["tancament_inscripcions"], message: "El tancament ha de ser posterior a l'obertura." });
  }
}

export const cicleCrear = z.strictObject(campsCicle).superRefine(validaDatesCicle);

export const cicleActualitzar = z
  .strictObject({
    ...Object.fromEntries(Object.entries(campsCicle).map(([k, v]) => [k, v.optional()])) as {
      [K in keyof typeof campsCicle]: z.ZodOptional<(typeof campsCicle)[K]>;
    },
    versio,
    motiu,
  });

/** Eliminar un cicle: confirmació explícita i motiu (queda a l'auditoria). */
export const cicleEliminar = z.strictObject({
  versio,
  confirmacio: z.literal(true, "Cal confirmar l'eliminació."),
  motiu: z.string().trim().min(3, "Indiqueu el motiu (mínim 3 caràcters).").max(500),
});

export const cicleCanviEstat = z.strictObject({
  estat: z.enum(ESTATS_CICLE),
  versio,
  confirmacio: z.boolean().optional(),
  motiu,
});

// ---------- Activitats ----------
const campsActivitat = {
  nom: textCurt(150),
  descripcio: textOpcional(2000).optional(),
  categoria: textOpcional(80).optional(),
  dies_setmana: z
    .array(z.number().int().min(1).max(7))
    .max(7)
    .refine((d) => new Set(d).size === d.length, "Hi ha dies repetits.")
    .transform((d) => [...d].sort((a, b) => a - b))
    .optional(),
  hora_inici: hora.nullable().optional(),
  hora_fi: hora.nullable().optional(),
  horari_text: textOpcional(200).optional(),
  data_inici: data.nullable().optional(),
  data_fi: data.nullable().optional(),
  espai: textOpcional(120).optional(),
  tallerista: textOpcional(120).optional(),
  gestio: z.enum(["generalitat", "associacio"]).optional(),
  destinataris: textOpcional(200).optional(),
  grup: z.number().int().min(1, "Mínim 1.").max(99, "Màxim 99.").nullable().optional(),
  capacitat: z.number().int().min(0).max(10000),
  nombre_sessions: z.number().int().min(0).max(1000).nullable().optional(),
  minim_participants: z.number().int().min(0).max(10000).nullable().optional(),
  codi_extern: textOpcional(80).optional(),
  informacio_difusio: z.record(z.string(), z.string().max(4000)).optional(),
};

type HoresDates = { hora_inici?: string | null; hora_fi?: string | null; data_inici?: string | null; data_fi?: string | null };
export function validaHoresDates(v: HoresDates, ctx: z.RefinementCtx) {
  if (v.hora_inici && v.hora_fi && v.hora_fi <= v.hora_inici) {
    ctx.addIssue({ code: "custom", path: ["hora_fi"], message: "L'hora de finalització ha de ser posterior a la d'inici." });
  }
  if (v.data_inici && v.data_fi && v.data_fi < v.data_inici) {
    ctx.addIssue({ code: "custom", path: ["data_fi"], message: "La data de finalització ha de ser posterior a la d'inici." });
  }
}

export const activitatCrear = z.strictObject(campsActivitat).superRefine(validaHoresDates);

export const activitatActualitzar = z.strictObject({
  ...Object.fromEntries(Object.entries(campsActivitat).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof campsActivitat]: z.ZodOptional<(typeof campsActivitat)[K]>;
  },
  versio,
  confirmacio: z.boolean().optional(),
  motiu,
});

export const activitatCanviEstat = z.strictObject({
  estat: z.enum(ESTATS_ACTIVITAT),
  versio,
  motiu,
});

export const activitatDuplicar = z.strictObject({
  /** Cicle de destinació (del mateix casal). Si no s'indica, el mateix cicle. */
  cicle_id: z.uuid().optional(),
  nom: textCurt(150).optional(),
});

// ---------- Usuaris i rols ----------
export const assignarRol = z.strictObject({
  email: z.email("Correu electrònic no vàlid.").trim().toLowerCase().max(254),
  nom_visible: textCurt(120),
  rol_codi: z.enum(["conserge"]),
  motiu,
});

export const revocarRol = z.strictObject({ motiu });

/** Alta d'una persona responsable d'un casal (superadministració). */
export const assignarResponsable = z.strictObject({
  email: z.email("Correu electrònic no vàlid.").trim().toLowerCase().max(254),
  nom_visible: textCurt(120),
});

export type CicleCrear = z.input<typeof cicleCrear>;
export type ActivitatCrear = z.input<typeof activitatCrear>;
