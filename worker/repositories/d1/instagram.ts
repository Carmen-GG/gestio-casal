import type { CanvisPublicacio, CompteInstagram, PublicacioInstagram, RepositoriInstagram } from "../tipus";
import { assignacionsUpdate } from "./util";

const COLUMNES_PUBLICACIO = [
  "peu", "estat", "ig_media_id", "enllac", "error_missatge", "imatge_testimoni_resum", "imatge_caduca_el", "publicat_per", "publicat_el",
] as const;

export class D1RepositoriInstagram implements RepositoriInstagram {
  constructor(private readonly db: D1Database) {}

  compte(casalId: string) {
    return this.db.prepare("SELECT * FROM instagram_comptes WHERE casal_id = ?").bind(casalId).first<CompteInstagram>();
  }

  async desarCompte(c: CompteInstagram) {
    await this.db.prepare(
      `INSERT INTO instagram_comptes (casal_id, ig_usuari_id, nom_usuari, testimoni_xifrat, testimoni_caduca_el, testimoni_renovat_el, connectat_per, connectat_el)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (casal_id) DO UPDATE SET ig_usuari_id = excluded.ig_usuari_id, nom_usuari = excluded.nom_usuari,
         testimoni_xifrat = excluded.testimoni_xifrat, testimoni_caduca_el = excluded.testimoni_caduca_el,
         testimoni_renovat_el = excluded.testimoni_renovat_el, connectat_per = excluded.connectat_per, connectat_el = excluded.connectat_el`,
    ).bind(c.casal_id, c.ig_usuari_id, c.nom_usuari, c.testimoni_xifrat, c.testimoni_caduca_el, c.testimoni_renovat_el, c.connectat_per, c.connectat_el).run();
  }

  async renovarTestimoni(casalId: string, testimoniXifrat: string, caducaEl: string | null, ara: string) {
    await this.db.prepare(
      "UPDATE instagram_comptes SET testimoni_xifrat = ?, testimoni_caduca_el = ?, testimoni_renovat_el = ? WHERE casal_id = ?",
    ).bind(testimoniXifrat, caducaEl, ara, casalId).run();
  }

  async esborrarCompte(casalId: string) {
    await this.db.prepare("DELETE FROM instagram_comptes WHERE casal_id = ?").bind(casalId).run();
  }

  async crearPublicacio(p: Parameters<RepositoriInstagram["crearPublicacio"]>[0]) {
    await this.db.prepare(
      `INSERT INTO instagram_publicacions (id, casal_id, fitxer_id, titol, peu, creat_per, creat_el, actualitzat_el)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(p.id, p.casal_id, p.fitxer_id, p.titol, p.peu, p.creat_per, p.creat_el, p.creat_el).run();
  }

  publicacio(id: string) {
    return this.db.prepare("SELECT * FROM instagram_publicacions WHERE id = ?").bind(id).first<PublicacioInstagram>();
  }

  publicacioPerImatge(testimoniResum: string) {
    return this.db.prepare("SELECT * FROM instagram_publicacions WHERE imatge_testimoni_resum = ?").bind(testimoniResum).first<PublicacioInstagram>();
  }

  async publicacions(casalId: string, limit: number) {
    const { results } = await this.db.prepare(
      "SELECT * FROM instagram_publicacions WHERE casal_id = ? ORDER BY creat_el DESC LIMIT ?",
    ).bind(casalId, limit).all<PublicacioInstagram>();
    return results;
  }

  async actualitzarPublicacio(id: string, versio: number, canvis: CanvisPublicacio, ara: string) {
    const { sql, valors } = assignacionsUpdate(canvis, COLUMNES_PUBLICACIO);
    const r = await this.db.prepare(
      `UPDATE instagram_publicacions SET ${sql}, actualitzat_el = ?, versio = versio + 1 WHERE id = ? AND versio = ?`,
    ).bind(...valors, ara, id, versio).run();
    return (r.meta.changes ?? 0) === 1;
  }
}
