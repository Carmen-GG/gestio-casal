/**
 * Contracte de les respostes de l'API pública. Només hi ha camps destinats
 * al públic: cap camp intern ni cap dada personal.
 */
import type { EstatCicle } from "../domain/cicles";
import type { CampPersonal } from "../domain/formulari";

export interface CiclePublic {
  id: string;
  nom: string;
  any: number;
  data_inici: string;
  data_fi: string;
  obertura_inscripcions: string;
  tancament_inscripcions: string;
  data_resolucio_prevista: string;
  estat: EstatCicle;
  accepta_sollicituds: boolean;
}

export interface CasalPublic {
  codi: string;
  nom: string;
  municipi: string;
}

export interface ActivitatPublica {
  id: string;
  nom: string;
  descripcio: string | null;
  categoria: string | null;
  dies_setmana: number[];
  hora_inici: string | null;
  hora_fi: string | null;
  horari_text: string | null;
  data_inici: string | null;
  data_fi: string | null;
  espai: string | null;
}

export interface RespostaCiclesPubliques {
  casal: CasalPublic;
  cicles: CiclePublic[];
}

/** Camps que demana el formulari d'aquest cicle, en l'ordre en què s'han de mostrar. */
export interface FormulariPublic {
  camps: { camp: CampPersonal; obligatori: boolean }[];
  informacio_privacitat: string;
}

export interface RespostaActivitatsPubliques {
  casal: CasalPublic;
  cicle: CiclePublic;
  activitats: ActivitatPublica[];
  formulari: FormulariPublic;
}

/** Resposta a una sol·licitud registrada. No conté cap dada personal. */
export interface RespostaSollicitudRegistrada {
  codi_confirmacio: string;
  rebuda_el: string;
  data_resolucio_prevista: string;
  cicle: string;
  preferencies: { ordre: number; activitat: string }[];
  /** Cert si és un reintent d'una sol·licitud que ja s'havia registrat. */
  repetida: boolean;
}

/** Format comú dels errors de l'API. `codi` és estable; `missatge` és per a persones. */
export interface ErrorApi {
  error: { codi: string; missatge: string; id_peticio?: string; detalls?: unknown };
}
