/**
 * Regles de domini del control d'assistència: calendari de sessions, resum i
 * percentatges. Funcions pures, compartides entre el panell i el servidor.
 *
 * Regla del casal: una assistència inferior al llindar (per defecte, el 80 %)
 * implica la pèrdua de la plaça. Mai s'aplica automàticament: cal que una persona
 * autoritzada ho confirmi plaça per plaça, i el servidor comprova que és per sota.
 *
 * El casal no fa servir absències justificades: totes les absències compten igual.
 */
export const ESTATS_ASSISTENCIA = ["present", "absent"] as const;
export type EstatAssistencia = (typeof ESTATS_ASSISTENCIA)[number];

export const ETIQUETES_ASSISTENCIA: Record<EstatAssistencia, string> = {
  present: "Present",
  absent: "Absent",
};

/** Abreviatures per a les graelles impreses. */
export const ABREVIATURES_ASSISTENCIA: Record<EstatAssistencia, string> = { present: "P", absent: "A" };

/** Llindar d'assistència (%) dels cicles nous, segons la regla del casal. Es pot canviar per cicle. */
export const LLINDAR_ASSISTENCIA_PER_DEFECTE = 80;

/** Nombre mínim de sessions computables (present + absent) per calcular un percentatge. */
export const MINIM_SESSIONS_PERCENTATGE = 3;
/** Màxim de sessions que es generen d'un cop (protecció davant de dates errònies). */
export const MAXIM_SESSIONS_GENERADES = 200;

const DIA_MS = 86_400_000;

/**
 * Dates (AAAA-MM-DD) entre `inici` i `fi`, ambdues incloses, que cauen en els
 * dies de la setmana indicats (1 = dilluns … 7 = diumenge).
 */
export function datesSessions(dies: number[], inici: string, fi: string): string[] {
  const valids = new Set(dies.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7));
  if (valids.size === 0) return [];
  const t0 = Date.parse(`${inici}T00:00:00Z`);
  const t1 = Date.parse(`${fi}T00:00:00Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) return [];
  const dates: string[] = [];
  for (let t = t0; t <= t1 && dates.length < MAXIM_SESSIONS_GENERADES; t += DIA_MS) {
    const diaSetmana = ((new Date(t).getUTCDay() + 6) % 7) + 1; // getUTCDay: 0 = diumenge
    if (valids.has(diaSetmana)) dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

export interface ResumAssistencia {
  presents: number;
  absents: number;
  /** Presències sobre totes les sessions amb marca. Null si encara no n'hi ha prou. */
  percentatge: number | null;
}

export function resumAssistencia(marques: EstatAssistencia[]): ResumAssistencia {
  const presents = marques.filter((m) => m === "present").length;
  // Qualsevol marca que no sigui «present» compta com a absència.
  const absents = marques.length - presents;
  const computables = marques.length;
  return {
    presents, absents,
    percentatge: computables >= MINIM_SESSIONS_PERCENTATGE ? Math.round((presents / computables) * 100) : null,
  };
}

/** Cert si hi ha llindar, hi ha prou dades i el percentatge és inferior al llindar. */
export const sotaLlindar = (percentatge: number | null, llindar: number | null) =>
  percentatge !== null && llindar !== null && percentatge < llindar;

/** Data local d'avui (Europa/Madrid) en format AAAA-MM-DD. */
export function avuiLocal(ara: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(ara);
  return p;
}
