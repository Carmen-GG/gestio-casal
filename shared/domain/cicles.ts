/**
 * Estats d'un cicle i transicions permeses.
 *
 * Les transicions "endavant" segueixen el flux habitual. Les transicions
 * "enrere" que poden afectar dades (reobrir inscripcions, tornar a adjudicar)
 * requereixen una confirmació explícita i un motiu, que el servidor exigeix.
 */
export const ESTATS_CICLE = [
  "preparacio",
  "inscripcions_obertes",
  "adjudicacio_en_proces",
  "adjudicat",
  "arxivat",
] as const;

export type EstatCicle = (typeof ESTATS_CICLE)[number];

export const ETIQUETES_ESTAT_CICLE: Record<EstatCicle, string> = {
  preparacio: "Preparació",
  inscripcions_obertes: "Inscripcions obertes",
  adjudicacio_en_proces: "Adjudicació",
  adjudicat: "Adjudicat",
  arxivat: "Arxivat",
};

/**
 * Estats que existien abans de la simplificació de 2026-10-16 (migració 0031). Ja no n'hi ha cap
 * cicle, però l'historial els pot contenir i s'han de poder llegir.
 */
export const ETIQUETES_ESTAT_CICLE_ANTIC: Record<string, string> = {
  esborrany: "Esborrany",
  inscripcions_tancades: "Inscripcions tancades",
  publicat: "Publicat",
  finalitzat: "Finalitzat",
};

export type TipusTransicio = "normal" | "requereix_confirmacio";

const TRANSICIONS: Record<EstatCicle, Partial<Record<EstatCicle, TipusTransicio>>> = {
  preparacio: { inscripcions_obertes: "normal", arxivat: "normal" },
  // Tancar les inscripcions porta directament a l'adjudicació.
  inscripcions_obertes: { adjudicacio_en_proces: "normal" },
  adjudicacio_en_proces: {
    adjudicat: "normal",
    // Reobrir les inscripcions pot alterar l'ordre i el volum de sol·licituds.
    inscripcions_obertes: "requereix_confirmacio",
  },
  adjudicat: {
    arxivat: "normal",
    // Tornar a adjudicar una adjudicació definitiva: cal confirmació i motiu.
    adjudicacio_en_proces: "requereix_confirmacio",
  },
  arxivat: {},
};

export function esEstatCicle(valor: unknown): valor is EstatCicle {
  return typeof valor === "string" && (ESTATS_CICLE as readonly string[]).includes(valor);
}

/** Retorna el tipus de transició o `null` si no està permesa. */
export function tipusTransicioCicle(des: EstatCicle, cap: EstatCicle): TipusTransicio | null {
  return TRANSICIONS[des][cap] ?? null;
}

export function transicionsPermeses(des: EstatCicle): { estat: EstatCicle; tipus: TipusTransicio }[] {
  return Object.entries(TRANSICIONS[des]).map(([estat, tipus]) => ({
    estat: estat as EstatCicle,
    tipus: tipus as TipusTransicio,
  }));
}

/**
 * Indica si un cicle accepta sol·licituds en un instant determinat:
 * ha d'estar en estat "inscripcions_obertes" i dins de la finestra de dates.
 */
export function acceptaSollicituds(
  cicle: { estat: EstatCicle; obertura_inscripcions: string; tancament_inscripcions: string },
  ara: Date,
): boolean {
  if (cicle.estat !== "inscripcions_obertes") return false;
  const t = ara.getTime();
  return t >= Date.parse(cicle.obertura_inscripcions) && t <= Date.parse(cicle.tancament_inscripcions);
}
