import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { clientAutenticat } from "../setup/sessio";

const NOU_CICLE = {
  nom: "Cicle fictici de primavera",
  any: 2027,
  data_inici: "2027-04-05",
  data_fi: "2027-06-18",
  obertura_inscripcions: "2027-03-01T08:00:00+01:00",
  tancament_inscripcions: "2027-03-15T20:00:00+01:00",
  data_resolucio_prevista: "2027-03-25",
};

describe("gestió de cicles", () => {
  it("crea, modifica i canvia l'estat d'un cicle amb historial", async () => {
    const { casal } = await crearEscenari();
    const c = await clientAutenticat("gestor_casal", casal.id);
    const creat = await c.json(`/api/gestio/casals/${casal.id}/cicles`, { method: "POST", json: NOU_CICLE });
    expect(creat.status).toBe(201);
    const cicle = creat.cos.cicle;
    expect(cicle.estat).toBe("esborrany");
    expect(cicle.llindar_assistencia).toBe(80); // regla del casal per defecte
    const senseLlindar = await c.json(`/api/gestio/casals/${casal.id}/cicles`, { method: "POST", json: { ...NOU_CICLE, llindar_assistencia: null } });
    expect(senseLlindar.cos.cicle.llindar_assistencia).toBeNull();
    expect(cicle.obertura_inscripcions).toBe("2027-03-01T07:00:00.000Z"); // normalitzat a UTC

    const mod = await c.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}`, {
      method: "PATCH", json: { versio: cicle.versio, data_resolucio_prevista: "2027-03-26", motiu: "Canvi de calendari" },
    });
    expect(mod.status).toBe(200);
    expect(mod.cos.cicle.data_resolucio_prevista).toBe("2027-03-26");

    // Una segona modificació amb la versió antiga és un conflicte.
    const antic = await c.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}`, {
      method: "PATCH", json: { versio: cicle.versio, nom: "Un altre nom" },
    });
    expect(antic.status).toBe(409);

    const estat = await c.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}/estat`, {
      method: "POST", json: { estat: "preparacio", versio: mod.cos.cicle.versio },
    });
    expect(estat.status).toBe(200);
    expect(estat.cos.cicle.estat).toBe("preparacio");

    const historial = await c.json(`/api/gestio/casals/${casal.id}/historial/cicle/${cicle.id}`);
    expect(historial.cos.historial.map((h: { accio: string }) => h.accio)).toEqual(["creacio", "modificacio", "canvi_estat"]);
    expect(historial.cos.historial[1].canvis).toEqual({ data_resolucio_prevista: { abans: "2027-03-25", despres: "2027-03-26" } });
    expect(historial.cos.historial[1].motiu).toBe("Canvi de calendari");
  });

  it("valida les dates al servidor", async () => {
    const { casal, cicle } = await crearEscenari();
    const c = await clientAutenticat("gestor_casal", casal.id);
    const r = await c.json(`/api/gestio/casals/${casal.id}/cicles`, { method: "POST", json: { ...NOU_CICLE, data_fi: "2027-01-01" } });
    expect(r.status).toBe(400);
    expect(r.cos.error.detalls.data_fi).toBeTruthy();
    // També quan només es modifica un camp i el resultat final seria incoherent.
    const r2 = await c.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}`, { method: "PATCH", json: { versio: cicle.versio, data_fi: "2026-01-01" } });
    expect(r2.status).toBe(400);
    const r3 = await c.json(`/api/gestio/casals/${casal.id}/cicles`, { method: "POST", json: { ...NOU_CICLE, data_inici: "2027-02-30" } });
    expect(r3.status).toBe(400);
  });

  it("no permet canviar els camps del formulari amb les inscripcions obertes", async () => {
    const { casal, cicle } = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    const c = await clientAutenticat("gestor_casal", casal.id);
    const r = await c.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}`, {
      method: "PATCH", json: { versio: cicle.versio, configuracio_formulari: { camps: { telefon: { actiu: true, obligatori: true } } } },
    });
    expect(r.status).toBe(409);
    expect(r.cos.error.codi).toBe("formulari_bloquejat");
  });

  it("reobrir un cicle tancat exigeix confirmació", async () => {
    const { casal, cicle } = await crearEscenari({ estatCicle: "inscripcions_tancades" });
    const c = await clientAutenticat("gestor_casal", casal.id);
    const url = `/api/gestio/casals/${casal.id}/cicles/${cicle.id}/estat`;
    expect((await c.peticio(url, { method: "POST", json: { estat: "inscripcions_obertes", versio: cicle.versio } })).status).toBe(428);
    const ok = await c.json(url, { method: "POST", json: { estat: "inscripcions_obertes", versio: cicle.versio, confirmacio: true, motiu: "Error en la data de tancament" } });
    expect(ok.status).toBe(200);
  });
});

describe("gestió d'activitats", () => {
  it("crea, edita, duplica, activa, desactiva i arxiva", async () => {
    const { casal, cicle } = await crearEscenari();
    const c = await clientAutenticat("gestor_casal", casal.id);
    const creada = await c.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}/activitats`, {
      method: "POST",
      json: { nom: "Taller d'escriptura (fictici)", capacitat: 12, dies_setmana: [3, 1], hora_inici: "18:00", hora_fi: "19:30", categoria: "Cultura" },
    });
    expect(creada.status).toBe(201);
    let a = creada.cos.activitat;
    expect(a.estat).toBe("esborrany");
    expect(a.dies_setmana).toEqual([1, 3]);

    const editada = await c.json(`/api/gestio/casals/${casal.id}/activitats/${a.id}`, { method: "PATCH", json: { versio: a.versio, capacitat: 15, espai: "Sala 2" } });
    expect(editada.status).toBe(200);
    a = editada.cos.activitat;
    expect(a.capacitat).toBe(15);

    const horesMal = await c.json(`/api/gestio/casals/${casal.id}/activitats/${a.id}`, { method: "PATCH", json: { versio: a.versio, hora_fi: "17:00" } });
    expect(horesMal.status).toBe(400);

    const copia = await c.json(`/api/gestio/casals/${casal.id}/activitats/${a.id}/duplicar`, { method: "POST", json: {} });
    expect(copia.status).toBe(201);
    expect(copia.cos.activitat).toMatchObject({ nom: "Taller d'escriptura (fictici) (còpia)", capacitat: 15, estat: "esborrany", espai: "Sala 2" });
    expect(copia.cos.activitat.id).not.toBe(a.id);

    const estat = async (e: string) => {
      const r = await c.json(`/api/gestio/casals/${casal.id}/activitats/${a.id}/estat`, { method: "POST", json: { estat: e, versio: a.versio } });
      if (r.status === 200) a = r.cos.activitat;
      return r.status;
    };
    expect(await estat("activa")).toBe(200);
    expect(await estat("esborrany")).toBe(409);
    expect(await estat("inactiva")).toBe(200);
    expect(await estat("arxivada")).toBe(200);
    const editarArxivada = await c.json(`/api/gestio/casals/${casal.id}/activitats/${a.id}`, { method: "PATCH", json: { versio: a.versio, nom: "No" } });
    expect(editarArxivada.status).toBe(409);

    const historial = await c.json(`/api/gestio/casals/${casal.id}/historial/activitat/${a.id}`);
    expect(historial.cos.historial.map((h: { accio: string }) => h.accio)).toEqual(["creacio", "modificacio", "canvi_estat", "canvi_estat", "arxivat"]);

    const actives = await c.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}/activitats?estat=arxivada`);
    expect(actives.cos.activitats.map((x: { id: string }) => x.id)).toEqual([a.id]);
  });

  it("canviar la capacitat després d'adjudicar exigeix confirmació", async () => {
    const { casal, activa } = await crearEscenari({ estatCicle: "adjudicat" });
    const c = await clientAutenticat("gestor_casal", casal.id);
    const url = `/api/gestio/casals/${casal.id}/activitats/${activa.id}`;
    expect((await c.peticio(url, { method: "PATCH", json: { versio: activa.versio, capacitat: 20 } })).status).toBe(428);
    expect((await c.peticio(url, { method: "PATCH", json: { versio: activa.versio, capacitat: 20, confirmacio: true, motiu: "Sala més gran" } })).status).toBe(200);
  });

  it("les activitats creades a mà són d'associació si no es diu el contrari, i es poden marcar com de la Generalitat", async () => {
    const { casal, cicle } = await crearEscenari({ estatCicle: "preparacio" });
    const c = await clientAutenticat("gestor_casal", casal.id);
    const ruta = `/api/gestio/casals/${casal.id}/cicles/${cicle.id}/activitats`;
    const manual = await c.json(ruta, { method: "POST", json: { nom: "Taller d'una associació", capacitat: 10 } });
    expect(manual.status).toBe(201);
    expect(manual.cos.activitat?.gestio ?? manual.cos.gestio).toBe("associacio");
    const gene = await c.json(ruta, { method: "POST", json: { nom: "Taller de la Generalitat", capacitat: 10, gestio: "generalitat" } });
    expect(gene.cos.activitat?.gestio ?? gene.cos.gestio).toBe("generalitat");
    expect((await c.json(ruta, { method: "POST", json: { nom: "X", capacitat: 1, gestio: "ajuntament" } })).status).toBe(400);
  });

  it("no permet crear activitats en un cicle arxivat", async () => {
    const { casal, cicle } = await crearEscenari({ estatCicle: "arxivat" });
    const c = await clientAutenticat("gestor_casal", casal.id);
    const r = await c.json(`/api/gestio/casals/${casal.id}/cicles/${cicle.id}/activitats`, { method: "POST", json: { nom: "X", capacitat: 1 } });
    expect(r.status).toBe(409);
  });
});

describe("persones autoritzades", () => {
  it("l'administració central assigna i revoca rols amb auditoria", async () => {
    const { casal } = await crearEscenari();
    const admin = await clientAutenticat("admin_central", null);
    const email = `nova-${crypto.randomUUID()}@exemple.invalid`;
    const r = await admin.json(`/api/gestio/casals/${casal.id}/usuaris`, { method: "POST", json: { email, nom_visible: "Persona nova", rol_codi: "conserge" } });
    expect(r.status).toBe(201);
    const duplicat = await admin.json(`/api/gestio/casals/${casal.id}/usuaris`, { method: "POST", json: { email, nom_visible: "Persona nova", rol_codi: "conserge" } });
    expect(duplicat.status).toBe(409);
    expect(((await admin.json(`/api/gestio/casals/${casal.id}/usuaris`)).cos.assignacions as unknown[]).length).toBe(1);

    const rev = await admin.json(`/api/gestio/casals/${casal.id}/usuaris/${r.cos.assignacio.id}/revocar`, { method: "POST", json: { motiu: "Canvi de destinació" } });
    expect(rev.status).toBe(200);
    expect(((await admin.json(`/api/gestio/casals/${casal.id}/usuaris`)).cos.assignacions as unknown[]).length).toBe(0);

    const auditoria = await admin.json(`/api/gestio/casals/${casal.id}/auditoria`);
    const tipus = auditoria.cos.registres.map((x: { tipus_operacio: string }) => x.tipus_operacio);
    expect(tipus).toContain("permisos.assignacio");
    expect(tipus).toContain("permisos.revocacio");
    // L'auditoria no conté el correu electrònic de la persona afectada.
    expect(JSON.stringify(auditoria.cos)).not.toContain(email);
  });

  it("un gestor de casal no pot gestionar permisos", async () => {
    const { casal } = await crearEscenari();
    const c = await clientAutenticat("gestor_casal", casal.id);
    expect((await c.peticio(`/api/gestio/casals/${casal.id}/usuaris`)).status).toBe(403);
  });
});
