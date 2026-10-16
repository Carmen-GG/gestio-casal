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

/** Els fitxers grans (plantilles de diversos MB) poden trigar més que una consulta. */
const TEMPS_MAXIM_FITXERS_MS = 120_000;

async function enviar(ruta: string, init: RequestInit & { json?: unknown; tempsMaxim?: number }): Promise<Response> {
  const { json, tempsMaxim, ...resta } = init;
  const control = new AbortController();
  const temporitzador = setTimeout(() => control.abort(), tempsMaxim ?? TEMPS_MAXIM_MS);
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
  return resposta;
}

async function peticio<T>(ruta: string, init: RequestInit & { json?: unknown; tempsMaxim?: number } = {}): Promise<T> {
  const resposta = await enviar(ruta, init);
  const esJson = resposta.headers.get("Content-Type")?.includes("application/json");
  const cos: unknown = esJson ? await resposta.json().catch(() => null) : null;

  if (!resposta.ok) throw errorDeResposta(resposta, cos);
  if (!esJson) {
    throw new ErrorClientApi(resposta.status, "resposta_invalida", "El servidor ha retornat una resposta inesperada.");
  }
  return cos as T;
}

function errorDeResposta(resposta: Response, cos: unknown) {
  const err = (cos as ErrorApi | null)?.error;
  return new ErrorClientApi(
    resposta.status,
    err?.codi ?? "error_desconegut",
    err?.missatge ?? "S'ha produït un error inesperat. Torneu-ho a provar més tard.",
    err?.id_peticio,
    err?.detalls,
  );
}

/** Descarrega un fitxer binari de l'API (amb la mateixa gestió d'errors). */
async function descarregar(ruta: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const resposta = await enviar(ruta, { method: "GET", signal, tempsMaxim: TEMPS_MAXIM_FITXERS_MS, headers: { Accept: "*/*" } });
  if (!resposta.ok) {
    const esJson = resposta.headers.get("Content-Type")?.includes("application/json");
    throw errorDeResposta(resposta, esJson ? await resposta.json().catch(() => null) : null);
  }
  return resposta.arrayBuffer();
}

export const api = {
  get: <T>(ruta: string, signal?: AbortSignal) => peticio<T>(ruta, { method: "GET", signal }),
  post: <T>(ruta: string, json: unknown = {}, headers?: Record<string, string>) => peticio<T>(ruta, { method: "POST", json, headers }),
  patch: <T>(ruta: string, json: unknown) => peticio<T>(ruta, { method: "PATCH", json }),
  put: <T>(ruta: string, json: unknown) => peticio<T>(ruta, { method: "PUT", json }),
  delete: <T>(ruta: string, json: unknown) => peticio<T>(ruta, { method: "DELETE", json }),
  /** Puja un fitxer tal qual: el tipus va a Content-Type (cal preflight des d'un altre origen). */
  pujar: <T>(ruta: string, fitxer: Blob, tipus: string) =>
    peticio<T>(ruta, { method: "POST", body: fitxer, headers: { "Content-Type": tipus }, tempsMaxim: TEMPS_MAXIM_FITXERS_MS }),
  descarregar,
};
