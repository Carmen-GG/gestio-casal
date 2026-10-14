import type { Repositoris } from "../tipus";
import type { Rellotge } from "../../lib/rellotge";
import { D1RepositoriCasals } from "./casals";
import { D1RepositoriCicles } from "./cicles";
import { D1RepositoriActivitats } from "./activitats";
import { D1RepositoriSessions, D1RepositoriUsuaris } from "./usuaris";
import { D1RepositoriSollicituds } from "./sollicituds";
import { D1RepositoriAuditoria, D1RepositoriHistorial, D1UnitatDeTreball } from "./registres";

export function repositorisD1(db: D1Database, rellotge: Rellotge): Repositoris {
  return {
    casals: new D1RepositoriCasals(db, rellotge),
    usuaris: new D1RepositoriUsuaris(db, rellotge),
    sessions: new D1RepositoriSessions(db),
    cicles: new D1RepositoriCicles(db, rellotge),
    activitats: new D1RepositoriActivitats(db, rellotge),
    historial: new D1RepositoriHistorial(db),
    auditoria: new D1RepositoriAuditoria(db),
    sollicituds: new D1RepositoriSollicituds(db),
    unitat: new D1UnitatDeTreball(db),
  };
}
