/** Valor aleatori de 32 bytes en base64url (testimonis de sessió i d'accés). */
export function testimoniAleatori(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Resum SHA-256 en hexadecimal: és el que es desa a la base de dades. */
export async function resumSha256(valor: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Resum SHA-256 en hexadecimal del contingut d'un fitxer. */
export async function resumSha256Bytes(dades: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", dades);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Lletres i xifres sense les que es confonen (0/O, 1/I/L). */
const ALFABET_CODI = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Codi de primer accés llegible (XXXX-XXXX-XXXX, ~59 bits). Es lliura a la persona i només se'n desa el resum. */
export function codiPrimerAcces(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const lletres: string[] = [];
  // Rebuig per evitar biaix: només bytes < 248 (8 × 31).
  for (const b of bytes) if (b < 248 && lletres.length < 12) lletres.push(ALFABET_CODI[b % 31]!);
  while (lletres.length < 12) lletres.push(ALFABET_CODI[crypto.getRandomValues(new Uint8Array(1))[0]! % 31]!);
  return `${lletres.slice(0, 4).join("")}-${lletres.slice(4, 8).join("")}-${lletres.slice(8).join("")}`;
}

/** Forma canònica d'un codi escrit (majúscules, sense guions ni espais). */
export const normalitzaCodiAcces = (codi: string) => codi.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const resumCodiPrimerAcces = (codi: string) => resumSha256(`primer-acces:${normalitzaCodiAcces(codi)}`);
