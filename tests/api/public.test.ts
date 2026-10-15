import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearApp } from "../../worker/app";
import { ARA, crearEscenari, rellotgeFix } from "../setup/dades";

const app = crearApp({ rellotge: rellotgeFix(ARA) });
const peticio = (ruta: string, init?: RequestInit) => app.request(`http://localhost${ruta}`, init, env);

describe("API: salut i capçaleres", () => {
  it("respon a /api/salut amb capçaleres de seguretat", async () => {
    const r = await peticio("/api/salut");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ estat: "ok" });
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(r.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("retorna errors estructurats per a rutes inexistents", async () => {
    const r = await peticio("/api/no-existeix");
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: { codi: "no_trobat" } });
  });

  it("rebutja peticions d'escriptura des d'un altre origen", async () => {
    const r = await peticio("/api/public/casals/X/cicles", { method: "POST", headers: { Origin: "https://atacant.invalid" } });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: { codi: "origen_no_permes" } });
  });

  it("no respon a preflight CORS d'orígens no permesos", async () => {
    const r = await peticio("/api/salut", { method: "OPTIONS", headers: { Origin: "https://atacant.invalid" } });
    expect(r.status).toBe(403);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("API pública: cicles i activitats", () => {
  it("llista els casals actius només amb codi, nom i municipi", async () => {
    const { casal } = await crearEscenari();
    const r = await peticio("/api/public/casals");
    expect(r.status).toBe(200);
    const { casals } = (await r.json()) as { casals: Record<string, unknown>[] };
    const trobat = casals.find((c) => c.codi === casal.codi);
    expect(trobat).toEqual({ codi: casal.codi, nom: casal.nom, municipi: casal.municipi });
    for (const c of casals) expect(Object.keys(c).sort()).toEqual(["codi", "municipi", "nom"]);
  });

  it("no mostra cicles en esborrany", async () => {
    const { casal } = await crearEscenari();
    const r = await peticio(`/api/public/casals/${casal.codi}/cicles`);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { cicles: unknown[] }).cicles).toEqual([]);
  });

  it("mostra els cicles oberts i només les activitats actives amb camps públics", async () => {
    const { casal, cicle, activa } = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    const cicles = (await (await peticio(`/api/public/casals/${casal.codi}/cicles`)).json()) as {
      cicles: { id: string; accepta_sollicituds: boolean; data_resolucio_prevista: string }[];
    };
    expect(cicles.cicles).toHaveLength(1);
    expect(cicles.cicles[0]).toMatchObject({ id: cicle.id, accepta_sollicituds: true, data_resolucio_prevista: "2027-01-08" });

    const r = await peticio(`/api/public/casals/${casal.codi}/cicles/${cicle.id}/activitats`);
    expect(r.status).toBe(200);
    const cos = (await r.json()) as { activitats: Record<string, unknown>[]; casal: Record<string, unknown> };
    expect(cos.activitats.map((a) => a.id)).toEqual([activa.id]);
    // Llista blanca: cap camp intern.
    expect(Object.keys(cos.activitats[0]!).sort()).toEqual([
      "categoria", "data_fi", "data_inici", "descripcio", "destinataris", "dies_setmana", "espai", "hora_fi", "hora_inici",
      "horari_text", "id", "nom",
    ]);
    expect(Object.keys(cos.casal).sort()).toEqual(["codi", "municipi", "nom"]);
    expect(JSON.stringify(cos)).not.toContain("nota_interna");
    expect(JSON.stringify(cos)).not.toContain("capacitat");
  });

  it("no permet consultar el cicle d'un casal a través d'un altre casal", async () => {
    const a = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    const b = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    const r = await peticio(`/api/public/casals/${b.casal.codi}/cicles/${a.cicle.id}/activitats`);
    expect(r.status).toBe(404);
  });

  it("respon 404 a codis o identificadors mal formats sense consultar dades", async () => {
    expect((await peticio("/api/public/casals/codi'malformat/cicles")).status).toBe(404);
    const { casal } = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    expect((await peticio(`/api/public/casals/${casal.codi}/cicles/no-es-un-uuid/activitats`)).status).toBe(404);
  });
});
