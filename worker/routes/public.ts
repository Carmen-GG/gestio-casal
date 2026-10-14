import { Hono } from "hono";
import type { Entorn } from "../app";
import { sollicitudPublica } from "../../shared/schemas/public";
import { ErrorAplicacio } from "../http/errors";
import { cosValidat } from "../http/validacio";
import { resumSha256 } from "../lib/cripto";
import { ServeiConsultaPublica } from "../services/consulta-publica";
import { ServeiSollicitudsPubliques } from "../services/sollicituds-publiques";

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
  })
  .post("/casals/:codi/cicles/:cicleId/sollicituds", async (c) => {
    // Limitació per origen de xarxa. La IP només s'usa com a clau del limitador
    // (resumida) i no es desa enlloc.
    if (c.env.LIMIT_SOLLICITUDS) {
      const ip = c.req.header("cf-connecting-ip") ?? "desconeguda";
      const { success } = await c.env.LIMIT_SOLLICITUDS.limit({ key: await resumSha256(`sollicituds:${ip}`) });
      if (!success) {
        throw new ErrorAplicacio(429, "massa_peticions", "S'han fet massa enviaments seguits. Espereu un minut i torneu-ho a provar.");
      }
    }
    const cos = await cosValidat(c, sollicitudPublica);
    const servei = new ServeiSollicitudsPubliques(c.get("repos"), c.get("rellotge"));
    const resultat = await servei.registrar(c.req.param("codi"), c.req.param("cicleId"),
      c.req.header("Idempotency-Key"), cos, c.get("idPeticio"));
    return c.json(resultat, resultat.repetida ? 200 : 201);
  });
