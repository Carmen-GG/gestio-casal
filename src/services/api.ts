/**
 * Client HTTP únic de l'aplicació. Centralitza:
 *  - el format d'errors de l'API (codi estable + missatge comprensible + errors per camp);
 *  - els errors de connexió i els temps d'espera;
 *  - que mai es mostrin errors tècnics a l'usuari.
 * L'API és al mateix origen (/api): la galeta de sessió viatja automàticament i
 * no cal cap URL ni secret al frontend.
 */
import type { ErrorApi } from "../../shared/api/public";

export class ErrorClientApi extends Error {
  constructor(
    readonly status: number,
    readonly codi: string,
    readonly missatgeUsuari: string,
    readonly idPeticio?: string,
    readonly detalls?: unknown,
  ) {
    super(codi);
  }

  /** Errors de validació per camp retornats pel servidor, si n'hi ha. */
  get errorsCamps(): Record<string, string> {
    return this.detalls && typeof this.detalls === "object" ? (this.detalls as Record<string, string>) : {};
  }
}

const TEMPS_MAXIM_MS = 15_000;

async function peticio<T>(ruta: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...resta } = init;
  const control = new AbortController();
  const temporitzador = setTimeout(() => control.abort(), TEMPS_MAXIM_MS);
  const extern = resta.signal;
  extern?.addEventListener("abort", () => control.abort());
  let resposta: Response;
  try {
    resposta = await fetch(`/api${ruta}`, {
      ...resta,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...resta.headers },
      body: json !== undefined ? JSON.stringify(json) : resta.body,
      signal: control.signal,
    });
  } catch (e) {
    if (extern?.aborted) throw e;
    if ((e as Error).name === "AbortError") {
      throw new ErrorClientApi(0, "temps_esgotat", "El servidor no respon. Comproveu la connexió i torneu-ho a provar.");
    }
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
      err?.detalls,
    );
  }
  if (!esJson) {
    throw new ErrorClientApi(resposta.status, "resposta_invalida", "El servidor ha retornat una resposta inesperada.");
  }
  return cos as T;
}

export const api = {
  get: <T>(ruta: string, signal?: AbortSignal) => peticio<T>(ruta, { method: "GET", signal }),
  post: <T>(ruta: string, json: unknown = {}, headers?: Record<string, string>) => peticio<T>(ruta, { method: "POST", json, headers }),
  patch: <T>(ruta: string, json: unknown) => peticio<T>(ruta, { method: "PATCH", json }),
};
