/**
 * Client mínim de l'API d'Instagram (Instagram API with Instagram Login, de Meta).
 * Només fa el que cal per publicar una imatge al compte professional d'un casal:
 * llegir el perfil, renovar el testimoni d'accés i publicar (contenidor → publicació).
 * El testimoni viatja a la capçalera Authorization, no a l'adreça.
 */
export const VERSIO_API_INSTAGRAM = "v23.0";
const BASE = "https://graph.instagram.com";

/** Error retornat per Instagram, amb un missatge per a persones (mai el testimoni). */
export class ErrorInstagram extends Error {
  constructor(
    readonly missatgeUsuari: string,
    /** Codi d'error de Meta (190 = testimoni no vàlid o caducat). */
    readonly codi: number | null = null,
  ) {
    super("error_instagram");
  }

  get testimoniNoValid() {
    return this.codi === 190;
  }
}

type Fetch = typeof fetch;

export class ClientInstagram {
  constructor(
    private readonly fetchFn: Fetch = (...a) => fetch(...a),
    private readonly espera: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async crida<T>(metode: "GET" | "POST", ruta: string, testimoni: string, cos?: Record<string, string>): Promise<T> {
    let r: Response;
    try {
      r = await this.fetchFn(`${BASE}${ruta}`, {
        method: metode,
        headers: { Authorization: `Bearer ${testimoni}`, ...(cos ? { "Content-Type": "application/json" } : {}) },
        body: cos ? JSON.stringify(cos) : undefined,
      });
    } catch {
      throw new ErrorInstagram("No s'ha pogut connectar amb Instagram. Torneu-ho a provar d'aquí a una estona.");
    }
    const dades = (await r.json().catch(() => null)) as (T & { error?: { message?: string; code?: number } }) | null;
    if (!r.ok || !dades || dades.error) {
      const codi = dades?.error?.code ?? null;
      if (codi === 190) throw new ErrorInstagram("Instagram no accepta el testimoni d'accés: pot haver caducat. Cal tornar a connectar el compte.", 190);
      const detall = (dades?.error?.message ?? "").replace(/[A-Za-z0-9_-]{40,}/g, "…").slice(0, 300);
      throw new ErrorInstagram(`Instagram ha rebutjat la petició${detall ? `: ${detall}` : "."}`, codi);
    }
    return dades;
  }

  /** Compte professional al qual pertany el testimoni. */
  async perfil(testimoni: string): Promise<{ igUsuariId: string; nomUsuari: string; tipus: string | null }> {
    const d = await this.crida<{ user_id?: string | number; id?: string; username?: string; account_type?: string }>(
      "GET", `/${VERSIO_API_INSTAGRAM}/me?fields=user_id,username,account_type`, testimoni);
    const id = d.user_id ?? d.id;
    if (!id || !d.username) throw new ErrorInstagram("Instagram no ha retornat les dades del compte.");
    return { igUsuariId: String(id), nomUsuari: d.username, tipus: d.account_type ?? null };
  }

  /**
   * Renova un testimoni de llarga durada (60 dies més). Instagram només ho permet
   * si el testimoni té almenys 24 hores; aquest punt exigeix el testimoni a l'adreça.
   */
  async renova(testimoni: string): Promise<{ testimoni: string; caducaEnSegons: number | null }> {
    let r: Response;
    try {
      r = await this.fetchFn(`${BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(testimoni)}`);
    } catch {
      throw new ErrorInstagram("No s'ha pogut connectar amb Instagram.");
    }
    const d = (await r.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: { code?: number } } | null;
    if (!r.ok || !d?.access_token) throw new ErrorInstagram("No s'ha pogut renovar el testimoni d'accés.", d?.error?.code ?? null);
    return { testimoni: d.access_token, caducaEnSegons: typeof d.expires_in === "number" ? d.expires_in : null };
  }

  /**
   * Publica una imatge: crea el contenidor (Instagram descarrega la imatge de `urlImatge`,
   * que ha de ser pública i JPEG), espera que estigui a punt i el publica.
   */
  async publicaImatge(igUsuariId: string, testimoni: string, urlImatge: string, peu: string): Promise<{ mediaId: string; enllac: string | null }> {
    const id = encodeURIComponent(igUsuariId);
    const contenidor = await this.crida<{ id: string }>("POST", `/${VERSIO_API_INSTAGRAM}/${id}/media`, testimoni, { image_url: urlImatge, caption: peu });
    for (let intent = 0; ; intent++) {
      const e = await this.crida<{ status_code?: string }>("GET", `/${VERSIO_API_INSTAGRAM}/${encodeURIComponent(contenidor.id)}?fields=status_code`, testimoni);
      if (e.status_code === "FINISHED" || e.status_code === undefined) break;
      if (e.status_code === "ERROR" || e.status_code === "EXPIRED") {
        throw new ErrorInstagram("Instagram no ha pogut processar la imatge. Comproveu-la i torneu-ho a provar.");
      }
      if (intent >= 10) throw new ErrorInstagram("Instagram encara està processant la imatge. Torneu-ho a provar d'aquí a uns minuts.");
      await this.espera(1500);
    }
    const media = await this.crida<{ id: string }>("POST", `/${VERSIO_API_INSTAGRAM}/${id}/media_publish`, testimoni, { creation_id: contenidor.id });
    // L'enllaç és només informatiu: si no s'obté, la publicació ja s'ha fet igualment.
    const enllac = await this.crida<{ permalink?: string }>("GET", `/${VERSIO_API_INSTAGRAM}/${encodeURIComponent(media.id)}?fields=permalink`, testimoni)
      .then((d) => d.permalink ?? null, () => null);
    return { mediaId: media.id, enllac };
  }
}
