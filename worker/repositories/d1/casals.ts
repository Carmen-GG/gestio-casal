import type { Casal, NouCasal, RepositoriCasals } from "../tipus";
import { jsonObjecte } from "./util";
import { nouId } from "../../lib/ids";
import { isoAra, type Rellotge } from "../../lib/rellotge";

type Fila = Omit<Casal, "actiu" | "configuracio"> & { actiu: number; configuracio: string };

const mapa = (f: Fila): Casal => ({ ...f, actiu: f.actiu === 1, configuracio: jsonObjecte(f.configuracio) });

export class D1RepositoriCasals implements RepositoriCasals {
  constructor(private readonly db: D1Database, private readonly rellotge: Rellotge) {}

  async perId(id: string) {
    const f = await this.db.prepare("SELECT * FROM casals WHERE id = ?").bind(id).first<Fila>();
    return f ? mapa(f) : null;
  }

  async perCodi(codi: string) {
    const f = await this.db.prepare("SELECT * FROM casals WHERE codi = ?").bind(codi).first<Fila>();
    return f ? mapa(f) : null;
  }

  async llistar(opcions: { nomesActius?: boolean } = {}) {
    const sql = opcions.nomesActius
      ? "SELECT * FROM casals WHERE actiu = 1 ORDER BY nom"
      : "SELECT * FROM casals ORDER BY nom";
    const { results } = await this.db.prepare(sql).all<Fila>();
    return results.map(mapa);
  }

  async crear(dades: NouCasal) {
    const ara = isoAra(this.rellotge);
    const id = nouId();
    await this.db
      .prepare(
        `INSERT INTO casals (id, codi, nom, municipi, adreca, actiu, configuracio, creat_el, actualitzat_el)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(id, dades.codi, dades.nom, dades.municipi, dades.adreca ?? null,
        JSON.stringify(dades.configuracio ?? {}), ara, ara)
      .run();
    return (await this.perId(id))!;
  }
}
