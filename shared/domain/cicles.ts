/**
 * Estats d'un cicle i transicions permeses.
 *
 * Les transicions "endavant" segueixen el flux habitual. Les transicions
 * "enrere" que poden afectar dades (reobrir inscripcions, tornar a adjudicar)
 * requereixen una confirmació explícita i un motiu, que el servidor exigeix.
 */
export const ESTATS_CICLE = [
  "esborrany",
  "preparacio",
  "inscripcions_obertes",
  "inscripcions_tancades",
  "adjudicacio_en_proces",
  "adjudicat",
  "publicat",
  "finalitzat",
  "arxivat",
] as const;

export type EstatCicle = (typeof ESTATS_CICLE)[number];

export const ETIQUETES_ESTAT_CICLE: Record<EstatCicle, string> = {
  esborrany: "Esborrany",
  preparacio: "Preparació",
  inscripcions_obertes: "Inscripcions obertes",
  inscripcions_tancades: "Inscripcions tancades",
  adjudicacio_en_proces: "En procés d'adjudicació",
  adjudicat: "Adjudicat",
  publicat: "Publicat",
  finalitzat: "Finalitzat",
  arxivat: "Arxivat",
};

export type TipusTransicio = "normal" | "requereix_confirmacio";

const TRANSICIONS: Record<EstatCicle, Partial<Record<EstatCicle, TipusTransicio>>> = {
  esborrany: { preparacio: "normal", arxivat: "normal" },
  preparacio: { esborrany: "normal", inscripcions_obertes: "normal", arxivat: "normal" },
  inscripcions_obertes: { inscripcions_tancades: "normal" },
  inscripcions_tancades: {
    adjudicacio_en_proces: "normal",
    // Reobrir un cicle tancat pot alterar l'ordre i el volum de sol·licituds.
    inscripcions_obertes: "requereix_confirmacio",
  },
  adjudicacio_en_proces: {
    adjudicat: "normal",
    inscripcions_tancades: "normal",
  },
  adjudicat: {
    publicat: "normal",
    // Tornar a adjudicar una adjudicació definitiva: cal confirmació i motiu.
    adjudicacio_en_proces: "requereix_confirmacio",
  },
  publicat: {
    finalitzat: "normal",
    adjudicacio_en_proces: "requereix_confirmacio",
  },
  finalitzat: { arxivat: "normal" },
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
