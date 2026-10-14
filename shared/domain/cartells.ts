/**
 * Plantilles de PG-Cartells: les plantilles originals són formularis PDF (AcroForm)
 * amb camps amb nom. Aquí es decideix quin contingut va a cada camp («rol»).
 *
 * Les plantilles de cartell tenen noms de camp descriptius («Titular linia 1»…).
 * Les d'Instagram fan servir «Texto1..7», i el mateix nom no vol dir el mateix
 * a totes les variants: el rol es dedueix de la posició i la mida de la lletra.
 * La persona que carrega la plantilla veu els rols detectats i els pot corregir.
 */

export const TIPUS_PLANTILLA = ["cartell", "instagram"] as const;
export type TipusPlantilla = (typeof TIPUS_PLANTILLA)[number];

export const ESTACIONS = ["primavera", "estiu", "tardor", "hivern"] as const;
export type Estacio = (typeof ESTACIONS)[number];

export const ESTATS_PLANTILLA = ["esborrany", "activa", "arxivada"] as const;
export type EstatPlantilla = (typeof ESTATS_PLANTILLA)[number];

/** Format del fitxer final: els cartells es lliuren en A4 i les imatges d'Instagram en quadrat. */
export const FORMATS_SORTIDA = ["A4", "A3", "1080x1080"] as const;
export type FormatSortida = (typeof FORMATS_SORTIDA)[number];

export const ROLS_CAMP = [
  "tipus_acte", "destinataris", "titol_1", "titol_2", "titol_3", "dates", "horaris",
  "casal_1", "casal_2", "adreca", "peu", "fotografia", "logo_1", "logo_2", "qr",
] as const;
export type RolCamp = (typeof ROLS_CAMP)[number];

export const ETIQUETES_ROL: Record<RolCamp, string> = {
  tipus_acte: "Tipus d'acte",
  destinataris: "Destinataris",
  titol_1: "Títol, línia 1",
  titol_2: "Títol, línia 2",
  titol_3: "Títol, línia 3",
  dates: "Dates",
  horaris: "Horaris",
  casal_1: "Nom del casal, línia 1",
  casal_2: "Nom del casal, línia 2",
  adreca: "Adreça",
  peu: "Peu (casal i adreça)",
  fotografia: "Fotografia",
  logo_1: "Logotip 1",
  logo_2: "Logotip 2",
  qr: "Codi QR",
};

export const ROLS_IMATGE: readonly RolCamp[] = ["fotografia", "logo_1", "logo_2", "qr"];

export const ETIQUETES_ESTACIO: Record<Estacio, string> = {
  primavera: "Primavera", estiu: "Estiu", tardor: "Tardor", hivern: "Hivern",
};
export const ETIQUETES_TIPUS_PLANTILLA: Record<TipusPlantilla, string> = {
  cartell: "Cartell", instagram: "Instagram",
};
export const ETIQUETES_ESTAT_PLANTILLA: Record<EstatPlantilla, string> = {
  esborrany: "Esborrany", activa: "Activa", arxivada: "Arxivada",
};

/** Camp tal com es llegeix del PDF. Coordenades en punts PDF, origen a baix a l'esquerra. */
export interface CampPdf {
  nom: string;
  tipus: "text" | "imatge";
  x: number;
  y: number;
  amplada: number;
  alcada: number;
  /** Cos de lletra de l'aparença per defecte (DA), si n'hi ha. */
  mida_lletra: number | null;
  negreta: boolean;
  /** 0 = esquerra, 1 = centre, 2 = dreta. */
  alineacio: 0 | 1 | 2;
  /** Color RGB (0-1) del text. */
  color: [number, number, number];
}

export interface CampPlantilla extends CampPdf {
  rol: RolCamp | null;
}

const NOMS_CARTELL: Record<string, RolCamp> = {
  "tipus d'acte": "tipus_acte",
  destinataris: "destinataris",
  "titular linia 1": "titol_1",
  "titular linia 2": "titol_2",
  "titular linia 3": "titol_3",
  dates: "dates",
  horaris: "horaris",
  "nom cc1": "casal_1",
  "nom cc2": "casal_2",
  "adreça": "adreca",
  imatge_af_image: "fotografia",
  logo_af_image1: "logo_1",
  logo_af_image2: "logo_2",
  "codi qr": "qr",
};

/**
 * Proposa el rol d'un camp. Primer pel nom; si el nom no és descriptiu (Texto1..7),
 * per la posició relativa a la pàgina i la mida de la lletra, com a les plantilles d'Instagram.
 */
export function proposaRol(camp: CampPdf, alcadaPagina: number): RolCamp | null {
  const perNom = NOMS_CARTELL[camp.nom.trim().toLowerCase()];
  if (perNom) return perNom;
  if (camp.tipus !== "text" || !/^texto\d+$/i.test(camp.nom.trim())) return null;

  const baix = camp.y / alcadaPagina;
  const dalt = (camp.y + camp.alcada) / alcadaPagina;
  const mida = (camp.mida_lletra ?? 0) / alcadaPagina;
  if (baix > 0.74) return "tipus_acte";
  if (baix > 0.7) return "destinataris";
  if (mida >= 0.088) return "titol_1"; // titular d'una sola línia, lletra molt gran
  if (mida >= 0.07) return baix > 0.64 ? "titol_1" : "titol_2";
  if (dalt < 0.1) return "peu";
  return camp.negreta ? "dates" : "horaris";
}

/** Assigna un rol a cada camp i evita que dos camps tinguin el mateix rol. */
export function assignaRols(camps: CampPdf[], alcadaPagina: number): CampPlantilla[] {
  const usats = new Set<RolCamp>();
  return camps.map((c) => {
    const rol = proposaRol(c, alcadaPagina);
    if (!rol || usats.has(rol)) return { ...c, rol: null };
    usats.add(rol);
    return { ...c, rol };
  });
}

export interface MetadadesNom {
  tipus: TipusPlantilla;
  estacio: Estacio | null;
  linies_titol: 1 | 2 | 3;
  amb_qr: boolean;
}

/**
 * Llegeix el tipus, l'estació, les línies de títol i el QR del nom original del fitxer
 * (p. ex. «base_tardor_DSI_QR_2L_IG.pdf»). Retorna null si el nom no segueix aquest patró.
 */
export function metadadesDelNom(nomFitxer: string): MetadadesNom | null {
  const nom = nomFitxer.toLowerCase().replace(/\.pdf$/, "");
  const tipus = /_ig$/.test(nom) ? "instagram" : /_car$/.test(nom) ? "cartell" : null;
  const linies = /_([123])l_/.exec(nom)?.[1];
  if (!tipus || !linies) return null;
  const estacio = ESTACIONS.find((e) => nom.includes(`_${e}_`)) ?? null;
  return { tipus, estacio, linies_titol: Number(linies) as 1 | 2 | 3, amb_qr: /_qr_/.test(nom) };
}

/** Nom llegible d'una plantilla a partir de les seves metadades. */
export function nomPlantilla(m: MetadadesNom): string {
  const parts = [ETIQUETES_TIPUS_PLANTILLA[m.tipus]];
  if (m.estacio) parts.push(ETIQUETES_ESTACIO[m.estacio].toLowerCase());
  parts.push(m.linies_titol === 1 ? "títol d'1 línia" : `títol de ${m.linies_titol} línies`);
  if (m.amb_qr) parts.push("amb QR");
  return parts.join(" · ");
}

/** Comprovacions perquè una plantilla es pugui fer servir per generar materials. */
export function avisosPlantilla(camps: CampPlantilla[], liniesTitol: number, ambQr: boolean): string[] {
  const rols = new Set(camps.map((c) => c.rol).filter(Boolean));
  const avisos: string[] = [];
  for (let i = 1; i <= liniesTitol; i++) {
    if (!rols.has(`titol_${i}` as RolCamp)) avisos.push(`No hi ha cap camp per a la línia ${i} del títol.`);
  }
  if (!rols.has("fotografia")) avisos.push("No hi ha cap camp per a la fotografia.");
  if (ambQr && !rols.has("qr")) avisos.push("La plantilla és de QR però no hi ha cap camp per al codi QR.");
  return avisos;
}

/** Tipus de fitxer acceptats i mida màxima per a cada ús. */
export const USOS_FITXER = ["plantilla", "previsualitzacio", "fotografia", "logotip", "material"] as const;
export type UsFitxer = (typeof USOS_FITXER)[number];

export const TIPUS_MIME_PER_US: Record<UsFitxer, readonly string[]> = {
  plantilla: ["application/pdf"],
  previsualitzacio: ["image/png", "image/jpeg"],
  fotografia: ["image/jpeg", "image/png"],
  logotip: ["image/png", "image/jpeg"],
  material: ["application/pdf", "image/png", "image/jpeg"],
};

export const MIDA_MAXIMA_FITXER: Record<UsFitxer, number> = {
  plantilla: 15 * 1024 * 1024,
  previsualitzacio: 2 * 1024 * 1024,
  fotografia: 10 * 1024 * 1024,
  logotip: 2 * 1024 * 1024,
  material: 20 * 1024 * 1024,
};
