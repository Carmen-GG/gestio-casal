import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PARAMETRES_INICIALS } from "../../shared/domain/adjudicacio";
import { clauOrdenacioPersona } from "../../shared/domain/ordenacio";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

const CONFIG = {
  informacio_privacitat: "Text de prova fictici.",
  camps: { telefon: { actiu: true, obligatori: false }, document_identitat: { actiu: true, obligatori: false }, data_naixement: { actiu: true, obligatori: false } },
};

/**
 * Cicle amb dues activitats d'una plaça i quatre sol·licituds fictícies:
 *   1. Zapata → [A]   2. Àvila → [B, A]   3. Bosch → [B]   4. Costa → [B, A]
 * Al cicle anterior, la mateixa Costa (un altre registre, mateix DNI i data de naixement) va quedar
 * en llista d'espera de l'activitat equivalent a A, que havia triat en 2a preferència. Una altra
 * Laia Costa amb el mateix telèfon i el mateix DNI però una altra data de naixement va quedar en
 * llista d'espera de la de B: no és la mateixa persona i no dona prioritat.
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
  await envia({ nom: "Laia", cognom1: "Costa", telefon: "600000004", document_identitat: "00000000-t", data_naixement: "1950-03-02" }, [B.id, A.id]);
  await cicleAnterior(e.casal.id, A.nom, B.nom);
  await env.DB.prepare("UPDATE cicles SET estat = 'inscripcions_tancades' WHERE id = ?").bind(e.cicle.id).run();
  const base = `/api/gestio/casals/${e.casal.id}`;
  const g = await clientAutenticat("gestor_casal", e.casal.id);
  const adj = `${base}/cicles/${e.cicle.id}/adjudicacio`;
  const sorteig = `${base}/cicles/${e.cicle.id}/sorteig`;
  const desa = async (canvis: Record<string, unknown> = {}) => {
    const actual = (await g.json(adj)).cos.configuracio?.versio ?? null;
    const r = await g.json(`${adj}/parametres`, { method: "PUT", json: { parametres: { ...PARAMETRES_INICIALS, ...canvis }, versio_actual: actual } });
    if (r.status !== 200) throw new Error(JSON.stringify(r.cos));
  };
  const sorteja = (activitatId: string, json: Record<string, unknown> = {}) =>
    g.json(`${base}/cicles/${e.cicle.id}/activitats/${activitatId}/sorteig`, { method: "POST", json });
  const enProces = () => env.DB.prepare("UPDATE cicles SET estat = 'adjudicacio_en_proces' WHERE id = ?").bind(e.cicle.id).run();
  return { ...e, A, B, base, g, adj, sorteig, desa, sorteja, enProces };
}

/** Cicle anterior fictici, amb adjudicació confirmada i Costa en llista d'espera (2a preferència). */
async function cicleAnterior(casalId: string, nomActivitat: string, nomActivitatB: string) {
  const id = crypto.randomUUID();
  const ara = "2026-06-01T10:00:00.000Z";
  const actA = crypto.randomUUID();
  const config = crypto.randomUUID();
  const exec = crypto.randomUUID();
  const participant = crypto.randomUUID();
  const sollicitud = crypto.randomUUID();
  const actB = crypto.randomUUID();
  const homonima = crypto.randomUUID();
  const sollicitudHomonima = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO cicles (id, casal_id, nom, any, data_inici, data_fi, obertura_inscripcions, tancament_inscripcions,
      data_resolucio_prevista, estat, creat_el, actualitzat_el) VALUES (?, ?, 'Cicle anterior fictici', 2026, '2026-09-14', '2026-12-18',
      '2026-06-01T07:00:00.000Z', '2026-06-30T21:59:59.000Z', '2026-07-10', 'finalitzat', ?, ?)`).bind(id, casalId, ara, ara),
    env.DB.prepare(`INSERT INTO activitats (id, casal_id, cicle_id, nom, capacitat, estat, creat_el, actualitzat_el)
      VALUES (?, ?, ?, ?, 1, 'activa', ?, ?)`).bind(actA, casalId, id, nomActivitat, ara, ara),
    env.DB.prepare(`INSERT INTO activitats (id, casal_id, cicle_id, nom, capacitat, estat, creat_el, actualitzat_el)
      VALUES (?, ?, ?, ?, 1, 'activa', ?, ?)`).bind(actB, casalId, id, nomActivitatB, ara, ara),
    env.DB.prepare(`INSERT INTO participants (id, casal_id, nom, cognom1, clau_ordenacio, telefon, document_identitat, data_naixement, creat_el, actualitzat_el)
      VALUES (?, ?, 'Laia', 'Costa', ?, '600 000 999', '00000000T', '1950-03-02', ?, ?)`).bind(participant, casalId, clauOrdenacioPersona({ cognom1: "Costa", nom: "Laia" }), ara, ara),
    env.DB.prepare(`INSERT INTO participants (id, casal_id, nom, cognom1, clau_ordenacio, telefon, document_identitat, data_naixement, creat_el, actualitzat_el)
      VALUES (?, ?, 'Laia', 'Costa', ?, '600 000 004', '00000000T', '1948-11-20', ?, ?)`).bind(homonima, casalId, clauOrdenacioPersona({ cognom1: "Costa", nom: "Laia" }), ara, ara),
    env.DB.prepare(`INSERT INTO sollicituds (id, casal_id, cicle_id, participant_id, numero, rebuda_el, estat, origen, codi_confirmacio, actualitzat_el)
      VALUES (?, ?, ?, ?, 2, ?, 'validada', 'gestio', ?, ?)`).bind(sollicitudHomonima, casalId, id, homonima, ara, crypto.randomUUID(), ara),
    env.DB.prepare(`INSERT INTO sollicituds (id, casal_id, cicle_id, participant_id, numero, rebuda_el, estat, origen, codi_confirmacio, actualitzat_el)
      VALUES (?, ?, ?, ?, 1, ?, 'validada', 'gestio', ?, ?)`).bind(sollicitud, casalId, id, participant, ara, crypto.randomUUID(), ara),
    env.DB.prepare(`INSERT INTO configuracions_adjudicacio (id, cicle_id, versio, parametres, creat_el) VALUES (?, ?, 1, '{}', ?)`).bind(config, id, ara),
    env.DB.prepare(`INSERT INTO execucions_adjudicacio (id, casal_id, cicle_id, configuracio_id, versio, estat, executada_el)
      VALUES (?, ?, ?, ?, 1, 'confirmada', ?)`).bind(exec, casalId, id, config, ara),
    env.DB.prepare(`INSERT INTO places (id, casal_id, activitat_id, sollicitud_id, estat, posicio_espera, preferencia, execucio_origen_id, actualitzat_el)
      VALUES (?, ?, ?, ?, 'llista_espera', 1, 2, ?, ?)`).bind(crypto.randomUUID(), casalId, actA, sollicitud, exec, ara),
    env.DB.prepare(`INSERT INTO places (id, casal_id, activitat_id, sollicitud_id, estat, posicio_espera, preferencia, execucio_origen_id, actualitzat_el)
      VALUES (?, ?, ?, ?, 'llista_espera', 1, 1, ?, ?)`).bind(crypto.randomUUID(), casalId, actB, sollicitudHomonima, exec, ara),
  ]);
}

type Grup = { activitat_id: string; sota_minim: boolean; resultats: { participant: { cognom1: string }; resultat: string; posicio_espera: number | null; per_espera_anterior: boolean }[] };
const resum = (grups: Grup[], id: string) =>
  grups.find((x) => x.activitat_id === id)!.resultats
    .map((r) => `${r.participant.cognom1}:${r.resultat}${r.posicio_espera ?? ""}${r.per_espera_anterior ? "*" : ""}`).sort();

describe("sorteig per activitat", () => {
  it("indica on cal sorteig, el fa o en registra el resultat, i només es repeteix anul·lant-lo amb motiu", async () => {
    const { casal, A, B, g, sorteig, desa, sorteja } = await escenari();
    await desa();
    const estat = await g.json(sorteig);
    expect(estat.status).toBe(200);
    expect(estat.cos).toMatchObject({ pot_sortejar: true, rang_numeros: 4, parametres: { tipus_sorteig: "numero", numeracio_sorteig: "inscripcio" } });
    expect(estat.cos.activitats.filter((a: { necessita_sorteig: boolean }) => a.necessita_sorteig).map((a: { id: string }) => a.id).sort())
      .toEqual([A.id, B.id].sort());

    const app = await sorteja(B.id);
    expect(app.status).toBe(201);
    expect(app.cos.sorteig).toMatchObject({ tipus: "numero", origen: "aplicacio", estat: "vigent", rang_maxim: 4 });
    expect(Number(app.cos.sorteig.valor)).toBeGreaterThanOrEqual(1);
    expect(Number(app.cos.sorteig.valor)).toBeLessThanOrEqual(4);

    expect((await sorteja(A.id, { valor_manual: "9" })).status).toBe(400);
    expect((await sorteja(A.id, { valor_manual: "M" })).status).toBe(400);
    const manual = await sorteja(A.id, { valor_manual: "2", motiu: "Sorteig amb bombo en directe" });
    expect(manual.cos.sorteig).toMatchObject({ valor: "2", origen: "manual" });
    expect((await sorteja(A.id)).cos.error.codi).toBe("sorteig_existent");

    const anulla = (id: string, json: Record<string, unknown>) => g.json(`${sorteig.replace(/sorteig$/, "sortejos")}/${id}/anullacio`, { method: "POST", json });
    expect((await anulla(manual.cos.sorteig.id, {})).status).toBe(400);
    expect((await anulla(manual.cos.sorteig.id, { motiu: "Error en anotar el número" })).status).toBe(200);
    expect((await anulla(manual.cos.sorteig.id, { motiu: "Una altra vegada" })).cos.error.codi).toBe("sorteig_anullat");
    expect((await sorteja(A.id, { valor_manual: "1" })).status).toBe(201);
    const historial = (await g.json(sorteig)).cos.historial;
    expect(historial.map((h: { estat: string; valor: string }) => `${h.valor}:${h.estat}`)).toContain("2:anullat");

    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${sorteig.replace(/sorteig$/, "activitats")}/${A.id}/sorteig`, { method: "POST", json: {} })).status).toBe(403);
    const auditoria = await env.DB.prepare("SELECT tipus_operacio FROM registres_auditoria WHERE casal_id = ? AND tipus_operacio LIKE 'adjudicacio.sorteig%' ORDER BY id")
      .bind(casal.id).all<{ tipus_operacio: string }>();
    expect(auditoria.results.map((r) => r.tipus_operacio)).toEqual(["adjudicacio.sorteig", "adjudicacio.sorteig", "adjudicacio.sorteig_anullat", "adjudicacio.sorteig"]);
    await expect(env.DB.prepare("DELETE FROM sortejos_adjudicacio WHERE id = ?").bind(manual.cos.sorteig.id).run()).rejects.toThrow();
  });

  it("aplica la regla: llista d'espera anterior, preferència i sorteig de cada activitat; llista qui queda sense activitat", async () => {
    const { A, B, base, g, adj, desa, sorteja, enProces } = await escenari();
    await desa();
    await enProces();
    const pendents = await g.json(`${adj}/propostes`, { method: "POST", json: {} });
    expect(pendents.cos.error.codi).toBe("sortejos_pendents");
    expect(pendents.cos.error.missatge).toContain("Ioga fictici");
    await sorteja(A.id, { valor_manual: "1" });
    await sorteja(B.id, { valor_manual: "3" });
    await env.DB.prepare("UPDATE activitats SET minim_participants = 5 WHERE id = ?").bind(A.id).run();

    const p = await g.json(`${adj}/propostes`, { method: "POST", json: {} });
    expect(p.status).toBe(201);
    expect(p.cos.execucio.resum).toMatchObject({ parelles_espera_anterior: 1, cicle_anterior: { nom: "Cicle anterior fictici" } });
    expect(p.cos.execucio.resum.sortejos).toHaveLength(2);
    const det = await g.json(`${base}/adjudicacions/${p.cos.execucio.id}`);
    // A: Costa té prioritat (llista d'espera anterior, 2a preferència). Després Zapata (1a) i Àvila (2a).
    expect(resum(det.cos.grups, A.id)).toEqual(["Costa:admesa*", "Zapata:llista_espera1", "Àvila:llista_espera2"].sort());
    // B: totes en 1a preferència; el sorteig (3) comença per Bosch (3), després Costa (4) i Àvila (2).
    expect(resum(det.cos.grups, B.id)).toEqual(["Bosch:admesa", "Costa:llista_espera1", "Àvila:llista_espera2"].sort());
    expect(det.cos.grups.find((x: Grup) => x.activitat_id === A.id).sota_minim).toBe(true);
    expect(det.cos.sense_activitat.map((f: { participant: { cognom1: string }; activitats_demanades: number; en_llista_espera: number }) =>
      `${f.participant.cognom1}:${f.activitats_demanades}:${f.en_llista_espera}`)).toEqual(["Àvila:2:2", "Zapata:1:1"]);

    const xlsx = await g.json(`${base}/adjudicacions/${p.cos.execucio.id}/exportacions/sense-activitat`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.cos.files).toHaveLength(2);
    expect(JSON.stringify(xlsx.cos.files)).toContain("llista d'espera (posició 2)");

    // La confirmació comprova que els sortejos no han canviat.
    const sorteigB = (await g.json(`${base}/cicles/${p.cos.execucio.cicle_id}/sorteig`)).cos.activitats.find((a: { id: string }) => a.id === B.id).sorteig;
    await g.json(`${base}/cicles/${p.cos.execucio.cicle_id}/sortejos/${sorteigB.id}/anullacio`, { method: "POST", json: { motiu: "Prova de canvi" } });
    await sorteja(B.id, { valor_manual: "2" });
    const conf = await g.json(`${base}/adjudicacions/${p.cos.execucio.id}/confirmar`, { method: "POST", json: { confirmacio: true } });
    expect(conf.cos.error.codi).toBe("proposta_obsoleta");
  });

  it("numeració aleatòria: assigna números únics una sola vegada i el sorteig n'usa el rang", async () => {
    const { casal, cicle, A, base, g, sorteig, desa, sorteja } = await escenari();
    await desa({ numeracio_sorteig: "aleatoria" });
    expect((await sorteja(A.id)).cos.error.codi).toBe("numeros_pendents");
    const r = await g.json(`${sorteig}/numeros`, { method: "POST", json: {} });
    expect(r.cos).toEqual({ assignats: 4, total: 4 });
    expect((await g.json(`${sorteig}/numeros`, { method: "POST", json: {} })).cos).toEqual({ assignats: 0, total: 4 });
    const { results } = await env.DB.prepare("SELECT numero FROM numeros_sorteig WHERE cicle_id = ? ORDER BY numero").bind(cicle.id).all<{ numero: number }>();
    expect(results.map((x) => x.numero)).toEqual([1, 2, 3, 4]);
    await expect(env.DB.prepare("UPDATE numeros_sorteig SET numero = 9 WHERE cicle_id = ?").bind(cicle.id).run()).rejects.toThrow();
    expect((await sorteja(A.id)).cos.sorteig).toMatchObject({ numeracio: "aleatoria", rang_maxim: 4 });
    const llista = await g.json(`${base}/cicles/${cicle.id}/exportacions/numeros-sorteig`);
    expect(llista.cos.columnes).toEqual(["Número de sorteig", "Núm. sol·licitud", "Persona"]);
    expect(llista.cos.files.map((f: unknown[]) => f[0])).toEqual([1, 2, 3, 4]);
    const auditoria = await env.DB.prepare("SELECT COUNT(*) AS n FROM registres_auditoria WHERE casal_id = ? AND tipus_operacio = 'adjudicacio.numeros_sorteig'")
      .bind(casal.id).first<{ n: number }>();
    expect(auditoria?.n).toBe(1);
  });

  it("no deixa sortejar fora d'estat ni sense la regla de sorteig per activitat", async () => {
    const { cicle, A, desa, sorteja } = await escenari();
    await desa({ criteri_ordre: "inscripcio" });
    expect((await sorteja(A.id)).cos.error.codi).toBe("sense_sorteig_activitat");
    await desa();
    await env.DB.prepare("UPDATE cicles SET estat = 'adjudicat' WHERE id = ?").bind(cicle.id).run();
    expect((await sorteja(A.id)).cos.error.codi).toBe("cicle_bloquejat");
  });
});
