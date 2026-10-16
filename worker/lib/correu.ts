/**
 * Client mínim de l'API de correu de Resend (https://resend.com/docs/api-reference/emails/send-email).
 * La clau és un secret del Worker; aquí no es registra mai ni la clau ni l'adreça de destí.
 */
export class ErrorCorreu extends Error {
  constructor(readonly status: number, readonly titol: string) {
    super(`Correu ${status}: ${titol}`);
  }
  /** Errors que aturen tot l'enviament: clau, remitent no verificat o límit del compte. */
  get global() {
    return this.status === 401 || this.status === 403 || this.status === 429;
  }
}

export interface ClientCorreu {
  envia(d: { a: string; assumpte: string; text: string }): Promise<{ id: string }>;
}

export function clientCorreu(clau: string, remitent: string, fetchFn: typeof fetch = fetch): ClientCorreu {
  return {
    async envia({ a, assumpte, text }) {
      const r = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${clau}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: remitent, to: [a], subject: assumpte, text }),
      });
      const cos = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!r.ok || !cos.id) throw new ErrorCorreu(r.status, String(cos.name ?? cos.message ?? "Error del servei de correu").slice(0, 120));
      return { id: cos.id };
    },
  };
}
