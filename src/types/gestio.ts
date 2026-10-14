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
