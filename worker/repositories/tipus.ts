/**
 * Contractes de la capa de repositoris.
 *
 * Els serveis i les rutes depenen d'aquestes interfícies, no de D1. Per migrar a
 * PostgreSQL o a una base de dades corporativa n'hi ha prou amb una implementació
 * nova de cada repositori (vegeu docs/adr/0003-capa-de-repositoris.md).
 */
import type { EstatCicle } from "../../shared/domain/cicles";
import type { CampPersonal } from "../../shared/domain/formulari";
import type { ActivitatMotor, ParametresAdjudicacio, ResultatMotor, SollicitudMotor } from "../../shared/domain/adjudicacio";
import type { EstatPlaca } from "../../shared/schemas/adjudicacio";

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
  taula: "casals" | "cicles" | "activitats" | "participants" | "sollicituds" | "execucions_adjudicacio" | "places";
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

/** Dades d'una sol·licitud nova del formulari públic, ja validades i normalitzades. */
export interface NovaSollicitudPublica {
  sollicitud_id: string;
  participant_id: string;
  casal_id: string;
  cicle_id: string;
  codi_confirmacio: string;
  clau_idempotencia: string;
  resum_peticio: string;
  privacitat_resum: string;
  rebuda_el: string;
  dades: Record<CampPersonal, string | null>;
  clau_ordenacio: string;
  preferencies: { activitat_id: string; ordre: number }[];
  id_peticio: string | null;
}

/** Vista mínima d'una sol·licitud ja registrada, sense dades personals. */
export interface SollicitudRegistrada {
  id: string;
  numero: number;
  codi_confirmacio: string;
  rebuda_el: string;
  resum_peticio: string | null;
  preferencies: { ordre: number; activitat: string }[];
}

export type ResultatRegistre =
  | { tipus: "registrada"; sollicitud: SollicitudRegistrada }
  | { tipus: "cicle_no_accepta" }
  | { tipus: "activitat_no_disponible" };

export interface RepositoriSollicituds {
  perClauIdempotencia(casalId: string, cicleId: string, clau: string): Promise<SollicitudRegistrada | null>;
  /**
   * Registra participant, sol·licitud, preferències i auditoria en una sola
   * transacció. Les condicions (cicle obert en l'instant de recepció, activitats
   * actives del cicle) es comproven dins de la mateixa transacció: o es desa tot o res.
   */
  registrarPublica(dades: NovaSollicitudPublica): Promise<ResultatRegistre>;
}

export const ESTATS_SOLLICITUD = ["rebuda", "validada", "pendent_revisio", "anullada"] as const;
export type EstatSollicitud = (typeof ESTATS_SOLLICITUD)[number];
export type OrigenSollicitud = "formulari_public" | "importacio" | "gestio";
/** Estat d'adjudicació derivat de l'adjudicació confirmada del cicle, si n'hi ha. */
export type EstatAdjudicacio = "pendent" | "admesa" | "llista_espera" | "sense_placa";

export type Participant = { id: string; versio: number } & Record<CampPersonal, string | null> & {
  codi_participant_intern: string | null;
};

/** Fila del llistat de sol·licituds. Conté totes les dades: el servei en treu les no autoritzades. */
export interface FilaSollicitud {
  id: string;
  numero: number;
  rebuda_el: string;
  estat: EstatSollicitud;
  origen: OrigenSollicitud;
  versio: number;
  nombre_preferencies: number;
  estat_adjudicacio: EstatAdjudicacio;
  participant: Participant;
}

export type OrdreLlistat = "inscripcio" | "alfabetic" | "preferencies" | "estat";

export interface FiltreSollicituds {
  /** Text ja normalitzat (minúscules, sense accents) separat en paraules. */
  paraules?: string[];
  numero?: number;
  activitatId?: string;
  estat?: EstatSollicitud;
  ordre?: OrdreLlistat;
  descendent?: boolean;
  pagina?: number;
  mida?: number;
}

export interface PreferenciaDetall {
  activitat_id: string;
  activitat: string;
  estat_activitat: EstatActivitat;
  ordre: number;
}

export interface DetallSollicitud extends FilaSollicitud {
  cicle_id: string;
  codi_confirmacio: string;
  privacitat_acceptada_el: string | null;
  importacio_id: string | null;
  preferencies: PreferenciaDetall[];
}

export interface GrupActivitat {
  activitat_id: string;
  activitat: string;
  capacitat: number;
  files: (FilaSollicitud & { ordre: number })[];
}

/** Parella de sol·licituds que podrien ser de la mateixa persona. */
export interface ParellaDuplicada {
  a: FilaSollicitud;
  b: FilaSollicitud;
  motius: ("mateix_nom" | "mateix_email" | "mateix_telefon" | "mateix_document" | "mateix_codi_intern" | "mateixa_persona")[];
  revisio: { decisio: "no_duplicat" | "duplicat"; motiu: string | null; revisat_el: string } | null;
}

export type CanvisParticipant = Partial<Record<CampPersonal | "codi_participant_intern", string | null>> & { clau_ordenacio?: string };

/** Fila d'una importació de sol·licituds ja validada al servidor. */
export interface FilaImportacioSollicitud {
  sollicitud_id: string;
  participant_id: string;
  /** Si és cert, el participant ja existeix (mateix codi intern) i no es modifica. */
  participant_existent: boolean;
  dades: Record<CampPersonal, string | null>;
  codi_participant_intern: string | null;
  clau_ordenacio: string;
  numero: number;
  rebuda_el: string;
  codi_confirmacio: string;
  clau_idempotencia: string;
  preferencies: { activitat_id: string; ordre: number }[];
}

export interface RepositoriGestioSollicituds {
  llistar(casalId: string, cicleId: string, filtre: FiltreSollicituds): Promise<{ files: FilaSollicitud[]; total: number }>;
  perActivitat(casalId: string, cicleId: string, filtre: FiltreSollicituds): Promise<GrupActivitat[]>;
  detall(casalId: string, id: string): Promise<DetallSollicitud | null>;
  /** Totes les files d'un cicle (exportacions i detecció de duplicats), en ordre d'inscripció. */
  totes(casalId: string, cicleId: string): Promise<(FilaSollicitud & { preferencies: PreferenciaDetall[] })[]>;
  participantPerCodiIntern(casalId: string, codi: string): Promise<Participant | null>;
  revisionsDuplicats(casalId: string, cicleId: string): Promise<{ a: string; b: string; decisio: "no_duplicat" | "duplicat"; motiu: string | null; revisat_el: string }[]>;
  maxNumero(cicleId: string): Promise<number>;
  operacioActualitzarParticipant(casalId: string, id: string, versioActual: number, canvis: CanvisParticipant, ara: string, operacio: string): Operacio;
  /** Toca la sol·licitud (versió i testimoni) i, opcionalment, en canvia l'estat. */
  operacioActualitzarSollicitud(casalId: string, id: string, versioActual: number, canvis: { estat?: EstatSollicitud }, ara: string, operacio: string): Operacio;
  /** Substitueix les preferències, condicionat al testimoni de l'operació sobre la sol·licitud. */
  operacionsSubstituirPreferencies(sollicitudId: string, cicleId: string, casalId: string, preferencies: { activitat_id: string; ordre: number }[], operacio: string): Operacio[];
  operacioRevisioDuplicat(dades: { id: string; casal_id: string; cicle_id: string; a: string; b: string; decisio: "no_duplicat" | "duplicat"; motiu: string | null; usuari_id: string }, ara: string): Operacio;
  operacionsImportarSollicituds(dades: { importacio_id: string; casal_id: string; cicle_id: string; clau: string; nom_fitxer: string | null; usuari_id: string; resum: Record<string, unknown>; files: FilaImportacioSollicitud[] }, ara: string): Operacio[];
  operacionsImportarActivitats(dades: { importacio_id: string; casal_id: string; cicle_id: string; clau: string; nom_fitxer: string | null; usuari_id: string; resum: Record<string, unknown>; activitats: (NovaActivitat & { id: string })[] }, ara: string): Operacio[];
}

// ---------- Adjudicació i places ----------
export type EstatExecucio = "proposta" | "confirmada" | "substituida" | "descartada";

export interface ConfiguracioAdjudicacio {
  id: string;
  cicle_id: string;
  versio: number;
  parametres: ParametresAdjudicacio;
  creat_per: string | null;
  creat_el: string;
}

export interface Execucio {
  id: string;
  casal_id: string;
  cicle_id: string;
  configuracio_id: string;
  configuracio_versio: number;
  versio: number;
  estat: EstatExecucio;
  lletra_sorteig: string | null;
  llavor_desempat: string | null;
  motiu: string | null;
  resum: Record<string, unknown>;
  executada_per: string | null;
  executada_el: string;
  confirmada_per: string | null;
  confirmada_el: string | null;
  substituida_per_execucio: string | null;
}

/** Resultat d'una execució amb les dades mínimes per identificar la persona. */
export interface FilaResultat extends Omit<ResultatMotor, "motiu"> {
  motiu: string | null;
  numero: number;
  participant: Participant;
}

export interface Placa {
  id: string;
  activitat_id: string;
  sollicitud_id: string;
  estat: EstatPlaca;
  posicio_espera: number | null;
  preferencia: number;
  versio: number;
  execucio_origen_id: string;
  actualitzat_el: string;
}

export interface FilaPlaca extends Placa {
  numero: number;
  participant: Participant;
}

export interface MovimentPlaca {
  id: number;
  placa_id: string;
  estat_anterior: EstatPlaca | null;
  estat_nou: EstatPlaca;
  motiu: string | null;
  usuari_id: string | null;
  execucio_id: string | null;
  creat_el: string;
}

/** Dades d'entrada del motor llegides de la base de dades. */
export interface DadesMotor {
  sollicituds: (SollicitudMotor & { estat: EstatSollicitud })[];
  activitats: (ActivitatMotor & { nom: string; estat: EstatActivitat })[];
}

export interface RepositoriAdjudicacio {
  configuracioVigent(cicleId: string): Promise<ConfiguracioAdjudicacio | null>;
  configuracions(cicleId: string): Promise<ConfiguracioAdjudicacio[]>;
  /** Insereix la versió `versio` només si la vigent és `versioAnterior` (null = cap). */
  operacioDesarConfiguracio(d: { id: string; cicle_id: string; versio: number; versio_anterior: number | null; parametres: ParametresAdjudicacio; usuari_id: string }, ara: string): Operacio;
  dadesMotor(casalId: string, cicleId: string): Promise<DadesMotor>;
  /** Parelles "sollicitud:activitat" amb plaça admesa en el cicle anterior del casal (mateixa persona, activitat equivalent). */
  continuitat(casalId: string, cicleId: string): Promise<{ parelles: Set<string>; cicle_anterior: { id: string; nom: string } | null }>;
  /** Parelles amb renúncia o baixa en les places actuals del cicle. */
  parellesExcloses(cicleId: string): Promise<Set<string>>;
  execucions(casalId: string, cicleId: string): Promise<Execucio[]>;
  execucio(casalId: string, id: string): Promise<Execucio | null>;
  execucioConfirmada(cicleId: string): Promise<Execucio | null>;
  resultats(execucioId: string): Promise<FilaResultat[]>;
  /** Descarta les propostes pendents i crea l'execució nova amb els resultats, si el cicle és en procés d'adjudicació. */
  operacionsNovaProposta(d: {
    id: string; casal_id: string; cicle_id: string; configuracio_id: string; versio: number;
    lletra: string | null; llavor: string | null; resum: Record<string, unknown>; usuari_id: string; operacio: string;
    resultats: ResultatMotor[];
  }, ara: string): Operacio[];
  maxVersioExecucio(cicleId: string): Promise<number>;
  /**
   * Confirma la proposta i, si n'hi havia, substitueix l'adjudicació confirmada anterior.
   * Crea o actualitza les places i en registra els moviments. Tot condicionat al testimoni.
   */
  operacionsConfirmar(d: {
    execucio_id: string; cicle_id: string; casal_id: string; anterior_id: string | null; motiu: string | null; usuari_id: string; operacio: string;
    places_noves: { id: string; sollicitud_id: string; activitat_id: string }[];
  }, ara: string): Operacio[];
  places(casalId: string, cicleId: string, activitatId?: string): Promise<FilaPlaca[]>;
  placa(casalId: string, id: string): Promise<(Placa & { cicle_id: string; capacitat: number }) | null>;
  moviments(placaId: string): Promise<MovimentPlaca[]>;
  /**
   * Canvi d'estat d'una plaça amb bloqueig optimista. Si `ocupa` és cert, només s'aplica
   * si les places admeses i ofertes de l'activitat són menys que la capacitat.
   */
  operacioMoviment(d: { placa_id: string; versio: number; des: EstatPlaca; cap: EstatPlaca; ocupa: boolean; operacio: string }, ara: string): Operacio;
  operacioRegistreMoviment(d: { placa_id: string; des: EstatPlaca; cap: EstatPlaca; motiu: string; usuari_id: string; operacio: string }, ara: string): Operacio;
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
  sollicituds: RepositoriSollicituds;
  gestioSollicituds: RepositoriGestioSollicituds;
  adjudicacio: RepositoriAdjudicacio;
  unitat: UnitatDeTreball;
}
