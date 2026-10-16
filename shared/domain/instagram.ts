/**
 * Publicacions d'Instagram a partir dels materials de PG-Cartells.
 * L'aplicació no publica mai sola: una persona revisa la imatge i el text i ho confirma.
 */
import type { TextosMaterial } from "./cartells-contingut";

export const ESTATS_PUBLICACIO = ["esborrany", "publicant", "publicada", "error", "publicada_manualment", "descartada"] as const;
export type EstatPublicacio = (typeof ESTATS_PUBLICACIO)[number];

export const ETIQUETES_ESTAT_PUBLICACIO: Record<EstatPublicacio, string> = {
  esborrany: "Pendent de publicar",
  publicant: "S'està publicant",
  publicada: "Publicada",
  error: "No s'ha pogut publicar",
  publicada_manualment: "Publicada a mà",
  descartada: "Descartada",
};

/** Estats en què encara es pot editar el text i publicar. */
export const ESTATS_EDITABLES: readonly EstatPublicacio[] = ["esborrany", "error"];

/** Límits del text d'una publicació d'Instagram. */
export const MAXIM_CARACTERS_PEU = 2200;
export const MAXIM_ETIQUETES = 30;
export const MAXIM_MENCIONS = 20;

export const compteEtiquetes = (text: string) => (text.match(/(^|[^\p{L}\p{N}_&])#[\p{L}\p{N}_]+/gu) ?? []).length;
export const compteMencions = (text: string) => (text.match(/(^|[^\p{L}\p{N}_])@[\p{L}\p{N}_.]+/gu) ?? []).length;

/** Problemes del text que Instagram rebutjaria; llista buida si és correcte. */
export function errorsPeu(text: string): string[] {
  const errors: string[] = [];
  if ([...text].length > MAXIM_CARACTERS_PEU) errors.push(`El text no pot passar de ${MAXIM_CARACTERS_PEU} caràcters.`);
  if (compteEtiquetes(text) > MAXIM_ETIQUETES) errors.push(`Instagram admet com a màxim ${MAXIM_ETIQUETES} etiquetes (#).`);
  if (compteMencions(text) > MAXIM_MENCIONS) errors.push(`Instagram admet com a màxim ${MAXIM_MENCIONS} mencions (@).`);
  return errors;
}

/**
 * Text proposat per a la publicació a partir dels textos del material: títol, dates,
 * horari, lloc i l'adreça d'inscripció. Es pot editar abans de publicar.
 */
export function peuPerDefecte(textos: TextosMaterial, opcions: { casal: string; urlInscripcio?: string | null }): string {
  const titol = [textos.titol_1, textos.titol_2, textos.titol_3].map((t) => t?.trim()).filter(Boolean).join(" ");
  const detalls = [
    textos.destinataris?.trim() ? `👥 ${textos.destinataris.trim()}` : "",
    textos.dates?.trim() ? `📅 ${textos.dates.trim()}` : "",
    textos.horaris?.trim() ? `🕒 ${textos.horaris.trim()}` : "",
    `📍 ${[opcions.casal, textos.adreca?.trim()].filter(Boolean).join(", ")}`,
  ].filter(Boolean);
  return [
    [textos.tipus_acte?.trim(), titol].filter(Boolean).join(": "),
    detalls.join("\n"),
    opcions.urlInscripcio ? `Inscripcions: ${opcions.urlInscripcio}` : "",
  ].filter(Boolean).join("\n\n");
}
