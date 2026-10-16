import type { Incidencia, Referent, RepositoriIncidencies, RepositoriTerritori } from "../tipus";

type FilaReferent = Omit<Referent, "actiu"> & { actiu: number };

/** Referents i territori dels casals (comarca, demarcació). */
export class D1RepositoriTerritori implements RepositoriTerritori {
  constructor(private readonly db: D1Database) {}

  async referents() {
    const { results } = await this.db.prepare("SELECT * FROM referents ORDER BY nom").all<FilaReferent>();
    return results.map((f) => ({ ...f, actiu: f.actiu === 1 }));
  }

  async referent(id: string) {
    const f = await this.db.prepare("SELECT * FROM referents WHERE id = ?").bind(id).first<FilaReferent>();
    return f ? { ...f, actiu: f.actiu === 1 } : null;
  }

  async crearReferent(d: { id: string; nom: string; email: string | null }, ara: string) {
    await this.db.prepare("INSERT INTO referents (id, nom, email, actiu, creat_el, actualitzat_el) VALUES (?, ?, ?, 1, ?, ?)")
      .bind(d.id, d.nom, d.email, ara, ara).run();
  }

  async actualitzarReferent(id: string, d: { nom: string; email: string | null; actiu: boolean }, ara: string) {
    const r = await this.db.prepare("UPDATE referents SET nom = ?, email = ?, actiu = ?, actualitzat_el = ? WHERE id = ?")
      .bind(d.nom, d.email, d.actiu ? 1 : 0, ara, id).run();
    return r.meta.changes === 1;
  }

  async fixarTerritori(casalId: string, d: { comarca: string | null; demarcacio: string | null; referent_id: string | null }, ara: string) {
    const r = await this.db.prepare(
      "UPDATE casals SET comarca = ?, demarcacio = ?, referent_id = ?, versio = versio + 1, actualitzat_el = ? WHERE id = ?",
    ).bind(d.comarca, d.demarcacio, d.referent_id, ara, casalId).run();
    return r.meta.changes === 1;
  }
}

/** Incidències registrades pels casals. */
export class D1RepositoriIncidencies implements RepositoriIncidencies {
  constructor(private readonly db: D1Database) {}

  async llistar(casalId: string, any: number | null) {
    const { results } = await this.db.prepare(
      `SELECT i.id, i.casal_id, i.data, i.categoria, i.descripcio, i.activitat_id, a.nom AS activitat, i.estat, i.resolucio, i.resolta_el, i.creat_el
       FROM incidencies i LEFT JOIN activitats a ON a.id = i.activitat_id
       WHERE i.casal_id = ?1 AND (?2 IS NULL OR substr(i.data, 1, 4) = ?2) ORDER BY i.data DESC, i.creat_el DESC`,
    ).bind(casalId, any === null ? null : String(any)).all<Incidencia>();
    return results;
  }

  async activitats(casalId: string) {
    const { results } = await this.db.prepare(
      `SELECT a.id, a.nom, c.nom AS cicle FROM activitats a JOIN cicles c ON c.id = a.cicle_id
       WHERE a.casal_id = ? AND a.estat <> 'arxivada' ORDER BY c.data_inici DESC, a.nom`,
    ).bind(casalId).all<{ id: string; nom: string; cicle: string }>();
    return results;
  }

  async crear(d: Parameters<RepositoriIncidencies["crear"]>[0], ara: string) {
    await this.db.prepare(
      `INSERT INTO incidencies (id, casal_id, data, categoria, descripcio, activitat_id, estat, creat_per, creat_el, actualitzat_el)
       VALUES (?, ?, ?, ?, ?, ?, 'oberta', ?, ?, ?)`,
    ).bind(d.id, d.casal_id, d.data, d.categoria, d.descripcio, d.activitat_id, d.usuari_id, ara, ara).run();
  }

  async resoldre(casalId: string, id: string, d: { resolucio: string | null; usuari_id: string }, ara: string) {
    const r = await this.db.prepare(
      `UPDATE incidencies SET estat = 'resolta', resolucio = ?, resolta_per = ?, resolta_el = ?, actualitzat_el = ?
       WHERE id = ? AND casal_id = ? AND estat = 'oberta'`,
    ).bind(d.resolucio, d.usuari_id, ara, ara, id, casalId).run();
    return r.meta.changes === 1;
  }
}
