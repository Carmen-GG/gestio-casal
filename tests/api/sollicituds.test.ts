import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { client, rellotgeMobil } from "../setup/sessio";
import type { Rellotge } from "../../worker/lib/rellotge";
import { TEXT_PRIVACITAT_PROVA } from "../../shared/domain/formulari";

/** Imatge PNG d'1×1 píxel (signatura de prova). */
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PRIVACITAT = "Text de prova de protecció de dades (fictici, no vàlid com a informació legal).";

/** Escenari amb un cicle obert, dues activitats actives i el text de privacitat configurat. */
async function escenariObert(config: Record<string, unknown> = {}) {
  const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
  const segona = await e.repos.activitats.crear({ casal_id: e.casal.id, cicle_id: e.cicle.id, nom: "Segon taller fictici", capacitat: 8, estat: "activa" });
  await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?")
    .bind(JSON.stringify({ informacio_privacitat: PRIVACITAT, ...config }), e.cicle.id).run();
  return { ...e, segona, ruta: `/api/public/casals/${e.casal.codi}/cicles/${e.cicle.id}/sollicituds` };
}

const cos = (activitats: string[], extra: Record<string, unknown> = {}) => ({
  dades: { data_naixement: "1980-05-01", nom: "Persona", cognom1: "Fictícia" },
  preferencies: activitats.map((id, i) => ({ activitat_id: id, ordre: i + 1 })),
  acceptacio_privacitat: true,
  ...extra,
});

/** Client sense limitador de peticions (les proves en fan moltes des del mateix origen). */
function enviador(rellotge?: Rellotge, entorn: Partial<typeof env> = { LIMIT_SOLLICITUDS: undefined }) {
  const c = client(rellotge, entorn);
  return (ruta: string, json: unknown, clau: string | null = crypto.randomUUID()) =>
    c.json(ruta, { method: "POST", json, headers: clau ? { "Idempotency-Key": clau } : {} });
}

describe("API pública: enviament de sol·licituds", () => {
  it("registra una sol·licitud correcta amb número correlatiu i confirmació", async () => {
    const { ruta, activa, segona, cicle } = await escenariObert();
    const envia = enviador();
    const r = await envia(ruta, cos([segona.id, activa.id]));
    expect(r.status).toBe(201);
    expect(r.cos).toMatchObject({
      data_resolucio_prevista: "2027-01-08", repetida: false,
      preferencies: [{ ordre: 1, activitat: "Segon taller fictici" }, { ordre: 2, activitat: "Taller fictici" }],
    });
    expect(r.cos.codi_confirmacio).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    // La resposta no retorna dades personals.
    expect(JSON.stringify(r.cos)).not.toContain("Fictícia");

    const r2 = await envia(ruta, cos([activa.id]));
    expect(r2.status).toBe(201);
    const files = await env.DB.prepare("SELECT numero, origen, privacitat_resum FROM sollicituds WHERE cicle_id = ? ORDER BY numero")
      .bind(cicle.id).all<{ numero: number; origen: string; privacitat_resum: string }>();
    expect(files.results.map((f) => f.numero)).toEqual([1, 2]);
    expect(files.results[0]!.origen).toBe("formulari_public");
    expect(files.results[0]!.privacitat_resum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("registra l'auditoria sense dades personals", async () => {
    const { ruta, activa, casal } = await escenariObert();
    await enviador()(ruta, cos([activa.id], { dades: { data_naixement: "1980-05-01", nom: "Nomúnic", cognom1: "Cognomúnic" } }));
    const a = await env.DB.prepare("SELECT * FROM registres_auditoria WHERE casal_id = ? AND tipus_operacio = 'sollicitud.recepcio'")
      .bind(casal.id).all();
    expect(a.results).toHaveLength(1);
    expect(JSON.stringify(a.results)).not.toMatch(/Nomúnic|Cognomúnic/);
  });

  it("un doble enviament amb la mateixa clau retorna la mateixa confirmació i no duplica", async () => {
    const { ruta, activa, cicle } = await escenariObert();
    const envia = enviador();
    const clau = crypto.randomUUID();
    const [a, b] = await Promise.all([envia(ruta, cos([activa.id]), clau), envia(ruta, cos([activa.id]), clau)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.cos.codi_confirmacio).toBe(b.cos.codi_confirmacio);
    const c = await envia(ruta, cos([activa.id]), clau);
    expect(c.status).toBe(200);
    expect(c.cos.repetida).toBe(true);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sollicituds WHERE cicle_id = ?").bind(cicle.id).first<{ n: number }>();
    expect(n!.n).toBe(1);
    // La mateixa clau amb dades diferents es rebutja.
    const d = await envia(ruta, cos([activa.id], { dades: { data_naixement: "1980-05-01", nom: "Altra", cognom1: "Persona" } }), clau);
    expect(d.status).toBe(409);
    expect(d.cos.error.codi).toBe("clau_idempotencia_reutilitzada");
  });

  it("exigeix la clau d'idempotència", async () => {
    const { ruta, activa } = await escenariObert();
    const r = await enviador()(ruta, cos([activa.id]), null);
    expect(r.status).toBe(400);
    expect(r.cos.error.codi).toBe("clau_idempotencia_requerida");
  });

  it("rebutja els camps obligatoris buits i els camps que el cicle no demana", async () => {
    const { ruta, activa } = await escenariObert({ camps: { telefon: { actiu: true, obligatori: true } } });
    const envia = enviador();
    const r = await envia(ruta, cos([activa.id], { dades: { data_naixement: "1980-05-01", nom: "", cognom1: "Fictícia" } }));
    expect(r.status).toBe(400);
    expect(r.cos.error.detalls["dades.nom"]).toBeTruthy();

    const r2 = await envia(ruta, cos([activa.id]));
    expect(r2.status).toBe(400);
    expect(r2.cos.error.detalls["dades.telefon"]).toBe("Aquest camp és obligatori.");

    const r3 = await envia(ruta, cos([activa.id], { dades: { data_naixement: "1980-05-01", nom: "Persona", cognom1: "Fictícia", telefon: "600 000 000", email: "persona@exemple.invalid" } }));
    expect(r3.status).toBe(400);
    expect(r3.cos.error.detalls["dades.email"]).toBe("Aquest camp no es demana en aquest cicle.");

    const r4 = await envia(ruta, cos([activa.id], { dades: { data_naixement: "1980-05-01", nom: "Persona", cognom1: "Fictícia", telefon: "600 000 000" } }));
    expect(r4.status).toBe(201);
  });

  it("valida el format de les dades", async () => {
    const { ruta, activa } = await escenariObert({
      camps: { email: { actiu: true, obligatori: false }, document_identitat: { actiu: true, obligatori: false }, data_naixement: { actiu: true, obligatori: false } },
    });
    const envia = enviador();
    const r = await envia(ruta, cos([activa.id], { dades: { data_naixement: "1980-05-01", nom: "P", cognom1: "F", email: "no-es-correu", document_identitat: "12345678A" } }));
    expect(r.status).toBe(400);
    expect(r.cos.error.detalls["dades.email"]).toBeTruthy();
    expect(r.cos.error.detalls["dades.document_identitat"]).toBeTruthy();
    const futur = await envia(ruta, cos([activa.id], { dades: { nom: "P", cognom1: "F", data_naixement: "2030-01-01" } }));
    expect(futur.status).toBe(400);
    expect(futur.cos.error.detalls["dades.data_naixement"]).toBeTruthy();
    // DNI fictici amb la lletra de control correcta (00000000T).
    const ok = await envia(ruta, cos([activa.id], { dades: { data_naixement: "1980-05-01", nom: "P", cognom1: "F", document_identitat: "00000000-t", email: "" } }));
    expect(ok.status).toBe(201);
  });

  it("rebutja preferències duplicades, incompletes o no consecutives", async () => {
    const { ruta, activa, segona } = await escenariObert();
    const envia = enviador();
    const dup = await envia(ruta, cos([], { preferencies: [{ activitat_id: activa.id, ordre: 1 }, { activitat_id: segona.id, ordre: 1 }] }));
    expect(dup.status).toBe(400);
    expect(dup.cos.error.detalls.preferencies).toContain("preferències duplicades");
    const salt = await envia(ruta, cos([], { preferencies: [{ activitat_id: activa.id, ordre: 1 }, { activitat_id: segona.id, ordre: 3 }] }));
    expect(salt.status).toBe(400);
    const buida = await envia(ruta, cos([]));
    expect(buida.status).toBe(400);
    expect(buida.cos.error.detalls.preferencies).toBe("Cal seleccionar almenys una activitat.");
    const repetida = await envia(ruta, cos([], { preferencies: [{ activitat_id: activa.id, ordre: 1 }, { activitat_id: activa.id, ordre: 2 }] }));
    expect(repetida.status).toBe(400);
  });

  it("rebutja activitats inexistents, en esborrany o d'un altre cicle sense desar res", async () => {
    const { ruta, activa, esborrany, cicle } = await escenariObert();
    const altre = await escenariObert();
    const envia = enviador();
    for (const id of [crypto.randomUUID(), esborrany.id, altre.activa.id]) {
      const r = await envia(ruta, cos([activa.id, id]));
      expect(r.status).toBe(400);
      expect(r.cos.error.detalls.preferencies).toContain("ja no està disponible");
    }
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sollicituds WHERE cicle_id = ?").bind(cicle.id).first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it("rebutja els enviaments fora del període o amb el cicle tancat", async () => {
    const { ruta, activa, cicle } = await escenariObert();
    // Fora de la finestra de dates (abans de l'obertura).
    const abans = await enviador(rellotgeMobil("2026-09-30T10:00:00.000Z"))(ruta, cos([activa.id]));
    expect(abans.status).toBe(409);
    expect(abans.cos.error.codi).toBe("cicle_tancat");
    await env.DB.prepare("UPDATE cicles SET estat = 'inscripcions_tancades' WHERE id = ?").bind(cicle.id).run();
    const tancat = await enviador()(ruta, cos([activa.id]));
    expect(tancat.status).toBe(409);
    expect(tancat.cos.error.codi).toBe("cicle_tancat");
  });

  it("sense text de protecció de dades propi, mostra el text de prova i l'exigeix acceptar", async () => {
    const { ruta, activa, cicle, casal } = await escenariObert();
    await env.DB.prepare("UPDATE cicles SET configuracio_formulari = '{}' WHERE id = ?").bind(cicle.id).run();
    const pub = await client().json(`/api/public/casals/${casal.codi}/cicles/${cicle.id}/activitats`);
    expect(pub.cos.formulari.informacio_privacitat).toBe(TEXT_PRIVACITAT_PROVA);
    const sense = await enviador()(ruta, cos([activa.id], { acceptacio_privacitat: false }));
    expect(sense.status).toBe(400);
    const r = await enviador()(ruta, cos([activa.id]));
    expect(r.status).toBe(201);
  });

  it("limita la tria a 7 activitats", async () => {
    const e = await escenariObert();
    const ids = [e.activa.id, e.segona.id];
    for (let i = 0; i < 6; i++) {
      ids.push((await e.repos.activitats.crear({ casal_id: e.casal.id, cicle_id: e.cicle.id, nom: `Taller extra ${i}`, capacitat: 5, estat: "activa" })).id);
    }
    const massa = await enviador()(e.ruta, cos(ids));
    expect(massa.status).toBe(400);
    expect(massa.cos.error.detalls.preferencies).toContain("màxim 7");
    const set = await enviador()(e.ruta, cos(ids.slice(0, 7)));
    expect(set.status).toBe(201);
  });

  it("exigeix la data de naixement i, si és menor, l'autorització signada del tutor", async () => {
    const { ruta, activa } = await escenariObert();
    const envia = enviador();
    const senseData = await envia(ruta, cos([activa.id], { dades: { nom: "P", cognom1: "F" } }));
    expect(senseData.status).toBe(400);
    expect(senseData.cos.error.detalls["dades.data_naixement"]).toBe("Aquest camp és obligatori.");

    const menor = { nom: "Infant", cognom1: "Fictici", data_naixement: "2016-03-10" };
    const senseTutor = await envia(ruta, cos([activa.id], { dades: menor }));
    expect(senseTutor.status).toBe(400);
    expect(senseTutor.cos.error.detalls.tutor).toBeTruthy();

    const tutor = { nom: "Mare", cognoms: "Fictícia Prova", document_identitat: "00000000T", autoritza: true, signatura: PNG };
    const senseSignatura = await envia(ruta, cos([activa.id], { dades: menor, tutor: { ...tutor, signatura: "" } }));
    expect(senseSignatura.status).toBe(400);
    const noPng = await envia(ruta, cos([activa.id], { dades: menor, tutor: { ...tutor, signatura: "data:image/png;base64,QUJDRA==" } }));
    expect(noPng.status).toBe(400);
    expect(noPng.cos.error.detalls["tutor.signatura"]).toBeTruthy();
    const senseCheck = await envia(ruta, cos([activa.id], { dades: menor, tutor: { ...tutor, autoritza: false } }));
    expect(senseCheck.status).toBe(400);

    const ok = await envia(ruta, cos([activa.id], { dades: menor, tutor }));
    expect(ok.status).toBe(201);
    const desada = await env.DB.prepare("SELECT a.nom, a.document_identitat, a.signatura FROM autoritzacions_tutor a JOIN sollicituds s ON s.id = a.sollicitud_id WHERE s.codi_confirmacio = ?")
      .bind(ok.cos.codi_confirmacio).first<{ nom: string; document_identitat: string; signatura: string }>();
    expect(desada).toEqual({ nom: "Mare", document_identitat: "00000000T", signatura: PNG });

    // Una persona adulta no desa cap dada de tutor encara que s'enviï.
    const adulta = await envia(ruta, cos([activa.id], { tutor }));
    expect(adulta.status).toBe(201);
    const cap = await env.DB.prepare("SELECT COUNT(*) AS n FROM autoritzacions_tutor a JOIN sollicituds s ON s.id = a.sollicitud_id WHERE s.codi_confirmacio = ?")
      .bind(adulta.cos.codi_confirmacio).first<{ n: number }>();
    expect(cap!.n).toBe(0);
  });

  it("exigeix acceptar la informació de protecció de dades", async () => {
    const { ruta, activa } = await escenariObert();
    const r = await enviador()(ruta, cos([activa.id], { acceptacio_privacitat: false }));
    expect(r.status).toBe(400);
    expect(r.cos.error.detalls.acceptacio_privacitat).toBeTruthy();
  });

  it("rebutja dades mal formades, camps no previstos i el camp parany", async () => {
    const { ruta, activa } = await escenariObert();
    const envia = enviador();
    const c = client(undefined, { LIMIT_SOLLICITUDS: undefined });
    const noJson = await c.peticio(ruta, { method: "POST", body: "nom=x", headers: { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": crypto.randomUUID() } });
    expect(noJson.status).toBe(415);
    const trencat = await c.peticio(ruta, { method: "POST", body: "{no json", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() } });
    expect(trencat.status).toBe(400);
    const extra = await envia(ruta, cos([activa.id], { administrador: true }));
    expect(extra.status).toBe(400);
    const tipus = await envia(ruta, { ...cos([activa.id]), preferencies: "totes" });
    expect(tipus.status).toBe(400);
    const parany = await envia(ruta, cos([activa.id], { web: "https://spam.invalid" }));
    expect(parany.status).toBe(400);
    expect(parany.cos.error.codi).toBe("peticio_rebutjada");
  });

  it("no revela si existeix un cicle no publicat", async () => {
    const e = await crearEscenari(); // cicle en esborrany
    const r = await enviador()(`/api/public/casals/${e.casal.codi}/cicles/${e.cicle.id}/sollicituds`, cos([e.activa.id]));
    expect(r.status).toBe(404);
  });

  it("limita el nombre d'enviaments seguits", async () => {
    const { ruta, activa } = await escenariObert();
    let comptador = 0;
    const limitador: RateLimit = { limit: async () => ({ success: ++comptador <= 2 }) };
    const envia = enviador(undefined, { LIMIT_SOLLICITUDS: limitador });
    expect((await envia(ruta, cos([activa.id]))).status).toBe(201);
    expect((await envia(ruta, cos([activa.id]))).status).toBe(201);
    const r = await envia(ruta, cos([activa.id]));
    expect(r.status).toBe(429);
    expect(r.cos.error.codi).toBe("massa_peticions");
  });

  it("l'API pública mostra els camps del formulari i el text de privacitat", async () => {
    const { casal, cicle } = await escenariObert({ camps: { telefon: { actiu: true, obligatori: true }, email: { actiu: false, obligatori: false } } });
    const r = await client().json(`/api/public/casals/${casal.codi}/cicles/${cicle.id}/activitats`);
    expect(r.cos.formulari).toEqual({
      camps: [{ camp: "nom", obligatori: true }, { camp: "cognom1", obligatori: true }, { camp: "data_naixement", obligatori: true }, { camp: "telefon", obligatori: true }],
      informacio_privacitat: PRIVACITAT,
    });
  });
});
