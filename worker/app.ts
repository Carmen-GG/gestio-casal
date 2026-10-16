import { Hono } from "hono";
import type { Env } from "./env";
import type { Repositoris } from "./repositories/tipus";
import { repositorisD1 } from "./repositories/d1";
import { rellotgeSistema, type Rellotge } from "./lib/rellotge";
import { ErrorAplicacio, errors, respostaError } from "./http/errors";
import { capcaleresSeguretat, idPeticio, MIDA_MAXIMA_COS, midaMaximaCos, politicaOrigen } from "./middleware/seguretat";
import { rutesPubliques } from "./routes/public";
import { rutesAuth } from "./routes/auth";
import { rutesWhatsapp } from "./routes/whatsapp";
import { rutesGestio } from "./routes/gestio";
import { esPujadaFitxer, rutesCartells } from "./routes/cartells";
import type { UsuariAutenticat } from "./auth/permisos";

export type Entorn = {
  Bindings: Env;
  Variables: { idPeticio: string; repos: Repositoris; rellotge: Rellotge; usuari: UsuariAutenticat; fetchMeta: typeof fetch };
};

export interface DependenciesApp {
  /** Permet substituir els repositoris o el rellotge a les proves. */
  repositoris?: (env: Env, rellotge: Rellotge) => Repositoris;
  rellotge?: Rellotge;
  /** Permet simular l'API de WhatsApp Business de Meta a les proves. */
  fetchMeta?: typeof fetch;
}

export function crearApp(deps: DependenciesApp = {}) {
  const rellotge = deps.rellotge ?? rellotgeSistema;
  const fabricaRepos = deps.repositoris ?? ((env: Env, r: Rellotge) => repositorisD1(env.DB, r));

  const app = new Hono<Entorn>().basePath("/api");

  app.use("*", idPeticio, capcaleresSeguretat, politicaOrigen, midaMaximaCos(MIDA_MAXIMA_COS, esPujadaFitxer));
  app.use("*", async (c, next) => {
    c.set("rellotge", rellotge);
    c.set("fetchMeta", deps.fetchMeta ?? ((input, init) => fetch(input, init)));
    c.set("repos", fabricaRepos(c.env, rellotge));
    await next();
  });

  app.get("/salut", async (c) => {
    // Comprova la connexió amb la base de dades sense exposar-ne detalls.
    try {
      await c.env.DB.prepare("SELECT 1").first();
      return c.json({ estat: "ok", entorn: c.env.APP_ENV });
    } catch {
      return c.json({ estat: "error_base_dades", entorn: c.env.APP_ENV }, 503);
    }
  });

  app.route("/public", rutesPubliques);
  app.route("/auth", rutesAuth);
  app.route("/whatsapp", rutesWhatsapp);
  app.route("/gestio", rutesGestio);
  app.route("/gestio", rutesCartells);

  app.notFound((c) => respostaError(c, errors.noTrobat("Ruta no trobada.")));

  app.onError((err, c) => {
    if (err instanceof ErrorAplicacio) return respostaError(c, err);
    // Restriccions d'unicitat de la base de dades: conflicte comprensible, sense detalls interns.
    if (/UNIQUE constraint failed/i.test(err.message)) {
      return respostaError(c, errors.conflicte("duplicat", "Ja existeix un registre amb aquestes dades."));
    }
    // Error inesperat: es registra només el tipus i l'id de petició, sense dades de la petició.
    console.error(JSON.stringify({ nivell: "error", id_peticio: c.get("idPeticio"), tipus: err.name, missatge: err.message }));
    return respostaError(
      c,
      new ErrorAplicacio(500, "error_intern", "S'ha produït un error inesperat. Torneu-ho a provar més tard."),
    );
  });

  return app;
}
