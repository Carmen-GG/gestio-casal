/**
 * Ordenació alfabètica de persones en català i castellà.
 *
 * La base de dades no té col·lacions per a català, de manera que el servidor
 * calcula una clau normalitzada (`clau_ordenacio`) que es pot ordenar byte a byte:
 *   - minúscules i sense diacrítics (à, é, ï, ñ, ç...);
 *   - "l·l" (i variants amb punt o guionet) es tracta com "ll";
 *   - apòstrofs eliminats (d'Alòs → dalos);
 *   - separador de camps inferior a qualsevol lletra o espai, perquè
 *     "Garcia" vagi abans que "Garcia López".
 * Ordre: primer cognom, segon cognom, nom.
 */
const SEPARADOR = "\u0001";

export function normalitzaText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/l[·.‧⋅-]l/g, "ll")
    .replace(/['’`´]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function clauOrdenacioPersona(p: { cognom1: string; cognom2?: string | null; nom: string }): string {
  return [normalitzaText(p.cognom1), normalitzaText(p.cognom2), normalitzaText(p.nom)].join(SEPARADOR);
}

/** Comparador per a llistes ja carregades (frontend i exportacions). */
export function comparaPersones(
  a: { cognom1: string; cognom2?: string | null; nom: string },
  b: { cognom1: string; cognom2?: string | null; nom: string },
): number {
  const ka = clauOrdenacioPersona(a);
  const kb = clauOrdenacioPersona(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}
