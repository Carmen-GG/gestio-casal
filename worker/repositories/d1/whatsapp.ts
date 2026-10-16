import type { ConfigWhatsapp, EnviamentWhatsapp, EstatMissatgeWhatsapp, MissatgeWhatsapp, RepositoriWhatsapp } from "../tipus";

/** Ordre dels estats: un avís d'entrega que arriba tard no fa tornar enrere un «llegit». */
const ORDRE: Record<EstatMissatgeWhatsapp, number> = { pendent: 0, no_enviable: 0, enviat: 1, entregat: 2, llegit: 3, fallit: 4 };

/** WhatsApp Business: configuració per casal, enviaments i missatges (sense telèfons ni textos de resposta). */
export class D1RepositoriWhatsapp implements RepositoriWhatsapp {
  constructor(private readonly db: D1Database) {}

  async config(casalId: string) {
    const f = await this.db.prepare(
      "SELECT casal_id, phone_number_id, numero_visible, idioma, actiu, ofertes_automatiques, actualitzat_el FROM whatsapp_config WHERE casal_id = ?",
    ).bind(casalId).first<Omit<ConfigWhatsapp, "actiu" | "ofertes_automatiques"> & { actiu: number; ofertes_automatiques: number }>();
    return f ? { ...f, actiu: f.actiu === 1, ofertes_automatiques: f.ofertes_automatiques === 1 } : null;
  }

  async desarConfig(d: Omit<ConfigWhatsapp, "actualitzat_el">, usuariId: string | null, ara: string) {
    await this.db.prepare(
      `INSERT INTO whatsapp_config (casal_id, phone_number_id, numero_visible, idioma, actiu, ofertes_automatiques, usuari_id, actualitzat_el)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (casal_id) DO UPDATE SET phone_number_id = excluded.phone_number_id, numero_visible = excluded.numero_visible,
         idioma = excluded.idioma, actiu = excluded.actiu, ofertes_automatiques = excluded.ofertes_automatiques,
         usuari_id = excluded.usuari_id, actualitzat_el = excluded.actualitzat_el`,
    ).bind(d.casal_id, d.phone_number_id, d.numero_visible, d.idioma, d.actiu ? 1 : 0, d.ofertes_automatiques ? 1 : 0, usuariId, ara).run();
  }

  async crearEnviament(e: EnviamentWhatsapp, missatges: Pick<MissatgeWhatsapp, "id" | "placa_id" | "plantilla">[], ara: string) {
    const sentencies = [
      this.db.prepare("INSERT INTO whatsapp_enviaments (id, casal_id, cicle_id, tipus, text, abast, usuari_id, creat_el) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(e.id, e.casal_id, e.cicle_id, e.tipus, e.text, e.abast, e.usuari_id, e.creat_el),
      ...missatges.map((m) => this.db.prepare(
        `INSERT INTO whatsapp_missatges (id, enviament_id, casal_id, cicle_id, placa_id, plantilla, estat, creat_el, actualitzat_el)
         VALUES (?, ?, ?, ?, ?, ?, 'pendent', ?, ?)`,
      ).bind(m.id, e.id, e.casal_id, e.cicle_id, m.placa_id, m.plantilla, ara, ara)),
    ];
    await this.db.batch(sentencies);
  }

  async enviament(casalId: string, id: string) {
    return this.db.prepare("SELECT * FROM whatsapp_enviaments WHERE casal_id = ? AND id = ?").bind(casalId, id).first<EnviamentWhatsapp>();
  }

  async enviaments(casalId: string, cicleId: string, tipus?: EnviamentWhatsapp["tipus"]) {
    const { results } = await this.db.prepare(
      `SELECT * FROM whatsapp_enviaments WHERE casal_id = ? AND cicle_id = ? ${tipus ? "AND tipus = ?" : ""} ORDER BY creat_el DESC LIMIT 50`,
    ).bind(...(tipus ? [casalId, cicleId, tipus] : [casalId, cicleId])).all<EnviamentWhatsapp>();
    if (results.length === 0) return [];
    const { results: recomptes } = await this.db.prepare(
      `SELECT enviament_id, estat, count(*) AS n FROM whatsapp_missatges WHERE enviament_id IN (${results.map(() => "?").join(",")}) GROUP BY enviament_id, estat`,
    ).bind(...results.map((e) => e.id)).all<{ enviament_id: string; estat: string; n: number }>();
    return results.map((e) => ({
      ...e, recompte: Object.fromEntries(recomptes.filter((r) => r.enviament_id === e.id).map((r) => [r.estat, Number(r.n)])),
    }));
  }

  async pendents(enviamentId: string, limit: number) {
    const { results } = await this.db.prepare(
      "SELECT * FROM whatsapp_missatges WHERE enviament_id = ? AND estat = 'pendent' ORDER BY creat_el, id LIMIT ?",
    ).bind(enviamentId, limit).all<MissatgeWhatsapp>();
    return results;
  }

  async recompte(enviamentId: string) {
    const { results } = await this.db.prepare(
      "SELECT estat, count(*) AS n FROM whatsapp_missatges WHERE enviament_id = ? GROUP BY estat",
    ).bind(enviamentId).all<{ estat: string; n: number }>();
    return Object.fromEntries(results.map((r) => [r.estat, Number(r.n)]));
  }

  async actualitzar(id: string, canvis: Partial<Pick<MissatgeWhatsapp, "estat" | "motiu" | "wamid" | "error_codi" | "error_text">>, ara: string) {
    const camps = Object.keys(canvis) as (keyof typeof canvis)[];
    if (camps.length === 0) return;
    await this.db.prepare(
      `UPDATE whatsapp_missatges SET ${camps.map((k) => `${k} = ?`).join(", ")}, actualitzat_el = ? WHERE id = ?`,
    ).bind(...camps.map((k) => canvis[k] ?? null), ara, id).run();
  }

  async perWamid(wamid: string) {
    return this.db.prepare("SELECT * FROM whatsapp_missatges WHERE wamid = ?").bind(wamid).first<MissatgeWhatsapp>();
  }

  async canviEstatPerWamid(wamid: string, estat: EstatMissatgeWhatsapp, error: { codi: number; text: string } | null, ara: string) {
    const m = await this.perWamid(wamid);
    if (!m || ORDRE[estat] <= ORDRE[m.estat]) return m;
    await this.db.prepare(
      "UPDATE whatsapp_missatges SET estat = ?, error_codi = ?, error_text = ?, motiu = ?, actualitzat_el = ? WHERE id = ?",
    ).bind(estat, error?.codi ?? m.error_codi, error?.text.slice(0, 200) ?? m.error_text,
      estat === "fallit" ? (error && [131026, 131021, 131030].includes(error.codi) ? "sense_whatsapp" : "error_meta") : m.motiu, ara, m.id).run();
    return { ...m, estat };
  }

  async resposta(wamid: string, resposta: "si" | "no" | "text", ara: string) {
    const m = await this.perWamid(wamid);
    if (!m) return null;
    // Un botó («sí» o «no») preval sobre un text lliure; no es desa el contingut del text.
    const nova = resposta === "text" && m.resposta && m.resposta !== "text" ? m.resposta : resposta;
    await this.db.prepare("UPDATE whatsapp_missatges SET resposta = ?, resposta_el = ?, actualitzat_el = ? WHERE id = ?")
      .bind(nova, ara, ara, m.id).run();
    return { ...m, resposta: nova, resposta_el: ara };
  }

  async darrersPerPlaca(casalId: string, cicleId: string) {
    const { results } = await this.db.prepare(
      `SELECT m.* FROM whatsapp_missatges m
       WHERE m.casal_id = ? AND m.cicle_id = ? AND m.estat <> 'pendent'
         AND m.creat_el = (SELECT max(x.creat_el) FROM whatsapp_missatges x WHERE x.placa_id = m.placa_id AND x.estat <> 'pendent')`,
    ).bind(casalId, cicleId).all<MissatgeWhatsapp>();
    const unic = new Map<string, MissatgeWhatsapp>();
    for (const m of results) if (!unic.has(m.placa_id) || m.id > unic.get(m.placa_id)!.id) unic.set(m.placa_id, m);
    return [...unic.values()];
  }

  async missatges(enviamentId: string) {
    const { results } = await this.db.prepare("SELECT * FROM whatsapp_missatges WHERE enviament_id = ? ORDER BY creat_el, id").bind(enviamentId).all<MissatgeWhatsapp>();
    return results;
  }
}
