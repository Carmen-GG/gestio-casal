import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PARAMETRES_INICIALS } from "../../shared/domain/adjudicacio";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

const CONFIG = { informacio_privacitat: "Text de prova fictici.", camps: { telefon: { actiu: true, obligatori: false } } };

/**
 * Activitat A (2 places, dilluns i dimecres del 5 al 30/10/2026) amb tres sol·licituds:
 * Zapata i Àvila admeses, Bosch en llista d'espera. Cicle adjudicat. Avui és l'1/11/2026.
 */
async function escenari() {
  const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
  const A = e.activa;
  await env.DB.prepare("UPDATE activitats SET capacitat = 2, data_inici = '2026-10-05', data_fi = '2026-10-30', nombre_sessions = 8 WHERE id = ?").bind(A.id).run();
  await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?").bind(JSON.stringify(CONFIG), e.cicle.id).run();
  const publica = client(undefined, { LIMIT_SOLLICITUDS: undefined });
  for (const [nom, cognom1, telefon] of [["Marta", "Zapata", "600000001"], ["Jordi", "Àvila", "600000002"], ["Núria", "Bosch", "600000003"]]) {
    const r = await publica.json(`/api/public/casals/${e.casal.codi}/cicles/${e.cicle.id}/sollicituds`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { dades: { data_naixement: "1980-05-01", nom, cognom1, telefon }, preferencies: [{ activitat_id: A.id, ordre: 1 }], acceptacio_privacitat: true },
    });
    if (r.status !== 201) throw new Error(JSON.stringify(r.cos));
  }
  await env.DB.prepare("UPDATE cicles SET estat = 'adjudicacio_en_proces' WHERE id = ?").bind(e.cicle.id).run();
  const base = `/api/gestio/casals/${e.casal.id}`;
  const g = await clientAutenticat("gestor_casal", e.casal.id);
  const adj = `${base}/cicles/${e.cicle.id}/adjudicacio`;
  await g.json(`${adj}/parametres`, { method: "PUT", json: { parametres: { ...PARAMETRES_INICIALS, criteri_ordre: "inscripcio", prioritat_espera_anterior: false }, versio_actual: null } });
  const p = await g.json(`${adj}/propostes`, { method: "POST", json: {} });
  await g.json(`${base}/adjudicacions/${p.cos.execucio.id}/confirmar`, { method: "POST", json: { confirmacio: true } });
  const full = () => g.json(`${base}/activitats/${A.id}/assistencia`);
  return { ...e, A, base, g, full };
}

type Persona = { id: string; versio: number; participant: { cognom1: string; telefon: string | null }; marques: Record<string, { estat: string; versio: number }>; resum: { percentatge: number | null }; sota_llindar: boolean };

describe("assistència: sessions", () => {
  it("genera el calendari sense duplicar sessions i permet afegir-ne i cancel·lar-ne", async () => {
    const { base, A, g, full, casal } = await escenari();
    const r = await g.json(`${base}/activitats/${A.id}/sessions/generacio`, { method: "POST" });
    expect(r.cos).toEqual({ creades: 8, existents: 0 });
    expect((await g.json(`${base}/activitats/${A.id}/sessions/generacio`, { method: "POST" })).cos).toEqual({ creades: 0, existents: 8 });
    const f = await full();
    expect(f.cos.sessions.map((s: { data: string }) => s.data)).toEqual(
      ["2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14", "2026-10-19", "2026-10-21", "2026-10-26", "2026-10-28"]);
    expect(f.cos.sessions[0]).toMatchObject({ hora_inici: "10:00", hora_fi: "11:30", estat: "prevista" });
    // Persones admeses per ordre alfabètic; la llista d'espera no hi és.
    expect(f.cos.persones.map((p: Persona) => p.participant.cognom1)).toEqual(["Àvila", "Zapata"]);

    const extra = await g.json(`${base}/activitats/${A.id}/sessions`, { method: "POST", json: { data: "2026-10-30", hora_inici: "10:00", hora_fi: "11:30" } });
    expect(extra.status).toBe(201);
    expect((await g.json(`${base}/activitats/${A.id}/sessions`, { method: "POST", json: { data: "2026-10-30", hora_inici: "10:00" } })).cos.error.codi).toBe("sessio_existent");
    expect((await g.json(`${base}/activitats/${A.id}/sessions`, { method: "POST", json: { data: "2026-10-31", hora_inici: "11:00", hora_fi: "10:00" } })).status).toBe(400);

    const sessio = (await full()).cos.sessions.find((s: { data: string }) => s.data === "2026-10-30");
    expect((await g.json(`${base}/sessions/${sessio.id}/cancellacio`, { method: "POST", json: { versio: sessio.versio, motiu: "" } })).status).toBe(400);
    expect((await g.json(`${base}/sessions/${sessio.id}/cancellacio`, { method: "POST", json: { versio: sessio.versio, motiu: "Festiu local" } })).status).toBe(200);
    expect((await full()).cos.sessions.find((s: { id: string }) => s.id === sessio.id)).toMatchObject({ estat: "cancellada", motiu_cancellacio: "Festiu local" });

    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${base}/activitats/${A.id}/sessions/generacio`, { method: "POST" })).status).toBe(403);
    expect((await consulta.json(`${base}/activitats/${A.id}/assistencia`)).status).toBe(200);
  });
});

describe("assistència: registre", () => {
  async function ambSessions() {
    const e = await escenari();
    await e.g.json(`${e.base}/activitats/${e.A.id}/sessions/generacio`, { method: "POST" });
    const f = (await e.full()).cos;
    const persona = (cognom: string) => f.persones.find((p: Persona) => p.participant.cognom1 === cognom) as Persona;
    const desa = (sessioId: string, marques: unknown[], motiu?: string) =>
      e.g.json(`${e.base}/sessions/${sessioId}/assistencia`, { method: "PUT", json: { marques, ...(motiu ? { motiu } : {}) } });
    return { ...e, sessions: f.sessions as { id: string; data: string; versio: number }[], persona, desa };
  }

  it("registra presències i absències, i en modificar-les exigeix motiu i deixa historial", async () => {
    const { base, g, full, sessions, persona, desa, casal } = await ambSessions();
    const [s1] = sessions;
    const z = persona("Zapata"), a = persona("Àvila");
    const r = await desa(s1!.id, [{ placa_id: z.id, estat: "present", versio: null }, { placa_id: a.id, estat: "absent", versio: null }]);
    expect(r.cos).toEqual({ noves: 2, modificades: 0 });
    let f = (await full()).cos;
    expect(f.sessions[0]).toMatchObject({ estat: "realitzada", marques: 2 });
    const marcaA = f.persones.find((p: Persona) => p.id === a.id).marques[s1!.id];
    expect(marcaA).toEqual({ estat: "absent", versio: 1 });

    // Tornar a enviar una marca nova que ja existeix és un conflicte (algú altre ja l'ha desada).
    expect((await desa(s1!.id, [{ placa_id: a.id, estat: "present", versio: null }])).cos.error.codi).toBe("conflicte_concurrencia");
    const sense = await desa(s1!.id, [{ placa_id: a.id, estat: "present", versio: 1 }]);
    expect(sense.status).toBe(428);
    expect((await desa(s1!.id, [{ placa_id: a.id, estat: "present", versio: 1 }], "Havia arribat tard")).cos)
      .toEqual({ noves: 0, modificades: 1 });
    expect((await desa(s1!.id, [{ placa_id: a.id, estat: "present", versio: 1 }], "Versió antiga")).cos.error.codi).toBe("conflicte_concurrencia");
    f = (await full()).cos;
    expect(f.persones.find((p: Persona) => p.id === a.id).marques[s1!.id]).toEqual({ estat: "present", versio: 2 });
    const historial = await g.json(`${base}/historial/placa/${a.id}`);
    expect(historial.cos.historial).toHaveLength(1);
    expect(historial.cos.historial[0]).toMatchObject({ accio: "modificacio", motiu: "Havia arribat tard",
      canvis: { assistencia: { abans: "absent", despres: "present", data: "2026-10-05" } } });
    const auditoria = await env.DB.prepare("SELECT COUNT(*) AS n FROM registres_assistencia WHERE sessio_id = ?").bind(s1!.id).first<{ n: number }>();
    expect(auditoria!.n).toBe(2);
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${base}/sessions/${s1!.id}/assistencia`, { method: "PUT", json: { marques: [{ placa_id: z.id, estat: "absent", versio: 1 }], motiu: "Prova" } })).status).toBe(403);
  });

  it("rebutja persones sense plaça, sessions futures o cancel·lades, i cicles fora d'estat", async () => {
    const { base, A, cicle, g, full, sessions, persona, desa } = await ambSessions();
    const z = persona("Zapata");
    const places = (await g.json(`${base}/cicles/${cicle.id}/places`)).cos.grups[0].places;
    const bosch = places.find((p: { participant: { cognom1: string } }) => p.participant.cognom1 === "Bosch");
    expect((await desa(sessions[0]!.id, [{ placa_id: bosch.id, estat: "present", versio: null }])).status).toBe(400);
    const futura = await g.json(`${base}/activitats/${A.id}/sessions`, { method: "POST", json: { data: "2026-11-05" } });
    expect(futura.status).toBe(201);
    const s = (await full()).cos.sessions.find((x: { data: string }) => x.data === "2026-11-05");
    expect((await desa(s.id, [{ placa_id: z.id, estat: "present", versio: null }])).cos.error.codi).toBe("sessio_futura");
    // Una sessió amb assistència no es pot cancel·lar.
    await desa(sessions[1]!.id, [{ placa_id: z.id, estat: "present", versio: null }]);
    expect((await g.json(`${base}/sessions/${sessions[1]!.id}/cancellacio`, { method: "POST", json: { versio: 2, motiu: "Prova" } })).cos.error.codi)
      .toBe("sessio_amb_assistencia");
    await env.DB.prepare("UPDATE cicles SET estat = 'finalitzat' WHERE id = ?").bind(cicle.id).run();
    expect((await desa(sessions[2]!.id, [{ placa_id: z.id, estat: "present", versio: null }])).cos.error.codi).toBe("cicle_bloquejat");
  });

  it("calcula percentatges, marca qui és per sota del llindar i exporta les dades", async () => {
    const { base, cicle, g, full, sessions, persona, desa, casal } = await ambSessions();
    const z = persona("Zapata"), a = persona("Àvila");
    for (const [i, s] of sessions.slice(0, 4).entries()) {
      await desa(s.id, [{ placa_id: z.id, estat: "present", versio: null }, { placa_id: a.id, estat: i === 0 ? "present" : "absent", versio: null }]);
    }
    const versio = (await g.json(`${base}/cicles/${cicle.id}`)).cos.cicle.versio;
    expect((await g.json(`${base}/cicles/${cicle.id}`, { method: "PATCH", json: { versio, llindar_assistencia: 101 } })).status).toBe(400);
    expect((await g.json(`${base}/cicles/${cicle.id}`, { method: "PATCH", json: { versio, llindar_assistencia: 75 } })).status).toBe(200);
    const f = (await full()).cos;
    const resum = (id: string) => f.persones.find((p: Persona) => p.id === id) as Persona;
    expect([resum(z.id).resum.percentatge, resum(z.id).sota_llindar]).toEqual([100, false]);
    expect([resum(a.id).resum.percentatge, resum(a.id).sota_llindar]).toEqual([25, true]);
    // Cap acció automàtica: la plaça continua admesa.
    const places = (await g.json(`${base}/cicles/${cicle.id}/places`)).cos.grups[0].places;
    expect(places.find((p: { id: string }) => p.id === a.id).estat).toBe("admesa");

    const resumCicle = await g.json(`${base}/cicles/${cicle.id}/assistencia`);
    expect(resumCicle.cos.activitats.find((x: { admeses: number }) => x.admeses === 2)).toMatchObject({ sessions: 8, realitzades: 4, mitjana: 63, sota_llindar: 1 });

    const exp = await g.json(`${base}/cicles/${cicle.id}/exportacions/assistencia`);
    expect(exp.cos.files).toEqual([["Taller fictici", 2, "Àvila, Jordi", 1, 3, 0, 25, "Sí"], ["Taller fictici", 1, "Zapata, Marta", 4, 0, 0, 100, "No"]]);
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await consulta.json(`${base}/cicles/${cicle.id}/exportacions/assistencia`)).status).toBe(403);
  });

  it("dona de baixa per assistència només si es confirma i la persona és per sota del llindar", async () => {
    const { base, A, cicle, g, sessions, persona, desa, casal } = await ambSessions();
    const z = persona("Zapata"), a = persona("Àvila");
    const baixa = (id: string, versio: number, client = g) =>
      client.json(`${base}/places/${id}/baixa-assistencia`, { method: "POST", json: { versio } });
    await env.DB.prepare("UPDATE cicles SET llindar_assistencia = NULL WHERE id = ?").bind(cicle.id).run();
    expect((await baixa(a.id, a.versio)).cos.error.codi).toBe("sense_llindar");

    await env.DB.prepare("UPDATE cicles SET llindar_assistencia = 80 WHERE id = ?").bind(cicle.id).run();
    for (const [i, s] of sessions.slice(0, 2).entries()) {
      await desa(s.id, [{ placa_id: z.id, estat: "present", versio: null }, { placa_id: a.id, estat: i === 0 ? "present" : "absent", versio: null }]);
    }
    // Encara no hi ha prou sessions per calcular el percentatge.
    expect((await baixa(a.id, a.versio)).cos.error.codi).toBe("no_sota_llindar");
    for (const s of sessions.slice(2, 5)) {
      await desa(s.id, [{ placa_id: z.id, estat: "present", versio: null }, { placa_id: a.id, estat: "absent", versio: null }]);
    }
    expect((await baixa(z.id, z.versio)).cos.error.codi).toBe("no_sota_llindar"); // 100 %
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await baixa(a.id, a.versio, consulta)).status).toBe(403);

    // Sense confirmació explícita no canvia res: la plaça continua admesa.
    const places = async () => (await g.json(`${base}/cicles/${cicle.id}/places`)).cos.grups[0].places as { id: string; estat: string }[];
    expect((await places()).find((p) => p.id === a.id)?.estat).toBe("admesa");

    const r = await baixa(a.id, a.versio);
    expect(r.status).toBe(200);
    expect((await places()).find((p) => p.id === a.id)?.estat).toBe("baixa");
    const moviments = (await g.json(`${base}/places/${a.id}/moviments`)).cos.moviments as { estat_nou: string; motiu: string }[];
    expect(moviments.at(-1)).toMatchObject({ estat_nou: "baixa", motiu: "Assistència del 20%, inferior al llindar del 80%." });
    const audit = await env.DB.prepare("SELECT detalls FROM registres_auditoria WHERE tipus_operacio = 'places.baixa_assistencia' AND entitat_id = ?").bind(a.id).first<{ detalls: string }>();
    expect(JSON.parse(audit!.detalls)).toMatchObject({ percentatge: 20, llindar: 80, des: "admesa", cap: "baixa" });
    // La falta justificada (FJ) es desa i compta com a falta.
    expect((await desa(sessions[5]!.id, [{ placa_id: z.id, estat: "absencia_justificada", versio: null }])).status).toBe(200);
    const full = (await g.json(`${base}/activitats/${A.id}/assistencia`)).cos;
    expect(full.persones.find((p: Persona) => p.id === z.id).resum).toEqual({ presents: 5, absents: 1, justificades: 1, percentatge: 83 });
    // No es pot repetir.
    expect((await baixa(a.id, a.versio + 1)).status).toBe(409);
  });
});

describe("graelles d'assistència", () => {
  it("retorna una graella per activitat amb admeses per ordre alfabètic i la llista d'espera a part", async () => {
    const { base, A, cicle, g, casal } = await escenari();
    await g.json(`${base}/activitats/${A.id}/sessions/generacio`, { method: "POST" });
    const r = await g.json(`${base}/cicles/${cicle.id}/exportacions/graelles`);
    expect(r.status).toBe(200);
    expect(r.cos.totals).toEqual({ activitats: 1, admeses: 2, espera: 1 });
    const graella = r.cos.graelles[0];
    expect(graella).toMatchObject({ activitat: "Taller fictici", capacitat: 2, horari: "dl, dc · 10:00–11:30", columnes_buides: 0 });
    expect(graella.sessions).toHaveLength(8);
    // Sempre amb nom, cognoms i telèfon (decisió de 2026-10-15).
    expect(graella.admeses.map((p: { nom: string; cognoms: string; telefon: string }) => [p.nom, p.cognoms, p.telefon]))
      .toEqual([["Jordi", "Àvila", "600000002"], ["Marta", "Zapata", "600000001"]]);
    expect(graella.espera).toEqual([{ posicio: 1, numero: 3, nom: "Núria", cognoms: "Bosch", telefon: "600000003", oferta_pendent: false }]);
    // Si es demana explícitament sense telèfon, o sense permís per veure'l, no s'hi inclou.
    expect((await g.json(`${base}/cicles/${cicle.id}/exportacions/graelles?telefon=0`)).cos.graelles[0].admeses[0].telefon).toBeNull();
    const auditoria = await env.DB.prepare("SELECT detalls FROM registres_auditoria WHERE casal_id = ? AND tipus_operacio = 'exportacio.graelles'").bind(casal.id).all<{ detalls: string }>();
    expect(auditoria.results).toHaveLength(2);
    expect(auditoria.results[0]!.detalls).not.toContain("600000");
  });
});

describe("baixa voluntària", () => {
  it("desa el motiu i la data, allibera la plaça i l'ofereix a la primera persona de la llista d'espera", async () => {
    const { base, A, cicle, g, full, casal } = await escenari();
    const persones = (await full()).cos.persones as Persona[];
    const avila = persones.find((p) => p.participant.cognom1 === "Àvila")!;
    const baixa = (id: string, json: unknown, client = g) => client.json(`${base}/places/${id}/baixa-voluntaria`, { method: "POST", json });

    expect((await baixa(avila.id, { versio: avila.versio, motiu: "" })).status).toBe(400);
    const consulta = await clientAutenticat("consulta_casal", casal.id);
    expect((await baixa(avila.id, { versio: avila.versio, motiu: "Canvi d'horari a la feina" }, consulta)).status).toBe(403);

    const r = await baixa(avila.id, { versio: avila.versio, motiu: "Canvi d'horari a la feina" });
    expect(r.status).toBe(200);
    expect(r.cos).toMatchObject({
      data: "2026-11-01", sense_oferta: null,
      oferta: { posicio: 1, nom: "Núria", cognom1: "Bosch", telefon: "600000003" },
      missatge: { activitat: "Taller fictici", horari: "dl, dc · 10:00–11:30", data_inici: null }, // ja ha començat
    });
    const places = (await g.json(`${base}/cicles/${cicle.id}/places`)).cos.grups[0].places as { id: string; estat: string; participant: { cognom1: string } }[];
    expect(Object.fromEntries(places.map((p) => [p.participant.cognom1, p.estat]))).toEqual({ Zapata: "admesa", Àvila: "renuncia", Bosch: "oferta_pendent" });

    // Motiu i data desats per als indicadors.
    const fila = await env.DB.prepare("SELECT activitat_id, cicle_id, estat_anterior, data, motiu FROM baixes_voluntaries WHERE placa_id = ?").bind(avila.id).first();
    expect(fila).toEqual({ activitat_id: A.id, cicle_id: cicle.id, estat_anterior: "admesa", data: "2026-11-01", motiu: "Canvi d'horari a la feina" });
    const ind = (await g.json(`${base}/cicles/${cicle.id}/indicadors`)).cos;
    expect(ind.totals.baixes_voluntaries).toBe(1);

    // El full d'assistència mostra la baixa i la llista d'espera per ordre d'adjudicació.
    const f = (await full()).cos;
    expect(f.persones.find((p: Persona) => p.id === avila.id)).toBeUndefined(); // sense marques, ja no surt a la graella
    expect(f.espera.map((p: { estat: string; participant: { cognom1: string; telefon: string } }) => [p.participant.cognom1, p.estat, p.participant.telefon]))
      .toEqual([["Bosch", "oferta_pendent", "600000003"]]);

    // No es pot repetir.
    expect((await baixa(avila.id, { versio: avila.versio + 1, motiu: "Una altra vegada" })).status).toBe(409);

    // La persona a qui s'ofereix no la vol: es desa igual i, sense ningú més en espera, la plaça queda lliure.
    const bosch = f.espera[0] as { id: string; versio: number };
    const r2 = await baixa(bosch.id, { versio: bosch.versio, motiu: "No li va bé l'horari" });
    expect(r2.cos).toMatchObject({ oferta: null, sense_oferta: expect.stringContaining("buida") });
    const fila2 = await env.DB.prepare("SELECT estat_anterior FROM baixes_voluntaries WHERE placa_id = ?").bind(bosch.id).first();
    expect(fila2).toEqual({ estat_anterior: "oferta_pendent" });
    const audit = await env.DB.prepare("SELECT COUNT(*) AS n FROM registres_auditoria WHERE tipus_operacio = 'places.baixa_voluntaria'").first<{ n: number }>();
    expect(audit!.n).toBe(2);
  });

  it("guarda la baixa amb les marques: la persona continua a la graella amb la data de la baixa", async () => {
    const { base, A, g, full } = await escenari();
    await g.json(`${base}/activitats/${A.id}/sessions/generacio`, { method: "POST" });
    const f = (await full()).cos;
    const z = f.persones.find((p: Persona) => p.participant.cognom1 === "Zapata") as Persona;
    await g.json(`${base}/sessions/${f.sessions[0].id}/assistencia`, { method: "PUT", json: { marques: [{ placa_id: z.id, estat: "present", versio: null }] } });
    expect((await g.json(`${base}/places/${z.id}/baixa-voluntaria`, { method: "POST", json: { versio: z.versio, motiu: "Es trasllada de barri" } })).status).toBe(200);
    const despres = (await full()).cos.persones.find((p: Persona) => p.id === z.id);
    expect(despres).toMatchObject({ estat: "renuncia", baixa_voluntaria: { data: "2026-11-01", motiu: "Es trasllada de barri" } });
  });
});

describe("rol de conserge", () => {
  it("només gestiona l'assistència: passa llista i treu les graelles amb telèfon, però no veu inscripcions ni comunicacions", async () => {
    const e = await escenari();
    const k = await clientAutenticat("conserge", e.casal.id);
    expect((await k.json(`${e.base}/cicles`)).status).toBe(200);
    expect((await k.json(`${e.base}/cicles/${e.cicle.id}/assistencia`)).status).toBe(200);
    expect((await k.json(`${e.base}/activitats/${e.A.id}/sessions/generacio`, { method: "POST" })).status).toBe(200);
    const f = (await k.json(`${e.base}/activitats/${e.A.id}/assistencia`)).cos;
    const z = f.persones.find((p: Persona) => p.participant.cognom1 === "Zapata") as Persona;
    expect(z.participant.telefon).toBe("600000001");
    const marca = await k.json(`${e.base}/sessions/${f.sessions[0].id}/assistencia`, { method: "PUT", json: { marques: [{ placa_id: z.id, estat: "present", versio: null }] } });
    expect(marca.status).toBe(200);
    const graelles = await k.json(`${e.base}/cicles/${e.cicle.id}/exportacions/graelles`);
    expect(graelles.status).toBe(200);
    expect(JSON.stringify(graelles.cos)).toContain("600000001");

    // Res més: ni inscripcions, ni comunicacions, ni baixes, ni equip, ni exportacions de dades.
    expect((await k.json(`${e.base}/cicles/${e.cicle.id}/sollicituds`)).status).toBe(403);
    expect((await k.json(`${e.base}/cicles/${e.cicle.id}/comunicacions`)).status).toBe(403);
    expect((await k.json(`${e.base}/cicles/${e.cicle.id}/exportacions/assistencia`)).status).toBe(403);
    expect((await k.json(`${e.base}/places/${z.id}/baixa-voluntaria`, { method: "POST", json: { versio: z.versio, motiu: "Prova" } })).status).toBe(403);
    expect((await k.json(`${e.base}/usuaris`)).status).toBe(403);
    expect((await k.json(`${e.base}/cicles`, { method: "POST", json: { nom: "No", any: 2027, data_inici: "2027-01-10", data_fi: "2027-03-30" } })).status).toBe(403);
  });
});
