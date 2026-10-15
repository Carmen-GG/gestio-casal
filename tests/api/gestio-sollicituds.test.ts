import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

const CONFIG = {
  informacio_privacitat: "Text de prova fictici.",
  camps: { cognom2: { actiu: true, obligatori: false }, telefon: { actiu: true, obligatori: false }, email: { actiu: true, obligatori: false }, document_identitat: { actiu: true, obligatori: false } },
};

/** Cicle obert amb tres sol·licituds fictícies rebudes pel formulari públic. */
async function escenari() {
  const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
  const segona = await e.repos.activitats.crear({ casal_id: e.casal.id, cicle_id: e.cicle.id, nom: "Ioga fictici", capacitat: 8, estat: "activa", codi_extern: "IOGA-1" });
  await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?").bind(JSON.stringify(CONFIG), e.cicle.id).run();
  const publica = client(undefined, { LIMIT_SOLLICITUDS: undefined });
  const envia = async (dades: Record<string, string>, activitats: string[]) => {
    const r = await publica.json(`/api/public/casals/${e.casal.codi}/cicles/${e.cicle.id}/sollicituds`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { dades, preferencies: activitats.map((activitat_id, i) => ({ activitat_id, ordre: i + 1 })), acceptacio_privacitat: true },
    });
    if (r.status !== 201) throw new Error(JSON.stringify(r.cos));
  };
  // Ordre d'arribada: Zapata, Àvila, Bosch. Alfabèticament: Àvila, Bosch, Zapata.
  await envia({ nom: "Marta", cognom1: "Zapata", telefon: "600000001", email: "z@exemple.invalid" }, [e.activa.id]);
  await envia({ nom: "Jordi", cognom1: "Àvila", cognom2: "Pons", document_identitat: "00000000T" }, [segona.id, e.activa.id]);
  await envia({ nom: "Núria", cognom1: "Bosch" }, [segona.id]);
  const base = `/api/gestio/casals/${e.casal.id}`;
  return { ...e, segona, base, llistat: `${base}/cicles/${e.cicle.id}/sollicituds` };
}

const noms = (files: { participant: { cognom1: string } }[]) => files.map((f) => f.participant.cognom1);

describe("gestió de sol·licituds: llistat i vistes", () => {
  it("ordena per inscripció i alfabèticament amb accents, de manera estable", async () => {
    const { casal, llistat } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    const ins = await g.json(`${llistat}?vista=inscripcio`);
    expect(ins.status).toBe(200);
    expect(noms(ins.cos.files)).toEqual(["Zapata", "Àvila", "Bosch"]);
    expect(ins.cos.files.map((f: { numero: number }) => f.numero)).toEqual([1, 2, 3]);
    expect(ins.cos.files[0].estat_adjudicacio).toBe("pendent");
    const alf = await g.json(`${llistat}?vista=alfabetic`);
    expect(noms(alf.cos.files)).toEqual(["Àvila", "Bosch", "Zapata"]);
    // Canviar el cognom no altera l'ordre d'inscripció.
    const det = await g.json(`/api/gestio/casals/${casal.id}/sollicituds/${ins.cos.files[0].id}`);
    await g.json(`/api/gestio/casals/${casal.id}/sollicituds/${ins.cos.files[0].id}/dades`, {
      method: "PATCH", json: { versio_participant: det.cos.sollicitud.participant.versio, dades: { cognom1: "Abad" }, motiu: "Correcció del cognom" },
    });
    expect(noms((await g.json(`${llistat}?vista=inscripcio`)).cos.files)).toEqual(["Abad", "Àvila", "Bosch"]);
    expect(noms((await g.json(`${llistat}?vista=alfabetic`)).cos.files)).toEqual(["Abad", "Àvila", "Bosch"]);
    expect(noms((await g.json(`${llistat}?vista=inscripcio&dir=desc`)).cos.files)).toEqual(["Bosch", "Àvila", "Abad"]);
  });

  it("cerca sense accents, per número, filtra i pagina", async () => {
    const { casal, llistat, segona } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    expect(noms((await g.json(`${llistat}?q=avila`)).cos.files)).toEqual(["Àvila"]);
    expect(noms((await g.json(`${llistat}?q=jordi%20pons`)).cos.files)).toEqual(["Àvila"]);
    expect(noms((await g.json(`${llistat}?q=3`)).cos.files)).toEqual(["Bosch"]);
    expect(noms((await g.json(`${llistat}?activitat=${segona.id}`)).cos.files)).toEqual(["Àvila", "Bosch"]);
    const pag = await g.json(`${llistat}?mida=10&pagina=1`);
    expect(pag.cos.total).toBe(3);
    expect((await g.json(`${llistat}?mida=10&pagina=2`)).cos.files).toEqual([]);
    expect((await g.json(`${llistat}?vista=qualsevol`)).status).toBe(400);
  });

  it("agrupa per activitat amb les persones per ordre alfabètic i la preferència", async () => {
    const { casal, llistat, activa, segona } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    const r = await g.json(`${llistat}?vista=activitat`);
    const grups = Object.fromEntries(r.cos.grups.map((x: { activitat_id: string }) => [x.activitat_id, x]));
    expect(grups[segona.id].files.map((f: { participant: { cognom1: string }; ordre: number }) => [f.participant.cognom1, f.ordre]))
      .toEqual([["Àvila", 1], ["Bosch", 1]]);
    expect(grups[activa.id].files.map((f: { participant: { cognom1: string }; ordre: number }) => [f.participant.cognom1, f.ordre]))
      .toEqual([["Àvila", 2], ["Zapata", 1]]);
  });

  it("amaga les dades de contacte sense permís i no mostra mai el DNI sencer", async () => {
    const { casal, llistat } = await escenari();
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    const r = await consulta.json(llistat);
    expect(r.status).toBe(200);
    expect(r.cos.files[0].participant.telefon).toBeNull();
    expect(r.cos.files[0].dades_restringides).toBe(true);
    const g = await clientAutenticat("gestor_casal", casal.id);
    const r2 = await g.json(llistat);
    expect(r2.cos.files[0].participant.telefon).toBe("600000001");
    expect(r2.cos.files[1].participant.document_identitat).toBe("•••••000T");
    expect(JSON.stringify(r2.cos)).not.toContain("00000000T");
    // Un altre casal no hi té accés.
    const altre = await crearEscenari();
    const aliè = await clientAutenticat("gestor_casal", altre.casal.id);
    expect((await aliè.json(llistat)).status).toBe(403);
  });
});

describe("gestió de sol·licituds: edició controlada", () => {
  it("edita dades amb motiu, desa l'historial sense valors i detecta conflictes", async () => {
    const { casal, llistat, base } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    const fila = (await g.json(llistat)).cos.files[0];
    const ruta = `${base}/sollicituds/${fila.id}`;
    const senseMotiu = await g.json(`${ruta}/dades`, { method: "PATCH", json: { versio_participant: fila.participant.versio, dades: { telefon: "600000009" } } });
    expect(senseMotiu.status).toBe(400);
    const ok = await g.json(`${ruta}/dades`, { method: "PATCH", json: { versio_participant: fila.participant.versio, dades: { telefon: "600000009" }, motiu: "Ho ha demanat per telèfon" } });
    expect(ok.status).toBe(200);
    expect(ok.cos.sollicitud.participant.telefon).toBe("600000009");
    const antic = await g.json(`${ruta}/dades`, { method: "PATCH", json: { versio_participant: fila.participant.versio, dades: { telefon: "600000008" }, motiu: "Un altre canvi" } });
    expect(antic.status).toBe(409);
    const hist = await g.json(`${base}/historial/sollicitud/${fila.id}`);
    expect(hist.cos.historial[0]).toMatchObject({ accio: "modificacio", motiu: "Ho ha demanat per telèfon", canvis: { telefon: { modificat: true } } });
    expect(JSON.stringify(hist.cos)).not.toContain("600000009");
    // Camps que el cicle no recull: no es poden afegir.
    const noRecollit = await g.json(`${ruta}/dades`, { method: "PATCH", json: { versio_participant: ok.cos.sollicitud.participant.versio, dades: { barri: "Centre" }, motiu: "Prova" } });
    expect(noRecollit.status).toBe(400);
    // La consulta no pot modificar.
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${ruta}/estat`, { method: "POST", json: { versio: 1, estat: "validada", motiu: "Prova" } })).status).toBe(403);
  });

  it("canvia l'estat i les preferències amb motiu i historial", async () => {
    const { casal, llistat, base, activa, segona } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    const fila = (await g.json(llistat)).cos.files[0];
    const ruta = `${base}/sollicituds/${fila.id}`;
    const e = await g.json(`${ruta}/estat`, { method: "POST", json: { versio: fila.versio, estat: "anullada", motiu: "Duplicada amb la núm. 2" } });
    expect(e.status).toBe(200);
    expect(e.cos.sollicitud.estat).toBe("anullada");
    const dup = await g.json(`${ruta}/preferencies`, { method: "PUT", json: {
      versio: e.cos.sollicitud.versio, motiu: "Canvi demanat", preferencies: [{ activitat_id: activa.id, ordre: 1 }, { activitat_id: segona.id, ordre: 1 }],
    } });
    expect(dup.status).toBe(400);
    const p = await g.json(`${ruta}/preferencies`, { method: "PUT", json: {
      versio: e.cos.sollicitud.versio, motiu: "Canvi demanat", preferencies: [{ activitat_id: segona.id, ordre: 1 }, { activitat_id: activa.id, ordre: 2 }],
    } });
    expect(p.status).toBe(200);
    expect(p.cos.sollicitud.preferencies.map((x: { activitat: string }) => x.activitat)).toEqual(["Ioga fictici", "Taller fictici"]);
    const hist = await g.json(`${base}/historial/sollicitud/${fila.id}`);
    expect(hist.cos.historial.map((h: { accio: string }) => h.accio)).toEqual(["canvi_estat", "modificacio"]);
    expect(hist.cos.historial[1].canvis.preferencies.despres).toEqual(["1. Ioga fictici", "2. Taller fictici"]);
    // Després de l'adjudicació no es poden canviar les preferències.
    await env.DB.prepare("UPDATE cicles SET estat = 'adjudicat' WHERE id = ?").bind(fila.id && (await g.json(ruta)).cos.sollicitud.cicle_id).run();
    const tard = await g.json(`${ruta}/preferencies`, { method: "PUT", json: { versio: p.cos.sollicitud.versio, motiu: "Massa tard", preferencies: [{ activitat_id: activa.id, ordre: 1 }] } });
    expect(tard.status).toBe(409);
  });
});

describe("possibles duplicats", () => {
  it("detecta coincidències per a revisió manual i en desa la decisió", async () => {
    const { casal, cicle, base, activa } = await escenari();
    const publica = client(undefined, { LIMIT_SOLLICITUDS: undefined });
    await publica.json(`/api/public/casals/${casal.codi}/cicles/${cicle.id}/sollicituds`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { dades: { nom: "nuria", cognom1: "BOSCH" }, preferencies: [{ activitat_id: activa.id, ordre: 1 }], acceptacio_privacitat: true },
    });
    const g = await clientAutenticat("gestor_casal", casal.id);
    const r = await g.json(`${base}/cicles/${cicle.id}/duplicats`);
    expect(r.cos.parelles).toHaveLength(1);
    expect(r.cos.parelles[0].motius).toEqual(["mateix_nom"]);
    const { a, b } = r.cos.parelles[0];
    const rev = await g.json(`${base}/cicles/${cicle.id}/duplicats/revisio`, { method: "POST", json: { a: b.id, b: a.id, decisio: "no_duplicat", motiu: "Són germanes" } });
    expect(rev.status).toBe(200);
    const r2 = await g.json(`${base}/cicles/${cicle.id}/duplicats`);
    expect(r2.cos.parelles[0].revisio).toMatchObject({ decisio: "no_duplicat", motiu: "Són germanes" });
    // No s'ha esborrat ni modificat cap sol·licitud.
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sollicituds WHERE cicle_id = ? AND estat = 'rebuda'").bind(cicle.id).first<{ n: number }>();
    expect(n!.n).toBe(4);
  });
});

describe("importacions", () => {
  it("previsualitza, valida i importa només les files vàlides de sol·licituds", async () => {
    const { casal, cicle, base, activa } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    const files = [
      { nom: "Pere", cognom1: "Fuster", data_registre: "15/10/2026 09:30", preferencia_1: "taller ficticí", preferencia_2: "IOGA-1", codi_participant_intern: "P-1" },
      { nom: "", cognom1: "Sense nom", preferencia_1: "Taller fictici" },
      { nom: "Laia", cognom1: "Roca", data_registre: "31/02/2026", preferencia_1: "Taller fictici" },
      { nom: "Joan", cognom1: "Mas", preferencia_1: "Activitat inexistent" },
      { nom: "Anna", cognom1: "Vila", preferencia_1: "Taller fictici", codi_participant_intern: "P-1" },
      { nom: "", cognom1: "", preferencia_1: "" },
      { nom: "Marta", cognom1: "Zapata", preferencia_1: "Taller fictici", barri: "Centre" },
    ];
    const ruta = `${base}/cicles/${cicle.id}/importacions/sollicituds`;
    const prev = await g.json(`${ruta}/previsualitzacio`, { method: "POST", json: { files } });
    expect(prev.status).toBe(200);
    expect(prev.cos.resum).toEqual({ total: 7, valides: 2, amb_avisos: 1, errors: 4, buides: 1 });
    const estats = prev.cos.files.map((f: { estat: string }) => f.estat);
    expect(estats).toEqual(["valida", "error", "error", "error", "error", "buida", "avis"]);
    expect(prev.cos.files[2].errors[0]).toContain("Data de registre incorrecta");
    expect(prev.cos.files[3].errors[0]).toContain("no existeix");
    expect(prev.cos.files[4].errors[0]).toContain("Identificador duplicat");
    expect(prev.cos.files[6].avisos.join(" ")).toContain("Possible duplicat");
    expect(prev.cos.files[6].avisos.join(" ")).toContain("no es recull");

    const clau = crypto.randomUUID();
    const obsoleta = await g.json(ruta, { method: "POST", json: { files, clau, confirmacio: true, files_esperades: 3 } });
    expect(obsoleta.status).toBe(409);
    const conf = await g.json(ruta, { method: "POST", json: { files, clau, confirmacio: true, files_esperades: 2, nom_fitxer: "prova.csv" } });
    expect(conf.status).toBe(201);
    expect(conf.cos).toMatchObject({ importades: 2, omeses: 5 });
    const repetida = await g.json(ruta, { method: "POST", json: { files, clau, confirmacio: true, files_esperades: 2 } });
    expect(repetida.status).toBe(409);
    expect(repetida.cos.error.codi).toBe("importacio_duplicada");

    const llistat = await g.json(`${base}/cicles/${cicle.id}/sollicituds?vista=inscripcio`);
    expect(llistat.cos.total).toBe(5);
    const importades = llistat.cos.files.filter((f: { origen: string }) => f.origen === "importacio");
    expect(importades.map((f: { numero: number }) => f.numero).sort()).toEqual([4, 5]);
    const pere = importades.find((f: { participant: { nom: string } }) => f.participant.nom === "Pere");
    expect(pere.rebuda_el).toBe("2026-10-15T07:30:00.000Z"); // 09:30 hora d'estiu de Madrid
    expect(pere.nombre_preferencies).toBe(2);
    // El camp que el cicle no recull no s'ha desat.
    const barri = await env.DB.prepare("SELECT COUNT(*) AS n FROM participants WHERE casal_id = ? AND barri IS NOT NULL").bind(casal.id).first<{ n: number }>();
    expect(barri!.n).toBe(0);
    expect(activa).toBeTruthy();
  });

  it("enllaça una persona existent pel codi intern sense modificar-ne les dades", async () => {
    const { casal, cicle, base } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    const ruta = `${base}/cicles/${cicle.id}/importacions/sollicituds`;
    const f1 = [{ nom: "Pere", cognom1: "Fuster", codi_participant_intern: "P-9", preferencia_1: "IOGA-1" }];
    expect((await g.json(ruta, { method: "POST", json: { files: f1, clau: crypto.randomUUID(), confirmacio: true, files_esperades: 1 } })).status).toBe(201);
    const prev = await g.json(`${ruta}/previsualitzacio`, { method: "POST", json: { files: [{ ...f1[0], telefon: "600111222" }] } });
    expect(prev.cos.files[0].avisos.join(" ")).toContain("ja existeix");
    const altra = await g.json(`${ruta}/previsualitzacio`, { method: "POST", json: { files: [{ ...f1[0], nom: "Una altra" }] } });
    expect(altra.cos.files[0].estat).toBe("error");
  });

  it("importa activitats en esborrany i no sobreescriu codis existents", async () => {
    const { casal, cicle, base } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    const ruta = `${base}/cicles/${cicle.id}/importacions/activitats`;
    const files = [
      { nom: "Pilates fictici", capacitat: "15", dies: "dl i dc", hora_inici: "9.30", hora_fi: "10:30", data_inici: "11/01/2027", data_fi: "24/03/2027", codi_extern: "PIL-1" },
      { nom: "Ioga repetit", capacitat: "10", codi_extern: "IOGA-1" },
      { nom: "Sense places", capacitat: "molts" },
      { nom: "Dies estranys", capacitat: "5", dies: "dilluns i festius" },
    ];
    const prev = await g.json(`${ruta}/previsualitzacio`, { method: "POST", json: { files } });
    expect(prev.cos.resum).toMatchObject({ valides: 1, errors: 3 });
    const conf = await g.json(ruta, { method: "POST", json: { files, clau: crypto.randomUUID(), confirmacio: true, files_esperades: 1 } });
    expect(conf.status).toBe(201);
    const act = await env.DB.prepare("SELECT * FROM activitats WHERE cicle_id = ? AND codi_extern = 'PIL-1'").bind(cicle.id).first<Record<string, unknown>>();
    expect(act).toMatchObject({ estat: "esborrany", dies_setmana: "[1,3]", hora_inici: "09:30", data_inici: "2027-01-11", capacitat: 15 });
    // La consulta no pot importar.
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${ruta}/previsualitzacio`, { method: "POST", json: { files } })).status).toBe(403);
  });
});

describe("importació del llistat d'activitats de la PGEc", () => {
  it("treu el cicle del nom de l'activitat", async () => {
    const { casal, cicle, base } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    const ruta = `${base}/cicles/${cicle.id}/importacions/activitats`;
    const files = [
      { codi_extern: "FA563/2026/06262", nom: "Pilates 1. 3r Cicle 2026", capacitat: "25" },
      { codi_extern: "FA563/2026/06266", nom: "Reciclem la nostra roba. 3r Cicle 2026.", capacitat: "20" },
      { codi_extern: "FA563/2026/07464", nom: "En Forma! 3r Cicle 2026", capacitat: "25" },
    ];
    const conf = await g.json(ruta, { method: "POST", json: { files, clau: crypto.randomUUID(), confirmacio: true, files_esperades: 3 } });
    expect(conf.status).toBe(201);
    const { results } = await env.DB.prepare("SELECT nom FROM activitats WHERE cicle_id = ? AND codi_extern LIKE 'FA563/%' ORDER BY codi_extern")
      .bind(cicle.id).all<{ nom: string }>();
    expect(results.map((r) => r.nom)).toEqual(["Pilates 1", "Reciclem la nostra roba", "En Forma!"]);
  });
});

describe("exportacions", () => {
  it("exporta el mateix nombre de sol·licituds que hi ha a la base de dades i ho audita", async () => {
    const { casal, cicle, base, segona } = await escenari();
    const g = await clientAutenticat("gestor_casal", casal.id);
    const r = await g.json(`${base}/cicles/${cicle.id}/exportacions/sollicituds`);
    expect(r.status).toBe(200);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sollicituds WHERE cicle_id = ?").bind(cicle.id).first<{ n: number }>();
    expect(r.cos.files).toHaveLength(n!.n);
    expect(r.cos.columnes).toContain("Telèfon");
    expect(r.cos.columnes).not.toContain("DNI/NIE");
    expect(r.cos.files[0].slice(0, 3)).toEqual([1, expect.stringMatching(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/), "Marta"]);
    const act = await g.json(`${base}/cicles/${cicle.id}/exportacions/sollicituds?activitat=${segona.id}`);
    expect(act.cos.files.map((f: unknown[]) => f[3])).toEqual(["Àvila", "Bosch"]);
    const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM registres_auditoria WHERE casal_id = ? AND tipus_operacio = 'exportacio.sollicituds'").bind(casal.id).first<{ n: number }>();
    expect(audit!.n).toBe(2);
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${base}/cicles/${cicle.id}/exportacions/sollicituds`)).status).toBe(403);
  });
});
