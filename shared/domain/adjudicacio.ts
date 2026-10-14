/**
 * Motor d'adjudicació de places. Funció pura, separada de la interfície i de la
 * base de dades: rep les sol·licituds, les activitats i els paràmetres, i
 * retorna un resultat per a cada parella sol·licitud-activitat.
 *
 * Les regles són configurables i no pretenen reproduir cap normativa oficial:
 * el casal ha de validar quins paràmetres s'apliquen (vegeu docs/adjudicacio.md).
 * Amb les mateixes dades i els mateixos paràmetres (inclosa la lletra o la
 * llavor del sorteig) el resultat és sempre el mateix.
 */
import { normalitzaText } from "./ordenacio";

/** Versió de l'algorisme. Es desa a cada execució per poder-la reproduir. */
export const VERSIO_MOTOR = 1;

export const CRITERIS_ORDRE = ["inscripcio", "lletra", "aleatori"] as const;
export type CriteriOrdre = (typeof CRITERIS_ORDRE)[number];

export const METODES = ["per_rondes", "per_persona"] as const;
export type Metode = (typeof METODES)[number];

export const ESTATS_PARTICIPANTS = ["rebuda", "validada", "pendent_revisio"] as const;

export interface ParametresAdjudicacio {
  /** Com s'ordenen les persones: per ordre d'inscripció, per sorteig de lletra o per sorteig amb llavor. */
  criteri_ordre: CriteriOrdre;
  /**
   * per_rondes: primer s'assigna la 1a preferència de tothom, després la 2a, etc.
   * per_persona: cada persona, pel seu ordre, obté totes les preferències que pugui.
   */
  metode: Metode;
  /** Nombre màxim d'activitats admeses per persona (null = sense límit). */
  maxim_activitats_per_persona: number | null;
  /** Si és cert, qui ja feia l'activitat el cicle anterior té prioritat en aquella activitat. */
  prioritat_continuitat: boolean;
  /** Si és cert, qui no obté plaça queda en llista d'espera; si no, queda sense plaça. */
  llista_espera: boolean;
  /** Estats de la sol·licitud que entren a l'adjudicació. Les anul·lades no hi entren mai. */
  estats_sollicitud: (typeof ESTATS_PARTICIPANTS)[number][];
}

/** Valors inicials del formulari de paràmetres. No són regles oficials: s'han de revisar i desar. */
export const PARAMETRES_INICIALS: ParametresAdjudicacio = {
  criteri_ordre: "inscripcio",
  metode: "per_rondes",
  maxim_activitats_per_persona: null,
  prioritat_continuitat: false,
  llista_espera: true,
  estats_sollicitud: ["rebuda", "validada"],
};

export interface SollicitudMotor {
  id: string;
  /** Persona: el límit d'activitats es compta per persona, encara que tingui més d'una sol·licitud. */
  participant_id: string;
  numero: number;
  rebuda_el: string;
  clau_ordenacio: string;
  preferencies: { activitat_id: string; ordre: number }[];
}

export interface ActivitatMotor {
  id: string;
  capacitat: number;
  /** Les activitats no actives no adjudiquen places. */
  disponible: boolean;
}

export interface EntradaMotor {
  sollicituds: SollicitudMotor[];
  activitats: ActivitatMotor[];
  parametres: ParametresAdjudicacio;
  /** Parelles "sollicitud_id:activitat_id" amb dret de continuïtat. */
  continuitat?: ReadonlySet<string>;
  /** Parelles excloses perquè ja s'hi va renunciar o donar de baixa en una adjudicació anterior. */
  excloses?: ReadonlySet<string>;
  /** Lletra del sorteig (criteri "lletra"). */
  lletra?: string | null;
  /** Llavor del sorteig (criteri "aleatori"). */
  llavor?: string | null;
}

export type MotiuNoAdjudicada = "maxim_activitats" | "activitat_no_disponible" | "exclosa" | "sense_llista_espera";

export interface ResultatMotor {
  sollicitud_id: string;
  activitat_id: string;
  preferencia: number;
  resultat: "admesa" | "llista_espera" | "no_adjudicada";
  posicio_espera: number | null;
  /** Ordre en què el motor ha pres la decisió (1, 2, 3...). */
  ordre_adjudicacio: number;
  per_continuitat: boolean;
  motiu: MotiuNoAdjudicada | null;
}

export interface ResumActivitat {
  capacitat: number;
  sollicituds: number;
  admeses: number;
  llista_espera: number;
  per_continuitat: number;
}

export interface SortidaMotor {
  resultats: ResultatMotor[];
  /** Posició de cada sol·licitud en l'ordre de prioritat (1 = primera). */
  ordre: string[];
  resum: {
    versio_motor: number;
    sollicituds: number;
    sollicituds_amb_placa: number;
    sollicituds_sense_placa: number;
    places_adjudicades: number;
    activitats: Record<string, ResumActivitat>;
  };
}

const clauParella = (s: string, a: string) => `${s}:${a}`;

/** Hash FNV-1a de 32 bits: només per derivar ordres reproduïbles, no per a seguretat. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Ordre de prioritat de les sol·licituds segons el criteri.
 * - inscripcio: data i hora de recepció i, a igualtat, número.
 * - lletra: ordre alfabètic (cognoms i nom) començant per la lletra sortejada, i tornant a començar per l'A.
 * - aleatori: ordre derivat de la llavor; cada sol·licitud té una clau fnv1a(llavor + id).
 * L'empat final sempre es resol pel número de sol·licitud.
 */
export function ordenaSollicituds(
  sollicituds: SollicitudMotor[], criteri: CriteriOrdre, opcions: { lletra?: string | null; llavor?: string | null } = {},
): SollicitudMotor[] {
  const llista = [...sollicituds];
  const perNumero = (a: SollicitudMotor, b: SollicitudMotor) => a.numero - b.numero;
  if (criteri === "inscripcio") {
    return llista.sort((a, b) => (a.rebuda_el < b.rebuda_el ? -1 : a.rebuda_el > b.rebuda_el ? 1 : perNumero(a, b)));
  }
  if (criteri === "lletra") {
    const lletra = normalitzaText(opcions.lletra ?? "").replace(/[^a-z]/g, "").slice(0, 1);
    if (!lletra) throw new Error("lletra_obligatoria");
    // La clau d'ordenació ja està normalitzada (minúscules i sense accents).
    const clau = (s: SollicitudMotor) => s.clau_ordenacio;
    // Les claus anteriors a la lletra van al final, en el mateix ordre alfabètic.
    const grup = (s: SollicitudMotor) => (clau(s) >= lletra ? 0 : 1);
    return llista.sort((a, b) => grup(a) - grup(b) || (clau(a) < clau(b) ? -1 : clau(a) > clau(b) ? 1 : perNumero(a, b)));
  }
  if (!opcions.llavor) throw new Error("llavor_obligatoria");
  const clau = new Map(llista.map((s) => [s.id, fnv1a(`${opcions.llavor}:${s.id}`)]));
  return llista.sort((a, b) => clau.get(a.id)! - clau.get(b.id)! || perNumero(a, b));
}

/** Executa l'adjudicació. No modifica l'entrada. */
export function adjudica(entrada: EntradaMotor): SortidaMotor {
  const p = entrada.parametres;
  const continuitat = p.prioritat_continuitat ? entrada.continuitat ?? new Set<string>() : new Set<string>();
  const excloses = entrada.excloses ?? new Set<string>();
  const activitats = new Map(entrada.activitats.map((a) => [a.id, a]));
  const lliures = new Map(entrada.activitats.map((a) => [a.id, a.disponible ? Math.max(0, a.capacitat) : 0]));
  const admesesPerPersona = new Map<string, number>();
  const ordenades = ordenaSollicituds(entrada.sollicituds, p.criteri_ordre, { lletra: entrada.lletra, llavor: entrada.llavor });
  const resultats = new Map<string, ResultatMotor>();
  const espera = new Map<string, string[]>(); // activitat → claus de parella en ordre
  let seq = 0;
  const maxim = p.maxim_activitats_per_persona;
  const potAdmetre = (s: SollicitudMotor) => maxim === null || (admesesPerPersona.get(s.participant_id) ?? 0) < maxim;

  const decideix = (s: SollicitudMotor, pref: { activitat_id: string; ordre: number }, perContinuitat: boolean) => {
    const clau = clauParella(s.id, pref.activitat_id);
    if (resultats.has(clau)) return;
    const base = { sollicitud_id: s.id, activitat_id: pref.activitat_id, preferencia: pref.ordre, posicio_espera: null, per_continuitat: false };
    const activitat = activitats.get(pref.activitat_id);
    if (!activitat || !activitat.disponible) {
      resultats.set(clau, { ...base, resultat: "no_adjudicada", ordre_adjudicacio: ++seq, motiu: "activitat_no_disponible" });
      return;
    }
    if (excloses.has(clau)) {
      resultats.set(clau, { ...base, resultat: "no_adjudicada", ordre_adjudicacio: ++seq, motiu: "exclosa" });
      return;
    }
    if (!potAdmetre(s)) {
      resultats.set(clau, { ...base, resultat: "no_adjudicada", ordre_adjudicacio: ++seq, motiu: "maxim_activitats" });
      return;
    }
    const lliure = lliures.get(pref.activitat_id) ?? 0;
    if (lliure > 0) {
      lliures.set(pref.activitat_id, lliure - 1);
      admesesPerPersona.set(s.participant_id, (admesesPerPersona.get(s.participant_id) ?? 0) + 1);
      resultats.set(clau, { ...base, resultat: "admesa", per_continuitat: perContinuitat, ordre_adjudicacio: ++seq, motiu: null });
      return;
    }
    if (perContinuitat) return; // Sense plaça reservada: es decidirà a la fase general.
    if (p.llista_espera) {
      const cua = espera.get(pref.activitat_id) ?? [];
      cua.push(clau);
      espera.set(pref.activitat_id, cua);
      resultats.set(clau, { ...base, resultat: "llista_espera", posicio_espera: cua.length, ordre_adjudicacio: ++seq, motiu: null });
    } else {
      resultats.set(clau, { ...base, resultat: "no_adjudicada", ordre_adjudicacio: ++seq, motiu: "sense_llista_espera" });
    }
  };

  const prefsOrdenades = (s: SollicitudMotor) => [...s.preferencies].sort((a, b) => a.ordre - b.ordre);

  // 1. Continuïtat: dins de cada activitat, qui ja la feia passa primer (en l'ordre de prioritat).
  if (continuitat.size > 0) {
    for (const s of ordenades) {
      for (const pref of prefsOrdenades(s)) {
        if (continuitat.has(clauParella(s.id, pref.activitat_id))) decideix(s, pref, true);
      }
    }
  }

  // 2. Fase general.
  if (p.metode === "per_persona") {
    for (const s of ordenades) for (const pref of prefsOrdenades(s)) decideix(s, pref, false);
  } else {
    const rondes = Math.max(0, ...ordenades.map((s) => s.preferencies.length));
    for (let r = 0; r < rondes; r++) {
      for (const s of ordenades) {
        const pref = prefsOrdenades(s)[r];
        if (pref) decideix(s, pref, false);
      }
    }
  }

  // Resultats en l'ordre de les sol·licituds i de les preferències.
  const llista: ResultatMotor[] = [];
  for (const s of ordenades) for (const pref of prefsOrdenades(s)) llista.push(resultats.get(clauParella(s.id, pref.activitat_id))!);

  const resumActivitats: Record<string, ResumActivitat> = {};
  for (const a of entrada.activitats) {
    resumActivitats[a.id] = { capacitat: a.capacitat, sollicituds: 0, admeses: 0, llista_espera: 0, per_continuitat: 0 };
  }
  for (const r of llista) {
    const ra = resumActivitats[r.activitat_id];
    if (!ra) continue;
    ra.sollicituds++;
    if (r.resultat === "admesa") ra.admeses++;
    if (r.resultat === "llista_espera") ra.llista_espera++;
    if (r.per_continuitat) ra.per_continuitat++;
  }
  const ambPlaca = new Set(llista.filter((r) => r.resultat === "admesa").map((r) => r.sollicitud_id));
  return {
    resultats: llista,
    ordre: ordenades.map((s) => s.id),
    resum: {
      versio_motor: VERSIO_MOTOR,
      sollicituds: ordenades.length,
      sollicituds_amb_placa: ambPlaca.size,
      sollicituds_sense_placa: ordenades.length - ambPlaca.size,
      places_adjudicades: llista.filter((r) => r.resultat === "admesa").length,
      activitats: resumActivitats,
    },
  };
}
