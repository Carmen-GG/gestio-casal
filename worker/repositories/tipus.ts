/**
 * Contractes de la capa de repositoris.
 *
 * Els serveis i les rutes depenen d'aquestes interfícies, no de D1. Per migrar a
 * PostgreSQL o a una base de dades corporativa n'hi ha prou amb una implementació
 * nova de cada repositori (vegeu docs/adr/0003-capa-de-repositoris.md).
 */
import type { EstatCicle } from "../../shared/domain/cicles";

export interface Casal {
  id: string;
  codi: string;
  nom: string;
  municipi: string;
  adreca: string | null;
  actiu: boolean;
  configuracio: Record<string, unknown>;
  versio: number;
  creat_el: string;
  actualitzat_el: string;
}

export interface NouCasal {
  codi: string;
  nom: string;
  municipi: string;
  adreca?: string | null;
  configuracio?: Record<string, unknown>;
}

export interface Cicle {
  id: string;
  casal_id: string;
  nom: string;
  any: number;
  data_inici: string;
  data_fi: string;
  obertura_inscripcions: string;
  tancament_inscripcions: string;
  data_resolucio_prevista: string;
  estat: EstatCicle;
  configuracio_formulari: Record<string, unknown>;
  versio: number;
  creat_el: string;
  actualitzat_el: string;
}

export type NouCicle = Omit<Cicle, "id" | "estat" | "versio" | "creat_el" | "actualitzat_el" | "configuracio_formulari"> & {
  configuracio_formulari?: Record<string, unknown>;
};

export const ESTATS_ACTIVITAT = ["esborrany", "activa", "inactiva", "arxivada"] as const;
export type EstatActivitat = (typeof ESTATS_ACTIVITAT)[number];

export interface Activitat {
  id: string;
  casal_id: string;
  cicle_id: string;
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
  capacitat: number;
  nombre_sessions: number | null;
  estat: EstatActivitat;
  informacio_difusio: Record<string, unknown>;
  configuracio_continuitat: Record<string, unknown>;
  codi_extern: string | null;
  versio: number;
  creat_el: string;
  actualitzat_el: string;
}

export type NovaActivitat = Pick<Activitat, "casal_id" | "cicle_id" | "nom" | "capacitat"> &
  Partial<
    Pick<
      Activitat,
      | "descripcio" | "categoria" | "dies_setmana" | "hora_inici" | "hora_fi" | "horari_text"
      | "data_inici" | "data_fi" | "espai" | "nombre_sessions" | "estat" | "informacio_difusio"
      | "configuracio_continuitat" | "codi_extern"
    >
  >;

export interface EntradaHistorial {
  casal_id: string;
  entitat: string;
  entitat_id: string;
  accio: "creacio" | "modificacio" | "canvi_estat" | "arxivat" | "duplicacio" | "importacio";
  canvis: Record<string, unknown>;
  usuari_id: string | null;
  motiu: string | null;
}

export interface EntradaAuditoria {
  casal_id: string | null;
  usuari_id: string | null;
  tipus_operacio: string;
  entitat: string;
  entitat_id: string | null;
  resultat: "exit" | "error" | "denegat";
  motiu?: string | null;
  /** Mai dades personals: només identificadors interns i metadades de l'operació. */
  detalls?: Record<string, unknown>;
  id_peticio?: string | null;
}

/**
 * Condició perquè una operació d'historial o d'auditoria només s'apliqui si
 * l'escriptura principal del mateix lot ha tingut efecte: el registre `id` de
 * `taula` ha de portar el testimoni aleatori `operacio` que aquella escriptura hi desa.
 */
export interface CondicioOperacio {
  taula: "casals" | "cicles" | "activitats";
  id: string;
  operacio: string;
}

/**
 * Una operació d'escriptura preparada. Permet agrupar diverses escriptures
 * (dada + historial + auditoria) en una sola transacció atòmica.
 */
export type Operacio = { readonly __marca: "Operacio" };

export type CanvisCasal = Partial<Pick<Casal, "nom" | "municipi" | "adreca" | "actiu" | "configuracio">>;

export interface RepositoriCasals {
  perId(id: string): Promise<Casal | null>;
  perCodi(codi: string): Promise<Casal | null>;
  llistar(opcions?: { nomesActius?: boolean; ids?: string[] }): Promise<Casal[]>;
  crear(dades: NouCasal): Promise<Casal>;
  operacioCrear(id: string, dades: NouCasal, ara: string, operacio: string): Operacio;
  operacioActualitzar(id: string, versioActual: number, canvis: CanvisCasal, ara: string, operacio: string): Operacio;
}

export interface Usuari {
  id: string;
  email: string;
  nom_visible: string;
  proveidor_identitat: "dev" | "entra_id";
  actiu: boolean;
}

/** Permisos efectius d'un usuari: globals (administració central) i per casal. */
export interface PermisosUsuari {
  globals: string[];
  perCasal: Record<string, string[]>;
}

export interface AssignacioRol {
  id: string;
  usuari_id: string;
  email: string;
  nom_visible: string;
  rol_codi: string;
  casal_id: string | null;
  atorgat_el: string;
}

export interface RepositoriUsuaris {
  perId(id: string): Promise<Usuari | null>;
  perEmail(email: string): Promise<Usuari | null>;
  crear(dades: { email: string; nom_visible: string; proveidor_identitat: Usuari["proveidor_identitat"] }): Promise<Usuari>;
  permisos(usuariId: string): Promise<PermisosUsuari>;
  assignacionsCasal(casalId: string): Promise<AssignacioRol[]>;
  assignacioPerId(id: string): Promise<AssignacioRol | null>;
  rolExisteix(codi: string): Promise<{ abast: "casal" | "global" } | null>;
  operacioAssignar(dades: { id: string; usuari_id: string; rol_codi: string; casal_id: string | null; atorgat_per: string; motiu: string | null }, ara: string): Operacio;
  operacioRevocar(id: string, revocatPer: string, motiu: string | null, ara: string): Operacio;
}

export interface RepositoriSessions {
  crearTestimoni(resum: string, usuariId: string, ara: string, caducaEl: string): Promise<void>;
  /** Marca el testimoni com a usat si és vàlid i retorna l'usuari. Un testimoni només serveix una vegada. */
  consumirTestimoni(resum: string, ara: string): Promise<string | null>;
  crearSessio(resum: string, usuariId: string, ara: string, caducaEl: string): Promise<void>;
  sessioVigent(resum: string, ara: string): Promise<{ usuari_id: string; darrer_us_el: string } | null>;
  tocarSessio(resum: string, ara: string): Promise<void>;
  revocarSessio(resum: string, ara: string): Promise<void>;
}

export type CanvisCicle = Partial<Pick<Cicle,
  | "nom" | "any" | "data_inici" | "data_fi" | "obertura_inscripcions" | "tancament_inscripcions"
  | "data_resolucio_prevista" | "configuracio_formulari">>;

export interface RepositoriCicles {
  /** Sempre filtra per casal per evitar accessos horitzontals. */
  perId(casalId: string, id: string): Promise<Cicle | null>;
  llistarPerCasal(casalId: string, opcions?: { estats?: EstatCicle[] }): Promise<Cicle[]>;
  crear(dades: NouCicle): Promise<Cicle>;
  operacioCrear(id: string, dades: NouCicle, ara: string, operacio: string): Operacio;
  /**
   * Operació de canvi d'estat condicionada a la versió actual (bloqueig optimista).
   * Si té efecte, incrementa la versió i desa el testimoni `operacio`.
   */
  operacioCanviEstat(
    casalId: string, id: string, versioActual: number, cap: EstatCicle, ara: string, operacio: string,
  ): Operacio;
  operacioActualitzar(casalId: string, id: string, versioActual: number, canvis: CanvisCicle, ara: string, operacio: string): Operacio;
}

export type CanvisActivitat = Partial<Omit<NovaActivitat, "casal_id" | "cicle_id">>;

export interface RepositoriActivitats {
  perId(casalId: string, id: string): Promise<Activitat | null>;
  llistarPerCicle(casalId: string, cicleId: string, opcions?: { estats?: EstatActivitat[] }): Promise<Activitat[]>;
  crear(dades: NovaActivitat): Promise<Activitat>;
  /** Inserció preparada per agrupar-la amb historial i auditoria. */
  operacioCrear(id: string, dades: NovaActivitat, ara: string, operacio: string): Operacio;
  operacioActualitzar(casalId: string, id: string, versioActual: number, canvis: CanvisActivitat, ara: string, operacio: string): Operacio;
}

export interface RepositoriHistorial {
  operacioAfegir(entrada: EntradaHistorial, ara: string, condicio?: CondicioOperacio): Operacio;
  llistar(entitat: string, entitatId: string): Promise<(EntradaHistorial & { id: number; creat_el: string })[]>;
}

export interface RepositoriAuditoria {
  operacioRegistrar(entrada: EntradaAuditoria, ara: string, condicio?: CondicioOperacio): Operacio;
  registrar(entrada: EntradaAuditoria, ara: string): Promise<void>;
  llistar(filtre: { casalId?: string; entitat?: string; entitatId?: string; limit?: number }): Promise<
    (EntradaAuditoria & { id: number; creat_el: string })[]
  >;
}

/** Executa un conjunt d'operacions de manera atòmica (tot o res). */
export interface UnitatDeTreball {
  executar(operacions: Operacio[]): Promise<{ canvis: number }[]>;
}

export interface Repositoris {
  casals: RepositoriCasals;
  usuaris: RepositoriUsuaris;
  sessions: RepositoriSessions;
  cicles: RepositoriCicles;
  activitats: RepositoriActivitats;
  historial: RepositoriHistorial;
  auditoria: RepositoriAuditoria;
  unitat: UnitatDeTreball;
}
