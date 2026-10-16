/** Tipus de les respostes de l'API de gestió (coincideixen amb worker/repositories/tipus.ts). */
import type { CanalComunicacio, EstatComunicacio, MotiuNoContacte } from "../../shared/schemas/comunicacions";
import type { EstatCicle, TipusTransicio } from "../../shared/domain/cicles";
import type { ConfiguracioFormulari } from "../../shared/domain/formulari";
import type { ParametresAdjudicacio } from "../../shared/domain/adjudicacio";
import type { EstatPlaca } from "../../shared/schemas/adjudicacio";
import type { EstatAssistencia } from "../../shared/domain/assistencia";
import type { CategoriaIncidencia } from "../../shared/domain/territori";

export interface Casal {
  id: string; codi: string; nom: string; municipi: string; adreca: string | null; actiu: boolean; versio: number;
}

export interface CasalAccessible {
  id: string; codi: string; nom: string; actiu: boolean; permisos: string[];
  /** Superadministració en un casal amb responsable: només hi pot consultar. */
  nomes_consulta: boolean;
}

export interface Jo {
  usuari: { id: string; nom_visible: string; email: string; telefon: string | null };
  administracio_central: boolean;
  /** Superadministració: assigna responsables i veu tots els casals. */
  superadministracio: boolean;
  /** Pot veure el quadre de comandament de tots els casals. */
  quadre_global: boolean;
  /** Té una contrasenya per entrar al panell. */
  te_contrasenya: boolean;
  /** Pot carregar i modificar les plantilles comunes a tots els casals (administració central). */
  pot_gestionar_plantilles_comunes: boolean;
  casals: CasalAccessible[];
}

export interface Cicle {
  id: string; casal_id: string; nom: string; any: number; data_inici: string; data_fi: string;
  obertura_inscripcions: string; tancament_inscripcions: string; data_resolucio_prevista: string;
  estat: EstatCicle; configuracio_formulari: Record<string, unknown>; llindar_assistencia: number | null; limits_grups: Record<string, number>; versio: number;
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
  data_inici: string | null; data_fi: string | null; espai: string | null; tallerista?: string | null; destinataris: string | null; grup: number | null; capacitat: number;
  nombre_sessions: number | null; minim_participants: number | null; estat: EstatActivitat; codi_extern: string | null; versio: number;
}

export interface EntradaHistorial {
  id: number; accio: string; canvis: Record<string, unknown>; usuari_id: string | null; motiu: string | null; creat_el: string;
}

export interface AssignacioRol {
  id: string; usuari_id: string; email: string; nom_visible: string; rol_codi: string; casal_id: string | null; atorgat_el: string;
  te_contrasenya?: boolean; darrer_acces_el?: string | null; codi_pendent_fins?: string | null;
}

/** Codi de primer accés: només es mostra una vegada. */
export interface CodiAcces { codi: string; caduca_el: string }
export type AccesAlta = { estat: "codi"; codi: CodiAcces } | { estat: "te_contrasenya" } | { estat: "altres_casals" };

export interface ResponsableCasal {
  assignacio_id: string; usuari_id: string; email: string; nom_visible: string; atorgat_el: string;
  te_contrasenya: boolean; darrer_acces_el: string | null; codi_pendent_fins: string | null; telefon: string | null;
}
export interface CasalResponsables {
  id: string; codi: string; nom: string; municipi: string; actiu: boolean; responsables: ResponsableCasal[];
}

export interface RecomptesGlobals {
  activitats: number; places_ofertes: number; sollicituds: number; persones: number; admeses: number; espera: number;
  renuncies: number; baixes: number; baixes_voluntaries: number; sessions_realitzades: number;
  presencies: number; absencies: number; absencies_justificades: number; percentatge_assistencia: number | null;
  activitats_sense_tallerista: number; sessions_falta_tallerista: number;
}
export interface CasalQuadre extends RecomptesGlobals {
  casal_id: string; casal: string; municipi: string; actiu: boolean; cicles: number;
  comarca: string | null; demarcacio: string | null; referent_id: string | null; referent: string | null;
  persones_diferents: number; persones_plataforma: number; equip: number; responsables: number;
  incidencies: number; incidencies_obertes: number; incidencies_per_categoria: Record<CategoriaIncidencia, number>;
}
export interface QuadreGlobal {
  any: number | null;
  anys: number[];
  casals: CasalQuadre[];
  cicles: (RecomptesGlobals & { casal_id: string; casal: string; cicle_id: string; cicle: string; any: number; estat: EstatCicle; data_inici: string; data_fi: string })[];
  referents: { id: string; nom: string; actiu: boolean }[];
}

export interface Referent { id: string; nom: string; email: string | null; actiu: boolean }
export interface CasalTerritori {
  id: string; codi: string; nom: string; municipi: string; actiu: boolean;
  comarca: string | null; demarcacio: string | null; referent_id: string | null;
}
export interface Incidencia {
  id: string; data: string; categoria: CategoriaIncidencia; descripcio: string; activitat_id: string | null; activitat: string | null;
  estat: "oberta" | "resolta"; resolucio: string | null; resolta_el: string | null; creat_el: string;
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
export interface AutoritzacioTutor { nom: string; cognoms: string; document_identitat: string | null; signatura: string; creat_el: string }
export interface ResultatImportacioActivitats {
  creades: number; actualitzades: number; sense_canvis: number; omeses: number;
  avisos: { fila: number; activitat: string; avisos: string[] }[];
}
export interface TaulaExportacio { titol: string; fitxer: string; columnes: string[]; files: (string | number | null)[][] }

// ---------- Adjudicació i places ----------
export type { EstatPlaca, ParametresAdjudicacio };

export interface ConfiguracioAdjudicacio { id: string; versio: number; parametres: ParametresAdjudicacio; creat_el: string }
export type EstatExecucio = "proposta" | "confirmada" | "substituida" | "descartada";
export interface ResumActivitatAdjudicacio {
  capacitat: number; sollicituds: number; admeses: number; llista_espera: number; per_continuitat: number; per_espera_anterior?: number;
}
export interface SorteigAplicat {
  id: string; activitat_id: string; tipus: "numero" | "lletra"; valor: string; numeracio: "inscripcio" | "aleatoria" | null;
  origen: "aplicacio" | "manual"; realitzat_el: string;
}
export interface Execucio {
  id: string; cicle_id: string; versio: number; configuracio_versio: number; estat: EstatExecucio;
  lletra_sorteig: string | null; llavor_desempat: string | null; motiu: string | null;
  resum: {
    sollicituds?: number; sollicituds_amb_placa?: number; sollicituds_sense_placa?: number; places_adjudicades?: number;
    sollicituds_fora_adjudicacio?: number; parelles_excloses?: number; parelles_continuitat?: number; parelles_espera_anterior?: number;
    sortejos?: SorteigAplicat[]; noms_activitats?: Record<string, string>;
    cicle_anterior?: { id: string; nom: string } | null; parametres?: ParametresAdjudicacio;
    activitats?: Record<string, ResumActivitatAdjudicacio>;
  };
  executada_el: string; confirmada_el: string | null; substituida_per_execucio: string | null;
}
export interface ResumAdjudicacio {
  estat_cicle: string; configuracio: ConfiguracioAdjudicacio | null; versions_configuracio: ConfiguracioAdjudicacio[];
  parametres_inicials: ParametresAdjudicacio; execucions: Execucio[]; pot_desar_parametres: boolean; pot_calcular: boolean;
}
export interface FilaResultat {
  sollicitud_id: string; activitat_id: string; preferencia: number; resultat: "admesa" | "llista_espera" | "no_adjudicada";
  posicio_espera: number | null; per_continuitat: boolean; per_espera_anterior: boolean; motiu: string | null; numero: number;
  participant: ParticipantVisible;
}
export interface PersonaSenseActivitat {
  sollicitud_id: string; numero: number; participant: ParticipantVisible; activitats_demanades: number; en_llista_espera: number;
  detall: { preferencia: number; activitat: string; resultat: FilaResultat["resultat"]; posicio_espera: number | null; motiu: string | null }[];
}
export interface DetallExecucio {
  execucio: Execucio; cicle: { id: string; nom: string; estat: string };
  grups: {
    activitat_id: string; activitat: string; capacitat: number; estat: EstatActivitat; minim_participants: number | null; sota_minim: boolean;
    resultats: FilaResultat[];
  }[];
  sense_activitat: PersonaSenseActivitat[];
  substitueix: { id: string; versio: number } | null; pot_confirmar: boolean;
}
export interface FilaPlaca {
  id: string; activitat_id: string; sollicitud_id: string; estat: EstatPlaca; posicio_espera: number | null; preferencia: number;
  versio: number; actualitzat_el: string; numero: number; participant: ParticipantVisible;
}
export interface RespostaPlaces {
  estat_cicle: string; gestionable: boolean;
  execucio_confirmada: { id: string; versio: number; confirmada_el: string } | null;
  grups: {
    activitat_id: string; activitat: string; capacitat: number; ocupades: number; lliures: number; espera: number;
    minim_participants: number | null; places: FilaPlaca[];
  }[];
}

export interface SorteigActivitat {
  id: string; activitat_id: string; activitat: string; tipus: "numero" | "lletra"; valor: string; rang_maxim: number | null;
  numeracio: "inscripcio" | "aleatoria" | null; origen: "aplicacio" | "manual"; motiu: string | null; estat: "vigent" | "anullat";
  realitzat_per_nom: string | null; realitzat_el: string; anullat_el: string | null; motiu_anullacio: string | null;
}
export interface EstatSorteig {
  estat_cicle: string; cicle: { id: string; nom: string };
  parametres: { criteri_ordre: ParametresAdjudicacio["criteri_ordre"]; tipus_sorteig: "numero" | "lletra"; numeracio_sorteig: "inscripcio" | "aleatoria" } | null;
  pot_sortejar: boolean; rang_numeros: number | null; numeros: { assignats: number; sense_numero: number };
  activitats: {
    id: string; nom: string; capacitat: number; sollicituds: number; necessita_sorteig: boolean;
    sorteig: SorteigActivitat | null; sorteig_altre_tipus: boolean;
  }[];
  historial: SorteigActivitat[];
}
export interface MovimentPlaca {
  id: number; estat_anterior: EstatPlaca | null; estat_nou: EstatPlaca; motiu: string | null; execucio_id: string | null; creat_el: string;
}

// ---------- Assistència ----------
export type { EstatAssistencia };
export interface Sessio {
  id: string; activitat_id: string; data: string; hora_inici: string | null; hora_fi: string | null;
  estat: "prevista" | "realitzada" | "cancellada"; motiu_cancellacio: string | null; versio: number; marques: number;
  tallerista_absent: 0 | 1; tallerista_motiu: string | null;
}
export interface ResumAssistencia { presents: number; absents: number; justificades: number; percentatge: number | null }
export interface PersonaAssistencia extends FilaPlaca {
  marques: Record<string, { estat: EstatAssistencia; versio: number }>; resum: ResumAssistencia; sota_llindar: boolean;
  baixa_voluntaria: { data: string; motiu: string } | null;
}
export interface FullAssistencia {
  casal: { nom: string };
  activitat: { id: string; nom: string; capacitat: number; horari: string | null; nombre_sessions: number | null; dies_setmana: number[]; data_inici: string | null; data_fi: string | null; espai: string | null; tallerista?: string | null };
  cicle: { id: string; nom: string; estat: EstatCicle; llindar_assistencia: number | null; data_inici: string; data_fi: string };
  sessions: Sessio[]; persones: PersonaAssistencia[]; espera: FilaPlaca[]; avui: string; pot_registrar: boolean; pot_crear_sessions: boolean;
}
export interface ComunicacioPlaca {
  placa_id: string; tipus: "admesa" | "espera"; canal: CanalComunicacio; estat: EstatComunicacio;
  motiu: MotiuNoContacte | null; nota: string | null; actualitzat_el: string;
}
export interface PersonaComunicacio {
  placa_id: string; sollicitud_id: string; participant_id: string; numero: number;
  situacio: "admesa" | "espera"; oferta_pendent: boolean; posicio: number | null;
  nom: string; cognoms: string; telefon: string | null; comunicacio: ComunicacioPlaca | null;
}
export interface DadesComunicacions {
  casal: string; cicle: { id: string; nom: string; estat: EstatCicle }; avui: string;
  activitats: { activitat_id: string; activitat: string; horari: string | null; espai: string | null; data_inici: string; persones: PersonaComunicacio[] }[];
}
export interface ResultatBaixaVoluntaria {
  data: string;
  missatge: { casal: string; activitat: string; horari: string | null; espai: string | null; data_inici: string | null };
  sense_oferta: string | null;
  oferta: { placa_id: string; numero: number; posicio: number | null; nom: string | null; cognom1: string | null; cognom2: string | null; telefon: string | null } | null;
  /** Oferta enviada sola per WhatsApp Business (null si el casal no el té actiu o no hi havia oferta). */
  whatsapp: { enviat: boolean; estat: string; motiu: string | null; error: string | null } | null;
}

export type IdiomaWhatsapp = "ca" | "es";
export interface ConfigWhatsapp {
  casal_id: string; phone_number_id: string; numero_visible: string | null; idioma: IdiomaWhatsapp;
  actiu: boolean; ofertes_automatiques: boolean; actualitzat_el: string;
}
export interface PlantillaMeta {
  nom: string; titol: string; categoria: string; idioma: IdiomaWhatsapp; text: string; parametres: string[]; botons: string[] | null; exemple: string;
}
export interface EstatWhatsapp {
  secrets: { testimoni: boolean; secret_app: boolean; verificacio: boolean };
  config: ConfigWhatsapp | null;
  disponible: boolean;
  plantilles: PlantillaMeta[];
}
export type EstatMissatgeWhatsapp = "pendent" | "enviat" | "entregat" | "llegit" | "fallit" | "no_enviable";
export interface MissatgeWhatsappPlaca {
  placa_id: string; plantilla: string; estat: EstatMissatgeWhatsapp; motiu: string | null; error_text: string | null;
  resposta: "si" | "no" | "text" | null; resposta_el: string | null; actualitzat_el: string;
}
export interface EnviamentWhatsapp {
  id: string; tipus: "activitat" | "general" | "oferta"; text: string | null; abast: unknown; creat_el: string; recompte: Record<string, number>;
}
export interface ResumWhatsapp {
  disponible: boolean; ofertes_automatiques: boolean; idioma: IdiomaWhatsapp; enviaments: EnviamentWhatsapp[]; missatges: MissatgeWhatsappPlaca[];
}
export interface ProgresEnviament { recompte: Record<string, number>; queden: number; aturat: string | null }
export interface ResumAssistenciaCicle {
  llindar_assistencia: number | null;
  activitats: { activitat_id: string; activitat: string; horari: string | null; admeses: number; sessions: number; realitzades: number;
    cancellades: number; nombre_sessions_previst: number | null; mitjana: number | null; sota_llindar: number }[];
}
export interface DadesGraelles {
  casal: string; cicle: string; telefon: boolean; llegenda: string;
  totals: { activitats: number; admeses: number; espera: number };
  graelles: {
    activitat_id: string; activitat: string; horari: string | null; capacitat: number; espai: string | null; data_inici: string; data_fi: string;
    sessions: { id: string; data: string }[]; columnes_buides: number;
    admeses: { ordre: number; numero: number; nom: string; cognoms: string; telefon: string | null; marques: string[] }[];
    espera: { posicio: number | null; numero: number; nom: string; cognoms: string; telefon: string | null; oferta_pendent: boolean }[];
  }[];
}

export interface IndicadorsCicle {
  cicle: { id: string; nom: string; estat: EstatCicle };
  calculat_el: string;
  inscripcions: { estat: "pendents" | "obertes" | "fora_de_termini" | "tancades"; obertura: string; tancament: string };
  adjudicacio: { estat: "sense_proposta" | "proposta" | "confirmada"; versio: number | null; data: string | null };
  totals: {
    activitats: number; activitats_no_actives: number; sollicituds: number;
    sollicituds_per_estat: { rebuda: number; validada: number; pendent_revisio: number; anullada: number };
    persones: number; places_disponibles: number; places_ocupades: number; places_lliures: number; admeses: number; espera: number; baixes_voluntaries: number;
    activitats_sense_inscripcions: number; activitats_mes_demanda: number;
  };
  activitats: {
    id: string; nom: string; capacitat: number; minim_participants: number | null; sollicituds: number; primera_preferencia: number;
    admeses: number; ofertes: number; espera: number; baixes_voluntaries: number; lliures: number; sense_inscripcions: boolean; mes_demanda: boolean;
  }[];
}

// ---------- PG-Cartells ----------
export type { CampPlantilla, EstatPlantilla, TipusPlantilla } from "../../shared/domain/cartells";
import type { CampPlantilla, Estacio, EstatPlantilla, FormatSortida, TipusPlantilla, UsFitxer } from "../../shared/domain/cartells";

export interface FitxerCartells {
  id: string; casal_id: string | null; us: UsFitxer; tipus_mime: string; mida: number; sha256: string;
  nom_original: string; pujat_per: string; pujat_el: string;
}

export interface PlantillaCartells {
  id: string; casal_id: string | null; fitxer_id: string; previsualitzacio_id: string | null; nom: string; tipus: TipusPlantilla; estacio: Estacio | null;
  linies_titol: number; amb_qr: boolean; tematica: string | null; identitat_grafica: string | null; estat: EstatPlantilla;
  pagina_amplada: number; pagina_alcada: number; format_sortida: FormatSortida; camps: CampPlantilla[];
  versio: number; creat_per: string; creat_el: string; actualitzat_el: string;
}

// ---------- Buscar usuari/a (persones de la PGEc) ----------
export interface ResumPersonaPlataforma {
  id: string;
  nom: string;
  cognoms: string;
  nom_sentit: string | null;
  document: string | null;
  data_naixement: string | null;
  localitat_naixement: string | null;
  numero_soci: string | null;
  telefon: string | null;
  origens: string[];
  coincidencies: string[];
}

export interface CercaPersonesPlataforma {
  persones: ResumPersonaPlataforma[];
  total: number;
  mes_resultats: boolean;
  resum: { total: number; darrera_importacio: string | null };
}

export interface FitxaPersonaPlataforma {
  persona: { id: string; nom: string; cognoms: string; origens: string[]; actualitzat_el: string };
  grups: { grup: string; titol: string; camps: { camp: string; etiqueta: string; valor: string; tipus: string }[] }[];
  dades_restringides: boolean;
  participacio: {
    cicle_id: string; cicle: string; data_inici: string | null; sollicituds: number[];
    activitats: { activitat_id: string; activitat: string; preferencia: number; estat: string | null; posicio_espera: number | null; sollicitud_anullada: boolean }[];
  }[];
}

export interface ResultatImportacioPersones {
  creades: number;
  actualitzades: number;
  sense_canvis: number;
  omeses: { fila: number; motiu: string }[];
}

// ---------- Comunicats de la superadministració ----------
export interface ConfigWhatsappCentral {
  phone_number_id: string; numero_visible: string | null; idioma: IdiomaWhatsapp; remitent: string; actiu: boolean; actualitzat_el: string;
}
export interface CasalComunicats {
  id: string; codi: string; nom: string; municipi: string; actiu: boolean;
  responsables: { usuari_id: string; nom_visible: string; email: string; te_mobil: boolean }[];
  /** Des de quin número reben el WhatsApp les persones del casal. */
  whatsapp: "casal" | "central" | null;
  persones: number; persones_mobil: number;
}
export interface ResumComunicat {
  id: string; assumpte: string; text: string; casal_ids: string[]; creat_el: string;
  canals: { correu_responsables: boolean; whatsapp_responsables: boolean; whatsapp_persones: boolean };
  recompte: Record<string, number>;
}
export interface EstatComunicats {
  serveis: { whatsapp: boolean; correu: boolean };
  config_central: ConfigWhatsappCentral | null;
  casals: CasalComunicats[];
  comunicats: ResumComunicat[];
}
export type MotiuComunicat = "telefon_fix" | "sense_telefon" | "telefon_invalid" | "sense_whatsapp" | "error_meta" | "sense_numero" | "sense_correu" | "error_correu" | "duplicat";
export interface EstatCanalComunicat { estat: EstatMissatgeWhatsapp; motiu: MotiuComunicat | null; error_text: string | null }
export interface ResultatComunicat {
  comunicat: { id: string; assumpte: string; text: string; creat_el: string; canals: ResumComunicat["canals"] };
  casals: {
    casal_id: string; casal: string;
    responsables: { nom: string; correu: EstatCanalComunicat | null; whatsapp: EstatCanalComunicat | null }[];
    persones: {
      total: number; contactades: number; llegides: number; pendents: number;
      no_contactades: { nom: string; telefon: string | null; tipus_telefon: string | null; motiu: MotiuComunicat | null; error_text: string | null }[];
    };
  }[];
}
export interface ComunicatCreat {
  comunicat_id: string; total: number; pendents: number;
  correu_manual: { nom: string; email: string; casal: string }[] | null;
}
