import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PARAMETRES_INICIALS } from "../../shared/domain/adjudicacio";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

const CONFIG = { informacio_privacitat: "Text de prova fictici." };

/**
 * Activitats actives: A «Taller fictici» (2 places), B «Ioga fictici» (5) i C «Ganxet fictici» (3).
 * Sol·licituds: Zapata → [A], Àvila → [A, B], Bosch → [A] i Puig → [A] (anul·lada).
 * També hi ha una activitat en esborrany, que no es compta.
 */
async function escenari() {
  const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
  const A = e.activa;
  await env.DB.prepare("UPDATE activitats SET capacitat = 2 WHERE id = ?").bind(A.id).run();
  await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?").bind(JSON.stringify(CONFIG), e.cicle.id).run();
  const B = await e.repos.activitats.crear({ casal_id: e.casal.id, cicle_id: e.cicle.id, nom: "Ioga fictici", capacitat: 5, estat: "activa" });
  const C = await e.repos.activitats.crear({ casal_id: e.casal.id, cicle_id: e.cicle.id, nom: "Ganxet fictici", capacitat: 3, estat: "activa" });
  const publica = client(undefined, { LIMIT_SOLLICITUDS: undefined });
  for (const [nom, cognom1, prefs] of [["Marta", "Zapata", [A.id]], ["Jordi", "Àvila", [A.id, B.id]], ["Núria", "Bosch", [A.id]], ["Pere", "Puig", [A.id]]] as const) {
    const r = await publica.json(`/api/public/casals/${e.casal.codi}/cicles/${e.cicle.id}/sollicituds`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { dades: { nom, cognom1 }, preferencies: prefs.map((activitat_id, i) => ({ activitat_id, ordre: i + 1 })), acceptacio_privacitat: true },
    });
    if (r.status !== 201) throw new Error(JSON.stringify(r.cos));
  }
  await env.DB.prepare(`UPDATE sollicituds SET estat = 'anullada' WHERE cicle_id = ? AND participant_id IN
    (SELECT id FROM participants WHERE cognom1 = 'Puig')`).bind(e.cicle.id).run();
  const base = `/api/gestio/casals/${e.casal.id}`;
  const g = await clientAutenticat("gestor_casal", e.casal.id);
  const indicadors = () => g.json(`${base}/cicles/${e.cicle.id}/indicadors`);
  return { ...e, A, B, C, base, g, indicadors };
}

describe("quadre de comandament del cicle", () => {
  it("calcula els indicadors a partir de les dades reals, abans i després de l'adjudicació", async () => {
    const { A, B, C, cicle, base, g, indicadors } = await escenari();
    const r = await indicadors();
    expect(r.status).toBe(200);
    expect(r.cos.inscripcions.estat).toBe("obertes");
    expect(r.cos.adjudicacio).toEqual({ estat: "sense_proposta", versio: null, data: null });
    expect(r.cos.totals).toEqual({
      activitats: 3, activitats_no_actives: 1, sollicituds: 3,
      sollicituds_per_estat: { rebuda: 3, validada: 0, pendent_revisio: 0, anullada: 1 },
      persones: 3, places_disponibles: 10, places_ocupades: 0, places_lliures: 10, admeses: 0, espera: 0,
      activitats_sense_inscripcions: 1, activitats_mes_demanda: 1,
    });
    const fila = (cos: { activitats: { id: string }[] }, id: string) => cos.activitats.find((a) => a.id === id);
    expect(fila(r.cos, A.id)).toMatchObject({ sollicituds: 3, primera_preferencia: 3, mes_demanda: true, sense_inscripcions: false });
    expect(fila(r.cos, B.id)).toMatchObject({ sollicituds: 1, primera_preferencia: 0, mes_demanda: false });
    expect(fila(r.cos, C.id)).toMatchObject({ sollicituds: 0, sense_inscripcions: true });

    await env.DB.prepare("UPDATE cicles SET estat = 'adjudicacio_en_proces' WHERE id = ?").bind(cicle.id).run();
    const adj = `${base}/cicles/${cicle.id}/adjudicacio`;
    await g.json(`${adj}/parametres`, {
      method: "PUT", json: { parametres: { ...PARAMETRES_INICIALS, criteri_ordre: "inscripcio", prioritat_espera_anterior: false, maxim_activitats_per_persona: 1 }, versio_actual: null },
    });
    const p = await g.json(`${adj}/propostes`, { method: "POST", json: {} });
    expect((await indicadors()).cos.adjudicacio).toMatchObject({ estat: "proposta", versio: 1 });
    await g.json(`${base}/adjudicacions/${p.cos.execucio.id}/confirmar`, { method: "POST", json: { confirmacio: true } });

    const d = (await indicadors()).cos;
    expect(d.inscripcions.estat).toBe("tancades");
    expect(d.adjudicacio).toMatchObject({ estat: "confirmada", versio: 1 });
    // Zapata i Àvila (per ordre d'inscripció) tenen A; Bosch queda en espera; Àvila ja té el màxim d'1 activitat.
    expect(fila(d, A.id)).toMatchObject({ admeses: 2, espera: 1, lliures: 0 });
    expect(fila(d, B.id)).toMatchObject({ admeses: 0, lliures: 5 });
    expect(d.totals).toMatchObject({ places_ocupades: 2, places_lliures: 8, admeses: 2, espera: 1 });
  });

  it("només el pot consultar qui té permís sobre el casal", async () => {
    const { base, cicle } = await escenari();
    const altre = await crearEscenari();
    const alie = await clientAutenticat("gestor_casal", altre.casal.id);
    expect((await alie.json(`${base}/cicles/${cicle.id}/indicadors`)).status).toBe(403);
    // L'id d'un cicle d'un altre casal sota el propi casal no es troba.
    const propi = await clientAutenticat("gestor_casal", altre.casal.id);
    expect((await propi.json(`/api/gestio/casals/${altre.casal.id}/cicles/${cicle.id}/indicadors`)).status).toBe(404);
    expect((await client().json(`${base}/cicles/${cicle.id}/indicadors`)).status).toBe(401);
  });
});
