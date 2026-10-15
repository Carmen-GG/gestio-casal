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
 * Plantilles de missatge. Quan el casal tingui l'API de WhatsApp Business, cada plantilla
 * s'haurà de donar d'alta a Meta amb aquest nom i aquests paràmetres, en aquest ordre;
 * el text d'aquí és el mateix que s'envia ara de manera semiautomàtica.
 */
export const PLANTILLES_WHATSAPP = {
  placa_admesa: { parametres: ["nom", "casal", "activitat", "detalls"] },
  llista_espera: { parametres: ["nom", "casal", "activitat", "detalls", "posicio"] },
  oferta_placa: { parametres: ["nom", "casal", "activitat", "detalls"] },
} as const;
export type PlantillaWhatsapp = keyof typeof PLANTILLES_WHATSAPP;

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
