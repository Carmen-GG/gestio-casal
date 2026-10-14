import { Hono } from "hono";
import { z } from "zod";
import type { Entorn } from "../app";
import { iniciarSessio, requereixSessio, tancarSessio } from "../auth/sessio";
import { ErrorAplicacio } from "../http/errors";
import { cosValidat } from "../http/validacio";
import { resumSha256 } from "../lib/cripto";

const entrada = z.strictObject({ testimoni: z.string().min(20).max(100) });

/**
 * Autenticació del panell.
 * Mètode de desenvolupament i proves: testimoni d'accés d'un sol ús generat amb
 * `scripts/acces-dev.mjs`. Està desactivat a producció, on s'haurà d'utilitzar el
 * proveïdor d'identitat corporatiu (p. ex. Microsoft Entra ID; vegeu docs/autenticacio.md).
 */
export const rutesAuth = new Hono<Entorn>()
  .post("/entrar", async (c) => {
    if (c.env.APP_ENV === "production") {
      throw new ErrorAplicacio(404, "metode_no_disponible", "Aquest mètode d'accés no està disponible.");
    }
    const { testimoni } = await cosValidat(c, entrada);
    const repos = c.get("repos");
    const ara = c.get("rellotge").ara().toISOString();
    const usuariId = await repos.sessions.consumirTestimoni(await resumSha256(testimoni), ara);
    const usuari = usuariId ? await repos.usuaris.perId(usuariId) : null;
    if (!usuari || !usuari.actiu) {
      await repos.auditoria.registrar(
        { casal_id: null, usuari_id: null, tipus_operacio: "sessio.inici", entitat: "sessio", entitat_id: null, resultat: "denegat", id_peticio: c.get("idPeticio") },
        ara,
      );
      throw new ErrorAplicacio(401, "acces_no_valid", "L'enllaç d'accés no és vàlid, ja s'ha utilitzat o ha caducat.");
    }
    await iniciarSessio(c, usuari.id);
    await repos.auditoria.registrar(
      { casal_id: null, usuari_id: usuari.id, tipus_operacio: "sessio.inici", entitat: "sessio", entitat_id: null, resultat: "exit", id_peticio: c.get("idPeticio") },
      ara,
    );
    return c.json({ ok: true });
  })
  .post("/sortir", async (c) => {
    await tancarSessio(c);
    return c.json({ ok: true });
  })
  .get("/jo", requereixSessio, async (c) => {
    const usuari = c.get("usuari");
    const ids = usuari.casalsAccessibles();
    const casals = await c.get("repos").casals.llistar(ids === null ? {} : { ids, nomesActius: true });
    return c.json({
      usuari: { id: usuari.id, nom_visible: usuari.usuari.nom_visible, email: usuari.usuari.email },
      administracio_central: ids === null,
      pot_crear_casals: usuari.esGlobal("casal.configurar"),
      casals: casals.map((k) => ({ id: k.id, codi: k.codi, nom: k.nom, actiu: k.actiu, permisos: usuari.permisosA(k.id) })),
    });
  });
