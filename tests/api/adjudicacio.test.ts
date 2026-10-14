import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PARAMETRES_INICIALS, type ParametresAdjudicacio } from "../../shared/domain/adjudicacio";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

/** Regles generals (un sol ordre per al cicle), com abans del sorteig per activitat. */
const GENERALS: ParametresAdjudicacio = { ...PARAMETRES_INICIALS, criteri_ordre: "inscripcio", prioritat_espera_anterior: false };

const CONFIG = { informacio_privacitat: "Text de prova fictici.", camps: { telefon: { actiu: true, obligatori: false } } };

/**
 * Cicle amb dues activitats d'una plaça i tres sol·licituds fictícies:
 *   1. Zapata → [A]   2. Àvila → [B, A]   3. Bosch → [B]
 * Després el cicle passa a «En procés d'adjudicació».
 */
async function escenari() {
  const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
  const A = e.activa;
  const B = await e.repos.activitats.crear({ casal_id: e.casal.id, cicle_id: e.cicle.id, nom: "Ioga fictici", capacitat: 1, estat: "activa" });
  await env.DB.prepare("UPDATE activitats SET capacitat = 1 WHERE id = ?").bind(A.id).run();
  await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?").bind(JSON.stringify(CONFIG), e.cicle.id).run();
  const publica = client(undefined, { LIMIT_SOLLICITUDS: undefined });
  const envia = async (dades: Record<string, string>, activitats: string[]) => {
    const r = await publica.json(`/api/public/casals/${e.casal.codi}/cicles/${e.cicle.id}/sollicituds`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { dades, preferencies: activitats.map((activitat_id, i) => ({ activitat_id, ordre: i + 1 })), acceptacio_privacitat: true },
    });
    if (r.status !== 201) throw new Error(JSON.stringify(r.cos));
  };
  await envia({ nom: "Marta", cognom1: "Zapata", telefon: "600000001" }, [A.id]);
  await envia({ nom: "Jordi", cognom1: "Àvila" }, [B.id, A.id]);
  await envia({ nom: "Núria", cognom1: "Bosch" }, [B.id]);
  await env.DB.prepare("UPDATE cicles SET estat = 'adjudicacio_en_proces' WHERE id = ?").bind(e.cicle.id).run();
  const base = `/api/gestio/casals/${e.casal.id}`;
  const g = await clientAutenticat("gestor_casal", e.casal.id);
  const adj = `${base}/cicles/${e.cicle.id}/adjudicacio`;
  const desa = (parametres = GENERALS, versio_actual: number | null = null) =>
    g.json(`${adj}/parametres`, { method: "PUT", json: { parametres, versio_actual } });
  const proposa = (json: Record<string, unknown> = {}) => g.json(`${adj}/propostes`, { method: "POST", json });
  const confirma = (id: string, json: Record<string, unknown> = {}) =>
    g.json(`${base}/adjudicacions/${id}/confirmar`, { method: "POST", json: { confirmacio: true, ...json } });
  return { ...e, A, B, base, g, adj, desa, proposa, confirma };
}

type Grup = { activitat_id: string; resultats: { participant: { cognom1: string }; resultat: string; posicio_espera: number | null }[] };
const resum = (grups: Grup[], id: string) =>
  grups.find((x) => x.activitat_id === id)!.resultats.map((r) => `${r.participant.cognom1}:${r.resultat}${r.posicio_espera ? r.posicio_espera : ""}`);

describe("adjudicació: paràmetres versionats", () => {
  it("exigeix desar els paràmetres abans de calcular i en crea versions sense sobreescriure", async () => {
    const { casal, adj, g, desa, proposa } = await escenari();
    const inicial = await g.json(adj);
    expect(inicial.status).toBe(200);
    expect(inicial.cos.configuracio).toBeNull();
    expect(inicial.cos.pot_calcular).toBe(false);
    expect((await proposa()).cos.error.codi).toBe("sense_parametres");

    const v1 = await desa();
    expect(v1.status).toBe(200);
    expect(v1.cos.configuracio.versio).toBe(1);
    // Algú altre ja ha desat la versió 1: no se sobreescriu.
    expect((await desa(GENERALS, null)).status).toBe(409);
    const v2 = await desa({ ...GENERALS, maxim_activitats_per_persona: 1 }, 1);
    expect(v2.cos.configuracio.versio).toBe(2);
    const ara = await g.json(adj);
    expect(ara.cos.versions_configuracio.map((c: { versio: number }) => c.versio)).toEqual([2, 1]);
    expect(ara.cos.pot_calcular).toBe(true);

    expect((await desa({ ...GENERALS, metode: "qualsevol" } as never, 2)).status).toBe(400);
    expect((await desa({ ...GENERALS, estats_sollicitud: ["anullada"] } as never, 2)).status).toBe(400);
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${adj}/parametres`, { method: "PUT", json: { parametres: GENERALS, versio_actual: 2 } })).status).toBe(403);
    expect((await consulta.json(adj)).status).toBe(200);
  });

  it("només calcula propostes amb el cicle en procés d'adjudicació", async () => {
    const { cicle, desa, proposa } = await escenari();
    await desa();
    await env.DB.prepare("UPDATE cicles SET estat = 'inscripcions_tancades' WHERE id = ?").bind(cicle.id).run();
    expect((await proposa()).cos.error.codi).toBe("cicle_no_en_adjudicacio");
  });
});

describe("adjudicació: proposta, confirmació i substitució", () => {
  it("calcula una proposta, la confirma i crea les places", async () => {
    const { casal, cicle, A, B, base, g, desa, proposa, confirma } = await escenari();
    await desa();
    const p = await proposa();
    expect(p.status).toBe(201);
    expect(p.cos.execucio).toMatchObject({ versio: 1, estat: "proposta", configuracio_versio: 1 });
    expect(p.cos.execucio.resum).toMatchObject({ sollicituds: 3, places_adjudicades: 2, versio_motor: 2 });

    const det = await g.json(`${base}/adjudicacions/${p.cos.execucio.id}`);
    expect(resum(det.cos.grups, A.id)).toEqual(["Zapata:admesa", "Àvila:llista_espera1"]);
    expect(resum(det.cos.grups, B.id)).toEqual(["Àvila:admesa", "Bosch:llista_espera1"]);
    expect(det.cos.pot_confirmar).toBe(true);
    expect(det.cos.substitueix).toBeNull();

    // Una proposta encara no canvia l'estat d'adjudicació de les sol·licituds.
    const llistat = `${base}/cicles/${cicle.id}/sollicituds`;
    expect((await g.json(llistat)).cos.files.map((f: { estat_adjudicacio: string }) => f.estat_adjudicacio)).toEqual(["pendent", "pendent", "pendent"]);

    const c = await confirma(p.cos.execucio.id);
    expect(c.status).toBe(200);
    expect(c.cos.execucio.estat).toBe("confirmada");
    expect((await g.json(`${base}/cicles/${cicle.id}`)).cos.cicle.estat).toBe("adjudicat");
    expect((await g.json(llistat)).cos.files.map((f: { estat_adjudicacio: string }) => f.estat_adjudicacio))
      .toEqual(["admesa", "admesa", "llista_espera"]);

    const places = await g.json(`${base}/cicles/${cicle.id}/places`);
    expect(places.cos.gestionable).toBe(true);
    expect(places.cos.grups.map((x: { activitat_id: string; ocupades: number; lliures: number; espera: number }) =>
      [x.activitat_id, x.ocupades, x.lliures, x.espera])).toEqual(expect.arrayContaining([[A.id, 1, 0, 1], [B.id, 1, 0, 1]]));

    // No es pot confirmar dues vegades.
    expect((await confirma(p.cos.execucio.id)).cos.error.codi).toBe("execucio_no_proposta");
    const auditoria = await env.DB.prepare("SELECT tipus_operacio FROM registres_auditoria WHERE casal_id = ? AND tipus_operacio LIKE 'adjudicacio.%' ORDER BY id")
      .bind(casal.id).all<{ tipus_operacio: string }>();
    expect(auditoria.results.map((r) => r.tipus_operacio)).toEqual(["adjudicacio.parametres", "adjudicacio.proposta", "adjudicacio.confirmacio"]);
    // Els resultats confirmats no es poden modificar.
    await expect(env.DB.prepare("UPDATE resultats_adjudicacio SET resultat = 'admesa' WHERE execucio_id = ?").bind(p.cos.execucio.id).run())
      .rejects.toThrow(/resultats_inalterables/);
  });

  it("una proposta nova descarta l'anterior i la lletra del sorteig queda registrada", async () => {
    const { adj, g, desa, proposa } = await escenari();
    await desa({ ...GENERALS, criteri_ordre: "lletra" });
    const p1 = await proposa({ lletra: "b" });
    expect(p1.cos.execucio.lletra_sorteig).toBe("B");
    const p2 = await proposa();
    expect(p2.cos.execucio.lletra_sorteig).toMatch(/^[A-Z]$/);
    expect(p2.cos.execucio.versio).toBe(2);
    const estats = (await g.json(adj)).cos.execucions.map((e: { versio: number; estat: string }) => [e.versio, e.estat]);
    expect(estats).toEqual([[2, "proposta"], [1, "descartada"]]);
    expect((await proposa({ lletra: "bb" })).status).toBe(400);
  });

  it("rebutja confirmar una proposta si les dades han canviat després del càlcul", async () => {
    const { base, g, cicle, desa, proposa, confirma } = await escenari();
    await desa();
    const p = await proposa();
    const fila = (await g.json(`${base}/cicles/${cicle.id}/sollicituds`)).cos.files[2];
    await g.json(`${base}/sollicituds/${fila.id}/estat`, { method: "POST", json: { versio: fila.versio, estat: "anullada", motiu: "Duplicada" } });
    expect((await confirma(p.cos.execucio.id)).cos.error.codi).toBe("proposta_obsoleta");
  });

  it("no deixa marcar el cicle com a adjudicat sense una adjudicació confirmada", async () => {
    const { base, g, cicle } = await escenari();
    const r = await g.json(`${base}/cicles/${cicle.id}/estat`, { method: "POST", json: { estat: "adjudicat", versio: (await g.json(`${base}/cicles/${cicle.id}`)).cos.cicle.versio } });
    expect(r.cos.error.codi).toBe("sense_adjudicacio_confirmada");
  });

  it("substitueix una adjudicació confirmada només amb motiu i respecta les renúncies", async () => {
    const { cicle, A, B, base, g, adj, desa, proposa, confirma } = await escenari();
    await desa();
    const v1 = (await proposa()).cos.execucio;
    await confirma(v1.id);
    // Àvila renuncia a la plaça de B.
    const places = (await g.json(`${base}/cicles/${cicle.id}/places`)).cos.grups;
    const avilaB = places.find((x: { activitat_id: string }) => x.activitat_id === B.id).places
      .find((p: { participant: { cognom1: string } }) => p.participant.cognom1 === "Àvila");
    expect((await g.json(`${base}/places/${avilaB.id}/moviments`, { method: "POST", json: { accio: "renunciar", versio: avilaB.versio, motiu: "Ho comunica per telèfon" } })).status).toBe(200);

    // Tornar a adjudicar requereix confirmació i motiu del canvi d'estat del cicle.
    const versioCicle = (await g.json(`${base}/cicles/${cicle.id}`)).cos.cicle.versio;
    const reobre = await g.json(`${base}/cicles/${cicle.id}/estat`, {
      method: "POST", json: { estat: "adjudicacio_en_proces", versio: versioCicle, confirmacio: true, motiu: "Error en la capacitat" },
    });
    expect(reobre.status).toBe(200);
    await env.DB.prepare("UPDATE activitats SET capacitat = 2 WHERE id = ?").bind(A.id).run();
    const v2 = (await proposa()).cos.execucio;
    const det = await g.json(`${base}/adjudicacions/${v2.id}`);
    expect(det.cos.substitueix).toEqual({ id: v1.id, versio: 1 });
    // La renúncia d'Àvila a B es manté: no se li torna a adjudicar.
    expect(resum(det.cos.grups, B.id)).toEqual(["Bosch:admesa", "Àvila:no_adjudicada"]);
    expect(resum(det.cos.grups, A.id)).toEqual(["Àvila:admesa", "Zapata:admesa"]);

    const sense = await confirma(v2.id);
    expect(sense.status).toBe(428);
    expect(sense.cos.error.codi).toBe("confirmacio_requerida");
    expect((await confirma(v2.id, { motiu: "Ampliació de places de l'activitat A" })).status).toBe(200);

    const execucions = (await g.json(adj)).cos.execucions;
    expect(execucions.map((e: { versio: number; estat: string }) => [e.versio, e.estat])).toEqual([[2, "confirmada"], [1, "substituida"]]);
    expect(execucions[1].substituida_per_execucio).toBe(v2.id);

    const ara = (await g.json(`${base}/cicles/${cicle.id}/places`)).cos.grups;
    const estats = (id: string) => ara.find((x: { activitat_id: string }) => x.activitat_id === id).places
      .map((p: { participant: { cognom1: string }; estat: string }) => `${p.participant.cognom1}:${p.estat}`);
    expect(estats(A.id)).toEqual(["Àvila:admesa", "Zapata:admesa"]);
    expect(estats(B.id)).toEqual(["Bosch:admesa", "Àvila:renuncia"]);
    const moviments = (await g.json(`${base}/places/${avilaB.id}/moviments`)).cos.moviments;
    expect(moviments.map((m: { estat_anterior: string | null; estat_nou: string }) => [m.estat_anterior, m.estat_nou]))
      .toEqual([[null, "admesa"], ["admesa", "renuncia"]]);
  });
});

describe("places i llistes d'espera", () => {
  async function adjudicat() {
    const e = await escenari();
    await e.desa();
    const p = await e.proposa();
    await e.confirma(p.cos.execucio.id);
    const places = async () => (await e.g.json(`${e.base}/cicles/${e.cicle.id}/places`)).cos.grups as
      { activitat_id: string; lliures: number; places: { id: string; versio: number; estat: string; participant: { cognom1: string } }[] }[];
    const placa = async (activitat: string, cognom: string) =>
      (await places()).find((x) => x.activitat_id === activitat)!.places.find((p) => p.participant.cognom1 === cognom)!;
    const mou = async (activitat: string, cognom: string, accio: string, versio?: number) => {
      const p = await placa(activitat, cognom);
      return e.g.json(`${e.base}/places/${p.id}/moviments`, { method: "POST", json: { accio, versio: versio ?? p.versio, motiu: "Motiu de prova" } });
    };
    return { ...e, places, placa, mou };
  }

  it("renúncia, oferta de la vacant i acceptació, amb el control de capacitat", async () => {
    const { A, B, mou, placa, base, g } = await adjudicat();
    // A és plena: no es pot admetre ningú de la llista d'espera.
    expect((await mou(A.id, "Àvila", "admetre")).cos.error.codi).toBe("sense_places_lliures");
    expect((await mou(B.id, "Bosch", "oferir")).cos.error.codi).toBe("sense_places_lliures");
    expect((await mou(B.id, "Bosch", "acceptar_oferta")).cos.error.codi).toBe("transicio_no_permesa");
    expect((await mou(B.id, "Àvila", "renunciar")).status).toBe(200);
    expect((await mou(B.id, "Bosch", "oferir")).status).toBe(200);
    expect((await placa(B.id, "Bosch")).estat).toBe("oferta_pendent");
    expect((await mou(B.id, "Bosch", "acceptar_oferta")).status).toBe(200);
    const bosch = await placa(B.id, "Bosch");
    expect(bosch.estat).toBe("admesa");
    const moviments = (await g.json(`${base}/places/${bosch.id}/moviments`)).cos.moviments;
    expect(moviments.map((m: { estat_nou: string; motiu: string }) => m.estat_nou)).toEqual(["llista_espera", "oferta_pendent", "admesa"]);
    // Una renúncia no es pot desfer des del panell.
    expect((await mou(B.id, "Àvila", "admetre")).cos.error.codi).toBe("transicio_no_permesa");
  });

  it("exigeix motiu, versió vigent i permís, i no deixa gestionar places fora d'estat", async () => {
    const { A, cicle, casal, mou, placa, base, g } = await adjudicat();
    const zapata = await placa(A.id, "Zapata");
    expect((await g.json(`${base}/places/${zapata.id}/moviments`, { method: "POST", json: { accio: "donar_baixa", versio: zapata.versio, motiu: "" } })).status).toBe(400);
    expect((await mou(A.id, "Zapata", "donar_baixa", zapata.versio + 5)).cos.error.codi).toBe("conflicte_concurrencia");
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${base}/places/${zapata.id}/moviments`, { method: "POST", json: { accio: "donar_baixa", versio: zapata.versio, motiu: "Prova" } })).status).toBe(403);
    const altre = await crearEscenari();
    const forani = await clientAutenticat("gestor_casal", altre.casal.id);
    expect((await forani.json(`${base}/places/${zapata.id}/moviments`)).status).toBe(403);
    expect((await forani.json(`/api/gestio/casals/${altre.casal.id}/places/${zapata.id}/moviments`)).status).toBe(404);
    await env.DB.prepare("UPDATE cicles SET estat = 'finalitzat' WHERE id = ?").bind(cicle.id).run();
    expect((await mou(A.id, "Zapata", "donar_baixa")).cos.error.codi).toBe("cicle_bloquejat");
  });

  it("exporta resultats i places amb auditoria i sense dades de contacte si no es poden veure", async () => {
    const { casal, cicle, base, g, adj } = await adjudicat();
    const execucio = (await g.json(adj)).cos.execucions[0];
    const res = await g.json(`${base}/adjudicacions/${execucio.id}/exportacio`);
    expect(res.status).toBe(200);
    expect(res.cos.columnes[0]).toBe("Activitat");
    expect(res.cos.files).toHaveLength(4);
    const admesos = await g.json(`${base}/cicles/${cicle.id}/exportacions/places?tipus=admesos`);
    expect(admesos.cos.files).toHaveLength(2);
    expect(admesos.cos.columnes).toContain("Telèfon");
    expect(JSON.stringify(admesos.cos.files)).toContain("600000001");
    const espera = await g.json(`${base}/cicles/${cicle.id}/exportacions/places?tipus=espera`);
    expect(espera.cos.files).toHaveLength(2);
    expect((await g.json(`${base}/cicles/${cicle.id}/exportacions/places?tipus=tot`)).status).toBe(400);
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${base}/cicles/${cicle.id}/exportacions/places?tipus=admesos`)).status).toBe(403);
    const places = await consulta.json(`${base}/cicles/${cicle.id}/places`);
    expect(JSON.stringify(places.cos)).not.toContain("600000001");
    const auditoria = await env.DB.prepare("SELECT tipus_operacio, detalls FROM registres_auditoria WHERE casal_id = ? AND tipus_operacio LIKE 'exportacio.%' ORDER BY id")
      .bind(casal.id).all<{ tipus_operacio: string; detalls: string }>();
    expect(auditoria.results.map((r) => r.tipus_operacio)).toEqual(["exportacio.adjudicacio", "exportacio.places.admesos", "exportacio.places.espera"]);
    expect(auditoria.results.map((r) => r.detalls).join()).not.toContain("600000001");
  });
});
