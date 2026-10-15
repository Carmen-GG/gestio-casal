/**
 * Contrasenyes del panell: resum PBKDF2-SHA256 amb sal aleatòria (WebCrypto).
 * Format desat: `pbkdf2-sha256$<iteracions>$<sal base64>$<resum base64>`.
 * 100.000 iteracions és el màxim que admet Cloudflare Workers.
 */
const ITERACIONS = 100_000;
const BYTES_SAL = 16;
const BITS_RESUM = 256;

export const LLARGADA_MINIMA_CONTRASENYA = 12;
export const LLARGADA_MAXIMA_CONTRASENYA = 200;

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const deB64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

async function deriva(contrasenya: string, sal: Uint8Array, iteracions: number): Promise<Uint8Array> {
  const clau = await crypto.subtle.importKey("raw", new TextEncoder().encode(contrasenya), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracions }, clau, BITS_RESUM);
  return new Uint8Array(bits);
}

export async function resumContrasenya(contrasenya: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  return `pbkdf2-sha256$${ITERACIONS}$${b64(sal)}$${b64(await deriva(contrasenya, sal, ITERACIONS))}`;
}

/** Sal fixa per fer el mateix càlcul quan l'usuari no existeix (no revela si el correu hi és pel temps de resposta). */
const SAL_FICTICIA = new Uint8Array(BYTES_SAL);

export async function comprovaContrasenya(contrasenya: string, desat: string | null): Promise<boolean> {
  const parts = desat?.split("$");
  if (!parts || parts.length !== 4 || parts[0] !== "pbkdf2-sha256") {
    await deriva(contrasenya, SAL_FICTICIA, ITERACIONS);
    return false;
  }
  const iteracions = Number(parts[1]);
  if (!Number.isInteger(iteracions) || iteracions < 1 || iteracions > ITERACIONS) return false;
  const esperat = deB64(parts[3]!);
  const obtingut = await deriva(contrasenya, deB64(parts[2]!), iteracions);
  if (esperat.length !== obtingut.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperat.length; i++) diferencia |= esperat[i]! ^ obtingut[i]!;
  return diferencia === 0;
}
