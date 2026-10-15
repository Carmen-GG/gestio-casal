/**
 * Persones usuàries de la plataforma de gestió d'equipaments (PGEc), importades des
 * dels llistats que se'n descarreguen («llistatUsuarisEquipaments» i «llistatCarnets»),
 * mentre l'aplicació no s'hi pugui connectar directament (petició de 2026-10-15).
 *
 * Cada camp té un nivell de visibilitat:
 *   - «basic»: el veu qui pot consultar sol·licituds;
 *   - «contacte»: telèfons, correu, adreça, urgències i dades del tutor/a; cal el
 *     permís de veure dades de contacte.
 * Els documents d'identitat (de la persona i del tutor/a) sempre es mostren emmascarats.
 */
import { interpretaData } from "./importacio";
import { clauOrdenacioPersona, normalitzaText } from "./ordenacio";

export type NivellCamp = "basic" | "contacte";
export type TipusCamp = "text" | "data" | "document" | "telefon";

export interface DefinicioCamp {
  etiqueta: string;
  grup: GrupCamps;
  nivell: NivellCamp;
  tipus?: TipusCamp;
  /** Capçaleres reconegudes, ja normalitzades (sense accents ni signes). */
  sinonims: string[];
}

export const GRUPS_CAMPS = {
  identificacio: "Identificació",
  naixement: "Naixement i gènere",
  equipament: "Equipament i alta",
  carnet: "Carnet",
  contacte: "Contacte",
  adreca: "Adreça",
  urgencies: "Urgències",
  autoritzacions: "Autoritzacions",
  tutor: "Tutor/a legal",
} as const;
export type GrupCamps = keyof typeof GRUPS_CAMPS;

const c = (etiqueta: string, grup: GrupCamps, nivell: NivellCamp, sinonims: string[], tipus?: TipusCamp): DefinicioCamp =>
  ({ etiqueta, grup, nivell, sinonims, tipus });

/** Adreça amb un sufix a les capçaleres (« tutor») i a les claus («tutor_»). */
const adreca = (prefix: "" | "tutor_", sufix: "" | " tutor", grup: GrupCamps, etiq: string) => ({
  [`${prefix}tipus_via`]: c(`Tipus de via${etiq}`, grup, "contacte", [`tipus de la via${sufix}`, `tipus de via${sufix}`, `tipus via${sufix}`]),
  [`${prefix}nom_via`]: c(`Nom de la via${etiq}`, grup, "contacte", [`nom de la via${sufix}`, `nom via${sufix}`, `carrer${sufix}`, `adreca${sufix}`, `direccion${sufix}`, `domicili${sufix}`]),
  [`${prefix}numero`]: c(`Número${etiq}`, grup, "contacte", [`numero${sufix}`, `num${sufix}`]),
  [`${prefix}bloc`]: c(`Bloc${etiq}`, grup, "contacte", [`bloc${sufix}`, `bloque${sufix}`]),
  [`${prefix}escala`]: c(`Escala${etiq}`, grup, "contacte", [`escala${sufix}`, `escalera${sufix}`]),
  [`${prefix}pis`]: c(`Pis${etiq}`, grup, "contacte", [`pis${sufix}`, `piso${sufix}`]),
  [`${prefix}porta`]: c(`Porta${etiq}`, grup, "contacte", [`porta${sufix}`, `puerta${sufix}`]),
  [`${prefix}codi_postal`]: c(`Codi postal${etiq}`, grup, "contacte", [`codi postal${sufix}`, `cp${sufix}`, `codigo postal${sufix}`]),
  [`${prefix}municipi`]: c(`Municipi${etiq}`, grup, "contacte", [`municipi${sufix}`, `poblacio${sufix}`, `municipio${sufix}`, `poblacion${sufix}`]),
});

/** Tots els camps que es poden importar, en l'ordre en què es mostren a la fitxa. */
export const CAMPS_PERSONA = {
  document: c("DNI/NIE o document", "identificacio", "basic", ["document", "dni", "nie", "dni nie", "nif", "document identitat", "document d identitat", "numero de document"], "document"),
  tipus_document: c("Tipus de document", "identificacio", "basic", ["tipus document", "tipus de document", "tipo documento", "tipo de documento"]),
  nom: c("Nom", "identificacio", "basic", ["nom", "nombre"]),
  cognom1: c("Primer cognom", "identificacio", "basic", ["cognom1", "primer cognom", "cognom", "apellido1", "primer apellido"]),
  cognom2: c("Segon cognom", "identificacio", "basic", ["cognom2", "segon cognom", "apellido2", "segundo apellido"]),
  nom_sentit: c("Nom sentit", "identificacio", "basic", ["nom sentit", "nom sentit o social"]),
  data_naixement: c("Data de naixement", "naixement", "basic", ["data naixement", "data de naixement", "fecha nacimiento", "fecha de nacimiento"], "data"),
  localitat_naixement: c("Localitat de naixement", "naixement", "basic", ["localitat de naixement", "localitat naixement", "lloc de naixement", "lloc naixement", "municipi de naixement", "lugar de nacimiento", "localidad de nacimiento"]),
  genere: c("Gènere", "naixement", "basic", ["genere", "genero", "sexe", "sexo"]),
  equipament_assignat: c("Equipament cívic assignat", "equipament", "basic", ["equipament civic assignat", "equipament assignat"]),
  equipament_activitat: c("Equipament cívic de l'activitat", "equipament", "basic", ["equipament civic activitat", "equipament activitat"]),
  data_alta: c("Data d'alta", "equipament", "basic", ["data alta", "data dalta", "data de alta", "fecha alta", "fecha de alta"], "data"),
  representant_legal: c("Té representant legal", "equipament", "basic", ["representant legal"]),
  tipus_carnet: c("Tipus de carnet", "carnet", "basic", ["tipus de carnet", "tipus carnet"]),
  numero_soci: c("Número de soci", "carnet", "basic", ["numero de soci", "numero soci", "num soci"]),
  equipament_carnet: c("Equipament del carnet", "carnet", "basic", ["equipament civic", "equipament"]),
  data_alta_carnet: c("Data d'alta del carnet", "carnet", "basic", ["data alta carnet"], "data"),
  data_caducitat_carnet: c("Data de caducitat del carnet", "carnet", "basic", ["data de caducitat", "data caducitat"], "data"),
  telefon_mobil: c("Telèfon mòbil", "contacte", "contacte", ["telefon mobil", "mobil", "movil", "telefono movil", "telefon", "telefono"], "telefon"),
  telefon_fix: c("Telèfon fix", "contacte", "contacte", ["telefon fix", "telefono fijo", "fix"], "telefon"),
  telefon_opcional: c("Telèfon opcional", "contacte", "contacte", ["telefon opcional", "telefono opcional", "altres telefons"], "telefon"),
  email: c("Correu electrònic", "contacte", "contacte", ["email", "correu electronic", "correu", "correo", "correo electronico", "e mail"]),
  ...adreca("", "", "adreca", ""),
  telefon_urgencia: c("Telèfon d'urgència", "urgencies", "contacte", ["telefon urgencia", "telefon d urgencia", "telefono urgencia"], "telefon"),
  persona_urgencia: c("Persona de contacte d'urgència", "urgencies", "contacte", ["persona urgencia", "persona d urgencia", "persona contacte urgencia"]),
  aut_imatges: c("Autoritza registrar imatges", "autoritzacions", "basic", ["aut registrar imatges", "autoritzacio imatges", "autoritza imatges"]),
  aut_informar: c("Autoritza rebre informació d'activitats", "autoritzacions", "basic", ["aut informar activitats", "autoritzacio informar activitats"]),
  tutor_nom: c("Nom del tutor/a", "tutor", "contacte", ["nom tutor legal", "nom tutor"]),
  tutor_cognom1: c("Primer cognom del tutor/a", "tutor", "contacte", ["cognom1 tutor legal", "primer cognom tutor legal", "cognom1 tutor"]),
  tutor_cognom2: c("Segon cognom del tutor/a", "tutor", "contacte", ["cognom2 tutor legal", "segon cognom tutor legal", "cognom2 tutor"]),
  tutor_document: c("Document del tutor/a", "tutor", "contacte", ["document tutor legal", "dni tutor legal", "document tutor"], "document"),
  tutor_telefon: c("Telèfon del tutor/a", "tutor", "contacte", ["telefon tutor legal", "telefon tutor"], "telefon"),
  tutor_email: c("Correu del tutor/a", "tutor", "contacte", ["email tutor legal", "correu tutor legal", "email tutor"]),
  tutor_telefon_urgencia: c("Telèfon d'urgència del tutor/a", "tutor", "contacte", ["telefon urgencia tutor legal", "telefon urgencia tutor"], "telefon"),
  tutor_persona_urgencia: c("Persona d'urgència del tutor/a", "tutor", "contacte", ["persona urgencia tutor legal", "persona urgencia tutor"]),
  ...adreca("tutor_", " tutor", "tutor", " (tutor/a)"),
  tutor_aut_imatges: c("Tutor/a: autoritza registrar imatges", "tutor", "contacte", ["aut registrar imatges tutor legal"]),
  tutor_aut_informar: c("Tutor/a: autoritza rebre informació", "tutor", "contacte", ["aut informar activitats tutor legal"]),
} satisfies Record<string, DefinicioCamp>;

export type CampPersona = keyof typeof CAMPS_PERSONA;
export const LLISTA_CAMPS_PERSONA = Object.keys(CAMPS_PERSONA) as CampPersona[];
export const definicio = (camp: string): DefinicioCamp | undefined => (CAMPS_PERSONA as Record<string, DefinicioCamp>)[camp];

/** Màxim de files per petició d'importació (el navegador envia el fitxer en blocs). */
export const MAX_FILES_BLOC_PERSONES = 500;
export const MAX_LLARGADA_VALOR = 300;

/**
 * Proposa el camp per a una capçalera. Al llistat de carnets, «Data d'alta» és la del
 * carnet i «Equipament cívic» és el del carnet; es reconeix pel «Número de soci».
 */
export function proposaCampPersona(capcalera: string, esCarnets: boolean): CampPersona | null {
  const n = normalitzaText(capcalera).replace(/_/g, " ");
  if (esCarnets && ["data alta", "data dalta", "data de alta"].includes(n)) return "data_alta_carnet";
  if (!esCarnets && n === "equipament civic") return "equipament_assignat";
  for (const camp of LLISTA_CAMPS_PERSONA) {
    if (camp === n.replace(/ /g, "_") || CAMPS_PERSONA[camp].sinonims.includes(n)) return camp;
  }
  return null;
}

/** El fitxer és un llistat de carnets si té la columna del número de soci. */
export const esLlistatCarnets = (capcaleres: string[]) =>
  capcaleres.some((h) => CAMPS_PERSONA.numero_soci.sinonims.includes(normalitzaText(h)));

/** Proposta de correspondència per a totes les columnes: cada camp, una sola vegada. */
export function proposaMapatgePersones(capcaleres: string[]): (CampPersona | "")[] {
  const carnets = esLlistatCarnets(capcaleres);
  const usats = new Set<string>();
  return capcaleres.map((h) => {
    const p = proposaCampPersona(h, carnets);
    if (!p || usats.has(p)) return "";
    usats.add(p);
    return p;
  });
}

/** Document normalitzat per comparar: majúscules, només lletres i xifres. */
export const normalitzaDocument = (d: string | null | undefined) => (d ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Text compacte per cercar telèfons i documents escrits amb espais o guions. */
const compacte = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

export type DadesPersona = Partial<Record<CampPersona, string>>;

/** Neteja una fila importada: només camps coneguts, text retallat i dates en AAAA-MM-DD. */
export function netejaFilaPersona(fila: Record<string, unknown>): DadesPersona {
  const dades: DadesPersona = {};
  for (const camp of LLISTA_CAMPS_PERSONA) {
    const brut = fila[camp];
    if (brut === undefined || brut === null) continue;
    let v = String(brut).replace(/\s+/g, " ").trim().slice(0, MAX_LLARGADA_VALOR);
    if (!v) continue;
    if (CAMPS_PERSONA[camp].tipus === "data") v = interpretaData(v) ?? v;
    if (CAMPS_PERSONA[camp].tipus === "document") v = normalitzaDocument(v) || v;
    dades[camp] = v;
  }
  return dades;
}

/**
 * Clau per reconèixer la mateixa persona en dues importacions: el document; si no n'hi ha,
 * nom, cognoms i data de naixement. Null si no n'hi ha prou per identificar-la.
 */
export function clauPersona(d: DadesPersona): { clau: string; per_document: boolean } | null {
  const doc = normalitzaDocument(d.document);
  if (doc.length >= 5) return { clau: `D:${doc}`, per_document: true };
  const alt = clauAlternativa(d);
  return alt ? { clau: alt, per_document: false } : null;
}

export function clauAlternativa(d: DadesPersona): string | null {
  if (!d.nom || !d.cognom1 || !d.data_naixement || !/^\d{4}-\d{2}-\d{2}$/.test(d.data_naixement)) return null;
  return `N:${clauOrdenacioPersona({ nom: d.nom, cognom1: d.cognom1, cognom2: d.cognom2 ?? null })}|${d.data_naixement}`;
}

const dataLlegible = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** Text normalitzat d'un nivell de visibilitat per a la cerca a tots els camps. */
export function textCerca(d: DadesPersona, nivell: NivellCamp): string {
  const parts: string[] = [];
  for (const camp of LLISTA_CAMPS_PERSONA) {
    const def = CAMPS_PERSONA[camp];
    const v = d[camp];
    if (!v || def.nivell !== nivell) continue;
    parts.push(normalitzaText(def.tipus === "data" ? dataLlegible(v) : v));
    if (def.tipus === "document" || def.tipus === "telefon") parts.push(compacte(v));
  }
  return ` ${parts.filter(Boolean).join(" ")} `;
}

export interface CondicionsCerca {
  /** Paraules normalitzades que han d'aparèixer totes. */
  paraules: string[];
  /** Data de naixement exacta (AAAA-MM-DD). */
  data_naixement: string | null;
}

/**
 * Interpreta el text de cerca: una data (dd/mm/aaaa) es busca com a data de naixement;
 * un document o telèfon amb espais o guions es busca tot junt; la resta, paraula per paraula.
 */
export function interpretaCerca(q: string): CondicionsCerca | null {
  const text = q.trim().slice(0, 120);
  if (!text) return null;
  const junt = compacte(text);
  const nomesData = interpretaData(text);
  if (nomesData) return { paraules: [], data_naixement: nomesData };
  if (/^\d{6,}$/.test(junt) || /^[a-z]{0,2}\d{6,8}[a-z]?$/.test(junt)) return { paraules: [junt], data_naixement: null };
  let data: string | null = null;
  const paraules: string[] = [];
  for (const t of text.split(/\s+/)) {
    const iso = interpretaData(t);
    if (iso && !data) { data = iso; continue; }
    paraules.push(...normalitzaText(t).split(" ").filter(Boolean));
  }
  const uniques = [...new Set(paraules)].slice(0, 8);
  return uniques.length || data ? { paraules: uniques, data_naixement: data } : null;
}

/** Comprova si el valor d'un camp concret conté totes les paraules de la cerca. */
export function campCoincideix(d: DadesPersona, camp: CampPersona, cond: CondicionsCerca): boolean {
  const v = d[camp];
  if (!v) return false;
  const def = CAMPS_PERSONA[camp];
  const text = ` ${normalitzaText(def.tipus === "data" ? dataLlegible(v) : v)} ${def.tipus === "document" || def.tipus === "telefon" ? compacte(v) : ""} `;
  if (cond.data_naixement && !(def.tipus === "data" && v === cond.data_naixement)) return false;
  return cond.paraules.every((p) => text.includes(p));
}
