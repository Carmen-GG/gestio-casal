import type {
  Comunicat, ConfigWhatsappCentral, DestinatariComunicat, EstatMissatgeWhatsapp, RepositoriComunicats,
} from "../tipus";

const ORDRE: Record<EstatMissatgeWhatsapp, number> = { pendent: 0, no_enviable: 0, enviat: 1, entregat: 2, llegit: 3, fallit: 4 };
/** Files per lot d'insercions (D1 limita les sentències per lot). */
const MIDA_INSERCIO = 80;

/** Comunicats de la superadministració: sense telèfons ni correus dels destinataris. */
export class D1RepositoriComunicats implements RepositoriComunicats {
  constructor(private readonly db: D1Database) {}

  async configCentral() {
    const f = await this.db.prepare(
      "SELECT phone_number_id, numero_visible, idioma, remitent, actiu, actualitzat_el FROM whatsapp_config_central WHERE id = 1",
    ).first<Omit<ConfigWhatsappCentral, "actiu"> & { actiu: number }>();
    return f ? { ...f, actiu: f.actiu === 1 } : null;
  }

  async desarConfigCentral(d: Omit<ConfigWhatsappCentral, "actualitzat_el">, usuariId: string | null, ara: string) {
    await this.db.prepare(
      `INSERT INTO whatsapp_config_central (id, phone_number_id, numero_visible, idioma, remitent, actiu, usuari_id, actualitzat_el)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET phone_number_id = excluded.phone_number_id, numero_visible = excluded.numero_visible,
         idioma = excluded.idioma, remitent = excluded.remitent, actiu = excluded.actiu, usuari_id = excluded.usuari_id,
         actualitzat_el = excluded.actualitzat_el`,
    ).bind(d.phone_number_id, d.numero_visible, d.idioma, d.remitent, d.actiu ? 1 : 0, usuariId, ara).run();
  }

  async crear(c: Comunicat, destinataris: Omit<DestinatariComunicat, "comunicat_id" | "wamid" | "error_text" | "creat_el" | "actualitzat_el">[], ara: string) {
    await this.db.prepare("INSERT INTO comunicats (id, assumpte, text, casal_ids, canals, usuari_id, creat_el) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(c.id, c.assumpte, c.text, c.casal_ids, c.canals, c.usuari_id, c.creat_el).run();
    for (let i = 0; i < destinataris.length; i += MIDA_INSERCIO) {
      await this.db.batch(destinataris.slice(i, i + MIDA_INSERCIO).map((d) => this.db.prepare(
        `INSERT INTO comunicats_destinataris (id, comunicat_id, casal_id, tipus, referencia_id, canal, estat, motiu, manual, creat_el, actualitzat_el)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(d.id, c.id, d.casal_id, d.tipus, d.referencia_id, d.canal, d.estat, d.motiu, d.manual, ara, ara)));
    }
  }

  async perId(id: string) {
    return this.db.prepare("SELECT * FROM comunicats WHERE id = ?").bind(id).first<Comunicat>();
  }

  async llistar(limit: number) {
    const { results } = await this.db.prepare("SELECT * FROM comunicats ORDER BY creat_el DESC LIMIT ?").bind(limit).all<Comunicat>();
    if (results.length === 0) return [];
    const { results: recomptes } = await this.db.prepare(
      `SELECT comunicat_id, estat, count(*) AS n FROM comunicats_destinataris
       WHERE comunicat_id IN (${results.map(() => "?").join(",")}) GROUP BY comunicat_id, estat`,
    ).bind(...results.map((c) => c.id)).all<{ comunicat_id: string; estat: string; n: number }>();
    return results.map((c) => ({
      ...c, recompte: Object.fromEntries(recomptes.filter((r) => r.comunicat_id === c.id).map((r) => [r.estat, Number(r.n)])),
    }));
  }

  async pendents(comunicatId: string, limit: number) {
    const { results } = await this.db.prepare(
      `SELECT * FROM comunicats_destinataris WHERE comunicat_id = ? AND estat = 'pendent' AND manual = 0
       ORDER BY tipus = 'persona', creat_el, id LIMIT ?`,
    ).bind(comunicatId, limit).all<DestinatariComunicat>();
    return results;
  }

  async destinataris(comunicatId: string) {
    const { results } = await this.db.prepare("SELECT * FROM comunicats_destinataris WHERE comunicat_id = ?")
      .bind(comunicatId).all<DestinatariComunicat>();
    return results;
  }

  async actualitzar(id: string, canvis: Partial<Pick<DestinatariComunicat, "estat" | "motiu" | "wamid" | "error_text">>, ara: string) {
    const camps = Object.keys(canvis) as (keyof typeof canvis)[];
    if (camps.length === 0) return;
    await this.db.prepare(`UPDATE comunicats_destinataris SET ${camps.map((k) => `${k} = ?`).join(", ")}, actualitzat_el = ? WHERE id = ?`)
      .bind(...camps.map((k) => canvis[k] ?? null), ara, id).run();
  }

  async canviEstatPerWamid(wamid: string, estat: EstatMissatgeWhatsapp, error: { codi: number; text: string } | null, ara: string) {
    const d = await this.db.prepare("SELECT * FROM comunicats_destinataris WHERE wamid = ?").bind(wamid).first<DestinatariComunicat>();
    if (!d || ORDRE[estat] <= ORDRE[d.estat]) return d;
    const motiu = estat === "fallit" ? (error && [131026, 131021, 131030].includes(error.codi) ? "sense_whatsapp" : "error_meta") : d.motiu;
    await this.db.prepare("UPDATE comunicats_destinataris SET estat = ?, motiu = ?, error_text = ?, actualitzat_el = ? WHERE id = ?")
      .bind(estat, motiu, error?.text.slice(0, 200) ?? d.error_text, ara, d.id).run();
    return { ...d, estat, motiu };
  }
}
