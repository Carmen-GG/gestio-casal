import type { EstatCicle } from "../../../shared/domain/cicles";
import type { Cicle, NouCicle, RepositoriCicles } from "../tipus";
import { comOperacio, jsonObjecte, marcadors } from "./util";
import { nouId } from "../../lib/ids";
import { isoAra, type Rellotge } from "../../lib/rellotge";

type Fila = Omit<Cicle, "configuracio_formulari"> & { configuracio_formulari: string };

const mapa = (f: Fila): Cicle => ({ ...f, configuracio_formulari: jsonObjecte(f.configuracio_formulari) });

export class D1RepositoriCicles implements RepositoriCicles {
  constructor(private readonly db: D1Database, private readonly rellotge: Rellotge) {}

  async perId(casalId: string, id: string) {
    const f = await this.db
      .prepare("SELECT * FROM cicles WHERE id = ? AND casal_id = ?")
      .bind(id, casalId)
      .first<Fila>();
    return f ? mapa(f) : null;
  }

  async llistarPerCasal(casalId: string, opcions: { estats?: EstatCicle[] } = {}) {
    const estats = opcions.estats ?? [];
    const filtre = estats.length ? ` AND estat IN (${marcadors(estats.length)})` : "";
    const { results } = await this.db
      .prepare(`SELECT * FROM cicles WHERE casal_id = ?${filtre} ORDER BY data_inici DESC, nom`)
      .bind(casalId, ...estats)
      .all<Fila>();
    return results.map(mapa);
  }

  async crear(dades: NouCicle) {
    const ara = isoAra(this.rellotge);
    const id = nouId();
    await this.db
      .prepare(
        `INSERT INTO cicles (id, casal_id, nom, any, data_inici, data_fi, obertura_inscripcions,
           tancament_inscripcions, data_resolucio_prevista, estat, configuracio_formulari, creat_el, actualitzat_el)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'esborrany', ?, ?, ?)`,
      )
      .bind(id, dades.casal_id, dades.nom, dades.any, dades.data_inici, dades.data_fi,
        dades.obertura_inscripcions, dades.tancament_inscripcions, dades.data_resolucio_prevista,
        JSON.stringify(dades.configuracio_formulari ?? {}), ara, ara)
      .run();
    return (await this.perId(dades.casal_id, id))!;
  }

  operacioCanviEstat(casalId: string, id: string, versioActual: number, cap: EstatCicle, ara: string, operacio: string) {
    return comOperacio(
      this.db
        .prepare(
          `UPDATE cicles SET estat = ?, actualitzat_el = ?, versio = versio + 1, darrera_operacio = ?
           WHERE id = ? AND casal_id = ? AND versio = ?`,
        )
        .bind(cap, ara, operacio, id, casalId, versioActual),
    );
  }
}
