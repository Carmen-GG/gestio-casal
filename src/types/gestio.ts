/** Tipus de les respostes de l'API de gestió (coincideixen amb worker/repositories/tipus.ts). */
import type { EstatCicle, TipusTransicio } from "../../shared/domain/cicles";
import type { ConfiguracioFormulari } from "../../shared/domain/formulari";

export interface Casal {
  id: string; codi: string; nom: string; municipi: string; adreca: string | null; actiu: boolean; versio: number;
}

export interface CasalAccessible {
  id: string; codi: string; nom: string; actiu: boolean; permisos: string[];
}

export interface Jo {
  usuari: { id: string; nom_visible: string; email: string };
  administracio_central: boolean;
  pot_crear_casals: boolean;
  casals: CasalAccessible[];
}

export interface Cicle {
  id: string; casal_id: string; nom: string; any: number; data_inici: string; data_fi: string;
  obertura_inscripcions: string; tancament_inscripcions: string; data_resolucio_prevista: string;
  estat: EstatCicle; configuracio_formulari: Record<string, unknown>; versio: number;
  creat_el: string; actualitzat_el: string;
}

export interface DetallCicle {
  cicle: Cicle;
  transicions: { estat: EstatCicle; tipus: TipusTransicio }[];
  formulari: ConfiguracioFormulari;
  accepta_sollicituds: boolean;
}

export type EstatActivitat = "esborrany" | "activa" | "inactiva" | "arxivada";

export interface Activitat {
  id: string; casal_id: string; cicle_id: string; nom: string; descripcio: string | null; categoria: string | null;
  dies_setmana: number[]; hora_inici: string | null; hora_fi: string | null; horari_text: string | null;
  data_inici: string | null; data_fi: string | null; espai: string | null; capacitat: number;
  nombre_sessions: number | null; estat: EstatActivitat; codi_extern: string | null; versio: number;
}

export interface EntradaHistorial {
  id: number; accio: string; canvis: Record<string, unknown>; usuari_id: string | null; motiu: string | null; creat_el: string;
}

export interface AssignacioRol {
  id: string; usuari_id: string; email: string; nom_visible: string; rol_codi: string; casal_id: string | null; atorgat_el: string;
}

export type EstatSollicitud = "rebuda" | "validada" | "pendent_revisio" | "anullada";
export type EstatAdjudicacio = "pendent" | "admesa" | "llista_espera" | "sense_placa";

export interface ParticipantVisible {
  id: string; versio: number; nom: string; cognom1: string; cognom2: string | null;
  data_naixement: string | null; document_identitat: string | null; telefon: string | null; email: string | null;
  adreca: string | null; codi_postal: string | null; municipi: string | null; lloc_naixement: string | null;
  barri: string | null; codi_participant_intern: string | null;
}

export interface FilaSollicitud {
  id: string; numero: number; rebuda_el: string; estat: EstatSollicitud; origen: "formulari_public" | "importacio" | "gestio";
  versio: number; nombre_preferencies: number; estat_adjudicacio: EstatAdjudicacio; participant: ParticipantVisible;
  dades_restringides: boolean;
}

export type RespostaLlistat =
  | { vista: "inscripcio" | "alfabetic"; total: number; pagina: number; mida: number; files: FilaSollicitud[] }
  | { vista: "activitat"; grups: { activitat_id: string; activitat: string; capacitat: number; files: (FilaSollicitud & { ordre: number })[] }[] };

export interface DetallSollicitud extends FilaSollicitud {
  cicle_id: string; codi_confirmacio: string; privacitat_acceptada_el: string | null; importacio_id: string | null;
  preferencies: { activitat_id: string; activitat: string; estat_activitat: EstatActivitat; ordre: number }[];
}

export interface ParellaDuplicada {
  a: FilaSollicitud; b: FilaSollicitud;
  motius: ("mateix_nom" | "mateix_email" | "mateix_telefon" | "mateix_document" | "mateix_codi_intern" | "mateixa_persona")[];
  revisio: { decisio: "no_duplicat" | "duplicat"; motiu: string | null; revisat_el: string } | null;
}

export interface ResultatFilaImportacio { fila: number; estat: "valida" | "avis" | "error" | "buida"; errors: string[]; avisos: string[]; descripcio: string }
export interface Previsualitzacio {
  files: ResultatFilaImportacio[];
  resum: { total: number; valides: number; amb_avisos: number; errors: number; buides: number };
  columnes_absents: string[];
}
export interface TaulaExportacio { titol: string; fitxer: string; columnes: string[]; files: (string | number | null)[][] }
