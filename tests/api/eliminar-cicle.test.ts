import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

describe("eliminar un cicle", () => {
  it("elimina un cicle sense inscripcions, amb les seves activitats i el calendari", async () => {
    const { casal, cicle, activa } = await crearEscenari({ estatCicle: "preparacio" });
    const g = await clientAutenticat("gestor_casal", casal.id);
    const ruta = `/api/gestio/casals/${casal.id}/cicles/${cicle.id}`;
    await env.DB.prepare("UPDATE activitats SET data_inici = '2026-10-05', data_fi = '2026-10-09' WHERE id = ?").bind(activa.id).run();
    expect((await g.json(`/api/gestio/casals/${casal.id}/activitats/${activa.id}/sessions/generacio`, { method: "POST" })).status).toBe(200);

    expect((await g.json(ruta, { method: "DELETE", json: { versio: cicle.versio, motiu: "Creat per error" } })).status).toBe(400);
    expect((await g.json(ruta, { method: "DELETE", json: { versio: cicle.versio + 5, confirmacio: true, motiu: "Creat per error" } })).status).toBe(409);
    const conserge = await clientAutenticat("conserge", casal.id);
    expect((await conserge.json(ruta, { method: "DELETE", json: { versio: cicle.versio, confirmacio: true, motiu: "Creat per error" } })).status).toBe(403);

    const r = await g.json(ruta, { method: "DELETE", json: { versio: cicle.versio, confirmacio: true, motiu: "Creat per error" } });
    expect(r.status).toBe(200);
    expect(r.cos).toEqual({ ok: true, activitats: 2 });
    expect((await g.json(ruta)).status).toBe(404);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM activitats WHERE cicle_id = ?").bind(cicle.id).first("n")).toBe(0);
    const audit = await env.DB.prepare("SELECT motiu FROM registres_auditoria WHERE tipus_operacio = 'cicle.eliminacio' AND entitat_id = ?").bind(cicle.id).first<{ motiu: string }>();
    expect(audit?.motiu).toBe("Creat per error");
  });

  it("no elimina un cicle que ja té sol·licituds", async () => {
    const { casal, cicle, activa } = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?")
      .bind(JSON.stringify({ informacio_privacitat: "Text fictici." }), cicle.id).run();
    const publica = client(undefined, { LIMIT_SOLLICITUDS: undefined });
    const s = await publica.json(`/api/public/casals/${casal.codi}/cicles/${cicle.id}/sollicituds`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { dades: { data_naixement: "1980-05-01", nom: "Persona", cognom1: "Fictícia" }, preferencies: [{ activitat_id: activa.id, ordre: 1 }], acceptacio_privacitat: true },
    });
    expect(s.status).toBe(201);
    const g = await clientAutenticat("gestor_casal", casal.id);
    const actual = (await g.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}`)).cos.cicle;
    const r = await g.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}`, { method: "DELETE", json: { versio: actual.versio, confirmacio: true, motiu: "Prova" } });
    expect(r.status).toBe(409);
    expect(r.cos.error.codi).toBe("cicle_amb_dades");
    expect(r.cos.error.missatge).toContain("arxiveu-lo");
  });
});
