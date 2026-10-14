import type { CondicioOperacio, EntradaAuditoria, EntradaHistorial, RepositoriAuditoria, RepositoriHistorial, UnitatDeTreball, Operacio } from "../tipus";
import { comOperacio, comStatement, jsonObjecte } from "./util";

const TAULES_CONDICIO = new Set(["casals", "cicles", "activitats", "participants", "sollicituds"]);

/** Converteix un INSERT ... VALUES en INSERT ... SELECT condicionat al testimoni d'operació. */
function condicionar(columnes: string, n: number, condicio?: CondicioOperacio) {
  const valors = Array.from({ length: n }, () => "?").join(", ");
  if (!condicio) return { sql: `(${columnes}) VALUES (${valors})`, extra: [] as unknown[] };
  if (!TAULES_CONDICIO.has(condicio.taula)) throw new Error("taula de condició no permesa");
  return {
    sql: `(${columnes}) SELECT ${valors} WHERE EXISTS (SELECT 1 FROM ${condicio.taula} WHERE id = ? AND darrera_operacio = ?)`,
    extra: [condicio.id, condicio.operacio] as unknown[],
  };
}

export class D1RepositoriHistorial implements RepositoriHistorial {
  constructor(private readonly db: D1Database) {}

  operacioAfegir(e: EntradaHistorial, ara: string, condicio?: CondicioOperacio) {
    const { sql, extra } = condicionar(
      "casal_id, entitat, entitat_id, accio, canvis, usuari_id, motiu, creat_el", 8, condicio);
    return comOperacio(
      this.db
        .prepare(`INSERT INTO historial_canvis ${sql}`)
        .bind(e.casal_id, e.entitat, e.entitat_id, e.accio, JSON.stringify(e.canvis), e.usuari_id, e.motiu, ara,
          ...extra),
    );
  }

  async llistar(entitat: string, entitatId: string) {
    const { results } = await this.db
      .prepare("SELECT * FROM historial_canvis WHERE entitat = ? AND entitat_id = ? ORDER BY id")
      .bind(entitat, entitatId)
      .all<EntradaHistorial & { id: number; creat_el: string; canvis: string }>();
    return results.map((f) => ({ ...f, canvis: jsonObjecte(f.canvis) }));
  }
}

export class D1RepositoriAuditoria implements RepositoriAuditoria {
  constructor(private readonly db: D1Database) {}

  operacioRegistrar(e: EntradaAuditoria, ara: string, condicio?: CondicioOperacio) {
    const { sql, extra } = condicionar(
      "creat_el, casal_id, usuari_id, tipus_operacio, entitat, entitat_id, resultat, motiu, detalls, id_peticio",
      10, condicio);
    return comOperacio(
      this.db
        .prepare(`INSERT INTO registres_auditoria ${sql}`)
        .bind(ara, e.casal_id, e.usuari_id, e.tipus_operacio, e.entitat, e.entitat_id, e.resultat,
          e.motiu ?? null, JSON.stringify(e.detalls ?? {}), e.id_peticio ?? null, ...extra),
    );
  }

  async registrar(e: EntradaAuditoria, ara: string) {
    await comStatement(this.operacioRegistrar(e, ara)).run();
  }

  async llistar(filtre: { casalId?: string; entitat?: string; entitatId?: string; limit?: number }) {
    const condicions: string[] = [];
    const params: unknown[] = [];
    if (filtre.casalId) { condicions.push("casal_id = ?"); params.push(filtre.casalId); }
    if (filtre.entitat) { condicions.push("entitat = ?"); params.push(filtre.entitat); }
    if (filtre.entitatId) { condicions.push("entitat_id = ?"); params.push(filtre.entitatId); }
    const where = condicions.length ? `WHERE ${condicions.join(" AND ")}` : "";
    const limit = Math.min(Math.max(filtre.limit ?? 100, 1), 500);
    const { results } = await this.db
      .prepare(`SELECT * FROM registres_auditoria ${where} ORDER BY id DESC LIMIT ${limit}`)
      .bind(...params)
      .all<EntradaAuditoria & { id: number; creat_el: string; detalls: string }>();
    return results.map((f) => ({ ...f, detalls: jsonObjecte(f.detalls) }));
  }
}

/** D1 executa `batch` com una transacció: si una sentència falla, no s'aplica cap. */
export class D1UnitatDeTreball implements UnitatDeTreball {
  constructor(private readonly db: D1Database) {}

  async executar(operacions: Operacio[]) {
    const resultats = await this.db.batch(operacions.map(comStatement));
    return resultats.map((r) => ({ canvis: r.meta.changes ?? 0 }));
  }
}
