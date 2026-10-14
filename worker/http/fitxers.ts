import { ErrorAplicacio } from "./errors";

/**
 * Llegeix el cos binari d'una petició sense superar `maxim` bytes, tant si la petició
 * indica la mida (Content-Length) com si no. Així un fitxer massa gran no s'arriba a carregar sencer.
 */
export async function llegeixFitxer(peticio: Request, maxim: number): Promise<Uint8Array> {
  const massaGran = () => new ErrorAplicacio(413, "fitxer_massa_gran", "El fitxer supera la mida màxima permesa.");
  const declarada = peticio.headers.get("Content-Length");
  if (declarada !== null && (!Number.isFinite(Number(declarada)) || Number(declarada) > maxim)) throw massaGran();
  if (!peticio.body) return new Uint8Array();
  const lector = peticio.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxim) {
      await lector.cancel();
      throw massaGran();
    }
    parts.push(value);
  }
  const resultat = new Uint8Array(total);
  let posicio = 0;
  for (const p of parts) {
    resultat.set(p, posicio);
    posicio += p.byteLength;
  }
  return resultat;
}
