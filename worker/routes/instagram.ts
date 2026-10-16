import { Hono, type Context } from "hono";
import type { Entorn } from "../app";
import { requereixSessio } from "../auth/sessio";
import { errors } from "../http/errors";
import { cosValidat, idRuta } from "../http/validacio";
import { compteConnectar, publicacioActualitzar, publicacioCrear, publicacioManual, publicacioPublicar } from "../../shared/schemas/instagram";
import { ServeiInstagram } from "../services/instagram";

type C = Context<Entorn>;
const ctx = (c: C) => ({ usuariId: c.get("usuari").id, idPeticio: c.get("idPeticio") });
const servei = (c: C) => new ServeiInstagram(c.get("repos"), c.get("rellotge"), c.env.FITXERS, c.env.INSTAGRAM_CLAU);

function casalAutoritzat(c: C, permis: string): string {
  const casalId = idRuta(c, "casalId");
  const usuari = c.get("usuari");
  if (!usuari.teAccesCasal(casalId)) throw errors.sensePermis();
  usuari.exigeix(permis, casalId);
  return casalId;
}

/**
 * Rutes d'Instagram del panell de gestió. La connexió del compte és de la responsable
 * del casal (casal.configurar); preparar i publicar, de qui té instagram.publicar.
 * Cap ruta publica sense una petició explícita de publicar amb confirmació.
 */
export const rutesInstagram = new Hono<Entorn>()
  .use("*", requereixSessio)
  .get("/casals/:casalId/instagram/compte", async (c) => {
    const casalId = casalAutoritzat(c, "instagram.publicar");
    return c.json(await servei(c).estatCompte(casalId));
  })
  .put("/casals/:casalId/instagram/compte", async (c) => {
    const casalId = casalAutoritzat(c, "casal.configurar");
    const { testimoni } = await cosValidat(c, compteConnectar);
    return c.json(await servei(c).connectar(casalId, testimoni, ctx(c)));
  })
  .post("/casals/:casalId/instagram/compte/desconnecta", async (c) => {
    const casalId = casalAutoritzat(c, "casal.configurar");
    await servei(c).desconnectar(casalId, ctx(c));
    return c.json(await servei(c).estatCompte(casalId));
  })
  .get("/casals/:casalId/instagram/publicacions", async (c) => {
    const casalId = casalAutoritzat(c, "instagram.publicar");
    return c.json({ publicacions: await servei(c).publicacions(casalId) });
  })
  .post("/casals/:casalId/instagram/publicacions", async (c) => {
    const casalId = casalAutoritzat(c, "instagram.publicar");
    const dades = await cosValidat(c, publicacioCrear);
    return c.json({ publicacio: await servei(c).crearPublicacio(casalId, dades, ctx(c)) }, 201);
  })
  .get("/casals/:casalId/instagram/publicacions/:publicacioId", async (c) => {
    const casalId = casalAutoritzat(c, "instagram.publicar");
    return c.json({ publicacio: await servei(c).publicacio(casalId, idRuta(c, "publicacioId")) });
  })
  .patch("/casals/:casalId/instagram/publicacions/:publicacioId", async (c) => {
    const casalId = casalAutoritzat(c, "instagram.publicar");
    const dades = await cosValidat(c, publicacioActualitzar);
    return c.json({ publicacio: await servei(c).actualitzar(casalId, idRuta(c, "publicacioId"), dades, ctx(c)) });
  })
  .post("/casals/:casalId/instagram/publicacions/:publicacioId/publica", async (c) => {
    const casalId = casalAutoritzat(c, "instagram.publicar");
    const { versio } = await cosValidat(c, publicacioPublicar);
    const origen = new URL(c.req.url).origin;
    return c.json({ publicacio: await servei(c).publicar(casalId, idRuta(c, "publicacioId"), versio, origen, ctx(c)) });
  })
  .post("/casals/:casalId/instagram/publicacions/:publicacioId/manual", async (c) => {
    const casalId = casalAutoritzat(c, "instagram.publicar");
    const dades = await cosValidat(c, publicacioManual);
    return c.json({ publicacio: await servei(c).marcarManual(casalId, idRuta(c, "publicacioId"), dades, ctx(c)) });
  });

/**
 * Adreça temporal de la imatge perquè els servidors d'Instagram la descarreguin mentre
 * es publica. Sense sessió: el testimoni aleatori de l'adreça és l'autorització, només
 * és vàlid uns minuts i es tanca en acabar la publicació.
 */
export const rutesInstagramPubliques = new Hono<Entorn>()
  .get("/imatges/:fitxer", async (c) => {
    const testimoni = c.req.param("fitxer").replace(/\.jpg$/, "");
    const objecte = await servei(c).imatgePublica(testimoni);
    if (!objecte) throw errors.noTrobat("No s'ha trobat la imatge.");
    return new Response(objecte.body, {
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(objecte.size), "Cache-Control": "no-store" },
    });
  });
