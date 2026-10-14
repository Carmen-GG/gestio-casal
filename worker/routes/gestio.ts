import { Hono, type Context } from "hono";
import type { Entorn } from "../app";
import { requereixSessio } from "../auth/sessio";
import { errors } from "../http/errors";
import { cosValidat, idRuta } from "../http/validacio";
import {
  activitatActualitzar, activitatCanviEstat, activitatCrear, activitatDuplicar, assignarRol, casalActualitzar,
  casalCrear, cicleActualitzar, cicleCanviEstat, cicleCrear, revocarRol,
} from "../../shared/schemas/gestio";
import { transicionsPermeses } from "../../shared/domain/cicles";
import { configuracioFormulariEfectiva } from "../../shared/domain/formulari";
import { ServeiCasals } from "../services/casals";
import { ServeiCicles } from "../services/cicles";
import { ServeiActivitats } from "../services/activitats";
import { ServeiUsuaris } from "../services/usuaris";
import { ServeiGestioSollicituds, filtraParticipant, taulaSollicituds, visibilitat } from "../services/gestio-sollicituds";
import { ServeiImportacions } from "../services/importacions";
import {
  consultaSollicituds, importacioConfirmacio, importacioPeticio, revisioDuplicat, sollicitudActualitzarDades,
  sollicitudCanviEstat, sollicitudPreferencies,
} from "../../shared/schemas/sollicituds";
import { errorsPerCamp } from "../../shared/schemas/comuns";
import { ESTATS_ACTIVITAT, type EstatActivitat } from "../repositories/tipus";

type C = Context<Entorn>;
const ctx = (c: C) => ({ usuariId: c.get("usuari").id, idPeticio: c.get("idPeticio") });
const casals = (c: C) => new ServeiCasals(c.get("repos"), c.get("rellotge"));
const cicles = (c: C) => new ServeiCicles(c.get("repos"), c.get("rellotge"));
const activitats = (c: C) => new ServeiActivitats(c.get("repos"), c.get("rellotge"));
const sollicituds = (c: C) => new ServeiGestioSollicituds(c.get("repos"), c.get("rellotge"));
const importacions = (c: C) => new ServeiImportacions(c.get("repos"), c.get("rellotge"));

/** Detall d'una sol·licitud amb només les dades que la persona usuària pot veure. */
async function detallVisible(c: C, casalId: string, id: string) {
  const detall = await sollicituds(c).obtenir(casalId, id);
  return filtraParticipant(detall, visibilitat(c.get("usuari"), casalId));
}

/** Comprova el permís al casal de la ruta i en retorna l'id. */
function casalAutoritzat(c: C, permis: string): string {
  const casalId = idRuta(c, "casalId");
  const usuari = c.get("usuari");
  if (!usuari.teAccesCasal(casalId)) throw errors.sensePermis();
  usuari.exigeix(permis, casalId);
  return casalId;
}

/**
 * Rutes del panell de gestió. Totes exigeixen sessió, i cada ruta comprova el
 * permís concret al casal indicat. Els repositoris filtren sempre per casal.
 */
export const rutesGestio = new Hono<Entorn>()
  .use("*", requereixSessio)

  // ---------- Casals ----------
  .get("/casals", async (c) => {
    const ids = c.get("usuari").casalsAccessibles();
    return c.json({ casals: await c.get("repos").casals.llistar(ids === null ? {} : { ids }) });
  })
  .post("/casals", async (c) => {
    if (!c.get("usuari").esGlobal("casal.configurar")) throw errors.sensePermis();
    const dades = await cosValidat(c, casalCrear);
    return c.json({ casal: await casals(c).crear(dades, ctx(c)) }, 201);
  })
  .get("/casals/:casalId", async (c) => {
    const casalId = casalAutoritzat(c, "casal.consultar");
    return c.json({ casal: await casals(c).obtenir(casalId) });
  })
  .patch("/casals/:casalId", async (c) => {
    const casalId = casalAutoritzat(c, "casal.configurar");
    const { motiu, ...canvis } = await cosValidat(c, casalActualitzar);
    return c.json({ casal: await casals(c).actualitzar(casalId, canvis, { ...ctx(c), motiu }) });
  })

  // ---------- Cicles ----------
  .get("/casals/:casalId/cicles", async (c) => {
    const casalId = casalAutoritzat(c, "cicles.consultar");
    return c.json({ cicles: await c.get("repos").cicles.llistarPerCasal(casalId) });
  })
  .post("/casals/:casalId/cicles", async (c) => {
    const casalId = casalAutoritzat(c, "cicles.gestionar");
    const dades = await cosValidat(c, cicleCrear);
    return c.json({ cicle: await cicles(c).crear(casalId, dades, ctx(c)) }, 201);
  })
  .get("/casals/:casalId/cicles/:cicleId", async (c) => {
    const casalId = casalAutoritzat(c, "cicles.consultar");
    const cicle = await cicles(c).obtenir(casalId, idRuta(c, "cicleId"));
    return c.json({
      cicle,
      transicions: transicionsPermeses(cicle.estat),
      formulari: configuracioFormulariEfectiva(cicle.configuracio_formulari),
      accepta_sollicituds: cicles(c).acceptaSollicituds(cicle),
    });
  })
  .patch("/casals/:casalId/cicles/:cicleId", async (c) => {
    const casalId = casalAutoritzat(c, "cicles.gestionar");
    const { versio, motiu, ...canvis } = await cosValidat(c, cicleActualitzar);
    const cicle = await cicles(c).actualitzar(casalId, idRuta(c, "cicleId"), canvis, { ...ctx(c), versio, motiu });
    return c.json({ cicle });
  })
  .post("/casals/:casalId/cicles/:cicleId/estat", async (c) => {
    const casalId = casalAutoritzat(c, "cicles.gestionar");
    const { estat, versio, confirmacio, motiu } = await cosValidat(c, cicleCanviEstat);
    const cicle = await cicles(c).canviarEstat(casalId, idRuta(c, "cicleId"), estat, {
      ...ctx(c), versioEsperada: versio, confirmacio, motiu,
    });
    return c.json({ cicle, transicions: transicionsPermeses(cicle.estat) });
  })

  // ---------- Activitats ----------
  .get("/casals/:casalId/cicles/:cicleId/activitats", async (c) => {
    const casalId = casalAutoritzat(c, "activitats.consultar");
    const cicle = await cicles(c).obtenir(casalId, idRuta(c, "cicleId"));
    const estat = c.req.query("estat");
    const estats = estat && (ESTATS_ACTIVITAT as readonly string[]).includes(estat) ? [estat as EstatActivitat] : undefined;
    return c.json({ activitats: await c.get("repos").activitats.llistarPerCicle(casalId, cicle.id, { estats }) });
  })
  .post("/casals/:casalId/cicles/:cicleId/activitats", async (c) => {
    const casalId = casalAutoritzat(c, "activitats.gestionar");
    const dades = await cosValidat(c, activitatCrear);
    return c.json({ activitat: await activitats(c).crear(casalId, idRuta(c, "cicleId"), dades, ctx(c)) }, 201);
  })
  .get("/casals/:casalId/activitats/:activitatId", async (c) => {
    const casalId = casalAutoritzat(c, "activitats.consultar");
    return c.json({ activitat: await activitats(c).obtenir(casalId, idRuta(c, "activitatId")) });
  })
  .patch("/casals/:casalId/activitats/:activitatId", async (c) => {
    const casalId = casalAutoritzat(c, "activitats.gestionar");
    const { versio, confirmacio, motiu, ...canvis } = await cosValidat(c, activitatActualitzar);
    const activitat = await activitats(c).actualitzar(casalId, idRuta(c, "activitatId"), canvis, { ...ctx(c), versio, confirmacio, motiu });
    return c.json({ activitat });
  })
  .post("/casals/:casalId/activitats/:activitatId/estat", async (c) => {
    const casalId = casalAutoritzat(c, "activitats.gestionar");
    const { estat, versio, motiu } = await cosValidat(c, activitatCanviEstat);
    return c.json({ activitat: await activitats(c).canviarEstat(casalId, idRuta(c, "activitatId"), estat, { ...ctx(c), versio, motiu }) });
  })
  .post("/casals/:casalId/activitats/:activitatId/duplicar", async (c) => {
    const casalId = casalAutoritzat(c, "activitats.gestionar");
    const opcions = await cosValidat(c, activitatDuplicar);
    return c.json({ activitat: await activitats(c).duplicar(casalId, idRuta(c, "activitatId"), { ...ctx(c), ...opcions }) }, 201);
  })

  // ---------- Sol·licituds ----------
  .get("/casals/:casalId/cicles/:cicleId/sollicituds", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    const consulta = consultaSollicituds.safeParse(c.req.query());
    if (!consulta.success) throw errors.peticioInvalida("Paràmetres de consulta no vàlids.", errorsPerCamp(consulta.error));
    return c.json(await sollicituds(c).llistar(casalId, idRuta(c, "cicleId"), consulta.data, visibilitat(c.get("usuari"), casalId)));
  })
  .get("/casals/:casalId/cicles/:cicleId/duplicats", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    return c.json({ parelles: await sollicituds(c).duplicats(casalId, idRuta(c, "cicleId"), visibilitat(c.get("usuari"), casalId)) });
  })
  .post("/casals/:casalId/cicles/:cicleId/duplicats/revisio", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.gestionar");
    const dades = await cosValidat(c, revisioDuplicat);
    return c.json(await sollicituds(c).revisarDuplicat(casalId, idRuta(c, "cicleId"), dades, ctx(c)));
  })
  .get("/casals/:casalId/sollicituds/:sollicitudId", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    return c.json({ sollicitud: await detallVisible(c, casalId, idRuta(c, "sollicitudId")) });
  })
  .patch("/casals/:casalId/sollicituds/:sollicitudId/dades", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.gestionar");
    const { versio_participant, dades, motiu } = await cosValidat(c, sollicitudActualitzarDades);
    const id = idRuta(c, "sollicitudId");
    await sollicituds(c).actualitzarDades(casalId, id, dades, {
      ...ctx(c), versioParticipant: versio_participant, motiu, vis: visibilitat(c.get("usuari"), casalId),
    });
    return c.json({ sollicitud: await detallVisible(c, casalId, id) });
  })
  .post("/casals/:casalId/sollicituds/:sollicitudId/estat", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.gestionar");
    const { versio, estat, motiu } = await cosValidat(c, sollicitudCanviEstat);
    const id = idRuta(c, "sollicitudId");
    await sollicituds(c).canviarEstat(casalId, id, estat, { ...ctx(c), versio, motiu });
    return c.json({ sollicitud: await detallVisible(c, casalId, id) });
  })
  .put("/casals/:casalId/sollicituds/:sollicitudId/preferencies", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.gestionar");
    const { versio, preferencies, motiu } = await cosValidat(c, sollicitudPreferencies);
    const id = idRuta(c, "sollicitudId");
    await sollicituds(c).actualitzarPreferencies(casalId, id, preferencies, { ...ctx(c), versio, motiu });
    return c.json({ sollicitud: await detallVisible(c, casalId, id) });
  })

  // ---------- Importacions ----------
  .post("/casals/:casalId/cicles/:cicleId/importacions/:tipus/previsualitzacio", async (c) => {
    const casalId = casalAutoritzat(c, "dades.importar");
    const { files } = await cosValidat(c, importacioPeticio);
    const tipus = c.req.param("tipus");
    const servei = importacions(c);
    if (tipus === "sollicituds") return c.json(await servei.previsualitzarSollicituds(casalId, idRuta(c, "cicleId"), files));
    if (tipus === "activitats") {
      c.get("usuari").exigeix("activitats.gestionar", casalId);
      return c.json(await servei.previsualitzarActivitats(casalId, idRuta(c, "cicleId"), files));
    }
    throw errors.noTrobat();
  })
  .post("/casals/:casalId/cicles/:cicleId/importacions/:tipus", async (c) => {
    const casalId = casalAutoritzat(c, "dades.importar");
    const dades = await cosValidat(c, importacioConfirmacio);
    const tipus = c.req.param("tipus");
    const servei = importacions(c);
    if (tipus === "sollicituds") return c.json(await servei.confirmarSollicituds(casalId, idRuta(c, "cicleId"), dades, ctx(c)), 201);
    if (tipus === "activitats") {
      c.get("usuari").exigeix("activitats.gestionar", casalId);
      return c.json(await servei.confirmarActivitats(casalId, idRuta(c, "cicleId"), dades, ctx(c)), 201);
    }
    throw errors.noTrobat();
  })

  // ---------- Exportacions ----------
  // Les dades surten amb les mateixes regles de visibilitat que la consulta; cada exportació queda auditada.
  .get("/casals/:casalId/cicles/:cicleId/exportacions/sollicituds", async (c) => {
    const casalId = casalAutoritzat(c, "dades.exportar");
    c.get("usuari").exigeix("sollicituds.consultar", casalId);
    const cicle = await sollicituds(c).cicle(casalId, idRuta(c, "cicleId"));
    const activitat = c.req.query("activitat");
    if (activitat !== undefined && !/^[0-9a-f-]{36}$/.test(activitat)) throw errors.noTrobat();
    const vis = visibilitat(c.get("usuari"), casalId);
    const taula = await taulaSollicituds(c.get("repos"), casalId, cicle, vis, activitat);
    await c.get("repos").auditoria.registrar({
      casal_id: casalId, usuari_id: c.get("usuari").id, tipus_operacio: "exportacio.sollicituds", entitat: "cicle", entitat_id: cicle.id,
      resultat: "exit", id_peticio: c.get("idPeticio"), detalls: { files: taula.files.length, activitat_id: activitat ?? null, dades_contacte: vis.contacte },
    }, new Date(c.get("rellotge").ara()).toISOString());
    return c.json(taula);
  })

  // ---------- Historial ----------
  .get("/casals/:casalId/historial/:entitat/:entitatId", async (c) => {
    const entitat = c.req.param("entitat");
    const permis = { casal: "casal.consultar", cicle: "cicles.consultar", activitat: "activitats.consultar", sollicitud: "sollicituds.consultar" }[entitat];
    if (!permis) throw errors.noTrobat();
    const casalId = casalAutoritzat(c, permis);
    const entitatId = idRuta(c, "entitatId");
    const entrades = await c.get("repos").historial.llistar(entitat, entitatId);
    // Defensa addicional: només entrades del casal de la ruta.
    return c.json({ historial: entrades.filter((e) => e.casal_id === casalId) });
  })

  // ---------- Persones autoritzades ----------
  .get("/casals/:casalId/usuaris", async (c) => {
    const casalId = casalAutoritzat(c, "usuaris.gestionar");
    return c.json({ assignacions: await c.get("repos").usuaris.assignacionsCasal(casalId) });
  })
  .post("/casals/:casalId/usuaris", async (c) => {
    const casalId = casalAutoritzat(c, "usuaris.gestionar");
    const dades = await cosValidat(c, assignarRol);
    const servei = new ServeiUsuaris(c.get("repos"), c.get("rellotge"), c.env.APP_ENV === "production" ? "entra_id" : "dev");
    return c.json({ assignacio: await servei.assignarRol(casalId, dades, ctx(c)) }, 201);
  })
  .post("/casals/:casalId/usuaris/:assignacioId/revocar", async (c) => {
    const casalId = casalAutoritzat(c, "usuaris.gestionar");
    const { motiu } = await cosValidat(c, revocarRol);
    const servei = new ServeiUsuaris(c.get("repos"), c.get("rellotge"), c.env.APP_ENV === "production" ? "entra_id" : "dev");
    await servei.revocar(casalId, idRuta(c, "assignacioId"), { ...ctx(c), motiu });
    return c.json({ ok: true });
  })

  // ---------- Auditoria ----------
  .get("/casals/:casalId/auditoria", async (c) => {
    const casalId = casalAutoritzat(c, "auditoria.consultar");
    const limit = Number(c.req.query("limit") ?? "100");
    return c.json({ registres: await c.get("repos").auditoria.llistar({ casalId, limit: Number.isFinite(limit) ? limit : 100 }) });
  });
