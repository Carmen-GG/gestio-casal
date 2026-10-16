import { z } from "zod";
import { Hono, type Context } from "hono";
import type { Entorn } from "../app";
import { requereixSessio } from "../auth/sessio";
import { errors } from "../http/errors";
import { cosValidat, idRuta } from "../http/validacio";
import {
  activitatActualitzar, activitatCanviEstat, activitatCrear, activitatDuplicar, assignarResponsable, assignarRol, casalActualitzar,
  cicleActualitzar, cicleCanviEstat, cicleEliminar, cicleCrear, revocarRol,
} from "../../shared/schemas/gestio";
import { transicionsPermeses } from "../../shared/domain/cicles";
import { configuracioFormulariEfectiva } from "../../shared/domain/formulari";
import { ServeiCasals } from "../services/casals";
import { ServeiCicles } from "../services/cicles";
import { ServeiActivitats } from "../services/activitats";
import { ServeiUsuaris } from "../services/usuaris";
import { ServeiAdministracio } from "../services/administracio";
import { ServeiGestioSollicituds, emmascaraDocument, filtraParticipant, taulaSollicituds, visibilitat } from "../services/gestio-sollicituds";
import { ServeiImportacions } from "../services/importacions";
import { ServeiAdjudicacio } from "../services/adjudicacio";
import { ServeiAssistencia } from "../services/assistencia";
import { ServeiIndicadors } from "../services/indicadors";
import { ServeiComunicacions } from "../services/comunicacions";
import { registreComunicacio } from "../../shared/schemas/comunicacions";
import { ServeiWhatsapp } from "../services/whatsapp";
import { ServeiComunicats } from "../services/comunicats";
import { ServeiIncidencies } from "../services/incidencies";
import { faltaTallerista, incidenciaNova, incidenciaResolucio, referentCanvis, referentNou, territoriCasal } from "../../shared/schemas/territori";
import { comunicat, configWhatsappCentral, telefonUsuari } from "../../shared/schemas/comunicats";
import { configWhatsapp, enviamentActivitat, enviamentGeneral } from "../../shared/schemas/whatsapp";
import { ServeiPersonesPlataforma } from "../services/persones-plataforma";
import { cercaPersones, importacioPersones } from "../../shared/schemas/persones-plataforma";
import type { CampPersona } from "../../shared/domain/persones-plataforma";
import { baixaAssistencia, baixaVoluntaria, cancellarSessio, novaSessio, registrarAssistencia } from "../../shared/schemas/assistencia";
import { anullarSorteig, confirmarProposta, desarParametres, movimentPlaca, novaProposta, nouSorteig } from "../../shared/schemas/adjudicacio";
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
const adjudicacio = (c: C) => new ServeiAdjudicacio(c.get("repos"), c.get("rellotge"));
const assistencia = (c: C) => new ServeiAssistencia(c.get("repos"), c.get("rellotge"));
const comunicacions = (c: C) => new ServeiComunicacions(c.get("repos"), c.get("rellotge"));
const whatsapp = (c: C) => new ServeiWhatsapp(c.get("repos"), c.get("rellotge"), c.env, c.get("fetchMeta"));
const comunicats = (c: C) => new ServeiComunicats(c.get("repos"), c.get("rellotge"), c.env, c.get("fetchMeta"));
const personesPlataforma = (c: C) => new ServeiPersonesPlataforma(c.get("repos"), c.get("rellotge"));
const indicadors = (c: C) => new ServeiIndicadors(c.get("repos"), c.get("rellotge"));
const incidencies = (c: C) => new ServeiIncidencies(c.get("repos"), c.get("rellotge"));
const INCIDENCIES = ["assistencia.registrar", "activitats.gestionar"];
const anyConsulta = (c: C) => { const a = c.req.query("any"); return a && /^\d{4}$/.test(a) ? Number(a) : null; };

/** Registra una exportació a l'auditoria (sense dades personals) i retorna la taula. */
async function exportacioAuditada(c: C, casalId: string, tipus: string, entitat: string, entitatId: string, taula: { files: unknown[] }, extra: Record<string, unknown> = {}) {
  await c.get("repos").auditoria.registrar({
    casal_id: casalId, usuari_id: c.get("usuari").id, tipus_operacio: `exportacio.${tipus}`, entitat, entitat_id: entitatId,
    resultat: "exit", id_peticio: c.get("idPeticio"), detalls: { files: taula.files.length, ...extra },
  }, new Date(c.get("rellotge").ara()).toISOString());
  return c.json(taula);
}

/** Detall d'una sol·licitud amb només les dades que la persona usuària pot veure. */
async function detallVisible(c: C, casalId: string, id: string) {
  const detall = await sollicituds(c).obtenir(casalId, id);
  return filtraParticipant(detall, visibilitat(c.get("usuari"), casalId));
}

const proveidor = (c: C): "dev" | "entra_id" => (c.env.APP_ENV === "production" ? "entra_id" : "dev");
const usuarisCasal = (c: C) => new ServeiUsuaris(c.get("repos"), c.get("rellotge"), proveidor(c));
const administracio = (c: C) => new ServeiAdministracio(c.get("repos"), c.get("rellotge"), proveidor(c));

/** Superadministració: permís global de gestionar persones (rol admin_central). */
function exigeixSuperadministracio(c: C) {
  if (!c.get("usuari").esGlobal("usuaris.gestionar")) throw errors.sensePermis();
}

/** Comprova el permís al casal de la ruta i en retorna l'id. */
function casalAutoritzat(c: C, permis: string): string {
  const casalId = idRuta(c, "casalId");
  const usuari = c.get("usuari");
  if (!usuari.teAccesCasal(casalId)) throw errors.sensePermis();
  usuari.exigeix(permis, casalId);
  return casalId;
}

/** Com casalAutoritzat, però n'hi ha prou amb un dels permisos. */
function casalAutoritzatAlgun(c: C, permisos: string[]): string {
  const casalId = idRuta(c, "casalId");
  const usuari = c.get("usuari");
  if (!usuari.teAccesCasal(casalId)) throw errors.sensePermis();
  if (!permisos.some((p) => usuari.pot(p, casalId))) throw errors.sensePermis();
  return casalId;
}
/** L'assistència la veu qui gestiona les inscripcions i qui passa llista (conserge), amb el telèfon a les graelles. */
const ASSISTENCIA = ["sollicituds.consultar", "assistencia.registrar"];
const visibilitatAssistencia = (c: C, casalId: string) =>
  ({ contacte: c.get("usuari").pot("sollicituds.dades_contacte", casalId) || c.get("usuari").pot("assistencia.registrar", casalId) });

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
  // Els casals són fixos (llista oficial carregada per migració): no es poden crear des de l'aplicació.
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
  .delete("/casals/:casalId/cicles/:cicleId", async (c) => {
    const casalId = casalAutoritzat(c, "cicles.gestionar");
    const { versio, motiu } = await cosValidat(c, cicleEliminar);
    return c.json(await cicles(c).eliminar(casalId, idRuta(c, "cicleId"), { versio, motiu }, ctx(c)));
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
  // Autorització del tutor d'una persona menor: només per a qui pot veure les dades de contacte.
  .get("/casals/:casalId/sollicituds/:sollicitudId/autoritzacio-tutor", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.dades_contacte");
    const id = idRuta(c, "sollicitudId");
    await sollicituds(c).obtenir(casalId, id);
    const a = await c.get("repos").sollicituds.autoritzacioTutor(casalId, id);
    return c.json({ autoritzacio: a && { ...a, document_identitat: emmascaraDocument(a.document_identitat) } });
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
  // Llistat d'activitats de la PGEc: s'importa tot directament, sense previsualització.
  .post("/casals/:casalId/cicles/:cicleId/importacions/activitats-pgec", async (c) => {
    const casalId = casalAutoritzat(c, "activitats.gestionar");
    const { files } = await cosValidat(c, importacioPeticio);
    return c.json(await importacions(c).importarActivitatsDirecte(casalId, idRuta(c, "cicleId"), files, ctx(c)), 201);
  })
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

  // ---------- Adjudicació ----------
  .get("/casals/:casalId/cicles/:cicleId/adjudicacio", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    return c.json(await adjudicacio(c).resum(casalId, idRuta(c, "cicleId")));
  })
  .put("/casals/:casalId/cicles/:cicleId/adjudicacio/parametres", async (c) => {
    const casalId = casalAutoritzat(c, "adjudicacio.executar");
    const cos = await cosValidat(c, desarParametres);
    return c.json({ configuracio: await adjudicacio(c).desarParametres(casalId, idRuta(c, "cicleId"), cos, ctx(c)) });
  })
  .post("/casals/:casalId/cicles/:cicleId/adjudicacio/propostes", async (c) => {
    const casalId = casalAutoritzat(c, "adjudicacio.executar");
    const cos = await cosValidat(c, novaProposta);
    return c.json({ execucio: await adjudicacio(c).calcularProposta(casalId, idRuta(c, "cicleId"), cos, ctx(c)) }, 201);
  })
  .get("/casals/:casalId/adjudicacions/:execucioId", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    return c.json(await adjudicacio(c).detallExecucio(casalId, idRuta(c, "execucioId"), visibilitat(c.get("usuari"), casalId)));
  })
  .post("/casals/:casalId/adjudicacions/:execucioId/confirmar", async (c) => {
    const casalId = casalAutoritzat(c, "adjudicacio.confirmar");
    const cos = await cosValidat(c, confirmarProposta);
    return c.json({ execucio: await adjudicacio(c).confirmar(casalId, idRuta(c, "execucioId"), cos, ctx(c)) });
  })
  .get("/casals/:casalId/adjudicacions/:execucioId/exportacio", async (c) => {
    const casalId = casalAutoritzat(c, "dades.exportar");
    c.get("usuari").exigeix("sollicituds.consultar", casalId);
    const id = idRuta(c, "execucioId");
    const vis = visibilitat(c.get("usuari"), casalId);
    return exportacioAuditada(c, casalId, "adjudicacio", "execucio_adjudicacio", id, await adjudicacio(c).taulaResultats(casalId, id, vis));
  })
  .get("/casals/:casalId/adjudicacions/:execucioId/exportacions/sense-activitat", async (c) => {
    const casalId = casalAutoritzat(c, "dades.exportar");
    c.get("usuari").exigeix("sollicituds.consultar", casalId);
    const id = idRuta(c, "execucioId");
    const vis = visibilitat(c.get("usuari"), casalId);
    return exportacioAuditada(c, casalId, "adjudicacio.sense_activitat", "execucio_adjudicacio", id, await adjudicacio(c).taulaSenseActivitat(casalId, id, vis));
  })

  // ---------- Sorteig per activitat ----------
  .get("/casals/:casalId/cicles/:cicleId/sorteig", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    return c.json(await adjudicacio(c).estatSorteig(casalId, idRuta(c, "cicleId")));
  })
  .post("/casals/:casalId/cicles/:cicleId/sorteig/numeros", async (c) => {
    const casalId = casalAutoritzat(c, "adjudicacio.executar");
    return c.json(await adjudicacio(c).assignarNumeros(casalId, idRuta(c, "cicleId"), ctx(c)));
  })
  .post("/casals/:casalId/cicles/:cicleId/activitats/:activitatId/sorteig", async (c) => {
    const casalId = casalAutoritzat(c, "adjudicacio.executar");
    const cos = await cosValidat(c, nouSorteig);
    return c.json({ sorteig: await adjudicacio(c).ferSorteig(casalId, idRuta(c, "cicleId"), idRuta(c, "activitatId"), cos, ctx(c)) }, 201);
  })
  .post("/casals/:casalId/cicles/:cicleId/sortejos/:sorteigId/anullacio", async (c) => {
    const casalId = casalAutoritzat(c, "adjudicacio.executar");
    const cos = await cosValidat(c, anullarSorteig);
    return c.json(await adjudicacio(c).anullarSorteig(casalId, idRuta(c, "cicleId"), idRuta(c, "sorteigId"), cos, ctx(c)));
  })
  .get("/casals/:casalId/cicles/:cicleId/exportacions/numeros-sorteig", async (c) => {
    const casalId = casalAutoritzat(c, "dades.exportar");
    c.get("usuari").exigeix("sollicituds.consultar", casalId);
    const cicleId = idRuta(c, "cicleId");
    const vis = visibilitat(c.get("usuari"), casalId);
    return exportacioAuditada(c, casalId, "numeros_sorteig", "cicle", cicleId, await adjudicacio(c).taulaNumeros(casalId, cicleId, vis));
  })

  // ---------- Places i llistes d'espera ----------
  .get("/casals/:casalId/cicles/:cicleId/places", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    return c.json(await adjudicacio(c).places(casalId, idRuta(c, "cicleId"), visibilitat(c.get("usuari"), casalId)));
  })
  .post("/casals/:casalId/places/:placaId/moviments", async (c) => {
    const casalId = casalAutoritzat(c, "places.gestionar");
    const cos = await cosValidat(c, movimentPlaca);
    return c.json(await adjudicacio(c).moviment(casalId, idRuta(c, "placaId"), cos, ctx(c)));
  })
  // ---------- Buscar usuari/a: persones importades de la PGEc ----------
  .get("/casals/:casalId/persones-plataforma", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    const consulta = cercaPersones.safeParse(c.req.query());
    if (!consulta.success) throw errors.peticioInvalida("Paràmetres de consulta no vàlids.", errorsPerCamp(consulta.error));
    const servei = personesPlataforma(c);
    const [resultat, resum] = await Promise.all([
      servei.cercar(casalId, consulta.data.q, consulta.data.camp as CampPersona | "tots", visibilitat(c.get("usuari"), casalId)),
      servei.resum(casalId),
    ]);
    return c.json({ ...resultat, resum });
  })
  .get("/casals/:casalId/persones-plataforma/:personaId", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    return c.json(await personesPlataforma(c).fitxa(casalId, idRuta(c, "personaId"), visibilitat(c.get("usuari"), casalId)));
  })
  // Els llistats de la PGEc porten telèfons i adreces: per importar-los cal poder-los veure.
  .post("/casals/:casalId/persones-plataforma/importacio", async (c) => {
    const casalId = casalAutoritzat(c, "dades.importar");
    c.get("usuari").exigeix("sollicituds.dades_contacte", casalId);
    const cos = await cosValidat(c, importacioPersones);
    return c.json(await personesPlataforma(c).importar(casalId, cos, ctx(c)));
  })
  // Comunicació de l'assignació: cal poder veure el telèfon de les persones.
  .get("/casals/:casalId/cicles/:cicleId/comunicacions", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.dades_contacte");
    c.get("usuari").exigeix("sollicituds.consultar", casalId);
    return c.json(await comunicacions(c).assignacions(casalId, idRuta(c, "cicleId")));
  })
  // ---------- WhatsApp Business ----------
  .get("/casals/:casalId/whatsapp", async (c) => {
    const casalId = casalAutoritzat(c, "casal.consultar");
    return c.json(await whatsapp(c).estat(casalId));
  })
  .put("/casals/:casalId/whatsapp", async (c) => {
    const casalId = casalAutoritzat(c, "casal.configurar");
    const cos = await cosValidat(c, configWhatsapp);
    return c.json(await whatsapp(c).configurar(casalId, { ...cos, numero_visible: cos.numero_visible?.trim() || null }, ctx(c)));
  })
  .post("/casals/:casalId/whatsapp/comprovacio", async (c) => {
    const casalId = casalAutoritzat(c, "casal.configurar");
    return c.json(await whatsapp(c).comprovar(casalId));
  })
  .get("/casals/:casalId/cicles/:cicleId/whatsapp", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.dades_contacte");
    return c.json(await whatsapp(c).resum(casalId, idRuta(c, "cicleId")));
  })
  .post("/casals/:casalId/cicles/:cicleId/whatsapp/activitats", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.dades_contacte");
    const cos = await cosValidat(c, enviamentActivitat);
    return c.json(await whatsapp(c).crearEnviamentActivitat(casalId, idRuta(c, "cicleId"), cos, ctx(c)), 201);
  })
  .post("/casals/:casalId/cicles/:cicleId/whatsapp/generals", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.dades_contacte");
    const cos = await cosValidat(c, enviamentGeneral);
    return c.json(await whatsapp(c).crearEnviamentGeneral(casalId, idRuta(c, "cicleId"), cos, ctx(c)), 201);
  })
  .post("/casals/:casalId/whatsapp/enviaments/:enviamentId/continua", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.dades_contacte");
    return c.json(await whatsapp(c).continuar(casalId, idRuta(c, "enviamentId"), ctx(c)));
  })
  .put("/casals/:casalId/places/:placaId/comunicacio", async (c) => {
    const casalId = casalAutoritzat(c, "places.gestionar");
    c.get("usuari").exigeix("sollicituds.dades_contacte", casalId);
    const cos = await cosValidat(c, registreComunicacio);
    return c.json(await comunicacions(c).registrar(casalId, idRuta(c, "placaId"), cos, ctx(c)));
  })
  .post("/casals/:casalId/places/:placaId/comunicacio/desfer", async (c) => {
    const casalId = casalAutoritzat(c, "places.gestionar");
    c.get("usuari").exigeix("sollicituds.dades_contacte", casalId);
    return c.json(await comunicacions(c).esborrar(casalId, idRuta(c, "placaId"), ctx(c)));
  })
  .post("/casals/:casalId/places/:placaId/baixa-voluntaria", async (c) => {
    const casalId = casalAutoritzat(c, "places.gestionar");
    const cos = await cosValidat(c, baixaVoluntaria);
    const r = await assistencia(c).baixaVoluntaria(casalId, idRuta(c, "placaId"), cos, visibilitat(c.get("usuari"), casalId), ctx(c));
    // Amb WhatsApp Business actiu, l'oferta s'envia sola. La baixa ja és desada: un error aquí no la desfà.
    let whatsappOferta = null;
    if (r.oferta) {
      try {
        const placa = await c.get("repos").adjudicacio.placa(casalId, r.oferta.placa_id);
        if (placa) whatsappOferta = await whatsapp(c).ofertaAutomatica(casalId, placa.cicle_id, placa.id, ctx(c));
      } catch {
        whatsappOferta = { enviat: false, estat: "error", motiu: null, error: "No s'ha pogut enviar l'oferta per WhatsApp Business." };
      }
    }
    return c.json({ ...r, whatsapp: whatsappOferta });
  })
  .post("/casals/:casalId/places/:placaId/baixa-assistencia", async (c) => {
    const casalId = casalAutoritzat(c, "places.gestionar");
    const cos = await cosValidat(c, baixaAssistencia);
    return c.json(await assistencia(c).baixaPerAssistencia(casalId, idRuta(c, "placaId"), cos, ctx(c)));
  })
  .get("/casals/:casalId/places/:placaId/moviments", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    return c.json({ moviments: await adjudicacio(c).movimentsPlaca(casalId, idRuta(c, "placaId")) });
  })
  .get("/casals/:casalId/cicles/:cicleId/exportacions/places", async (c) => {
    const casalId = casalAutoritzat(c, "dades.exportar");
    c.get("usuari").exigeix("sollicituds.consultar", casalId);
    const tipus = c.req.query("tipus");
    if (tipus !== "admesos" && tipus !== "espera") throw errors.peticioInvalida("Tipus d'exportació no vàlid.");
    const cicleId = idRuta(c, "cicleId");
    const vis = visibilitat(c.get("usuari"), casalId);
    return exportacioAuditada(c, casalId, `places.${tipus}`, "cicle", cicleId, await adjudicacio(c).taulaPlaces(casalId, cicleId, tipus, vis),
      { dades_contacte: vis.contacte });
  })

  // ---------- Assistència ----------
  .get("/casals/:casalId/cicles/:cicleId/indicadors", async (c) => {
    const casalId = casalAutoritzat(c, "sollicituds.consultar");
    return c.json(await indicadors(c).cicle(casalId, idRuta(c, "cicleId")));
  })
  .get("/casals/:casalId/cicles/:cicleId/assistencia", async (c) => {
    const casalId = casalAutoritzatAlgun(c, ASSISTENCIA);
    return c.json(await assistencia(c).resumCicle(casalId, idRuta(c, "cicleId")));
  })
  .get("/casals/:casalId/activitats/:activitatId/assistencia", async (c) => {
    const casalId = casalAutoritzatAlgun(c, ASSISTENCIA);
    return c.json(await assistencia(c).activitat(casalId, idRuta(c, "activitatId"), visibilitatAssistencia(c, casalId)));
  })
  .post("/casals/:casalId/activitats/:activitatId/sessions/generacio", async (c) => {
    const casalId = casalAutoritzat(c, "assistencia.registrar");
    return c.json(await assistencia(c).generarSessions(casalId, idRuta(c, "activitatId"), ctx(c)));
  })
  .post("/casals/:casalId/activitats/:activitatId/sessions", async (c) => {
    const casalId = casalAutoritzat(c, "assistencia.registrar");
    const cos = await cosValidat(c, novaSessio);
    return c.json(await assistencia(c).afegirSessio(casalId, idRuta(c, "activitatId"), cos, ctx(c)), 201);
  })
  .post("/casals/:casalId/sessions/:sessioId/cancellacio", async (c) => {
    const casalId = casalAutoritzat(c, "assistencia.registrar");
    const cos = await cosValidat(c, cancellarSessio);
    return c.json(await assistencia(c).cancellarSessio(casalId, idRuta(c, "sessioId"), cos, ctx(c)));
  })
  .put("/casals/:casalId/sessions/:sessioId/tallerista", async (c) => {
    const casalId = casalAutoritzat(c, "assistencia.registrar");
    const cos = await cosValidat(c, faltaTallerista);
    return c.json(await assistencia(c).faltaTallerista(casalId, idRuta(c, "sessioId"), cos, ctx(c)));
  })

  // ---------- Incidències del casal ----------
  .get("/casals/:casalId/incidencies", async (c) => {
    const casalId = casalAutoritzatAlgun(c, INCIDENCIES);
    return c.json(await incidencies(c).llistar(casalId, anyConsulta(c)));
  })
  .post("/casals/:casalId/incidencies", async (c) => {
    const casalId = casalAutoritzatAlgun(c, INCIDENCIES);
    return c.json(await incidencies(c).crear(casalId, await cosValidat(c, incidenciaNova), ctx(c)), 201);
  })
  .post("/casals/:casalId/incidencies/:incidenciaId/resolucio", async (c) => {
    const casalId = casalAutoritzatAlgun(c, INCIDENCIES);
    return c.json(await incidencies(c).resoldre(casalId, idRuta(c, "incidenciaId"), await cosValidat(c, incidenciaResolucio), ctx(c)));
  })
  .put("/casals/:casalId/sessions/:sessioId/assistencia", async (c) => {
    const casalId = casalAutoritzat(c, "assistencia.registrar");
    const cos = await cosValidat(c, registrarAssistencia);
    return c.json(await assistencia(c).registrar(casalId, idRuta(c, "sessioId"), cos, ctx(c)));
  })
  .get("/casals/:casalId/cicles/:cicleId/exportacions/graelles", async (c) => {
    // Graelles per imprimir: qui exporta dades del casal, o qui passa llista (conserge).
    const casalId = casalAutoritzatAlgun(c, ["dades.exportar", "assistencia.registrar"]);
    if (!c.get("usuari").pot("assistencia.registrar", casalId)) c.get("usuari").exigeix("sollicituds.consultar", casalId);
    const cicleId = idRuta(c, "cicleId");
    const vis = visibilitatAssistencia(c, casalId);
    const dades = await assistencia(c).graelles(casalId, cicleId, vis, c.req.query("telefon") !== "0");
    await c.get("repos").auditoria.registrar({
      casal_id: casalId, usuari_id: c.get("usuari").id, tipus_operacio: "exportacio.graelles", entitat: "cicle", entitat_id: cicleId,
      resultat: "exit", id_peticio: c.get("idPeticio"), detalls: { ...dades.totals, telefon: dades.telefon },
    }, new Date(c.get("rellotge").ara()).toISOString());
    return c.json(dades);
  })
  .get("/casals/:casalId/cicles/:cicleId/exportacions/assistencia", async (c) => {
    const casalId = casalAutoritzat(c, "dades.exportar");
    c.get("usuari").exigeix("sollicituds.consultar", casalId);
    const cicleId = idRuta(c, "cicleId");
    return exportacioAuditada(c, casalId, "assistencia", "cicle", cicleId, await assistencia(c).taulaAssistencia(casalId, cicleId));
  })

  // ---------- Historial ----------
  .get("/casals/:casalId/historial/:entitat/:entitatId", async (c) => {
    const entitat = c.req.param("entitat");
    const permis = { casal: "casal.consultar", cicle: "cicles.consultar", activitat: "activitats.consultar", sollicitud: "sollicituds.consultar", placa: "sollicituds.consultar" }[entitat];
    if (!permis) throw errors.noTrobat();
    const casalId = casalAutoritzat(c, permis);
    const entitatId = idRuta(c, "entitatId");
    // Només entrades del casal de la ruta, filtrades a la mateixa consulta.
    return c.json({ historial: await c.get("repos").historial.llistar(entitat, entitatId, casalId) });
  })

  // ---------- Persones autoritzades ----------
  .get("/casals/:casalId/usuaris", async (c) => {
    const casalId = casalAutoritzat(c, "usuaris.gestionar");
    const repos = c.get("repos");
    const assignacions = await repos.usuaris.assignacionsCasal(casalId);
    const estat = await repos.usuaris.estatAcces(assignacions.map((a) => a.usuari_id), new Date(c.get("rellotge").ara()).toISOString());
    return c.json({ assignacions: assignacions.map((a) => ({ ...a, ...estat[a.usuari_id] })) });
  })
  .get("/casals/:casalId/usuaris/historial", async (c) => {
    const casalId = casalAutoritzat(c, "usuaris.gestionar");
    return c.json({ historial: await c.get("repos").usuaris.historialEquip(casalId) });
  })
  .post("/casals/:casalId/usuaris", async (c) => {
    const casalId = casalAutoritzat(c, "usuaris.gestionar");
    const dades = await cosValidat(c, assignarRol);
    const servei = usuarisCasal(c);
    const assignacio = await servei.assignarRol(casalId, dades, ctx(c));
    // El codi de primer accés només es retorna aquí, una vegada.
    const acces = await servei.accesAlta(assignacio.usuari_id, casalId, ctx(c), false);
    return c.json({ assignacio, acces }, 201);
  })
  .post("/casals/:casalId/usuaris/:assignacioId/revocar", async (c) => {
    const casalId = casalAutoritzat(c, "usuaris.gestionar");
    const { motiu } = await cosValidat(c, revocarRol);
    await usuarisCasal(c).revocar(casalId, idRuta(c, "assignacioId"), { ...ctx(c), motiu });
    return c.json({ ok: true });
  })
  .post("/casals/:casalId/usuaris/:assignacioId/codi-acces", async (c) => {
    const casalId = casalAutoritzat(c, "usuaris.gestionar");
    return c.json({ codi: await usuarisCasal(c).nouCodi(casalId, idRuta(c, "assignacioId"), ctx(c), false) });
  })

  // ---------- Superadministració ----------
  .get("/administracio/responsables", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await administracio(c).responsables());
  })
  .post("/administracio/casals/:casalId/responsables", async (c) => {
    exigeixSuperadministracio(c);
    const casalId = idRuta(c, "casalId");
    const dades = await cosValidat(c, assignarResponsable);
    return c.json(await administracio(c).assignarResponsable(casalId, dades, ctx(c)), 201);
  })
  .post("/administracio/casals/:casalId/responsables/:assignacioId/revocar", async (c) => {
    exigeixSuperadministracio(c);
    const { motiu } = await cosValidat(c, revocarRol);
    await administracio(c).revocarResponsable(idRuta(c, "casalId"), idRuta(c, "assignacioId"), { ...ctx(c), motiu });
    return c.json({ ok: true });
  })
  .post("/administracio/casals/:casalId/responsables/:assignacioId/codi-acces", async (c) => {
    exigeixSuperadministracio(c);
    return c.json({ codi: await administracio(c).nouCodiResponsable(idRuta(c, "casalId"), idRuta(c, "assignacioId"), ctx(c)) });
  })
  .put("/administracio/usuaris/:usuariId/telefon", async (c) => {
    exigeixSuperadministracio(c);
    const usuariId = idRuta(c, "usuariId");
    const { telefon } = await cosValidat(c, telefonUsuari);
    if (!(await c.get("repos").usuaris.responsables()).some((r) => r.usuari_id === usuariId)) throw errors.noTrobat("No s'ha trobat la persona responsable.");
    await c.get("repos").usuaris.fixarTelefon(usuariId, telefon, c.get("rellotge").ara().toISOString());
    return c.json({ ok: true });
  })
  // Comunicats als casals (petició de 2026-10-16).
  .get("/administracio/comunicats", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await comunicats(c).estat());
  })
  .put("/administracio/comunicats/whatsapp", async (c) => {
    exigeixSuperadministracio(c);
    const d = await cosValidat(c, configWhatsappCentral);
    return c.json(await comunicats(c).configurarCentral({ ...d, numero_visible: d.numero_visible ?? null }, ctx(c)));
  })
  .post("/administracio/comunicats/whatsapp/comprovacio", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await comunicats(c).comprovarCentral());
  })
  .post("/administracio/comunicats", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await comunicats(c).crear(await cosValidat(c, comunicat), ctx(c)), 201);
  })
  .post("/administracio/comunicats/:comunicatId/continua", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await comunicats(c).continuar(idRuta(c, "comunicatId")));
  })
  .get("/administracio/comunicats/:comunicatId/manuals", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await comunicats(c).manuals(idRuta(c, "comunicatId")));
  })
  .post("/administracio/comunicats/:comunicatId/manuals/:destinatariId", async (c) => {
    exigeixSuperadministracio(c);
    const { enviat } = await cosValidat(c, z.strictObject({ enviat: z.boolean() }));
    return c.json(await comunicats(c).marcarManual(idRuta(c, "comunicatId"), idRuta(c, "destinatariId"), enviat));
  })
  .get("/administracio/comunicats/:comunicatId", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await comunicats(c).resultat(idRuta(c, "comunicatId")));
  })
  .get("/administracio/quadre", async (c) => {
    if (!c.get("usuari").esGlobal("estadistiques.consultar")) throw errors.sensePermis();
    return c.json(await administracio(c).quadre(anyConsulta(c), ctx(c)));
  })
  // Territori i referents (petició de 2026-10-16).
  .get("/administracio/territori", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await administracio(c).territori());
  })
  .post("/administracio/referents", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await administracio(c).crearReferent(await cosValidat(c, referentNou), ctx(c)), 201);
  })
  .put("/administracio/referents/:referentId", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await administracio(c).actualitzarReferent(idRuta(c, "referentId"), await cosValidat(c, referentCanvis), ctx(c)));
  })
  .put("/administracio/casals/:casalId/territori", async (c) => {
    exigeixSuperadministracio(c);
    return c.json(await administracio(c).fixarTerritori(idRuta(c, "casalId"), await cosValidat(c, territoriCasal), ctx(c)));
  })

  // ---------- Auditoria ----------
  .get("/casals/:casalId/auditoria", async (c) => {
    const casalId = casalAutoritzat(c, "auditoria.consultar");
    const limit = Number(c.req.query("limit") ?? "100");
    return c.json({ registres: await c.get("repos").auditoria.llistar({ casalId, limit: Number.isFinite(limit) ? limit : 100 }) });
  });
