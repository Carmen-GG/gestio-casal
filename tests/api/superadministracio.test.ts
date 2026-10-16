import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

const CONTRASENYA = "una frase fictícia prou llarga";

async function primerAcces(email: string, codi: string, contrasenya = CONTRASENYA) {
  const c = client();
  const r = await c.json("/api/auth/primer-acces", { method: "POST", json: { email, codi, contrasenya } });
  return { c, r };
}

describe("superadministració i responsables", () => {
  it("assigna una persona responsable que entra la primera vegada amb el codi i crea la contrasenya", async () => {
    const { casal } = await crearEscenari();
    const altre = await crearEscenari();
    const admin = await clientAutenticat("admin_central", null);
    const email = `responsable-${crypto.randomUUID()}@exemple.invalid`;
    const r = await admin.json(`/api/gestio/administracio/casals/${casal.id}/responsables`, { method: "POST", json: { email, nom_visible: "Responsable fictícia" } });
    expect(r.status).toBe(201);
    expect(r.cos.acces.estat).toBe("codi");
    const codi: string = r.cos.acces.codi.codi;
    expect(codi).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // El codi no es desa en clar i no surt a l'auditoria.
    const desat = await env.DB.prepare("SELECT count(*) AS n FROM testimonis_acces WHERE resum = ?").bind(codi).first<{ n: number }>();
    expect(desat!.n).toBe(0);

    const llista = await admin.json("/api/gestio/administracio/responsables");
    const fila = llista.cos.casals.find((k: { id: string }) => k.id === casal.id);
    expect(fila.responsables).toHaveLength(1);
    expect(fila.responsables[0]).toMatchObject({ email, te_contrasenya: false, codi_pendent_fins: expect.any(String) });

    // Codi equivocat o d'una altra persona: no entra.
    expect((await primerAcces(email, "AAAA-BBBB-CCCC")).r.status).toBe(401);
    expect((await primerAcces("algu@exemple.invalid", codi)).r.status).toBe(401);
    // Amb el codi (escrit en minúscules i sense guions) crea la contrasenya i entra.
    const { c, r: ok } = await primerAcces(email, codi.toLowerCase().replace(/-/g, ""));
    expect(ok.status).toBe(200);
    const jo = (await c.json("/api/auth/jo")).cos;
    expect(jo.te_contrasenya).toBe(true);
    expect(jo.superadministracio).toBe(false);
    expect(jo.casals.map((k: { id: string }) => k.id)).toEqual([casal.id]);
    expect(jo.casals[0].permisos).toContain("usuaris.gestionar");
    // El codi només serveix una vegada; després entra amb la contrasenya.
    expect((await primerAcces(email, codi)).r.status).toBe(401);
    expect((await client().json("/api/auth/entrar-contrasenya", { method: "POST", json: { email, contrasenya: CONTRASENYA } })).status).toBe(200);
    // Només el seu casal.
    expect((await c.json(`/api/gestio/casals/${altre.casal.id}/cicles`)).status).toBe(403);
    expect((await c.json("/api/gestio/administracio/responsables")).status).toBe(403);
    expect((await c.json("/api/gestio/administracio/quadre")).status).toBe(403);
  });

  it("la persona responsable dona d'alta i de baixa el seu equip, però no pot tocar la responsable", async () => {
    const { casal } = await crearEscenari();
    const admin = await clientAutenticat("admin_central", null);
    const email = `resp-${crypto.randomUUID()}@exemple.invalid`;
    const alta = await admin.json(`/api/gestio/administracio/casals/${casal.id}/responsables`, { method: "POST", json: { email, nom_visible: "Responsable" } });
    const { c: resp } = await primerAcces(email, alta.cos.acces.codi.codi);
    const base = `/api/gestio/casals/${casal.id}/usuaris`;

    const emailEquip = `equip-${crypto.randomUUID()}@exemple.invalid`;
    const nou = await resp.json(base, { method: "POST", json: { email: emailEquip, nom_visible: "Persona de l'equip", rol_codi: "conserge" } });
    expect(nou.status).toBe(201);
    expect(nou.cos.acces.estat).toBe("codi");
    // No pot fer responsable ningú.
    expect((await resp.json(base, { method: "POST", json: { email: "x@exemple.invalid", nom_visible: "X", rol_codi: "responsable_casal" } })).status).toBe(400);
    const { c: equip } = await primerAcces(emailEquip, nou.cos.acces.codi.codi);
    expect((await equip.json(`/api/gestio/casals/${casal.id}/cicles`)).status).toBe(200);
    expect((await equip.json(base)).status).toBe(403);

    const assignacions = (await resp.json(base)).cos.assignacions as { id: string; rol_codi: string; te_contrasenya: boolean }[];
    expect(assignacions.every((a) => a.te_contrasenya)).toBe(true);
    const propia = assignacions.find((a) => a.rol_codi === "responsable_casal")!;
    expect((await resp.json(`${base}/${propia.id}/revocar`, { method: "POST", json: { motiu: "Prova" } })).status).toBe(409);
    expect((await resp.json(`${base}/${propia.id}/codi-acces`, { method: "POST", json: {} })).status).toBe(409);
    // Nou codi per a qui ha oblidat la contrasenya, i baixa.
    const deEquip = assignacions.find((a) => a.rol_codi === "conserge")!;
    expect((await resp.json(`${base}/${deEquip.id}/codi-acces`, { method: "POST", json: {} })).status).toBe(200);
    expect((await resp.json(`${base}/${deEquip.id}/revocar`, { method: "POST", json: { motiu: "Baixa" } })).status).toBe(200);
    expect((await equip.json(`/api/gestio/casals/${casal.id}/cicles`)).status).toBe(403);
  });

  it("no dona codi d'una persona que té accés a altres casals", async () => {
    const { casal } = await crearEscenari();
    const altre = await crearEscenari();
    const admin = await clientAutenticat("admin_central", null);
    const email = `resp-${crypto.randomUUID()}@exemple.invalid`;
    const alta = await admin.json(`/api/gestio/administracio/casals/${casal.id}/responsables`, { method: "POST", json: { email, nom_visible: "Responsable" } });
    const { c: resp } = await primerAcces(email, alta.cos.acces.codi.codi);
    // Persona que ja és d'un altre casal i encara no té contrasenya.
    const compartida = `compartida-${crypto.randomUUID()}@exemple.invalid`;
    await admin.json(`/api/gestio/casals/${altre.casal.id}/usuaris`, { method: "POST", json: { email: compartida, nom_visible: "Compartida", rol_codi: "conserge" } });
    const r = await resp.json(`/api/gestio/casals/${casal.id}/usuaris`, { method: "POST", json: { email: compartida, nom_visible: "Compartida", rol_codi: "conserge" } });
    expect(r.status).toBe(201);
    expect(r.cos.acces).toEqual({ estat: "altres_casals" });
  });

  it("la superadministració només consulta els casals que tenen responsable", async () => {
    const { casal, cicle } = await crearEscenari();
    const admin = await clientAutenticat("admin_central", null);
    const nouCicle = { nom: "Cicle fictici 2", any: 2027, data_inici: "2027-04-05", data_fi: "2027-06-18", obertura_inscripcions: "2027-03-01T08:00:00.000Z", tancament_inscripcions: "2027-03-15T20:00:00.000Z", data_resolucio_prevista: "2027-03-25" };
    // Sense responsable: el gestiona.
    expect((await admin.json(`/api/gestio/casals/${casal.id}/cicles`, { method: "POST", json: nouCicle })).status).toBe(201);
    let jo = (await admin.json("/api/auth/jo")).cos;
    expect(jo.superadministracio).toBe(true);
    expect(jo.casals.find((k: { id: string }) => k.id === casal.id).nomes_consulta).toBe(false);

    await admin.json(`/api/gestio/administracio/casals/${casal.id}/responsables`, { method: "POST", json: { email: `r-${crypto.randomUUID()}@exemple.invalid`, nom_visible: "R" } });
    jo = (await admin.json("/api/auth/jo")).cos;
    const k = jo.casals.find((x: { id: string }) => x.id === casal.id);
    expect(k.nomes_consulta).toBe(true);
    expect(k.permisos).toContain("sollicituds.consultar");
    expect(k.permisos).not.toContain("cicles.gestionar");
    // Ho veu tot, però no pot modificar res.
    expect((await admin.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}/sollicituds`)).status).toBe(200);
    expect((await admin.json(`/api/gestio/casals/${casal.id}/cicles`, { method: "POST", json: nouCicle })).status).toBe(403);
    expect((await admin.json(`/api/gestio/casals/${casal.id}/usuaris`)).status).toBe(403);
  });

  it("quadre de comandament global amb tots els casals i cicles, sense dades personals", async () => {
    const { casal, cicle, activa } = await crearEscenari();
    // Només compten les activitats de la Generalitat; l'esborrany és d'una associació.
    await env.DB.prepare("UPDATE activitats SET gestio = 'generalitat' WHERE id = ?").bind(activa.id).run();
    const admin = await clientAutenticat("admin_central", null);
    const r = await admin.json("/api/gestio/administracio/quadre?any=2027");
    expect(r.status).toBe(200);
    expect(r.cos.anys).toContain(2027);
    const fila = r.cos.cicles.find((c: { cicle_id: string }) => c.cicle_id === cicle.id);
    expect(fila).toMatchObject({ casal: "Casal de prova", activitats: 1, places_ofertes: 10, sollicituds: 0 });
    const k = r.cos.casals.find((c: { casal_id: string }) => c.casal_id === casal.id);
    expect(k).toMatchObject({ cicles: 1, activitats: 1 });
    expect(Array.isArray(r.cos.referents)).toBe(true);
    const gestor = await clientAutenticat("gestor_casal", casal.id);
    expect((await gestor.json("/api/gestio/administracio/quadre")).status).toBe(403);
  });
  it("la superadministració entra només amb la seva contrasenya; la d'un altre rol no hi serveix", async () => {
    const { casal } = await crearEscenari();
    const frase = `frase superadministracio ${crypto.randomUUID()}`;
    const admin = await clientAutenticat("admin_central", null);
    expect((await admin.json("/api/auth/contrasenya", { method: "POST", json: { nova: frase } })).status).toBe(200);
    const gestor = await clientAutenticat("gestor_casal", casal.id);
    const fraseGestor = `frase de l'equip ${crypto.randomUUID()}`;
    expect((await gestor.json("/api/auth/contrasenya", { method: "POST", json: { nova: fraseGestor } })).status).toBe(200);

    const sl = () => client(undefined, { LIMIT_ENTRADA: undefined });
    const c = sl();
    expect((await c.json("/api/auth/superadministracio", { method: "POST", json: { contrasenya: frase } })).status).toBe(200);
    const jo = await c.json("/api/auth/jo");
    expect(jo.cos.superadministracio).toBe(true);
    expect(jo.cos.usuari.id).toBe(admin.usuari.id);

    for (const contrasenya of ["no és la contrasenya correcta", fraseGestor]) {
      const r = await sl().json("/api/auth/superadministracio", { method: "POST", json: { contrasenya } });
      expect(r.status).toBe(401);
    }
    expect((await sl().json("/api/auth/superadministracio", { method: "POST", json: { contrasenya: frase, email: "x@y.cat" } })).status).toBe(400);
  });
});
