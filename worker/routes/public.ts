import { Hono } from "hono";
import type { Entorn } from "../app";
import { ServeiConsultaPublica } from "../services/consulta-publica";

/**
 * Rutes públiques (sense autenticació). Només retornen informació destinada
 * a la difusió i mai dades personals ni camps interns.
 */
export const rutesPubliques = new Hono<Entorn>()
  .get("/casals/:codi/cicles", async (c) => {
    const servei = new ServeiConsultaPublica(c.get("repos"), c.get("rellotge"));
    return c.json(await servei.ciclesPublics(c.req.param("codi")));
  })
  .get("/casals/:codi/cicles/:cicleId/activitats", async (c) => {
    const servei = new ServeiConsultaPublica(c.get("repos"), c.get("rellotge"));
    return c.json(await servei.activitatsPubliques(c.req.param("codi"), c.req.param("cicleId")));
  });
