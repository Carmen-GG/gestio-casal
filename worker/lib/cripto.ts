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
