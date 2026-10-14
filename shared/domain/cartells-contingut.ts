/**
 * Textos per defecte dels materials de PG-Cartells a partir de les dades d'una activitat.
 * Són només una proposta: la persona que fa el material els pot editar abans de generar-lo,
 * i els canvis no modifiquen mai l'activitat.
 */
import type { RolCamp } from "./cartells";

export const ROLS_TEXT = [
  "tipus_acte", "destinataris", "titol_1", "titol_2", "titol_3", "dates", "horaris",
  "casal_1", "casal_2", "adreca", "peu",
] as const satisfies readonly RolCamp[];
export type RolText = (typeof ROLS_TEXT)[number];
export type TextosMaterial = Partial<Record<RolText, string>>;

export interface DadesActivitatMaterial {
  nom: string;
  categoria: string | null;
  dies_setmana: number[];
  hora_inici: string | null;
  hora_fi: string | null;
  horari_text: string | null;
  data_inici: string | null;
  data_fi: string | null;
}
export interface DadesCasalMaterial { nom: string; municipi: string; adreca: string | null }
export interface DadesCicleMaterial { data_inici: string; data_fi: string }

const MESOS = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"];
const DIES = ["", "dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte", "diumenge"];

const majuscula = (t: string) => (t ? t[0]!.toLocaleUpperCase("ca") + t.slice(1) : t);
const llista = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} i ${parts.at(-1)}` : (parts[0] ?? ""));

/** «12 de gener», «1 d'octubre» (apostrofació davant de vocal). */
function diaMes(dia: number, mes: number): string {
  const nom = MESOS[mes - 1]!;
  return `${dia} ${/^[aeiou]/.test(nom) ? "d'" : "de "}${nom}`;
}

function parteixData(data: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mes >= 1 && mes <= 12 && d >= 1 && d <= 31 ? [a, mes, d] : null;
}

/** «Del 12 de gener al 23 de març de 2027»; l'any del començament només si és diferent. */
export function textDates(inici: string | null, fi: string | null): string {
  const a = inici ? parteixData(inici) : null;
  const b = fi ? parteixData(fi) : null;
  if (!a && !b) return "";
  if (!a || !b || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2])) {
    const [any, mes, dia] = (a ?? b)!;
    return majuscula(`${diaMes(dia, mes)} de ${any}`);
  }
  const des = a[0] === b[0] ? diaMes(a[2], a[1]) : `${diaMes(a[2], a[1])} de ${a[0]}`;
  // L'1 i l'11 es llegeixen «u» i «onze»: «De l'1 d'abril a l'11 de maig».
  const prep = a[2] === 1 || a[2] === 11 ? "De l'" : "Del ";
  const fins = b[2] === 1 || b[2] === 11 ? "a l'" : "al ";
  return `${prep}${des} ${fins}${diaMes(b[2], b[1])} de ${b[0]}`;
}

/** Hora «10:00» en notació catalana «10.00». */
const hora = (h: string) => h.slice(0, 5).replace(":", ".");

/** «Dilluns i dimecres, de 10.00 a 11.30 h». Si l'activitat té un horari escrit a mà, es fa servir aquest. */
export function textHorari(a: Pick<DadesActivitatMaterial, "dies_setmana" | "hora_inici" | "hora_fi" | "horari_text">): string {
  if (a.horari_text?.trim()) return a.horari_text.trim();
  const dies = llista(a.dies_setmana.map((d) => DIES[d] ?? "").filter(Boolean));
  const hores = a.hora_inici && a.hora_fi ? `de ${hora(a.hora_inici)} a ${hora(a.hora_fi)} h`
    : a.hora_inici ? `a les ${hora(a.hora_inici)} h` : "";
  return majuscula([dies, hores].filter(Boolean).join(", "));
}

/**
 * Reparteix un text en `n` línies tan iguals com es pugui (sense partir paraules).
 * Si hi ha menys paraules que línies, les darreres queden buides.
 */
export function reparteixLinies(text: string, n: number): string[] {
  const paraules = text.trim().split(/\s+/).filter(Boolean);
  if (n <= 1 || paraules.length <= 1) return [paraules.join(" "), ...Array<string>(Math.max(0, n - 1)).fill("")];
  if (paraules.length <= n) return [...paraules, ...Array<string>(n - paraules.length).fill("")];
  let millor: string[] = [];
  let millorMax = Infinity;
  // Prova tots els talls possibles (els títols tenen poques paraules).
  const prova = (inici: number, resten: number, acc: string[]) => {
    if (resten === 1) {
      const linies = [...acc, paraules.slice(inici).join(" ")];
      const max = Math.max(...linies.map((l) => l.length));
      if (max < millorMax) { millorMax = max; millor = linies; }
      return;
    }
    for (let fi = inici + 1; fi <= paraules.length - resten + 1; fi++) prova(fi, resten - 1, [...acc, paraules.slice(inici, fi).join(" ")]);
  };
  prova(0, n, []);
  return millor;
}

/** Nom del casal en dues línies: si el nom conté el municipi, es talla just abans. */
export function liniesNomCasal(nom: string, municipi: string): [string, string] {
  const i = municipi ? nom.indexOf(municipi) : -1;
  if (i > 0) return [nom.slice(0, i).trim(), nom.slice(i).trim()];
  const [a = "", b = ""] = reparteixLinies(nom, 2);
  return [a, b];
}

export function textAdreca(casal: DadesCasalMaterial): string {
  const adreca = casal.adreca?.trim() ?? "";
  if (!adreca) return casal.municipi;
  return adreca.toLocaleLowerCase("ca").includes(casal.municipi.toLocaleLowerCase("ca")) ? adreca : `${adreca} · ${casal.municipi}`;
}

/** Proposta de textos per a una plantilla amb `liniesTitol` línies de títol. */
export function textosPerDefecte(d: {
  activitat: DadesActivitatMaterial | null;
  cicle: DadesCicleMaterial | null;
  casal: DadesCasalMaterial;
  liniesTitol: number;
}): TextosMaterial {
  const [casal_1, casal_2] = liniesNomCasal(d.casal.nom, d.casal.municipi);
  const adreca = textAdreca(d.casal);
  const textos: TextosMaterial = { casal_1, casal_2, adreca, peu: `${d.casal.nom}\n${adreca}` };
  const a = d.activitat;
  if (!a) return textos;
  const titol = reparteixLinies(a.nom, Math.min(3, Math.max(1, d.liniesTitol)));
  titol.forEach((l, i) => { textos[`titol_${i + 1}` as RolText] = l; });
  textos.tipus_acte = a.categoria?.trim().toLocaleUpperCase("ca") ?? "";
  textos.destinataris = "";
  textos.dates = textDates(a.data_inici ?? d.cicle?.data_inici ?? null, a.data_fi ?? d.cicle?.data_fi ?? null);
  textos.horaris = textHorari(a);
  return textos;
}

/**
 * Adreça per al codi QR: només una adreça web (http o https) sense dades personals.
 * Retorna el missatge d'error o null si és vàlida.
 */
export function errorUrlQr(url: string): string | null {
  const valor = url.trim();
  if (!valor) return "Indiqueu l'adreça del codi QR.";
  if (valor.length > 300) return "L'adreça és massa llarga per a un codi QR llegible.";
  let u: URL;
  try { u = new URL(valor); } catch { return "No és una adreça web vàlida."; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "L'adreça ha de començar per https://.";
  if (u.username || u.password) return "L'adreça no pot incloure usuari ni contrasenya.";
  return null;
}

/** Nom de fitxer segur a partir d'un text («Ioga suau» → «ioga-suau»). */
export function slugFitxer(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/l·l/gi, "ll").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "material";
}
