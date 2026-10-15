import { Hono } from "hono";
import { z } from "zod";
import type { Entorn } from "../app";
import { iniciarSessio, requereixSessio, tancarSessio } from "../auth/sessio";
import { ErrorAplicacio, errors } from "../http/errors";
import { cosValidat } from "../http/validacio";
import { resumSha256 } from "../lib/cripto";
import {
  comprovaContrasenya, LLARGADA_MAXIMA_CONTRASENYA, LLARGADA_MINIMA_CONTRASENYA, resumContrasenya,
} from "../auth/contrasenya";

const entrada = z.strictObject({ testimoni: z.string().min(20).max(100) });
const entradaContrasenya = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  contrasenya: z.string().min(1).max(LLARGADA_MAXIMA_CONTRASENYA),
});
const canviContrasenya = z.strictObject({
  actual: z.string().max(LLARGADA_MAXIMA_CONTRASENYA).optional(),
  nova: z.string()
    .min(LLARGADA_MINIMA_CONTRASENYA, `La contrasenya ha de tenir almenys ${LLARGADA_MINIMA_CONTRASENYA} caràcters.`)
    .max(LLARGADA_MAXIMA_CONTRASENYA)
    .refine((v) => v.trim().length === v.length, "La contrasenya no pot començar ni acabar amb espais."),
});

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
  .post("/entrar-contrasenya", async (c) => {
    // Límit d'intents per origen de xarxa (la IP només es fa servir resumida com a clau, no es desa).
    if (c.env.LIMIT_ENTRADA) {
      const ip = c.req.header("cf-connecting-ip") ?? "desconeguda";
      const { success } = await c.env.LIMIT_ENTRADA.limit({ key: await resumSha256(`entrada:${ip}`) });
      if (!success) throw new ErrorAplicacio(429, "massa_peticions", "Massa intents seguits. Espereu un minut i torneu-ho a provar.");
    }
    const { email, contrasenya } = await cosValidat(c, entradaContrasenya);
    const repos = c.get("repos");
    const ara = c.get("rellotge").ara().toISOString();
    const usuari = await repos.usuaris.perEmail(email);
    // Es calcula el resum encara que la persona no existeixi, perquè el temps no ho reveli.
    const valida = await comprovaContrasenya(contrasenya, usuari ? await repos.usuaris.resumContrasenya(usuari.id) : null);
    if (!usuari || !usuari.actiu || !valida) {
      await repos.auditoria.registrar(
        { casal_id: null, usuari_id: null, tipus_operacio: "sessio.inici", entitat: "sessio", entitat_id: null, resultat: "denegat", id_peticio: c.get("idPeticio") },
        ara,
      );
      throw new ErrorAplicacio(401, "credencials_no_valides", "El correu o la contrasenya no són correctes.");
    }
    await iniciarSessio(c, usuari.id);
    await repos.auditoria.registrar(
      { casal_id: null, usuari_id: usuari.id, tipus_operacio: "sessio.inici", entitat: "sessio", entitat_id: null, resultat: "exit", id_peticio: c.get("idPeticio") },
      ara,
    );
    return c.json({ ok: true });
  })
  .post("/contrasenya", requereixSessio, async (c) => {
    const { actual, nova } = await cosValidat(c, canviContrasenya);
    const repos = c.get("repos");
    const usuari = c.get("usuari");
    const ara = c.get("rellotge").ara().toISOString();
    const desada = await repos.usuaris.resumContrasenya(usuari.id);
    // Si ja en té una, cal la contrasenya actual: una sessió oberta no n'hi ha prou per canviar-la.
    if (desada && !(await comprovaContrasenya(actual ?? "", desada))) {
      throw errors.peticioInvalida("La contrasenya actual no és correcta.", { actual: "La contrasenya actual no és correcta." });
    }
    await repos.usuaris.fixarContrasenya(usuari.id, await resumContrasenya(nova), ara);
    await repos.auditoria.registrar(
      { casal_id: null, usuari_id: usuari.id, tipus_operacio: "usuari.contrasenya", entitat: "usuari", entitat_id: usuari.id, resultat: "exit", id_peticio: c.get("idPeticio") },
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
      te_contrasenya: (await c.get("repos").usuaris.resumContrasenya(usuari.id)) !== null,
      pot_crear_casals: usuari.esGlobal("casal.configurar"),
      pot_gestionar_plantilles_comunes: usuari.esGlobal("cartells.plantilles"),
      casals: casals.map((k) => ({ id: k.id, codi: k.codi, nom: k.nom, actiu: k.actiu, permisos: usuari.permisosA(k.id) })),
    });
  });
