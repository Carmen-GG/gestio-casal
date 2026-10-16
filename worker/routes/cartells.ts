import { Hono, type Context } from "hono";
import type { Entorn } from "../app";
import { requereixSessio } from "../auth/sessio";
import { errors, ErrorAplicacio } from "../http/errors";
import { llegeixFitxer } from "../http/fitxers";
import { cosValidat, idRuta } from "../http/validacio";
import { MIDA_MAXIMA_FITXER, TIPUS_PLANTILLA, type TipusPlantilla, type UsFitxer } from "../../shared/domain/cartells";
import { consultaPujada, fotoCrear, plantillaActualitzar, plantillaCrear } from "../../shared/schemas/cartells";
import { errorsPerCamp } from "../../shared/schemas/comuns";
import { ServeiCartells } from "../services/cartells";

type C = Context<Entorn>;
const ctx = (c: C) => ({ usuariId: c.get("usuari").id, idPeticio: c.get("idPeticio") });
const servei = (c: C) => {
  if (!c.env.FITXERS) throw new ErrorAplicacio(503, "emmagatzematge_no_configurat", "L'emmagatzematge de fitxers no està configurat.");
  return new ServeiCartells(c.get("repos"), c.get("rellotge"), c.env.FITXERS);
};

/** Permís necessari per pujar un fitxer, segons l'ús, a un casal o als recursos comuns. */
const PERMIS_PUJADA_CASAL: Record<UsFitxer, string> = {
  plantilla: "cartells.plantilles", previsualitzacio: "cartells.plantilles",
  fotografia: "cartells.fotografies", logotip: "cartells.fotografies", material: "cartells.generar",
};
const PERMIS_PUJADA_COMU: Record<UsFitxer, string> = {
  plantilla: "cartells.plantilles", previsualitzacio: "cartells.plantilles",
  fotografia: "cartells.recursos_comuns", logotip: "cartells.recursos_comuns", material: "cartells.recursos_comuns",
};

/** Les pujades de fitxers tenen el seu propi límit de mida (vegeu `llegeixFitxer`). */
export const esPujadaFitxer = (c: C) => c.req.method === "POST" && /^\/api\/gestio\/(casals\/[^/]+\/)?cartells\/fitxers$/.test(c.req.path);

function casalAutoritzat(c: C, permis: string): string {
  const casalId = idRuta(c, "casalId");
  const usuari = c.get("usuari");
  if (!usuari.teAccesCasal(casalId)) throw errors.sensePermis();
  usuari.exigeix(permis, casalId);
  return casalId;
}

function exigeixGlobal(c: C, permis: string) {
  if (!c.get("usuari").esGlobal(permis)) throw errors.sensePermis();
}

async function pujada(c: C, casalId: string | null) {
  const consulta = consultaPujada.safeParse({ us: c.req.query("us"), nom: c.req.query("nom") });
  if (!consulta.success) throw errors.peticioInvalida("Dades no vàlides.", errorsPerCamp(consulta.error));
  const { us, nom } = consulta.data;
  // Les miniatures serveixen per a les plantilles i per a la fototeca.
  const alternatiu = us === "previsualitzacio" ? (casalId === null ? "cartells.recursos_comuns" : "cartells.fotografies") : null;
  if (casalId === null) {
    if (!(alternatiu && c.get("usuari").esGlobal(alternatiu))) exigeixGlobal(c, PERMIS_PUJADA_COMU[us]);
  } else if (!(alternatiu && c.get("usuari").pot(alternatiu, casalId))) c.get("usuari").exigeix(PERMIS_PUJADA_CASAL[us], casalId);
  // El tipus del fitxer va a Content-Type: un formulari d'un altre lloc no el pot enviar sense preflight CORS.
  const tipusMime = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  const contingut = await llegeixFitxer(c.req.raw, MIDA_MAXIMA_FITXER[us]);
  const { fitxer, existent } = await servei(c).pujarFitxer({ casalId, us, nom, tipusMime, contingut }, ctx(c));
  const { clau: _clau, ...visible } = fitxer;
  return c.json({ fitxer: visible, existent }, existent ? 200 : 201);
}

function tipusConsulta(c: C): TipusPlantilla | undefined {
  const t = c.req.query("tipus");
  if (t === undefined || t === "") return undefined;
  if (!(TIPUS_PLANTILLA as readonly string[]).includes(t)) throw errors.peticioInvalida("Tipus de plantilla no vàlid.");
  return t as TipusPlantilla;
}

/** Plantilla visible des del casal (pròpia o comuna). */
async function plantillaDelCasal(c: C, casalId: string) {
  const p = await servei(c).plantilla(idRuta(c, "plantillaId"));
  if (p.casal_id !== null && p.casal_id !== casalId) throw errors.noTrobat("No s'ha trobat la plantilla.");
  return p;
}

/**
 * Rutes de PG-Cartells. Totes exigeixen sessió i comproven el permís concret al servidor.
 * Els recursos comuns (casal_id nul) els gestiona només l'administració central.
 */
export const rutesCartells = new Hono<Entorn>()
  .use("*", requereixSessio)

  // ---------- Fitxers ----------
  .post("/casals/:casalId/cartells/fitxers", async (c) => pujada(c, casalAutoritzat(c, "cartells.consultar")))
  .post("/cartells/fitxers", async (c) => pujada(c, null))
  .get("/casals/:casalId/cartells/fitxers/:fitxerId", async (c) => {
    const casalId = casalAutoritzat(c, "cartells.consultar");
    const { fitxer, objecte } = await servei(c).fitxerDelCasal(casalId, idRuta(c, "fitxerId"));
    const nom = encodeURIComponent(fitxer.nom_original);
    return new Response(objecte.body, {
      headers: {
        "Content-Type": fitxer.tipus_mime,
        "Content-Length": String(fitxer.mida),
        "Content-Disposition": `attachment; filename*=UTF-8''${nom}`,
        // Els fitxers no canvien mai. Les plantilles i les seves previsualitzacions no tenen dades personals i es poden desar a la memòria cau del navegador.
        "Cache-Control": fitxer.us === "plantilla" || fitxer.us === "previsualitzacio" ? "private, max-age=604800, immutable" : "no-store",
      },
    });
  })

  // ---------- Fototeca ----------
  .get("/casals/:casalId/cartells/fotos", async (c) => {
    const casalId = casalAutoritzat(c, "cartells.consultar");
    return c.json({ fotos: await servei(c).fotos(casalId) });
  })
  .post("/casals/:casalId/cartells/fotos", async (c) => {
    const casalId = casalAutoritzat(c, "cartells.fotografies");
    const r = await servei(c).afegirFoto(casalId, await cosValidat(c, fotoCrear), ctx(c));
    return c.json(r, r.existent ? 200 : 201);
  })
  .delete("/casals/:casalId/cartells/fotos/:fotoId", async (c) => {
    const casalId = casalAutoritzat(c, "cartells.consultar");
    const foto = await servei(c).fotoDelCasal(casalId, idRuta(c, "fotoId"));
    // Una foto comuna la retira només la superadministració.
    if (foto.casal_id === null) exigeixGlobal(c, "cartells.recursos_comuns");
    else c.get("usuari").exigeix("cartells.fotografies", casalId);
    await servei(c).retirarFoto(foto, ctx(c));
    return c.json({ ok: true });
  })
  .get("/cartells/fotos", async (c) => {
    exigeixGlobal(c, "cartells.recursos_comuns");
    return c.json({ fotos: await servei(c).fotos(null) });
  })
  .post("/cartells/fotos", async (c) => {
    exigeixGlobal(c, "cartells.recursos_comuns");
    const r = await servei(c).afegirFoto(null, await cosValidat(c, fotoCrear), ctx(c));
    return c.json(r, r.existent ? 200 : 201);
  })
  .delete("/cartells/fotos/:fotoId", async (c) => {
    exigeixGlobal(c, "cartells.recursos_comuns");
    await servei(c).retirarFoto(await servei(c).fotoDelCasal(null, idRuta(c, "fotoId")), ctx(c));
    return c.json({ ok: true });
  })

  // ---------- Plantilles ----------
  .get("/casals/:casalId/cartells/plantilles", async (c) => {
    const casalId = casalAutoritzat(c, "cartells.consultar");
    const nomesActives = !c.get("usuari").pot("cartells.plantilles", casalId);
    return c.json({ plantilles: await servei(c).plantilles(casalId, { tipus: tipusConsulta(c), nomesActives }) });
  })
  .get("/casals/:casalId/cartells/plantilles/:plantillaId", async (c) => {
    const casalId = casalAutoritzat(c, "cartells.consultar");
    const p = await plantillaDelCasal(c, casalId);
    if (p.estat !== "activa" && !c.get("usuari").pot("cartells.plantilles", casalId)) throw errors.noTrobat("No s'ha trobat la plantilla.");
    return c.json({ plantilla: p });
  })
  .post("/casals/:casalId/cartells/plantilles", async (c) => {
    const casalId = casalAutoritzat(c, "cartells.plantilles");
    const dades = await cosValidat(c, plantillaCrear);
    return c.json({ plantilla: await servei(c).crearPlantilla(casalId, dades, ctx(c)) }, 201);
  })
  .post("/cartells/plantilles", async (c) => {
    exigeixGlobal(c, "cartells.plantilles");
    const dades = await cosValidat(c, plantillaCrear);
    return c.json({ plantilla: await servei(c).crearPlantilla(null, dades, ctx(c)) }, 201);
  })
  .patch("/casals/:casalId/cartells/plantilles/:plantillaId", async (c) => {
    const casalId = casalAutoritzat(c, "cartells.consultar");
    const actual = await plantillaDelCasal(c, casalId);
    // Una plantilla comuna afecta tots els casals: només la modifica l'administració central.
    if (actual.casal_id === null) exigeixGlobal(c, "cartells.plantilles");
    else c.get("usuari").exigeix("cartells.plantilles", casalId);
    const dades = await cosValidat(c, plantillaActualitzar);
    return c.json({ plantilla: await servei(c).actualitzarPlantilla(actual, dades, ctx(c)) });
  });
