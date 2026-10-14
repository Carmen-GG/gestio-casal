import type { CanvisCasal, Casal, NouCasal, RepositoriCasals } from "../tipus";
import { assignacionsUpdate, comOperacio, comStatement, jsonObjecte, marcadors } from "./util";
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

  async llistar(opcions: { nomesActius?: boolean; ids?: string[] } = {}) {
    const condicions: string[] = [];
    const params: unknown[] = [];
    if (opcions.nomesActius) condicions.push("actiu = 1");
    if (opcions.ids) {
      if (opcions.ids.length === 0) return [];
      condicions.push(`id IN (${marcadors(opcions.ids.length)})`);
      params.push(...opcions.ids);
    }
    const where = condicions.length ? `WHERE ${condicions.join(" AND ")}` : "";
    const { results } = await this.db.prepare(`SELECT * FROM casals ${where} ORDER BY nom`).bind(...params).all<Fila>();
    return results.map(mapa);
  }

  operacioActualitzar(id: string, versioActual: number, canvis: CanvisCasal, ara: string, operacio: string) {
    const { sql, valors } = assignacionsUpdate(canvis, ["nom", "municipi", "adreca", "actiu", "configuracio"]);
    return comOperacio(
      this.db
        .prepare(
          `UPDATE casals SET ${sql}, actualitzat_el = ?, versio = versio + 1, darrera_operacio = ?
           WHERE id = ? AND versio = ?`,
        )
        .bind(...valors, ara, operacio, id, versioActual),
    );
  }

  operacioCrear(id: string, dades: NouCasal, ara: string, operacio: string) {
    return comOperacio(
      this.db
        .prepare(
          `INSERT INTO casals (id, codi, nom, municipi, adreca, actiu, configuracio, darrera_operacio, creat_el, actualitzat_el)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        )
        .bind(id, dades.codi, dades.nom, dades.municipi, dades.adreca ?? null,
          JSON.stringify(dades.configuracio ?? {}), operacio, ara, ara),
    );
  }

  async crear(dades: NouCasal) {
    const id = nouId();
    await comStatement(this.operacioCrear(id, dades, isoAra(this.rellotge), nouId())).run();
    return (await this.perId(id))!;
  }
}
