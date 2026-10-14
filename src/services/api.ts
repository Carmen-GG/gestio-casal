/**
 * Client HTTP únic de l'aplicació. Centralitza:
 *  - el format d'errors de l'API (codi estable + missatge comprensible);
 *  - els errors de connexió i els temps d'espera;
 *  - que mai es mostrin errors tècnics a l'usuari.
 * L'API és al mateix origen (/api), de manera que no cal configurar cap URL ni secret.
 */
import type { ErrorApi } from "../../shared/api/public";

export class ErrorClientApi extends Error {
  constructor(
    readonly status: number,
    readonly codi: string,
    readonly missatgeUsuari: string,
    readonly idPeticio?: string,
  ) {
    super(codi);
  }
}

const TEMPS_MAXIM_MS = 15_000;

async function peticio<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const control = new AbortController();
  const temporitzador = setTimeout(() => control.abort(), TEMPS_MAXIM_MS);
  let resposta: Response;
  try {
    resposta = await fetch(`/api${ruta}`, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
      signal: init.signal ?? control.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError" && !init.signal?.aborted) {
      throw new ErrorClientApi(0, "temps_esgotat", "El servidor no respon. Comproveu la connexió i torneu-ho a provar.");
    }
    if ((e as Error).name === "AbortError") throw e;
    throw new ErrorClientApi(0, "sense_connexio", "No s'ha pogut connectar amb el servidor. Comproveu la connexió a internet.");
  } finally {
    clearTimeout(temporitzador);
  }

  const esJson = resposta.headers.get("Content-Type")?.includes("application/json");
  const cos: unknown = esJson ? await resposta.json().catch(() => null) : null;

  if (!resposta.ok) {
    const err = (cos as ErrorApi | null)?.error;
    throw new ErrorClientApi(
      resposta.status,
      err?.codi ?? "error_desconegut",
      err?.missatge ?? "S'ha produït un error inesperat. Torneu-ho a provar més tard.",
      err?.id_peticio,
    );
  }
  if (!esJson) {
    throw new ErrorClientApi(resposta.status, "resposta_invalida", "El servidor ha retornat una resposta inesperada.");
  }
  return cos as T;
}

export const api = {
  get: <T>(ruta: string, signal?: AbortSignal) => peticio<T>(ruta, { method: "GET", signal }),
};
