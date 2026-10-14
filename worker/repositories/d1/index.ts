import type { Repositoris } from "../tipus";
import type { Rellotge } from "../../lib/rellotge";
import { D1RepositoriCasals } from "./casals";
import { D1RepositoriCicles } from "./cicles";
import { D1RepositoriActivitats } from "./activitats";
import { D1RepositoriAuditoria, D1RepositoriHistorial, D1UnitatDeTreball } from "./registres";

export function repositorisD1(db: D1Database, rellotge: Rellotge): Repositoris {
  return {
    casals: new D1RepositoriCasals(db, rellotge),
    cicles: new D1RepositoriCicles(db, rellotge),
    activitats: new D1RepositoriActivitats(db, rellotge),
    historial: new D1RepositoriHistorial(db),
    auditoria: new D1RepositoriAuditoria(db),
    unitat: new D1UnitatDeTreball(db),
  };
}
