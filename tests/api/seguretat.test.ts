import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ARA, crearEscenari } from "../setup/dades";
import { client, clientAutenticat, rellotgeMobil, usuariAmbRol } from "../setup/sessio";

describe("autenticació", () => {
  it("rebutja l'accés al panell sense sessió", async () => {
    const c = client();
    const r = await c.json("/api/gestio/casals");
    expect(r.status).toBe(401);
    expect(r.cos.error.codi).toBe("no_autenticat");
    expect((await c.json("/api/auth/jo")).status).toBe(401);
  });

  it("inicia sessió amb un testimoni vàlid i estableix una galeta segura", async () => {
    const { casal } = await crearEscenari();
    const { testimoni } = await usuariAmbRol("gestor_casal", casal.id);
    const c = client();
    const r = await c.peticio("/api/auth/entrar", { method: "POST", json: { testimoni } });
    expect(r.status).toBe(200);
    const setCookie = r.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/^__Host-casal_sessio=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    const jo = await c.json("/api/auth/jo");
    expect(jo.status).toBe(200);
    expect(jo.cos.casals.map((k: { id: string }) => k.id)).toEqual([casal.id]);
    // La sessió es desa resumida: el valor de la galeta no apareix a la base de dades.
    const valor = c.galeta.split("=")[1]!;
    const fila = await env.DB.prepare("SELECT count(*) AS n FROM sessions_usuari WHERE resum = ?").bind(valor).first<{ n: number }>();
    expect(fila!.n).toBe(0);
  });

  it("un testimoni només es pot utilitzar una vegada", async () => {
    const { casal } = await crearEscenari();
    const { testimoni } = await usuariAmbRol("gestor_casal", casal.id);
    expect((await client().peticio("/api/auth/entrar", { method: "POST", json: { testimoni } })).status).toBe(200);
    const r = await client().json("/api/auth/entrar", { method: "POST", json: { testimoni } });
    expect(r.status).toBe(401);
    expect(r.cos.error.codi).toBe("acces_no_valid");
  });

  it("rebutja testimonis caducats o inventats i ho registra a l'auditoria", async () => {
    const { casal } = await crearEscenari();
    const { testimoni } = await usuariAmbRol("gestor_casal", casal.id, { caducaEl: "2026-11-01T09:00:00.000Z" });
    expect((await client().peticio("/api/auth/entrar", { method: "POST", json: { testimoni } })).status).toBe(401);
    expect((await client().peticio("/api/auth/entrar", { method: "POST", json: { testimoni: "x".repeat(43) } })).status).toBe(401);
    const denegats = await env.DB.prepare("SELECT count(*) AS n FROM registres_auditoria WHERE tipus_operacio = 'sessio.inici' AND resultat = 'denegat'").first<{ n: number }>();
    expect(denegats!.n).toBeGreaterThanOrEqual(2);
  });

  it("l'accés de desenvolupament no existeix a producció", async () => {
    const { casal } = await crearEscenari();
    const { testimoni } = await usuariAmbRol("gestor_casal", casal.id);
    const r = await client(undefined, { APP_ENV: "production" }).peticio("/api/auth/entrar", { method: "POST", json: { testimoni } });
    expect(r.status).toBe(404);
  });

  it("tancar la sessió la revoca al servidor", async () => {
    const { casal } = await crearEscenari();
    const c = await clientAutenticat("gestor_casal", casal.id);
    const galeta = c.galeta;
    expect((await c.peticio("/api/auth/sortir", { method: "POST" })).status).toBe(200);
    c.galeta = galeta; // reutilitzar la galeta antiga no ha de funcionar
    expect((await c.peticio("/api/gestio/casals")).status).toBe(401);
  });

  it("la sessió caduca per inactivitat", async () => {
    const { casal } = await crearEscenari();
    const rellotge = rellotgeMobil();
    const c = await clientAutenticat("gestor_casal", casal.id, rellotge);
    rellotge.avanca(30 * 60 * 1000);
    expect((await c.peticio("/api/gestio/casals")).status).toBe(200);
    rellotge.avanca(61 * 60 * 1000);
    expect((await c.peticio("/api/gestio/casals")).status).toBe(401);
  });
});

describe("autorització", () => {
  it("un usuari sense permís d'escriptura no pot crear cicles", async () => {
    const { casal } = await crearEscenari();
    const c = await clientAutenticat("consulta_casal", casal.id);
    expect((await c.peticio(`/api/gestio/casals/${casal.id}/cicles`)).status).toBe(200);
    const r = await c.json(`/api/gestio/casals/${casal.id}/cicles`, {
      method: "POST",
      json: { nom: "X", any: 2027, data_inici: "2027-01-01", data_fi: "2027-02-01", obertura_inscripcions: "2026-12-01T00:00:00Z", tancament_inscripcions: "2026-12-15T00:00:00Z", data_resolucio_prevista: "2026-12-20" },
    });
    expect(r.status).toBe(403);
    expect(r.cos.error.codi).toBe("sense_permis");
  });

  it("no permet accedir a dades d'un altre casal", async () => {
    const a = await crearEscenari();
    const b = await crearEscenari();
    const c = await clientAutenticat("gestor_casal", a.casal.id);
    expect((await c.peticio(`/api/gestio/casals/${b.casal.id}`)).status).toBe(403);
    expect((await c.peticio(`/api/gestio/casals/${b.casal.id}/cicles`)).status).toBe(403);
    // Ni tan sols posant l'id d'una activitat de B sota el casal A.
    expect((await c.peticio(`/api/gestio/casals/${a.casal.id}/activitats/${b.activa.id}`)).status).toBe(404);
    expect((await c.peticio(`/api/gestio/casals/${a.casal.id}/cicles/${b.cicle.id}`)).status).toBe(404);
    const llista = await c.json("/api/gestio/casals");
    expect(llista.cos.casals.map((k: { id: string }) => k.id)).toEqual([a.casal.id]);
  });

  it("la revocació d'un rol té efecte immediat", async () => {
    const { casal } = await crearEscenari();
    const c = await clientAutenticat("gestor_casal", casal.id);
    expect((await c.peticio(`/api/gestio/casals/${casal.id}/cicles`)).status).toBe(200);
    await env.DB.prepare("UPDATE assignacions_rols SET revocat_el = ? WHERE usuari_id = ?").bind(ARA, c.usuari.id).run();
    expect((await c.peticio(`/api/gestio/casals/${casal.id}/cicles`)).status).toBe(403);
  });

  it("ningú no pot crear casals des de l'API: són fixos", async () => {
    const { casal } = await crearEscenari();
    const dades = { codi: `NOU-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, nom: "Casal nou fictici", municipi: "Municipi fictici" };
    for (const c of [await clientAutenticat("gestor_casal", casal.id), await clientAutenticat("admin_central", null)]) {
      expect((await c.peticio("/api/gestio/casals", { method: "POST", json: dades })).status).toBeGreaterThanOrEqual(400);
    }
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM casals WHERE codi = ?").bind(dades.codi).first("n")).toBe(0);
  });

  it("rebutja camps no autoritzats a la petició", async () => {
    const { casal, activa } = await crearEscenari();
    const c = await clientAutenticat("gestor_casal", casal.id);
    const r = await c.json(`/api/gestio/casals/${casal.id}/activitats/${activa.id}`, {
      method: "PATCH", json: { versio: activa.versio, nom: "Nou nom", casal_id: "un-altre", estat: "activa" },
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.cos.error.detalls)).toContain("casal_id");
  });

  it("exigeix JSON a les peticions d'escriptura", async () => {
    const { casal } = await crearEscenari();
    const c = await clientAutenticat("gestor_casal", casal.id);
    const r = await c.peticio(`/api/gestio/casals/${casal.id}/cicles`, { method: "POST", body: "nom=x", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    expect(r.status).toBe(415);
  });

  it("les rutes públiques no donen accés a dades de gestió", async () => {
    const { casal, cicle, esborrany } = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    const c = client();
    expect((await c.peticio(`/api/public/casals/${casal.id}/cicles`)).status).toBe(404); // per id intern no
    const r = await c.json(`/api/public/casals/${casal.codi}/cicles/${cicle.id}/activitats`);
    expect(JSON.stringify(r.cos)).not.toContain(esborrany.id);
    expect((await c.peticio(`/api/gestio/casals/${casal.id}/cicles`)).status).toBe(401);
  });
});

describe("mida de les peticions", () => {
  it("rebutja cossos massa grans, tant si s'indica la mida com si no", async () => {
    const { casal, cicle } = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    const c = client();
    const ruta = `/api/public/casals/${casal.codi}/cicles/${cicle.id}/sollicituds`;
    const gran = JSON.stringify({ dades: { nom: "x".repeat(300 * 1024) } });
    const ambMida = await c.peticio(ruta, {
      method: "POST", body: gran, headers: { "Content-Type": "application/json", "Content-Length": String(gran.length), "Idempotency-Key": crypto.randomUUID() },
    });
    expect(ambMida.status).toBe(413);
    // Enviament fragmentat, sense Content-Length.
    const flux = new ReadableStream({ start(ctl) { for (let i = 0; i < 10; i++) ctl.enqueue(new TextEncoder().encode("x".repeat(64 * 1024))); ctl.close(); } });
    const senseMida = await c.peticio(ruta, {
      method: "POST", body: flux, headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      // @ts-expect-error: necessari per enviar un flux com a cos
      duplex: "half",
    });
    expect(senseMida.status).toBe(413);
  });
});
