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
export const VERSIO_MOTOR = 3;

/**
 * - sorteig_activitat: a cada activitat, l'ordre el decideix un sorteig propi
 *   (de número o de lletra) fet abans de calcular. És la regla indicada pel casal.
 * - inscripcio, lletra, aleatori: un únic ordre per a tot el cicle.
 */
export const CRITERIS_ORDRE = ["sorteig_activitat", "inscripcio", "lletra", "aleatori"] as const;
export type CriteriOrdre = (typeof CRITERIS_ORDRE)[number];

export const METODES = ["per_rondes", "per_persona"] as const;
export type Metode = (typeof METODES)[number];

export const ESTATS_PARTICIPANTS = ["rebuda", "validada", "pendent_revisio"] as const;

/** Sorteig per activitat: d'un número (es comença per aquest número) o d'una lletra (inicial del primer cognom). */
export const TIPUS_SORTEIG = ["numero", "lletra"] as const;
export type TipusSorteig = (typeof TIPUS_SORTEIG)[number];

/**
 * Número de cada persona per al sorteig de número:
 * - inscripcio: el número de sol·licitud (ordre d'inscripció);
 * - aleatoria: un número aleatori assignat a cada sol·licitud en tancar les inscripcions.
 */
export const NUMERACIONS_SORTEIG = ["inscripcio", "aleatoria"] as const;
export type NumeracioSorteig = (typeof NUMERACIONS_SORTEIG)[number];

export interface Sorteig {
  tipus: TipusSorteig;
  /** Número (com a text) o lletra majúscula sortejada. */
  valor: string;
}

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
  /**
   * Prioritat absoluta en una activitat per a qui va quedar en llista d'espera de l'activitat
   * equivalent el cicle anterior havent-la triat com a preferència fins a `preferencia_maxima_espera_anterior`.
   */
  prioritat_espera_anterior: boolean;
  preferencia_maxima_espera_anterior: number;
  /** Només amb el criteri sorteig_activitat. */
  tipus_sorteig: TipusSorteig;
  numeracio_sorteig: NumeracioSorteig;
}

/** Valors per als paràmetres desats abans de la versió 2 del motor (no tenien aquests camps). */
const PARAMETRES_V1_ABSENTS = {
  prioritat_espera_anterior: false,
  preferencia_maxima_espera_anterior: 2,
  tipus_sorteig: "numero",
  numeracio_sorteig: "inscripcio",
} as const satisfies Partial<ParametresAdjudicacio>;

/** Completa uns paràmetres desats amb una versió anterior. No canvia el comportament que tenien. */
export const normalitzaParametres = (p: Partial<ParametresAdjudicacio> & Omit<ParametresAdjudicacio, keyof typeof PARAMETRES_V1_ABSENTS>): ParametresAdjudicacio =>
  ({ ...PARAMETRES_V1_ABSENTS, ...p });

/**
 * Valors inicials del formulari de paràmetres: la regla indicada pel casal Can Boada
 * (prioritat a la llista d'espera anterior en 1a o 2a preferència, després per
 * preferència i sorteig per activitat). Cal revisar-los i desar-los.
 */
export const PARAMETRES_INICIALS: ParametresAdjudicacio = {
  criteri_ordre: "sorteig_activitat",
  metode: "per_rondes",
  maxim_activitats_per_persona: null,
  prioritat_continuitat: false,
  llista_espera: true,
  estats_sollicitud: ["rebuda", "validada"],
  prioritat_espera_anterior: true,
  preferencia_maxima_espera_anterior: 2,
  tipus_sorteig: "numero",
  numeracio_sorteig: "inscripcio",
};

export interface SollicitudMotor {
  id: string;
  /** Persona: el límit d'activitats es compta per persona, encara que tingui més d'una sol·licitud. */
  participant_id: string;
  numero: number;
  rebuda_el: string;
  clau_ordenacio: string;
  /** Número aleatori assignat per al sorteig (numeració «aleatoria»), si n'hi ha. */
  numero_sorteig?: number | null;
  preferencies: { activitat_id: string; ordre: number }[];
}

export interface ActivitatMotor {
  id: string;
  capacitat: number;
  /** Les activitats no actives no adjudiquen places. */
  disponible: boolean;
  /** Grup d'activitats que no es poden acumular (vegeu `EntradaMotor.limits_grups`). */
  grup?: number | null;
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
  /** Parelles "sollicitud_id:activitat_id" amb prioritat per haver quedat en llista d'espera el cicle anterior. */
  espera_anterior?: ReadonlySet<string>;
  /** Sorteig de cada activitat (criteri "sorteig_activitat"). */
  sortejos?: ReadonlyMap<string, Sorteig>;
  /** Màxim d'activitats admeses de cada grup per persona ({"1": 1, "2": 3}). Grups sense límit: no hi són. */
  limits_grups?: Readonly<Record<string, number>>;
}

export type MotiuNoAdjudicada = "maxim_activitats" | "maxim_grup" | "activitat_no_disponible" | "exclosa" | "sense_llista_espera";

export interface ResultatMotor {
  sollicitud_id: string;
  activitat_id: string;
  preferencia: number;
  resultat: "admesa" | "llista_espera" | "no_adjudicada";
  posicio_espera: number | null;
  /** Ordre en què el motor ha pres la decisió (1, 2, 3...). */
  ordre_adjudicacio: number;
  per_continuitat: boolean;
  /** Admesa o en llista d'espera amb la prioritat de la llista d'espera del cicle anterior. */
  per_espera_anterior: boolean;
  motiu: MotiuNoAdjudicada | null;
}

export interface ResumActivitat {
  capacitat: number;
  sollicituds: number;
  admeses: number;
  llista_espera: number;
  per_continuitat: number;
  per_espera_anterior: number;
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

/** Número de la persona en el sorteig de número. */
export const numeroSorteig = (s: SollicitudMotor, numeracio: NumeracioSorteig): number | null =>
  numeracio === "aleatoria" ? s.numero_sorteig ?? null : s.numero;

/**
 * Comparador de l'ordre d'una activitat segons el seu sorteig.
 * - número N: primer els números ≥ N en ordre creixent, després els anteriors (es torna a començar per l'1);
 * - lletra L: primer els cognoms que comencen per L o posteriors en ordre alfabètic, després els anteriors.
 * Sense sorteig (activitat on no cal), ordre d'inscripció. L'empat final, pel número de sol·licitud.
 */
export function comparadorSorteig(sorteig: Sorteig | undefined, numeracio: NumeracioSorteig) {
  const perNumero = (a: SollicitudMotor, b: SollicitudMotor) => a.numero - b.numero;
  if (!sorteig) {
    return (a: SollicitudMotor, b: SollicitudMotor) => (a.rebuda_el < b.rebuda_el ? -1 : a.rebuda_el > b.rebuda_el ? 1 : perNumero(a, b));
  }
  if (sorteig.tipus === "lletra") {
    const lletra = normalitzaText(sorteig.valor).replace(/[^a-z]/g, "").slice(0, 1);
    const grup = (s: SollicitudMotor) => (s.clau_ordenacio >= lletra ? 0 : 1);
    return (a: SollicitudMotor, b: SollicitudMotor) =>
      grup(a) - grup(b) || (a.clau_ordenacio < b.clau_ordenacio ? -1 : a.clau_ordenacio > b.clau_ordenacio ? 1 : perNumero(a, b));
  }
  const inici = Number(sorteig.valor);
  const clau = (s: SollicitudMotor) => {
    const n = numeroSorteig(s, numeracio);
    if (n === null) return Number.MAX_SAFE_INTEGER; // Sense número: al final.
    return n >= inici ? n - inici : n - inici + 1_000_000_000;
  };
  return (a: SollicitudMotor, b: SollicitudMotor) => clau(a) - clau(b) || perNumero(a, b);
}

/**
 * Activitats on cal sorteig: les disponibles amb més sol·licituds que places
 * (sense comptar les parelles excloses). A les altres hi caben totes.
 */
export function activitatsAmbSorteig(entrada: Pick<EntradaMotor, "sollicituds" | "activitats" | "excloses">): string[] {
  const excloses = entrada.excloses ?? new Set<string>();
  const demanda = new Map<string, number>();
  for (const s of entrada.sollicituds) {
    for (const pr of s.preferencies) {
      if (!excloses.has(clauParella(s.id, pr.activitat_id))) demanda.set(pr.activitat_id, (demanda.get(pr.activitat_id) ?? 0) + 1);
    }
  }
  return entrada.activitats.filter((a) => a.disponible && (demanda.get(a.id) ?? 0) > a.capacitat).map((a) => a.id);
}

/** Executa l'adjudicació. No modifica l'entrada. */
export function adjudica(entrada: EntradaMotor): SortidaMotor {
  const p = normalitzaParametres(entrada.parametres);
  const perActivitat = p.criteri_ordre === "sorteig_activitat";
  if (perActivitat && p.metode !== "per_rondes") throw new Error("sorteig_activitat_requereix_rondes");
  const continuitat = p.prioritat_continuitat ? entrada.continuitat ?? new Set<string>() : new Set<string>();
  const esperaAnterior = p.prioritat_espera_anterior ? entrada.espera_anterior ?? new Set<string>() : new Set<string>();
  const excloses = entrada.excloses ?? new Set<string>();
  const activitats = new Map(entrada.activitats.map((a) => [a.id, a]));
  const lliures = new Map(entrada.activitats.map((a) => [a.id, a.disponible ? Math.max(0, a.capacitat) : 0]));
  const admesesPerPersona = new Map<string, number>();
  // Ordre general: el del criteri, o l'ordre d'inscripció amb el sorteig per activitat (només per presentar els resultats).
  const ordenades = ordenaSollicituds(entrada.sollicituds, perActivitat ? "inscripcio" : p.criteri_ordre, { lletra: entrada.lletra, llavor: entrada.llavor });
  const resultats = new Map<string, ResultatMotor>();
  const espera = new Map<string, string[]>(); // activitat → claus de parella en ordre
  let seq = 0;
  const maxim = p.maxim_activitats_per_persona;
  const potAdmetre = (s: SollicitudMotor) => maxim === null || (admesesPerPersona.get(s.participant_id) ?? 0) < maxim;
  // Grups d'activitats: una persona no pot obtenir més activitats d'un grup que el límit del grup.
  const limitsGrups = entrada.limits_grups ?? {};
  const admesesPerGrup = new Map<string, number>(); // "participant:grup" → admeses
  const limitGrup = (a: ActivitatMotor) => (a.grup != null ? limitsGrups[String(a.grup)] : undefined);
  const potAdmetreGrup = (s: SollicitudMotor, a: ActivitatMotor) => {
    const limit = limitGrup(a);
    return limit === undefined || (admesesPerGrup.get(`${s.participant_id}:${a.grup}`) ?? 0) < limit;
  };

  type Prioritat = "continuitat" | "espera_anterior" | null;
  const decideix = (s: SollicitudMotor, pref: { activitat_id: string; ordre: number }, prioritat: Prioritat) => {
    const clau = clauParella(s.id, pref.activitat_id);
    if (resultats.has(clau)) return;
    const base = {
      sollicitud_id: s.id, activitat_id: pref.activitat_id, preferencia: pref.ordre, posicio_espera: null,
      per_continuitat: false, per_espera_anterior: false,
    };
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
      // Amb prioritat, la decisió es deixa per a la fase general (pot haver-hi una preferència anterior pendent).
      if (prioritat) return;
      resultats.set(clau, { ...base, resultat: "no_adjudicada", ordre_adjudicacio: ++seq, motiu: "maxim_activitats" });
      return;
    }
    if (!potAdmetreGrup(s, activitat)) {
      // Ja té el màxim d'activitats d'aquest grup: no s'admet ni entra a la llista d'espera.
      if (prioritat) return;
      resultats.set(clau, { ...base, resultat: "no_adjudicada", ordre_adjudicacio: ++seq, motiu: "maxim_grup" });
      return;
    }
    const marca = { per_continuitat: prioritat === "continuitat", per_espera_anterior: prioritat === "espera_anterior" };
    const lliure = lliures.get(pref.activitat_id) ?? 0;
    if (lliure > 0) {
      lliures.set(pref.activitat_id, lliure - 1);
      admesesPerPersona.set(s.participant_id, (admesesPerPersona.get(s.participant_id) ?? 0) + 1);
      if (limitGrup(activitat) !== undefined) {
        const clauGrup = `${s.participant_id}:${activitat.grup}`;
        admesesPerGrup.set(clauGrup, (admesesPerGrup.get(clauGrup) ?? 0) + 1);
      }
      resultats.set(clau, { ...base, ...marca, resultat: "admesa", ordre_adjudicacio: ++seq, motiu: null });
      return;
    }
    if (prioritat === "continuitat") return; // Sense plaça reservada: es decidirà a la fase general.
    if (p.llista_espera) {
      // La prioritat de la llista d'espera anterior també posa la persona al davant de la llista d'espera.
      const cua = espera.get(pref.activitat_id) ?? [];
      cua.push(clau);
      espera.set(pref.activitat_id, cua);
      resultats.set(clau, { ...base, ...marca, resultat: "llista_espera", posicio_espera: cua.length, ordre_adjudicacio: ++seq, motiu: null });
    } else {
      resultats.set(clau, { ...base, resultat: "no_adjudicada", ordre_adjudicacio: ++seq, motiu: "sense_llista_espera" });
    }
  };

  const prefsOrdenades = (s: SollicitudMotor) => [...s.preferencies].sort((a, b) => a.ordre - b.ordre);
  const rondes = Math.max(0, ...ordenades.map((s) => s.preferencies.length));
  const comparadors = new Map(entrada.activitats.map((a) => [a.id, comparadorSorteig(entrada.sortejos?.get(a.id), p.numeracio_sorteig)]));

  /**
   * Recorre les preferències per rondes (1a de tothom, 2a…). Amb sorteig per activitat,
   * dins de cada ronda i activitat les persones van en l'ordre del sorteig de l'activitat;
   * si no, en l'ordre general. Dins d'una ronda cada persona té una sola preferència,
   * de manera que l'ordre entre activitats no altera el resultat.
   */
  const perRondes = (accepta: (s: SollicitudMotor, activitatId: string) => boolean, prioritat: Prioritat) => {
    for (let r = 0; r < rondes; r++) {
      const ronda = ordenades.map((s) => ({ s, pref: prefsOrdenades(s)[r] })).filter((x) => x.pref && accepta(x.s, x.pref.activitat_id));
      if (perActivitat) {
        for (const a of entrada.activitats) {
          const comparador = comparadors.get(a.id)!;
          ronda.filter((x) => x.pref!.activitat_id === a.id).sort((x, y) => comparador(x.s, y.s))
            .forEach((x) => decideix(x.s, x.pref!, prioritat));
        }
        // Preferències d'activitats que no són al cicle: es decideixen igualment (no disponibles).
        ronda.filter((x) => !activitats.has(x.pref!.activitat_id)).forEach((x) => decideix(x.s, x.pref!, prioritat));
      } else {
        ronda.forEach((x) => decideix(x.s, x.pref!, prioritat));
      }
    }
  };

  // 1. Llista d'espera del cicle anterior: prioritat absoluta a l'activitat.
  if (esperaAnterior.size > 0) perRondes((s, a) => esperaAnterior.has(clauParella(s.id, a)), "espera_anterior");

  // 2. Continuïtat: dins de cada activitat, qui ja la feia passa primer.
  if (continuitat.size > 0) perRondes((s, a) => continuitat.has(clauParella(s.id, a)), "continuitat");

  // 3. Fase general.
  if (p.metode === "per_persona") {
    for (const s of ordenades) for (const pref of prefsOrdenades(s)) decideix(s, pref, null);
  } else {
    perRondes(() => true, null);
  }

  // Resultats en l'ordre de les sol·licituds i de les preferències.
  const llista: ResultatMotor[] = [];
  for (const s of ordenades) for (const pref of prefsOrdenades(s)) llista.push(resultats.get(clauParella(s.id, pref.activitat_id))!);

  const resumActivitats: Record<string, ResumActivitat> = {};
  for (const a of entrada.activitats) {
    resumActivitats[a.id] = { capacitat: a.capacitat, sollicituds: 0, admeses: 0, llista_espera: 0, per_continuitat: 0, per_espera_anterior: 0 };
  }
  for (const r of llista) {
    const ra = resumActivitats[r.activitat_id];
    if (!ra) continue;
    ra.sollicituds++;
    if (r.resultat === "admesa") ra.admeses++;
    if (r.resultat === "llista_espera") ra.llista_espera++;
    if (r.per_continuitat) ra.per_continuitat++;
    if (r.per_espera_anterior) ra.per_espera_anterior++;
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
