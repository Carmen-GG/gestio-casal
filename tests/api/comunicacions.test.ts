import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PARAMETRES_INICIALS } from "../../shared/domain/adjudicacio";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

const CONFIG = { informacio_privacitat: "Text de prova fictici.", camps: { telefon: { actiu: true, obligatori: false } } };

/** Activitat amb 2 places: Zapata (mòbil) i Àvila (fix) admeses, Bosch (mòbil) en llista d'espera. */
async function escenari() {
  const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
  const A = e.activa;
  await env.DB.prepare("UPDATE activitats SET capacitat = 2 WHERE id = ?").bind(A.id).run();
  await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?").bind(JSON.stringify(CONFIG), e.cicle.id).run();
  const publica = client(undefined, { LIMIT_SOLLICITUDS: undefined });
  for (const [nom, cognom1, telefon] of [["Marta", "Zapata", "600000001"], ["Jordi", "Àvila", "937000002"], ["Núria", "Bosch", "600000003"]]) {
    const r = await publica.json(`/api/public/casals/${e.casal.codi}/cicles/${e.cicle.id}/sollicituds`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { dades: { data_naixement: "1980-05-01", nom, cognom1, telefon }, preferencies: [{ activitat_id: A.id, ordre: 1 }], acceptacio_privacitat: true },
    });
    if (r.status !== 201) throw new Error(JSON.stringify(r.cos));
  }
  await env.DB.prepare("UPDATE cicles SET estat = 'adjudicacio_en_proces' WHERE id = ?").bind(e.cicle.id).run();
  const base = `/api/gestio/casals/${e.casal.id}`;
  const g = await clientAutenticat("gestor_casal", e.casal.id);
  const adj = `${base}/cicles/${e.cicle.id}/adjudicacio`;
  await g.json(`${adj}/parametres`, { method: "PUT", json: { parametres: { ...PARAMETRES_INICIALS, criteri_ordre: "inscripcio", prioritat_espera_anterior: false }, versio_actual: null } });
  const p = await g.json(`${adj}/propostes`, { method: "POST", json: {} });
  await g.json(`${base}/adjudicacions/${p.cos.execucio.id}/confirmar`, { method: "POST", json: { confirmacio: true } });
  const llista = async () => (await g.json(`${base}/cicles/${e.cicle.id}/comunicacions`)).cos;
  return { ...e, A, base, g, llista };
}

type Persona = { placa_id: string; cognoms: string; situacio: string; posicio: number | null; telefon: string | null; comunicacio: { estat: string; motiu: string | null; nota: string | null; tipus: string } | null };

describe("comunicacions segons activitat", () => {
  it("llista admeses per ordre alfabètic i la llista d'espera, amb nom, cognoms i telèfon", async () => {
    const { base, cicle, llista, casal } = await escenari();
    const d = await llista();
    expect(d.activitats).toHaveLength(1);
    expect(d.activitats[0].persones.map((p: Persona) => [p.cognoms, p.situacio, p.posicio, p.telefon, p.comunicacio])).toEqual([
      ["Àvila", "admesa", null, "937000002", null],
      ["Zapata", "admesa", null, "600000001", null],
      ["Bosch", "espera", 1, "600000003", null],
    ]);
    // Sense permís per veure el contacte no s'hi pot entrar.
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${base}/cicles/${cicle.id}/comunicacions`)).status).toBe(403);
  });

  it("desa enviaments i persones no contactades, i es pot desfer", async () => {
    const { base, g, llista, casal } = await escenari();
    const persones = (await llista()).activitats[0].persones as Persona[];
    const zapata = persones.find((p) => p.cognoms === "Zapata")!;
    const bosch = persones.find((p) => p.cognoms === "Bosch")!;
    const desa = (id: string, json: unknown, client = g) => client.json(`${base}/places/${id}/comunicacio`, { method: "PUT", json });

    expect((await desa(zapata.placa_id, { tipus: "admesa", canal: "whatsapp_manual", estat: "enviat" })).status).toBe(200);
    // «No contactat» exigeix el motiu.
    expect((await desa(bosch.placa_id, { tipus: "espera", canal: "whatsapp_manual", estat: "no_contactat" })).status).toBe(400);
    expect((await desa(bosch.placa_id, { tipus: "espera", canal: "whatsapp_manual", estat: "no_contactat", motiu: "no_respon", nota: "Trucar a la tarda" })).status).toBe(200);
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await desa(zapata.placa_id, { tipus: "admesa", canal: "whatsapp_manual", estat: "enviat" }, consulta)).status).toBe(403);

    let d = (await llista()).activitats[0].persones as Persona[];
    expect(d.find((p) => p.cognoms === "Zapata")!.comunicacio).toMatchObject({ tipus: "admesa", estat: "enviat", motiu: null });
    expect(d.find((p) => p.cognoms === "Bosch")!.comunicacio).toMatchObject({ tipus: "espera", estat: "no_contactat", motiu: "no_respon", nota: "Trucar a la tarda" });

    // Després de trucar-la.
    await desa(bosch.placa_id, { tipus: "espera", canal: "telefon", estat: "contactat_telefon" });
    d = (await llista()).activitats[0].persones as Persona[];
    expect(d.find((p) => p.cognoms === "Bosch")!.comunicacio).toMatchObject({ estat: "contactat_telefon", motiu: null });

    expect((await g.json(`${base}/places/${zapata.placa_id}/comunicacio/desfer`, { method: "POST" })).status).toBe(200);
    expect((await g.json(`${base}/places/${zapata.placa_id}/comunicacio/desfer`, { method: "POST" })).status).toBe(404);
    d = (await llista()).activitats[0].persones as Persona[];
    expect(d.find((p) => p.cognoms === "Zapata")!.comunicacio).toBeNull();

    // A l'auditoria no hi ha telèfons ni notes.
    const audit = await env.DB.prepare("SELECT detalls FROM registres_auditoria WHERE casal_id = ? AND tipus_operacio LIKE 'comunicacions.%'").bind(casal.id).all<{ detalls: string }>();
    expect(audit.results.length).toBe(4);
    expect(audit.results.map((r) => r.detalls).join(" ")).not.toMatch(/6000000|Trucar/);
  });

  it("no registra comunicacions de places que ja no estan admeses ni en espera", async () => {
    const { base, g, llista } = await escenari();
    const zapata = ((await llista()).activitats[0].persones as Persona[]).find((p) => p.cognoms === "Zapata")!;
    const placa = (await g.json(`${base}/cicles/${(await llista()).cicle.id}/places`)).cos.grups[0].places.find((p: { id: string }) => p.id === zapata.placa_id);
    await g.json(`${base}/places/${zapata.placa_id}/baixa-voluntaria`, { method: "POST", json: { versio: placa.versio, motiu: "Es trasllada" } });
    const r = await g.json(`${base}/places/${zapata.placa_id}/comunicacio`, { method: "PUT", json: { tipus: "admesa", canal: "whatsapp_manual", estat: "enviat" } });
    expect(r.cos.error.codi).toBe("placa_no_comunicable");
    // La plaça s'ha ofert a Bosch, que ara surt com a pendent de resposta.
    const bosch = ((await llista()).activitats[0].persones as (Persona & { oferta_pendent: boolean })[]).find((p) => p.cognoms === "Bosch")!;
    expect(bosch).toMatchObject({ situacio: "espera", oferta_pendent: true });
  });
});
