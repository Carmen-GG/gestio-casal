import type { ComunicacioPlaca, RepositoriComunicacions } from "../tipus";

/** Registre de les comunicacions de l'assignació per plaça (una fila per plaça). */
export class D1RepositoriComunicacions implements RepositoriComunicacions {
  constructor(private readonly db: D1Database) {}

  async llistar(casalId: string, cicleId: string) {
    const { results } = await this.db.prepare(
      `SELECT placa_id, tipus, canal, estat, motiu, nota, actualitzat_el FROM comunicacions_placa WHERE casal_id = ? AND cicle_id = ?`,
    ).bind(casalId, cicleId).all<ComunicacioPlaca>();
    return results;
  }

  async desar(d: ComunicacioPlaca & { casal_id: string; cicle_id: string; usuari_id: string | null }) {
    await this.db.prepare(
      `INSERT INTO comunicacions_placa (placa_id, casal_id, cicle_id, tipus, canal, estat, motiu, nota, usuari_id, actualitzat_el)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (placa_id) DO UPDATE SET tipus = excluded.tipus, canal = excluded.canal, estat = excluded.estat,
         motiu = excluded.motiu, nota = excluded.nota, usuari_id = excluded.usuari_id, actualitzat_el = excluded.actualitzat_el`,
    ).bind(d.placa_id, d.casal_id, d.cicle_id, d.tipus, d.canal, d.estat, d.motiu, d.nota, d.usuari_id, d.actualitzat_el).run();
  }

  async esborrar(casalId: string, placaId: string) {
    const r = await this.db.prepare("DELETE FROM comunicacions_placa WHERE casal_id = ? AND placa_id = ?").bind(casalId, placaId).run();
    return r.meta.changes ?? 0;
  }
}
