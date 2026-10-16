/**
 * Xifratge simètric (AES-GCM) de secrets que l'aplicació ha de poder tornar a llegir,
 * com el testimoni d'accés del compte d'Instagram d'un casal. La clau és un secret del
 * Worker (INSTAGRAM_CLAU) i no es desa mai a la base de dades.
 */
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function clauAes(secret: string, us: string): Promise<CryptoKey> {
  // La clau es deriva del secret i de l'ús: el mateix secret no xifra dues coses diferents igual.
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode(us) },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function xifra(text: string, secret: string, us: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const xifrat = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await clauAes(secret, us), new TextEncoder().encode(text));
  return `${b64url(iv)}.${b64url(new Uint8Array(xifrat))}`;
}

export async function desxifra(valor: string, secret: string, us: string): Promise<string> {
  const [iv, dades] = valor.split(".");
  if (!iv || !dades) throw new Error("valor_xifrat_no_valid");
  const pla = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64url(iv) }, await clauAes(secret, us), deB64url(dades));
  return new TextDecoder().decode(pla);
}
