/**
 * Contractes de la capa de repositoris.
 *
 * Els serveis i les rutes depenen d'aquestes interfícies, no de D1. Per migrar a
 * PostgreSQL o a una base de dades corporativa n'hi ha prou amb una implementació
 * nova de cada repositori (vegeu docs/adr/0003-capa-de-repositoris.md).
 */
import type { DadesPersona } from "../../shared/domain/persones-plataforma";
import type { IdiomaWhatsapp, PlantillaWhatsapp } from "../../shared/domain/whatsapp";
import type { CanalComunicacio, EstatComunicacio, MotiuNoContacte, TipusComunicacio } from "../../shared/schemas/comunicacions";
import type { EstatCicle } from "../../shared/domain/cicles";
import type { CampPersonal } from "../../shared/domain/formulari";
import type { ActivitatMotor, ParametresAdjudicacio, ResultatMotor, SollicitudMotor } from "../../shared/domain/adjudicacio";
import type { EstatPlaca } from "../../shared/schemas/adjudicacio";
import type { EstatAssistencia } from "../../shared/domain/assistencia";
import type { EstatPublicacio } from "../../shared/domain/instagram";
import type { CATEGORIES_INCIDENCIA } from "../../shared/domain/territori";
import type { CampPlantilla, Estacio, EstatPlantilla, FormatSortida, TipusPlantilla, UsFitxer } from "../../shared/domain/cartells";

export interface Casal {
  id: string;
  codi: string;
  nom: string;
  municipi: string;
  adreca: string | null;
  comarca: string | null;
  demarcacio: string | null;
  referent_id: string | null;
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
  llindar_assistencia: number | null;
  /** Màxim d'activitats de cada grup per persona a l'adjudicació ({"1": 1, "2": 3}). */
  limits_grups: Record<string, number>;
  versio: number;
  creat_el: string;
  actualitzat_el: string;
}

export type NouCicle = Omit<Cicle, "id" | "estat" | "versio" | "creat_el" | "actualitzat_el" | "configuracio_formulari" | "llindar_assistencia" | "limits_grups"> & {
  configuracio_formulari?: Record<string, unknown>;
  /** Sense valor: el llindar per defecte de la regla del casal. Null: sense llindar. */
  llindar_assistencia?: number | null;
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
  /** Persona tallerista (buit: sense tallerista assignada). */
  tallerista: string | null;
  /** Qui la gestiona: només les de la Generalitat compten a les estadístiques de la superadministració. */
  gestio: GestioActivitat;
  /** Persones a qui va dirigida (text de la PGEc). */
  destinataris: string | null;
  /** Grup d'activitats que no es poden acumular (vegeu `cicles.limits_grups`). */
  grup: string | null;
  capacitat: number;
  nombre_sessions: number | null;
  /** Mínim de participants perquè es faci. Només genera avisos. */
  minim_participants: number | null;
  estat: EstatActivitat;
  informacio_difusio: Record<string, unknown>;
  configuracio_continuitat: Record<string, unknown>;
  codi_extern: string | null;
  versio: number;
  creat_el: string;
  actualitzat_el: string;
}

export type GestioActivitat = "generalitat" | "associacio";

export type NovaActivitat = Pick<Activitat, "casal_id" | "cicle_id" | "nom" | "capacitat"> &
  Partial<
    Pick<
      Activitat,
      | "descripcio" | "categoria" | "dies_setmana" | "hora_inici" | "hora_fi" | "horari_text"
      | "data_inici" | "data_fi" | "espai" | "tallerista" | "gestio" | "destinataris" | "grup" | "nombre_sessions" | "minim_participants" | "estat" | "informacio_difusio"
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
  taula: "casals" | "cicles" | "activitats" | "participants" | "sollicituds" | "execucions_adjudicacio" | "places" | "sessions_activitat"
    | "sortejos_adjudicacio" | "cartells_plantilles";
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
  /** Mòbil per als avisos de la superadministració (opcional). */
  telefon: string | null;
}

/** Permisos efectius d'un usuari: globals (administració central) i per casal. */
export interface PermisosUsuari {
  globals: string[];
  perCasal: Record<string, string[]>;
  /** Casals amb alguna persona responsable vigent (només es carrega per a qui té permisos globals). */
  casalsAmbResponsable: string[];
}

export interface ResponsableCasal {
  assignacio_id: string;
  usuari_id: string;
  email: string;
  nom_visible: string;
  atorgat_el: string;
  te_contrasenya: boolean;
  darrer_acces_el: string | null;
  codi_pendent_fins: string | null;
  telefon: string | null;
}

/** Un període d'una persona en un rol del casal (des de l'alta fins a la baixa, si n'hi ha). */
export interface PeriodeEquip {
  id: string;
  usuari_id: string;
  email: string;
  nom_visible: string;
  rol_codi: string;
  atorgat_el: string;
  atorgat_per: string | null;
  revocat_el: string | null;
  revocat_per: string | null;
  motiu: string | null;
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
  /** Resum desat de la contrasenya (null si no en té). */
  resumContrasenya(usuariId: string): Promise<string | null>;
  /** Persones actives de la superadministració amb contrasenya (per a l'accés només amb contrasenya). */
  superadministracio(): Promise<{ id: string; contrasenya_resum: string }[]>;
  fixarContrasenya(usuariId: string, resum: string, ara: string): Promise<void>;
  assignacionsCasal(casalId: string): Promise<AssignacioRol[]>;
  /** Totes les assignacions del casal, també les revocades: una fila per període. */
  historialEquip(casalId: string): Promise<PeriodeEquip[]>;
  assignacioPerId(id: string): Promise<AssignacioRol | null>;
  rolExisteix(codi: string): Promise<{ abast: "casal" | "global" } | null>;
  /** Responsables vigents de tots els casals. */
  responsables(): Promise<(ResponsableCasal & { casal_id: string })[]>;
  /** Assignacions vigents de la persona (per saber si té accés a altres casals o global). */
  assignacionsUsuari(usuariId: string): Promise<{ rol_codi: string; casal_id: string | null }[]>;
  /** Estat d'accés de les persones: si tenen contrasenya i si tenen un codi de primer accés vigent. */
  estatAcces(usuariIds: string[], ara: string): Promise<Record<string, { te_contrasenya: boolean; darrer_acces_el: string | null; codi_pendent_fins: string | null }>>;
  marcarAcces(usuariId: string, ara: string): Promise<void>;
  fixarTelefon(usuariId: string, telefon: string | null, ara: string): Promise<void>;
  operacioAssignar(dades: { id: string; usuari_id: string; rol_codi: string; casal_id: string | null; atorgat_per: string; motiu: string | null }, ara: string): Operacio;
  operacioRevocar(id: string, revocatPer: string, motiu: string | null, ara: string): Operacio;
}

export interface RepositoriSessions {
  crearTestimoni(resum: string, usuariId: string, ara: string, caducaEl: string): Promise<void>;
  /** Nou codi de primer accés: invalida els anteriors de la mateixa persona. */
  crearCodiPrimerAcces(resum: string, usuariId: string, ara: string, caducaEl: string): Promise<void>;
  /** Consumeix un codi de primer accés vàlid de la persona. */
  consumirCodiPrimerAcces(resum: string, usuariId: string, ara: string): Promise<boolean>;
  /** Marca el testimoni com a usat si és vàlid i retorna l'usuari. Un testimoni només serveix una vegada. */
  consumirTestimoni(resum: string, ara: string): Promise<string | null>;
  crearSessio(resum: string, usuariId: string, ara: string, caducaEl: string): Promise<void>;
  sessioVigent(resum: string, ara: string): Promise<{ usuari_id: string; darrer_us_el: string } | null>;
  tocarSessio(resum: string, ara: string): Promise<void>;
  revocarSessio(resum: string, ara: string): Promise<void>;
}

export type CanvisCicle = Partial<Pick<Cicle,
  | "nom" | "any" | "data_inici" | "data_fi" | "obertura_inscripcions" | "tancament_inscripcions"
  | "data_resolucio_prevista" | "configuracio_formulari" | "llindar_assistencia" | "limits_grups">>;

export interface DadesCicle {
  activitats: number;
  sollicituds: number;
  places: number;
  marques_assistencia: number;
  adjudicacions: number;
  altres: number;
}

export interface RepositoriCicles {
  /** Sempre filtra per casal per evitar accessos horitzontals. */
  perId(casalId: string, id: string): Promise<Cicle | null>;
  llistarPerCasal(casalId: string, opcions?: { estats?: EstatCicle[] }): Promise<Cicle[]>;
  /** Dades del cicle que impedeixen eliminar-lo (inscripcions, places, assistència, comunicacions…). */
  dadesVinculades(cicleId: string): Promise<DadesCicle>;
  /** Esborra el cicle i les seves activitats. Només per a cicles sense dades vinculades. */
  operacionsEliminar(casalId: string, cicleId: string): Operacio[];
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
  /** Amb `casalId`, només les entrades d'aquell casal. */
  llistar(entitat: string, entitatId: string, casalId?: string): Promise<(EntradaHistorial & { id: number; creat_el: string })[]>;
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
  /** Autorització del tutor (només per a menors d'edat). */
  tutor?: DadesAutoritzacioTutor | null;
  id_peticio: string | null;
}

export interface DadesAutoritzacioTutor {
  nom: string;
  cognoms: string;
  document_identitat: string;
  /** Imatge PNG de la signatura (data URL). */
  signatura: string;
}

export interface AutoritzacioTutorDesada extends DadesAutoritzacioTutor {
  creat_el: string;
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
  autoritzacioTutor(casalId: string, sollicitudId: string): Promise<AutoritzacioTutorDesada | null>;
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
  activitats: (ActivitatMotor & { nom: string; estat: EstatActivitat; minim_participants: number | null })[];
  limits_grups: Record<string, number>;
}

/** Sorteig d'una activitat (número o lletra). No s'esborra: s'anul·la amb motiu. */
export interface SorteigActivitat {
  id: string;
  casal_id: string;
  cicle_id: string;
  activitat_id: string;
  activitat: string;
  tipus: "numero" | "lletra";
  valor: string;
  rang_maxim: number | null;
  numeracio: "inscripcio" | "aleatoria" | null;
  origen: "aplicacio" | "manual";
  motiu: string | null;
  estat: "vigent" | "anullat";
  realitzat_per: string | null;
  realitzat_per_nom: string | null;
  realitzat_el: string;
  anullat_per: string | null;
  anullat_el: string | null;
  motiu_anullacio: string | null;
}

export interface RepositoriAdjudicacio {
  configuracioVigent(cicleId: string): Promise<ConfiguracioAdjudicacio | null>;
  configuracions(cicleId: string): Promise<ConfiguracioAdjudicacio[]>;
  /** Insereix la versió `versio` només si la vigent és `versioAnterior` (null = cap). */
  operacioDesarConfiguracio(d: { id: string; cicle_id: string; versio: number; versio_anterior: number | null; parametres: ParametresAdjudicacio; usuari_id: string }, ara: string): Operacio;
  dadesMotor(casalId: string, cicleId: string): Promise<DadesMotor>;
  /** Parelles "sollicitud:activitat" amb plaça admesa en el cicle anterior del casal (mateixa persona, activitat equivalent). */
  continuitat(casalId: string, cicleId: string): Promise<{ parelles: Set<string>; cicle_anterior: { id: string; nom: string } | null }>;
  /**
   * Parelles "sollicitud:activitat" de persones que el cicle anterior van quedar en llista d'espera
   * de l'activitat equivalent havent-la triat com a preferència 1..`preferenciaMaxima`.
   */
  esperaAnterior(casalId: string, cicleId: string, preferenciaMaxima: number): Promise<{ parelles: Set<string>; cicle_anterior: { id: string; nom: string } | null }>;
  /** Parelles amb renúncia o baixa en les places actuals del cicle. */
  parellesExcloses(cicleId: string): Promise<Set<string>>;
  numerosSorteig(cicleId: string): Promise<{ sollicitud_id: string; numero: number; assignat_el: string }[]>;
  llistaNumerosSorteig(casalId: string, cicleId: string): Promise<{ numero: number; numero_sollicitud: number; participant: Participant }[]>;
  /** Insereix números de sorteig nous (inscripcions tancades o adjudicació en procés). Són immutables. */
  operacionsAssignarNumeros(d: { casal_id: string; cicle_id: string; assignacions: { sollicitud_id: string; numero: number }[]; usuari_id: string }, ara: string): Operacio[];
  sortejos(cicleId: string): Promise<SorteigActivitat[]>;
  operacioNouSorteig(d: Omit<SorteigActivitat, "estat" | "anullat_per" | "anullat_el" | "motiu_anullacio" | "activitat" | "realitzat_per_nom"> & { operacio: string }): Operacio;
  operacioAnullarSorteig(d: { id: string; casal_id: string; cicle_id: string; motiu: string; usuari_id: string; operacio: string }, ara: string): Operacio;
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

// ---------- Assistència ----------
export interface Sessio {
  id: string;
  activitat_id: string;
  data: string;
  hora_inici: string | null;
  hora_fi: string | null;
  estat: "prevista" | "realitzada" | "cancellada";
  motiu_cancellacio: string | null;
  /** La persona tallerista no ha vingut a la sessió. */
  tallerista_absent: 0 | 1;
  tallerista_motiu: string | null;
  versio: number;
  /** Nombre de marques registrades en aquesta sessió. */
  marques: number;
}

export interface Marca {
  sessio_id: string;
  placa_id: string;
  estat: EstatAssistencia;
  versio: number;
  registrat_el: string;
}

export interface RepositoriAssistencia {
  sessions(activitatId: string): Promise<Sessio[]>;
  sessionsCicle(cicleId: string): Promise<Sessio[]>;
  sessio(casalId: string, id: string): Promise<(Sessio & { cicle_id: string }) | null>;
  /** Insereix les sessions que encara no existeixen (mateixa activitat, data i hora d'inici). */
  operacioCrearSessions(sessions: { id: string; activitat_id: string; data: string; hora_inici: string | null; hora_fi: string | null }[], usuariId: string, ara: string): Operacio;
  operacioCancellarSessio(id: string, versio: number, motiu: string, ara: string, operacio: string): Operacio;
  operacioFaltaTallerista(id: string, absent: boolean, motiu: string | null, ara: string, operacio: string): Operacio;
  marquesActivitat(activitatId: string): Promise<Marca[]>;
  marquesCicle(cicleId: string): Promise<Marca[]>;
  operacioNovaMarca(d: { sessio_id: string; placa_id: string; estat: EstatAssistencia; usuari_id: string; operacio: string }, ara: string): Operacio;
  operacioModificarMarca(d: { sessio_id: string; placa_id: string; estat: EstatAssistencia; versio: number; usuari_id: string; operacio: string }, ara: string): Operacio;
  /**
   * Historial d'una modificació. Fa fallar tot el lot si la modificació no ha tingut
   * efecte (algú altre l'ha canviada mentrestant).
   */
  operacioHistorialMarca(d: { casal_id: string; sessio_id: string; placa_id: string; data: string; abans: EstatAssistencia; despres: EstatAssistencia; motiu: string; usuari_id: string; operacio: string }, ara: string): Operacio;
  operacioSessioRealitzada(sessioId: string, ara: string): Operacio;
  /** Desa el motiu i la data d'una baixa voluntària, condicionat al canvi d'estat de la plaça de la mateixa operació. */
  baixesVoluntaries(activitatId: string): Promise<{ placa_id: string; data: string; motiu: string }[]>;
  operacioBaixaVoluntaria(d: { placa_id: string; casal_id: string; estat_anterior: "admesa" | "oferta_pendent"; data: string; motiu: string; usuari_id: string | null; operacio: string }, ara: string): Operacio;
}

/** Executa un conjunt d'operacions de manera atòmica (tot o res). */
export interface UnitatDeTreball {
  executar(operacions: Operacio[]): Promise<{ canvis: number }[]>;
}

export interface DadesIndicadors {
  sollicituds_per_estat: Record<string, number>;
  /** Participants diferents amb alguna sol·licitud no anul·lada. */
  persones: number;
  activitats: {
    id: string; nom: string; estat: EstatActivitat; capacitat: number; minim_participants: number | null;
    sollicituds: number; primera_preferencia: number; admeses: number; ofertes: number; espera: number; baixes_voluntaries: number;
  }[];
  darrera_execucio: { versio: number; estat: "proposta" | "confirmada"; executada_el: string; confirmada_el: string | null } | null;
}

export interface ComunicacioPlaca {
  placa_id: string;
  tipus: TipusComunicacio;
  canal: CanalComunicacio;
  estat: EstatComunicacio;
  motiu: MotiuNoContacte | null;
  nota: string | null;
  actualitzat_el: string;
}

export interface RepositoriComunicacions {
  llistar(casalId: string, cicleId: string): Promise<ComunicacioPlaca[]>;
  desar(d: ComunicacioPlaca & { casal_id: string; cicle_id: string; usuari_id: string | null }): Promise<void>;
  esborrar(casalId: string, placaId: string): Promise<number>;
}

export interface ConfigWhatsapp {
  casal_id: string;
  phone_number_id: string;
  numero_visible: string | null;
  idioma: IdiomaWhatsapp;
  actiu: boolean;
  ofertes_automatiques: boolean;
  actualitzat_el: string;
}

export type EstatMissatgeWhatsapp = "pendent" | "enviat" | "entregat" | "llegit" | "fallit" | "no_enviable";
export type MotiuMissatgeWhatsapp = "telefon_fix" | "sense_telefon" | "telefon_invalid" | "sense_whatsapp" | "error_meta";

export interface MissatgeWhatsapp {
  id: string;
  enviament_id: string;
  casal_id: string;
  cicle_id: string;
  placa_id: string;
  plantilla: PlantillaWhatsapp;
  estat: EstatMissatgeWhatsapp;
  motiu: MotiuMissatgeWhatsapp | null;
  wamid: string | null;
  error_codi: number | null;
  error_text: string | null;
  resposta: "si" | "no" | "text" | null;
  resposta_el: string | null;
  creat_el: string;
  actualitzat_el: string;
}

export interface EnviamentWhatsapp {
  id: string;
  casal_id: string;
  cicle_id: string;
  tipus: "activitat" | "general" | "oferta";
  text: string | null;
  abast: string;
  usuari_id: string | null;
  creat_el: string;
}

export interface RepositoriWhatsapp {
  config(casalId: string): Promise<ConfigWhatsapp | null>;
  desarConfig(d: Omit<ConfigWhatsapp, "actualitzat_el">, usuariId: string | null, ara: string): Promise<void>;
  crearEnviament(e: EnviamentWhatsapp, missatges: Pick<MissatgeWhatsapp, "id" | "placa_id" | "plantilla">[], ara: string): Promise<void>;
  enviament(casalId: string, id: string): Promise<EnviamentWhatsapp | null>;
  enviaments(casalId: string, cicleId: string, tipus?: EnviamentWhatsapp["tipus"]): Promise<(EnviamentWhatsapp & { recompte: Record<string, number> })[]>;
  pendents(enviamentId: string, limit: number): Promise<MissatgeWhatsapp[]>;
  recompte(enviamentId: string): Promise<Record<string, number>>;
  actualitzar(id: string, canvis: Partial<Pick<MissatgeWhatsapp, "estat" | "motiu" | "wamid" | "error_codi" | "error_text">>, ara: string): Promise<void>;
  perWamid(wamid: string): Promise<MissatgeWhatsapp | null>;
  canviEstatPerWamid(wamid: string, estat: EstatMissatgeWhatsapp, error: { codi: number; text: string } | null, ara: string): Promise<MissatgeWhatsapp | null>;
  resposta(wamid: string, resposta: "si" | "no" | "text", ara: string): Promise<MissatgeWhatsapp | null>;
  /** Darrer missatge de cada plaça del cicle. */
  darrersPerPlaca(casalId: string, cicleId: string): Promise<MissatgeWhatsapp[]>;
  /** Missatges d'un enviament amb la plaça (per mostrar el resultat). */
  missatges(enviamentId: string): Promise<MissatgeWhatsapp[]>;
}

export interface PersonaPlataforma {
  id: string;
  clau: string;
  document_norm: string | null;
  nom: string | null;
  cognom1: string | null;
  cognom2: string | null;
  clau_ordenacio: string;
  data_naixement: string | null;
  dades: DadesPersona;
  origens: string[];
  text_basic: string;
  text_contacte: string;
  creat_el: string;
  actualitzat_el: string;
}

export interface ParticipacioPersona {
  cicle_id: string;
  cicle: string;
  cicle_data_inici: string | null;
  sollicitud_numero: number;
  sollicitud_estat: string;
  activitat_id: string;
  activitat: string;
  preferencia: number;
  placa_estat: string | null;
  posicio_espera: number | null;
}

export interface RepositoriPersonesPlataforma {
  perClaus(casalId: string, claus: string[]): Promise<PersonaPlataforma[]>;
  desar(casalId: string, persones: PersonaPlataforma[]): Promise<void>;
  cercar(casalId: string, f: { paraules: string[]; data_naixement: string | null; contacte: boolean; limit: number }): Promise<{ persones: PersonaPlataforma[]; total: number }>;
  perId(casalId: string, id: string): Promise<PersonaPlataforma | null>;
  /** Nom i telèfons de totes les persones del casal (per als comunicats). */
  contactes(casalId: string): Promise<ContactePersona[]>;
  resum(casalId: string): Promise<{ total: number; darrera_importacio: string | null }>;
  /** Sol·licituds i places de l'aplicació de la mateixa persona (per document o per nom i data de naixement). */
  participacions(casalId: string, documentNorm: string | null, clauOrdenacio: string, dataNaixement: string | null): Promise<ParticipacioPersona[]>;
}

/** Recomptes d'un cicle per al quadre de comandament global. */
export interface IndicadorsCicleGlobal {
  casal_id: string;
  cicle_id: string;
  cicle: string;
  any: number;
  estat: string;
  data_inici: string;
  data_fi: string;
  activitats: number;
  places_ofertes: number;
  sollicituds: number;
  persones: number;
  admeses: number;
  espera: number;
  renuncies: number;
  baixes: number;
  baixes_voluntaries: number;
  sessions_realitzades: number;
  presencies: number;
  absencies: number;
  absencies_justificades: number;
  /** Activitats sense cap tallerista indicada. */
  activitats_sense_tallerista: number;
  /** Sessions no cancel·lades en què la tallerista no ha vingut. */
  sessions_falta_tallerista: number;
}

/** Recomptes per casal que no depenen del cicle. */
export interface IndicadorsCasalGlobal {
  casal_id: string;
  persones_diferents: number;
  persones_plataforma: number;
  equip: number;
  responsables: number;
}

export interface RepositoriIndicadors {
  cicle(casalId: string, cicleId: string): Promise<DadesIndicadors>;
  /** Tots els casals i cicles (filtrats per any del cicle si se'n dona). */
  global(any: number | null): Promise<{ cicles: IndicadorsCicleGlobal[]; casals: IndicadorsCasalGlobal[]; anys: number[]; incidencies: RecompteIncidencies[] }>;
}

/** Incidències d'un casal per categoria i estat (any de la data de la incidència). */
export interface RecompteIncidencies { casal_id: string; categoria: CategoriaIncidencia; estat: EstatIncidencia; n: number }

// ---------- Territori i referents ----------
export interface Referent {
  id: string;
  nom: string;
  email: string | null;
  actiu: boolean;
  creat_el: string;
  actualitzat_el: string;
}

export interface RepositoriTerritori {
  referents(): Promise<Referent[]>;
  referent(id: string): Promise<Referent | null>;
  crearReferent(d: { id: string; nom: string; email: string | null }, ara: string): Promise<void>;
  actualitzarReferent(id: string, d: { nom: string; email: string | null; actiu: boolean }, ara: string): Promise<boolean>;
  /** Comarca, demarcació i referent d'un casal. */
  fixarTerritori(casalId: string, d: { comarca: string | null; demarcacio: string | null; referent_id: string | null }, ara: string): Promise<boolean>;
}

// ---------- Incidències ----------
export type CategoriaIncidencia = (typeof CATEGORIES_INCIDENCIA)[number];
export type EstatIncidencia = "oberta" | "resolta";

export interface Incidencia {
  id: string;
  casal_id: string;
  data: string;
  categoria: CategoriaIncidencia;
  descripcio: string;
  activitat_id: string | null;
  activitat: string | null;
  estat: EstatIncidencia;
  resolucio: string | null;
  resolta_el: string | null;
  creat_el: string;
}

export interface RepositoriIncidencies {
  llistar(casalId: string, any: number | null): Promise<Incidencia[]>;
  /** Activitats no arxivades del casal, per vincular-hi una incidència. */
  activitats(casalId: string): Promise<{ id: string; nom: string; cicle: string }[]>;
  crear(d: { id: string; casal_id: string; data: string; categoria: CategoriaIncidencia; descripcio: string; activitat_id: string | null; usuari_id: string }, ara: string): Promise<void>;
  /** Marca la incidència com a resolta; retorna fals si no existeix o ja ho estava. */
  resoldre(casalId: string, id: string, d: { resolucio: string | null; usuari_id: string }, ara: string): Promise<boolean>;
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
  assistencia: RepositoriAssistencia;
  comunicacions: RepositoriComunicacions;
  whatsapp: RepositoriWhatsapp;
  comunicats: RepositoriComunicats;
  personesPlataforma: RepositoriPersonesPlataforma;
  indicadors: RepositoriIndicadors;
  territori: RepositoriTerritori;
  incidencies: RepositoriIncidencies;
  cartells: RepositoriCartells;
  instagram: RepositoriInstagram;
  unitat: UnitatDeTreball;
}

// ---------- PG-Cartells ----------

export interface FitxerCartells {
  id: string;
  casal_id: string | null;
  us: UsFitxer;
  clau: string;
  tipus_mime: string;
  mida: number;
  sha256: string;
  nom_original: string;
  pujat_per: string;
  pujat_el: string;
}

export interface PlantillaCartells {
  id: string;
  casal_id: string | null;
  fitxer_id: string;
  previsualitzacio_id: string | null;
  nom: string;
  tipus: TipusPlantilla;
  estacio: Estacio | null;
  linies_titol: number;
  amb_qr: boolean;
  tematica: string | null;
  identitat_grafica: string | null;
  estat: EstatPlantilla;
  pagina_amplada: number;
  pagina_alcada: number;
  format_sortida: FormatSortida;
  camps: CampPlantilla[];
  versio: number;
  creat_per: string;
  creat_el: string;
  actualitzat_el: string;
}

export type NovaPlantillaCartells = Omit<PlantillaCartells, "id" | "versio" | "creat_el" | "actualitzat_el" | "estat">;

export interface RepositoriCartells {
  operacioCrearFitxer(f: FitxerCartells): Operacio;
  fitxer(id: string): Promise<FitxerCartells | null>;
  /** Fitxers amb el mateix contingut i el mateix àmbit (casal o comú), per evitar duplicats. */
  fitxersPerContingut(sha256: string, us: UsFitxer, casalId: string | null): Promise<FitxerCartells[]>;
  operacioCrearPlantilla(id: string, p: NovaPlantillaCartells, ara: string, operacio: string): Operacio;
  operacioActualitzarPlantilla(id: string, versioActual: number, canvis: Partial<Pick<PlantillaCartells,
    "nom" | "estat" | "estacio" | "tematica" | "identitat_grafica" | "camps" | "format_sortida">>, ara: string, operacio: string): Operacio;
  plantilla(id: string): Promise<PlantillaCartells | null>;
  plantillaPerFitxer(fitxerId: string): Promise<PlantillaCartells | null>;
  /** Plantilles comunes i, si s'indica, les específiques del casal. */
  plantilles(filtre: { casalId: string | null; tipus?: TipusPlantilla; estats?: EstatPlantilla[] }): Promise<PlantillaCartells[]>;
}

// ---------- Instagram ----------

/** Compte d'Instagram connectat a un casal. El testimoni xifrat no surt mai del servidor. */
export interface CompteInstagram {
  casal_id: string;
  ig_usuari_id: string;
  nom_usuari: string;
  testimoni_xifrat: string;
  testimoni_caduca_el: string | null;
  testimoni_renovat_el: string;
  connectat_per: string;
  connectat_el: string;
}

export interface PublicacioInstagram {
  id: string;
  casal_id: string;
  fitxer_id: string;
  titol: string;
  peu: string;
  estat: EstatPublicacio;
  ig_media_id: string | null;
  enllac: string | null;
  error_missatge: string | null;
  imatge_testimoni_resum: string | null;
  imatge_caduca_el: string | null;
  versio: number;
  creat_per: string;
  creat_el: string;
  publicat_per: string | null;
  publicat_el: string | null;
  actualitzat_el: string;
}

export type CanvisPublicacio = Partial<Pick<PublicacioInstagram,
  "peu" | "estat" | "ig_media_id" | "enllac" | "error_missatge" | "imatge_testimoni_resum" | "imatge_caduca_el" | "publicat_per" | "publicat_el">>;

export interface RepositoriInstagram {
  compte(casalId: string): Promise<CompteInstagram | null>;
  desarCompte(c: CompteInstagram): Promise<void>;
  renovarTestimoni(casalId: string, testimoniXifrat: string, caducaEl: string | null, ara: string): Promise<void>;
  esborrarCompte(casalId: string): Promise<void>;
  crearPublicacio(p: Omit<PublicacioInstagram, "estat" | "ig_media_id" | "enllac" | "error_missatge" | "imatge_testimoni_resum" | "imatge_caduca_el" | "versio" | "publicat_per" | "publicat_el" | "actualitzat_el">): Promise<void>;
  publicacio(id: string): Promise<PublicacioInstagram | null>;
  publicacioPerImatge(testimoniResum: string): Promise<PublicacioInstagram | null>;
  publicacions(casalId: string, limit: number): Promise<PublicacioInstagram[]>;
  /** Aplica els canvis només si la versió coincideix; retorna si s'han aplicat. */
  actualitzarPublicacio(id: string, versio: number, canvis: CanvisPublicacio, ara: string): Promise<boolean>;
}

export interface ContactePersona {
  id: string;
  nom: string | null;
  cognoms: string;
  telefon_mobil: string | null;
  telefon_opcional: string | null;
  telefon_fix: string | null;
  tutor_telefon: string | null;
}

export interface ConfigWhatsappCentral {
  phone_number_id: string;
  numero_visible: string | null;
  idioma: "ca" | "es";
  remitent: string;
  actiu: boolean;
  actualitzat_el: string;
}

export type CanalComunicat = "correu" | "whatsapp";
export type MotiuComunicat = MotiuMissatgeWhatsapp | "sense_numero" | "sense_correu" | "error_correu" | "duplicat";

export interface Comunicat {
  id: string;
  assumpte: string;
  text: string;
  casal_ids: string;
  canals: string;
  usuari_id: string | null;
  creat_el: string;
}

export interface DestinatariComunicat {
  id: string;
  comunicat_id: string;
  casal_id: string;
  tipus: "responsable" | "persona";
  referencia_id: string;
  canal: CanalComunicat;
  estat: EstatMissatgeWhatsapp;
  motiu: MotiuComunicat | null;
  wamid: string | null;
  error_text: string | null;
  creat_el: string;
  actualitzat_el: string;
}

export interface RepositoriComunicats {
  configCentral(): Promise<ConfigWhatsappCentral | null>;
  desarConfigCentral(d: Omit<ConfigWhatsappCentral, "actualitzat_el">, usuariId: string | null, ara: string): Promise<void>;
  crear(c: Comunicat, destinataris: Omit<DestinatariComunicat, "comunicat_id" | "wamid" | "error_text" | "creat_el" | "actualitzat_el">[], ara: string): Promise<void>;
  perId(id: string): Promise<Comunicat | null>;
  /** Darrers comunicats amb recomptes per estat. */
  llistar(limit: number): Promise<(Comunicat & { recompte: Record<string, number> })[]>;
  /** Pendents: primer les responsables, després les persones. */
  pendents(comunicatId: string, limit: number): Promise<DestinatariComunicat[]>;
  destinataris(comunicatId: string): Promise<DestinatariComunicat[]>;
  actualitzar(id: string, canvis: Partial<Pick<DestinatariComunicat, "estat" | "motiu" | "wamid" | "error_text">>, ara: string): Promise<void>;
  canviEstatPerWamid(wamid: string, estat: EstatMissatgeWhatsapp, error: { codi: number; text: string } | null, ara: string): Promise<DestinatariComunicat | null>;
}
