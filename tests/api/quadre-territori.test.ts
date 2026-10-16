import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { clientAutenticat } from "../setup/sessio";

type FilaCasal = {
  casal_id: string; comarca: string | null; demarcacio: string | null; referent_id: string | null; referent: string | null;
  activitats_sense_tallerista: number; sessions_falta_tallerista: number; incidencies: number; incidencies_obertes: number;
  incidencies_per_categoria: Record<string, number>;
};

describe("quadre de comandament: territori, referents, talleristes i incidències", () => {
  it("la superadministració dona d'alta referents i assigna comarca, demarcació i referent a un casal", async () => {
    const { casal } = await crearEscenari();
    const admin = await clientAutenticat("admin_central", null);
    const nom = `Referent ${crypto.randomUUID().slice(0, 8)}`;
    const alta = await admin.json("/api/gestio/administracio/referents", { method: "POST", json: { nom, email: "referent@exemple.invalid" } });
    expect(alta.status).toBe(201);
    expect((await admin.json("/api/gestio/administracio/referents", { method: "POST", json: { nom: "" } })).status).toBe(400);

    const territori = `/api/gestio/administracio/casals/${casal.id}/territori`;
    expect((await admin.json(territori, { method: "PUT", json: { comarca: "Vallès Occidental", demarcacio: "Barcelona", referent_id: crypto.randomUUID() } })).status).toBe(404);
    expect((await admin.json(territori, { method: "PUT", json: { comarca: "Vallès Occidental", demarcacio: "Barcelona", referent_id: alta.cos.id } })).status).toBe(200);

    const t = await admin.json("/api/gestio/administracio/territori");
    expect(t.cos.referents.find((r: { id: string }) => r.id === alta.cos.id)).toMatchObject({ nom, actiu: true });
    expect(t.cos.casals.find((k: { id: string }) => k.id === casal.id)).toMatchObject({ comarca: "Vallès Occidental", demarcacio: "Barcelona", referent_id: alta.cos.id });

    expect((await admin.json(`/api/gestio/administracio/referents/${alta.cos.id}`, { method: "PUT", json: { nom, email: null, actiu: false } })).status).toBe(200);
    const q = await admin.json("/api/gestio/administracio/quadre");
    expect(q.cos.referents.find((r: { id: string }) => r.id === alta.cos.id)).toMatchObject({ actiu: false });
    expect(q.cos.casals.find((k: FilaCasal) => k.casal_id === casal.id)).toMatchObject({ comarca: "Vallès Occidental", referent: nom });

    // Una persona responsable no hi pot entrar.
    const gestor = await clientAutenticat("gestor_casal", casal.id);
    expect((await gestor.json("/api/gestio/administracio/territori")).status).toBe(403);
    expect((await gestor.json(territori, { method: "PUT", json: { comarca: null, demarcacio: null, referent_id: null } })).status).toBe(403);
  });

  it("compta les activitats sense tallerista i les sessions en què la tallerista ha faltat", async () => {
    const { casal, cicle, activa } = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    const g = await clientAutenticat("gestor_casal", casal.id);
    const base = `/api/gestio/casals/${casal.id}`;
    await env.DB.prepare("UPDATE activitats SET data_inici = '2026-10-05', data_fi = '2026-10-16', tallerista = NULL WHERE id = ?").bind(activa.id).run();
    expect((await g.json(`${base}/activitats/${activa.id}/sessions/generacio`, { method: "POST" })).status).toBe(200);
    const sessions = (await g.json(`${base}/activitats/${activa.id}/assistencia`)).cos.sessions as { id: string; tallerista_absent: number }[];
    expect(sessions.length).toBeGreaterThan(1);
    expect(sessions[0]!.tallerista_absent).toBe(0);

    const conserge = await clientAutenticat("conserge", casal.id);
    const falta = await conserge.json(`${base}/sessions/${sessions[0]!.id}/tallerista`, { method: "PUT", json: { absent: true, motiu: "Malaltia" } });
    expect(falta.status).toBe(200);
    expect((await g.json(`${base}/activitats/${activa.id}/assistencia`)).cos.sessions[0]).toMatchObject({ tallerista_absent: 1, tallerista_motiu: "Malaltia" });

    const admin = await clientAutenticat("admin_central", null);
    const quadre = async () => (await admin.json("/api/gestio/administracio/quadre")).cos;
    let q = await quadre();
    expect(q.cicles.find((c: { cicle_id: string }) => c.cicle_id === cicle.id)).toMatchObject({ activitats_sense_tallerista: 2, sessions_falta_tallerista: 1 });

    // Desmarcar-la i indicar la tallerista.
    await conserge.json(`${base}/sessions/${sessions[0]!.id}/tallerista`, { method: "PUT", json: { absent: false } });
    await env.DB.prepare("UPDATE activitats SET tallerista = 'Persona fictícia' WHERE id = ?").bind(activa.id).run();
    q = await quadre();
    expect(q.casals.find((k: FilaCasal) => k.casal_id === casal.id)).toMatchObject({ activitats_sense_tallerista: 1, sessions_falta_tallerista: 0 });
  });

  it("el casal registra i resol incidències, i el quadre les compta per categoria", async () => {
    const { casal, activa } = await crearEscenari();
    const base = `/api/gestio/casals/${casal.id}/incidencies`;
    const conserge = await clientAutenticat("conserge", casal.id);
    const nova = await conserge.json(base, { method: "POST", json: { data: "2026-10-20", categoria: "instal·lacions", descripcio: "S'ha espatllat la calefacció de la sala 2." } });
    expect(nova.status).toBe(201);
    expect((await conserge.json(base, { method: "POST", json: { data: "2026-10-21", categoria: "tallerista", descripcio: "No ha vingut", activitat_id: activa.id } })).status).toBe(201);
    expect((await conserge.json(base, { method: "POST", json: { data: "2026-10-21", categoria: "inventada", descripcio: "xxx" } })).status).toBe(400);
    expect((await conserge.json(base, { method: "POST", json: { data: "2026-10-21", categoria: "altres", descripcio: "xxx", activitat_id: crypto.randomUUID() } })).status).toBe(404);

    const llista = await conserge.json(`${base}?any=2026`);
    expect(llista.cos.incidencies).toHaveLength(2);
    expect(llista.cos.incidencies[0]).toMatchObject({ categoria: "tallerista", activitat: "Taller fictici", estat: "oberta" });
    expect(llista.cos.activitats.map((a: { id: string }) => a.id)).toContain(activa.id);

    const resol = `${base}/${nova.cos.id}/resolucio`;
    expect((await conserge.json(resol, { method: "POST", json: { resolucio: "Reparada" } })).status).toBe(200);
    expect((await conserge.json(resol, { method: "POST", json: {} })).status).toBe(409);

    const admin = await clientAutenticat("admin_central", null);
    const k = (await admin.json("/api/gestio/administracio/quadre?any=2026")).cos.casals.find((f: FilaCasal) => f.casal_id === casal.id) as FilaCasal;
    expect(k).toMatchObject({ incidencies: 2, incidencies_obertes: 1 });
    expect(k.incidencies_per_categoria).toMatchObject({ "instal·lacions": 1, tallerista: 1, salut: 0 });
    expect((await admin.json("/api/gestio/administracio/quadre?any=2025")).cos.casals.find((f: FilaCasal) => f.casal_id === casal.id).incidencies).toBe(0);

    // Un altre casal no hi té accés.
    const { casal: altre } = await crearEscenari();
    const aliena = await clientAutenticat("conserge", altre.id);
    expect((await aliena.json(base)).status).toBe(403);
    expect((await aliena.json(`/api/gestio/casals/${altre.id}/incidencies/${nova.cos.id}/resolucio`, { method: "POST", json: {} })).status).toBe(409);
  });
});
