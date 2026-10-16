import type { IdiomaWhatsapp, PlantillaWhatsapp } from "../../shared/domain/whatsapp";

/**
 * Client mínim de l'API de WhatsApp Business de Meta (Cloud API).
 * El testimoni d'accés és un secret del Worker; aquí no es registra mai ni el testimoni
 * ni el telèfon de destí.
 */
export const VERSIO_GRAPH = "v21.0";
const BASE = `https://graph.facebook.com/${VERSIO_GRAPH}`;

/** Error retornat per Meta, amb el codi per decidir què fer (p. ex. 131026: el número no té WhatsApp). */
export class ErrorMeta extends Error {
  constructor(readonly codi: number, readonly titol: string, readonly status: number) {
    super(`Meta ${codi}: ${titol}`);
  }
  /** El destinatari no pot rebre el missatge (no té WhatsApp, número inexistent…): no és un error del casal. */
  get destinatariNoDisponible() {
    return [131026, 131021, 131030].includes(this.codi);
  }
}

/** Errors que aturen tot l'enviament: credencials, plantilla inexistent o límits del compte. */
export const esErrorGlobal = (e: ErrorMeta) =>
  e.status === 401 || [0, 3, 10, 100, 190, 200, 131031, 131042, 131056, 132000, 132001, 132005, 132007, 132012, 133010, 130429, 80007].includes(e.codi);

export interface ClientWhatsapp {
  enviaPlantilla(d: {
    phoneNumberId: string; destinatari: string; plantilla: PlantillaWhatsapp; idioma: IdiomaWhatsapp; parametres: string[];
  }): Promise<{ wamid: string }>;
  comprovaNumero(phoneNumberId: string): Promise<{ numero: string | null; nom_verificat: string | null; qualitat: string | null }>;
}

type Fetch = typeof fetch;

export function clientWhatsapp(token: string, fetchFn: Fetch = fetch): ClientWhatsapp {
  async function crida<T>(ruta: string, init?: RequestInit): Promise<T> {
    let r: Response;
    try {
      r = await fetchFn(`${BASE}/${ruta}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
    } catch {
      throw new ErrorMeta(0, "No s'ha pogut connectar amb Meta.", 0);
    }
    const cos = (await r.json().catch(() => ({}))) as { error?: { code?: number; message?: string; error_user_title?: string } } & T;
    if (!r.ok || cos.error) {
      const codi = Number(cos.error?.code ?? 0);
      // Només el títol curt de l'error: el missatge complet de Meta pot repetir el número de destí.
      const titol = (cos.error?.error_user_title ?? titolError(codi)).slice(0, 200);
      throw new ErrorMeta(codi, titol, r.status);
    }
    return cos;
  }

  return {
    async enviaPlantilla({ phoneNumberId, destinatari, plantilla, idioma, parametres }) {
      const cos = await crida<{ messages?: { id: string }[] }>(`${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: destinatari,
          type: "template",
          template: {
            name: plantilla,
            language: { code: idioma },
            components: [{ type: "body", parameters: parametres.map((text) => ({ type: "text", text })) }],
          },
        }),
      });
      const wamid = cos.messages?.[0]?.id;
      if (!wamid) throw new ErrorMeta(0, "Meta no ha retornat l'identificador del missatge.", 200);
      return { wamid };
    },
    async comprovaNumero(phoneNumberId) {
      const cos = await crida<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
        `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`,
      );
      return { numero: cos.display_phone_number ?? null, nom_verificat: cos.verified_name ?? null, qualitat: cos.quality_rating ?? null };
    },
  };
}

function titolError(codi: number): string {
  if (codi === 190) return "El testimoni d'accés a Meta no és vàlid o ha caducat.";
  if (codi === 132001) return "La plantilla no existeix o no està aprovada en aquest idioma.";
  if (codi === 131026) return "El número no té WhatsApp o no pot rebre el missatge.";
  if (codi === 131056 || codi === 130429 || codi === 80007) return "S'ha arribat al límit d'enviaments de Meta. Torneu-ho a provar d'aquí a una estona.";
  if (codi === 100) return "Meta ha rebutjat la petició (paràmetres o identificador del número incorrectes).";
  return "Meta ha rebutjat el missatge.";
}

/** Comprova la signatura X-Hub-Signature-256 dels avisos de Meta (HMAC-SHA256 del cos amb el secret de l'app). */
export async function signaturaValida(cos: string, capcalera: string | null | undefined, secret: string): Promise<boolean> {
  if (!capcalera?.startsWith("sha256=")) return false;
  const clau = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const hex = capcalera.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const signatura = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", clau, signatura, new TextEncoder().encode(cos));
}
