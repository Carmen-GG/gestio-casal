/**
 * Avís per WhatsApp a la persona que rep una plaça de la llista d'espera.
 *
 * L'enviament automàtic des del WhatsApp Business del casal necessita l'API de
 * WhatsApp Business de Meta (número registrat, plantilles aprovades). Mentre no hi
 * sigui, l'aplicació prepara el missatge i obre WhatsApp amb el text escrit: la
 * persona del casal només ha de prémer «Envia».
 */

export type TipusTelefon = "mobil" | "fix" | "estranger" | "sense" | "invalid";

export interface TelefonAnalitzat {
  tipus: TipusTelefon;
  /** Número internacional sense «+» ni espais, apte per a wa.me. Null si no es pot fer servir. */
  internacional: string | null;
}

/**
 * Classifica un telèfon: mòbil espanyol (6 o 7), fix espanyol (8 o 9), estranger
 * (amb prefix internacional diferent de +34) o sense número. Un fix no té WhatsApp.
 */
export function analitzaTelefon(telefon: string | null | undefined): TelefonAnalitzat {
  const net = (telefon ?? "").replace(/[\s().-]/g, "");
  if (!net) return { tipus: "sense", internacional: null };
  let digits = net.startsWith("+") ? net.slice(1) : net.startsWith("00") ? net.slice(2) : null;
  if (digits === null) {
    if (!/^\d{9}$/.test(net)) return { tipus: "invalid", internacional: null };
    digits = `34${net}`;
  }
  if (!/^\d{8,15}$/.test(digits)) return { tipus: "invalid", internacional: null };
  if (!digits.startsWith("34")) return { tipus: "estranger", internacional: digits };
  const nacional = digits.slice(2);
  if (!/^\d{9}$/.test(nacional)) return { tipus: "invalid", internacional: null };
  if (/^[67]/.test(nacional)) return { tipus: "mobil", internacional: digits };
  if (/^[89]/.test(nacional)) return { tipus: "fix", internacional: null };
  return { tipus: "invalid", internacional: null };
}

export interface DadesMissatgeOferta {
  nom: string;
  casal: string;
  activitat: string;
  horari: string | null;
  espai: string | null;
  data_inici: string | null;
}

const dataLlegible = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const detallsActivitat = (d: DadesMissatgeOferta) =>
  [d.horari, d.espai ? `aula ${d.espai}` : null, d.data_inici ? `a partir del ${dataLlegible(d.data_inici)}` : null].filter(Boolean).join(", ");

/**
 * Plantilles de WhatsApp Business. Cada plantilla s'ha de donar d'alta a Meta (WhatsApp
 * Manager → Plantilles de missatge) amb aquest nom, categoria «Utilitat», l'idioma del
 * casal i exactament aquest text; {{1}}, {{2}}… són els paràmetres, en aquest ordre.
 * Meta no accepta paràmetres buits ni amb salts de línia: es netegen abans d'enviar.
 */
export const PLANTILLES_WHATSAPP = {
  placa_admesa: {
    titol: "Plaça adjudicada",
    parametres: ["nom", "casal", "activitat", "detalls"],
    text: {
      ca: "Hola, {{1}}!\n\nUs escrivim del {{2}}. Teniu plaça a l'activitat «{{3}}» ({{4}}).\n\nSi finalment no hi podeu venir, digueu-nos-ho per poder oferir la plaça a una altra persona.\n\nUs hi esperem!",
      es: "¡Hola, {{1}}!\n\nOs escribimos del {{2}}. Tenéis plaza en la actividad «{{3}}» ({{4}}).\n\nSi finalmente no podéis venir, decídnoslo para poder ofrecer la plaza a otra persona.\n\n¡Os esperamos!",
    },
    botons: null,
  },
  llista_espera: {
    titol: "Llista d'espera",
    parametres: ["nom", "casal", "activitat", "detalls", "posicio"],
    text: {
      ca: "Hola, {{1}}!\n\nUs escrivim del {{2}}. De moment no hi ha plaça a l'activitat «{{3}}» ({{4}}) i heu quedat en llista d'espera amb el número {{5}}.\n\nSi s'allibera una plaça, us avisarem per aquest mateix mitjà.\n\nGràcies!",
      es: "¡Hola, {{1}}!\n\nOs escribimos del {{2}}. De momento no hay plaza en la actividad «{{3}}» ({{4}}) y habéis quedado en lista de espera con el número {{5}}.\n\nSi se libera una plaza, os avisaremos por este mismo medio.\n\n¡Gracias!",
    },
    botons: null,
  },
  oferta_placa: {
    titol: "Oferta de plaça (llista d'espera)",
    parametres: ["nom", "casal", "activitat", "detalls"],
    text: {
      ca: "Hola, {{1}}!\n\nUs escrivim del {{2}}. S'ha alliberat una plaça a l'activitat «{{3}}» ({{4}}) i sou la persona següent de la llista d'espera.\n\nLa voleu?",
      es: "¡Hola, {{1}}!\n\nOs escribimos del {{2}}. Se ha liberado una plaza en la actividad «{{3}}» ({{4}}) y sois la siguiente persona de la lista de espera.\n\n¿La queréis?",
    },
    botons: { ca: ["Sí, la vull", "No, gràcies"], es: ["Sí, la quiero", "No, gracias"] },
  },
  sollicitud_rebuda: {
    titol: "Sol·licitud rebuda",
    parametres: ["nom", "casal", "cicle", "codi"],
    text: {
      ca: "Hola, {{1}}!\n\nUs escrivim del {{2}}. Hem rebut la vostra sol·licitud d'inscripció al cicle «{{3}}». El codi de confirmació és {{4}}.\n\nAixò encara no és l'adjudicació de places: us avisarem quan estigui feta.\n\nGràcies!",
      es: "¡Hola, {{1}}!\n\nOs escribimos del {{2}}. Hemos recibido vuestra solicitud de inscripción al ciclo «{{3}}». El código de confirmación es {{4}}.\n\nEsto todavía no es la adjudicación de plazas: os avisaremos cuando esté hecha.\n\n¡Gracias!",
    },
    botons: null,
  },
  avis_general: {
    titol: "Comunicació general",
    parametres: ["nom", "casal", "text"],
    text: {
      ca: "Hola, {{1}}!\n\nUs escrivim del {{2}}:\n\n{{3}}\n\nGràcies!",
      es: "¡Hola, {{1}}!\n\nOs escribimos del {{2}}:\n\n{{3}}\n\n¡Gracias!",
    },
    botons: null,
  },
} as const;
export type PlantillaWhatsapp = keyof typeof PLANTILLES_WHATSAPP;
export type IdiomaWhatsapp = "ca" | "es";
export const NOMS_PLANTILLES = Object.keys(PLANTILLES_WHATSAPP) as PlantillaWhatsapp[];

/** Meta no admet salts de línia, tabuladors ni més de 4 espais seguits dins d'un paràmetre, ni paràmetres buits. */
export function netejaParametre(v: string | number | null | undefined, maxim = 400): string {
  const net = String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, maxim);
  return net || "-";
}

/** Detalls de l'activitat per a les plantilles: horari, aula i data d'inici. */
export const detallsPlantilla = (d: Pick<DadesMissatgeOferta, "horari" | "espai" | "data_inici">, idioma: IdiomaWhatsapp = "ca") =>
  [d.horari, d.espai ? `aula ${d.espai}` : null, d.data_inici ? `a partir del ${dataLlegible(d.data_inici)}` : null].filter(Boolean).join(", ")
  || (idioma === "es" ? "consultad el horario en el casal" : "consulteu l'horari al casal");

/** Text final d'una plantilla amb els paràmetres (el mateix que rebrà la persona). */
export function textPlantilla(plantilla: PlantillaWhatsapp, idioma: IdiomaWhatsapp, parametres: string[]): string {
  return PLANTILLES_WHATSAPP[plantilla].text[idioma].replace(/\{\{(\d+)\}\}/g, (_, n: string) => parametres[Number(n) - 1] ?? "");
}

/** Missatge per a una persona admesa en una activitat. */
export function missatgeAdmissio(d: DadesMissatgeOferta): string {
  const detalls = detallsActivitat(d);
  return [
    `Hola, ${d.nom.trim()}!`,
    `Us escrivim del ${d.casal}. Teniu plaça a l'activitat «${d.activitat}»${detalls ? ` (${detalls})` : ""}.`,
    "Si finalment no hi podeu venir, digueu-nos-ho per poder oferir la plaça a una altra persona.",
    "Us hi esperem!",
  ].join("\n\n");
}

/** Missatge per a una persona que ha quedat en llista d'espera d'una activitat. */
export function missatgeEspera(d: DadesMissatgeOferta & { posicio: number | null }): string {
  const detalls = detallsActivitat(d);
  return [
    `Hola, ${d.nom.trim()}!`,
    `Us escrivim del ${d.casal}. De moment no hi ha plaça a l'activitat «${d.activitat}»${detalls ? ` (${detalls})` : ""}`
      + ` i heu quedat en llista d'espera${d.posicio ? ` amb el número ${d.posicio}` : ""}.`,
    "Si s'allibera una plaça, us avisarem per aquest mateix mitjà.",
    "Gràcies!",
  ].join("\n\n");
}

/** Text del missatge d'oferta de plaça. El casal el pot retocar a WhatsApp abans d'enviar-lo. */
export function missatgeOferta(d: DadesMissatgeOferta): string {
  const detalls = detallsActivitat(d);
  return [
    `Hola, ${d.nom.trim()}!`,
    `Us escrivim del ${d.casal}. S'ha alliberat una plaça a l'activitat «${d.activitat}»${detalls ? ` (${detalls})` : ""}`
      + " i sou la persona següent de la llista d'espera.",
    "Ens podeu confirmar si la voleu? Si no la necessiteu, digueu-nos-ho i la passarem a la persona següent.",
    "Gràcies!",
  ].join("\n\n");
}

/** Enllaç que obre WhatsApp (mòbil o web) amb el missatge preparat. */
export const enllacWhatsapp = (internacional: string, text: string) =>
  `https://wa.me/${internacional}?text=${encodeURIComponent(text)}`;
