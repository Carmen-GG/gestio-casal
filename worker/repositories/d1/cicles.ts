import type { EstatCicle } from "../../../shared/domain/cicles";
import { LLINDAR_ASSISTENCIA_PER_DEFECTE } from "../../../shared/domain/assistencia";
import type { CanvisCicle, Cicle, DadesCicle, NouCicle, RepositoriCicles } from "../tipus";
import { assignacionsUpdate, comOperacio, comStatement, jsonObjecte, marcadors } from "./util";
import { nouId } from "../../lib/ids";
import { isoAra, type Rellotge } from "../../lib/rellotge";

type Fila = Omit<Cicle, "configuracio_formulari" | "limits_grups"> & { configuracio_formulari: string; limits_grups: string };

const mapa = (f: Fila): Cicle => ({
  ...f, configuracio_formulari: jsonObjecte(f.configuracio_formulari), limits_grups: jsonObjecte(f.limits_grups) as Record<string, number>,
});

const DE_LES_ACTIVITATS = "SELECT id FROM activitats WHERE cicle_id = ?1";

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

  operacioCrear(id: string, dades: NouCicle, ara: string, operacio: string) {
    return comOperacio(
      this.db
        .prepare(
          `INSERT INTO cicles (id, casal_id, nom, any, data_inici, data_fi, obertura_inscripcions,
             tancament_inscripcions, data_resolucio_prevista, estat, configuracio_formulari, llindar_assistencia,
             darrera_operacio, creat_el, actualitzat_el)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'esborrany', ?, ?, ?, ?, ?)`,
        )
        .bind(id, dades.casal_id, dades.nom, dades.any, dades.data_inici, dades.data_fi,
          dades.obertura_inscripcions, dades.tancament_inscripcions, dades.data_resolucio_prevista,
          JSON.stringify(dades.configuracio_formulari ?? {}),
          dades.llindar_assistencia === undefined ? LLINDAR_ASSISTENCIA_PER_DEFECTE : dades.llindar_assistencia, operacio, ara, ara),
    );
  }

  async crear(dades: NouCicle) {
    const id = nouId();
    await comStatement(this.operacioCrear(id, dades, isoAra(this.rellotge), nouId())).run();
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

  operacioActualitzar(casalId: string, id: string, versioActual: number, canvis: CanvisCicle, ara: string, operacio: string) {
    const { sql, valors } = assignacionsUpdate(canvis, [
      "nom", "any", "data_inici", "data_fi", "obertura_inscripcions", "tancament_inscripcions",
      "data_resolucio_prevista", "configuracio_formulari", "llindar_assistencia", "limits_grups",
    ]);
    return comOperacio(
      this.db
        .prepare(
          `UPDATE cicles SET ${sql}, actualitzat_el = ?, versio = versio + 1, darrera_operacio = ?
           WHERE id = ? AND casal_id = ? AND versio = ?`,
        )
        .bind(...valors, ara, operacio, id, casalId, versioActual),
    );
  }

  async dadesVinculades(cicleId: string) {
    const fila = await this.db.prepare(
      `SELECT
         (SELECT COUNT(*) FROM activitats WHERE cicle_id = ?1) AS activitats,
         (SELECT COUNT(*) FROM sollicituds WHERE cicle_id = ?1) AS sollicituds,
         (SELECT COUNT(*) FROM places WHERE activitat_id IN (${DE_LES_ACTIVITATS})) AS places,
         (SELECT COUNT(*) FROM registres_assistencia r JOIN sessions_activitat s ON s.id = r.sessio_id
           WHERE s.activitat_id IN (${DE_LES_ACTIVITATS})) AS marques_assistencia,
         (SELECT COUNT(*) FROM execucions_adjudicacio WHERE cicle_id = ?1)
           + (SELECT COUNT(*) FROM sortejos_adjudicacio WHERE cicle_id = ?1) AS adjudicacions,
         (SELECT COUNT(*) FROM baixes_voluntaries WHERE cicle_id = ?1)
           + (SELECT COUNT(*) FROM comunicacions_placa WHERE cicle_id = ?1)
           + (SELECT COUNT(*) FROM whatsapp_enviaments WHERE cicle_id = ?1)
           + (SELECT COUNT(*) FROM whatsapp_missatges WHERE cicle_id = ?1)
           + (SELECT COUNT(*) FROM incidencies WHERE activitat_id IN (${DE_LES_ACTIVITATS})) AS altres`,
    ).bind(cicleId).first<DadesCicle>();
    return fila!;
  }

  operacionsEliminar(casalId: string, cicleId: string) {
    // Ordre: primer el que depèn de les activitats, després les activitats i, al final, el cicle.
    const sql = [
      `DELETE FROM sessions_activitat WHERE activitat_id IN (${DE_LES_ACTIVITATS})`,
      "DELETE FROM configuracions_adjudicacio WHERE cicle_id = ?1",
      "DELETE FROM numeros_sorteig WHERE cicle_id = ?1",
      "DELETE FROM revisions_duplicats WHERE cicle_id = ?1",
      "DELETE FROM activitats WHERE cicle_id = ?1",
      "DELETE FROM importacions WHERE cicle_id = ?1",
    ];
    return [
      ...sql.map((q) => comOperacio(this.db.prepare(q).bind(cicleId))),
      comOperacio(this.db.prepare("DELETE FROM cicles WHERE id = ? AND casal_id = ?").bind(cicleId, casalId)),
    ];
  }
}
