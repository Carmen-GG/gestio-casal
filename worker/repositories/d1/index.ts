import type { Repositoris } from "../tipus";
import type { Rellotge } from "../../lib/rellotge";
import { D1RepositoriCasals } from "./casals";
import { D1RepositoriCicles } from "./cicles";
import { D1RepositoriActivitats } from "./activitats";
import { D1RepositoriSessions, D1RepositoriUsuaris } from "./usuaris";
import { D1RepositoriSollicituds } from "./sollicituds";
import { D1RepositoriGestioSollicituds } from "./gestio-sollicituds";
import { D1RepositoriAdjudicacio } from "./adjudicacio";
import { D1RepositoriAssistencia } from "./assistencia";
import { D1RepositoriIndicadors } from "./indicadors";
import { D1RepositoriComunicacions } from "./comunicacions";
import { D1RepositoriWhatsapp } from "./whatsapp";
import { D1RepositoriComunicats } from "./comunicats";
import { D1RepositoriPersonesPlataforma } from "./persones-plataforma";
import { D1RepositoriCartells } from "./cartells";
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
    gestioSollicituds: new D1RepositoriGestioSollicituds(db),
    adjudicacio: new D1RepositoriAdjudicacio(db),
    assistencia: new D1RepositoriAssistencia(db),
    comunicacions: new D1RepositoriComunicacions(db),
    whatsapp: new D1RepositoriWhatsapp(db),
    comunicats: new D1RepositoriComunicats(db),
    personesPlataforma: new D1RepositoriPersonesPlataforma(db),
    indicadors: new D1RepositoriIndicadors(db),
    cartells: new D1RepositoriCartells(db),
    unitat: new D1UnitatDeTreball(db),
  };
}
