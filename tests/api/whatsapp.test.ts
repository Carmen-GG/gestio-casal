import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PARAMETRES_INICIALS } from "../../shared/domain/adjudicacio";
import { crearApp } from "../../worker/app";
import { ARA, crearEscenari, rellotgeFix } from "../setup/dades";
import { client, clientAutenticat } from "../setup/sessio";

const CONFIG = { informacio_privacitat: "Text de prova fictici.", camps: { telefon: { actiu: true, obligatori: false } } };
const SECRETS = { WHATSAPP_TOKEN: "testimoni-fictici", WHATSAPP_APP_SECRET: "secret-fictici", WHATSAPP_VERIFY_TOKEN: "verificacio-ficticia" };

/** Meta simulada: desa les peticions i respon segons el número de destí. */
function metaFicticia() {
  const peticions: { url: string; cos: any }[] = [];
  const fetchMeta = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const cos = init?.body ? JSON.parse(String(init.body)) : null;
    peticions.push({ url, cos });
    if (!url.includes("/messages")) return Response.json({ display_phone_number: "+34 600 00 00 00", verified_name: "Casal fictici", quality_rating: "GREEN" });
    if (cos.to === "34600000009") return Response.json({ error: { code: 131026, message: "Message undeliverable to 34600000009" } }, { status: 400 });
    return Response.json({ messages: [{ id: `wamid.${crypto.randomUUID()}` }] });
  }) as typeof fetch;
  return { peticions, fetchMeta };
}

/** Client amb sessió que fa servir una app amb Meta simulada i els secrets de WhatsApp. */
async function clientWhatsapp(rol: string, casalId: string, fetchMeta: typeof fetch) {
  const c = await clientAutenticat(rol, casalId);
  const app = crearApp({ rellotge: rellotgeFix(ARA), fetchMeta });
  const peticio = (ruta: string, init: RequestInit & { json?: unknown } = {}) => {
    const { json, ...resta } = init;
    const headers = new Headers(resta.headers);
    headers.set("Cookie", c.galeta);
    if (json !== undefined) headers.set("Content-Type", "application/json");
    return app.request(`http://localhost${ruta}`, { ...resta, headers, body: json !== undefined ? JSON.stringify(json) : resta.body }, { ...env, ...SECRETS });
  };
  return { json: async (ruta: string, init: RequestInit & { json?: unknown } = {}) => { const r = await peticio(ruta, init); return { status: r.status, cos: await r.json() as any }; }, peticio };
}

/** Activitat amb 2 places: Zapata (mòbil) i Àvila (fix) admeses; Bosch (mòbil) i Sala (sense WhatsApp) en llista d'espera. */
async function escenari() {
  const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
  await env.DB.prepare("UPDATE activitats SET capacitat = 2 WHERE id = ?").bind(e.activa.id).run();
  await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?").bind(JSON.stringify(CONFIG), e.cicle.id).run();
  const publica = client(undefined, { LIMIT_SOLLICITUDS: undefined });
  for (const [nom, cognom1, telefon] of [["Marta", "Zapata", "600000001"], ["Jordi", "Àvila", "937000002"], ["Núria", "Bosch", "600000003"], ["Pau", "Sala", "600000009"]]) {
    const r = await publica.json(`/api/public/casals/${e.casal.codi}/cicles/${e.cicle.id}/sollicituds`, {
      method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
      json: { dades: { data_naixement: "1980-05-01", nom, cognom1, telefon }, preferencies: [{ activitat_id: e.activa.id, ordre: 1 }], acceptacio_privacitat: true },
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
  const meta = metaFicticia();
  const r = await clientWhatsapp("responsable_casal", e.casal.id, meta.fetchMeta);
  return { ...e, base, r, meta };
}

async function activa(r: Awaited<ReturnType<typeof clientWhatsapp>>, base: string, extra: object = {}) {
  const res = await r.json(`${base}/whatsapp`, { method: "PUT", json: { phone_number_id: "1234567890", numero_visible: "+34 600 00 00 00", idioma: "ca", actiu: true, ofertes_automatiques: true, ...extra } });
  expect(res.status).toBe(200);
}

const enviaTot = async (r: Awaited<ReturnType<typeof clientWhatsapp>>, base: string, id: string) => {
  let d: any;
  do d = (await r.json(`${base}/whatsapp/enviaments/${id}/continua`, { method: "POST" })).cos; while (d.queden > 0 && !d.aturat);
  return d;
};

describe("WhatsApp Business", () => {
  it("sense configurar no envia res i l'estat no revela els secrets", async () => {
    const { base, r, cicle } = await escenari();
    const estat = (await r.json(`${base}/whatsapp`)).cos;
    expect(estat.secrets).toEqual({ testimoni: true, secret_app: true, verificacio: true });
    expect(JSON.stringify(estat)).not.toContain("testimoni-fictici");
    expect(estat.disponible).toBe(false);
    expect(estat.plantilles.map((p: { nom: string }) => p.nom)).toEqual(["placa_admesa", "llista_espera", "oferta_placa", "sollicitud_rebuda", "avis_general"]);
    expect((await r.json(`${base}/cicles/${cicle.id}/whatsapp/activitats`, { method: "POST", json: {} })).status).toBe(409);
  });

  it("envia l'assignació per activitat: plantilla segons la situació, fixos i números sense WhatsApp a la llista de trucades", async () => {
    const { base, r, cicle, meta } = await escenari();
    await activa(r, base);
    const c = await r.json(`${base}/cicles/${cicle.id}/whatsapp/activitats`, { method: "POST", json: { nomes_pendents: true } });
    expect(c.status).toBe(201);
    expect(c.cos.total).toBe(4);
    const fi = await enviaTot(r, base, c.cos.enviament_id);
    expect(fi.recompte).toEqual({ enviat: 2, no_enviable: 1, fallit: 1 });
    const missatges = meta.peticions.filter((p) => p.url.endsWith("/1234567890/messages")).map((p) => p.cos);
    expect(missatges.map((m) => [m.to, m.template.name, m.template.language.code])).toEqual(expect.arrayContaining([
      ["34600000001", "placa_admesa", "ca"], ["34600000003", "llista_espera", "ca"], ["34600000009", "llista_espera", "ca"],
    ]));
    // Els paràmetres no tenen salts de línia i segueixen l'ordre de la plantilla.
    const zapata = missatges.find((m) => m.to === "34600000001");
    const params = zapata.template.components[0].parameters.map((p: { text: string }) => p.text);
    expect(params[0]).toBe("Marta");
    expect(params.every((t: string) => !/\n/.test(t) && t.length > 0)).toBe(true);
    // Registre per a la llista de trucades.
    const persones = (await r.json(`${base}/cicles/${cicle.id}/comunicacions`)).cos.activitats[0].persones;
    const estat = Object.fromEntries(persones.map((p: any) => [p.cognoms, [p.comunicacio?.canal, p.comunicacio?.estat, p.comunicacio?.motiu]]));
    expect(estat).toEqual({
      Zapata: ["whatsapp_api", "enviat", null], Àvila: ["whatsapp_api", "no_contactat", "telefon_fix"],
      Bosch: ["whatsapp_api", "enviat", null], Sala: ["whatsapp_api", "no_contactat", "sense_whatsapp"],
    });
    // Una segona vegada «només pendents» no torna a enviar a qui ja ho té.
    const segona = await r.json(`${base}/cicles/${cicle.id}/whatsapp/activitats`, { method: "POST", json: { nomes_pendents: true } });
    expect(segona.cos.total).toBe(2);
  });

  it("comunicació general: un missatge per persona, amb el text del casal", async () => {
    const { base, r, cicle, meta } = await escenari();
    await activa(r, base);
    const c = await r.json(`${base}/cicles/${cicle.id}/whatsapp/generals`, { method: "POST", json: { text: "Dimecres el casal\nestarà tancat.", situacions: ["admesa"] } });
    expect(c.cos.total).toBe(2);
    await enviaTot(r, base, c.cos.enviament_id);
    const m = meta.peticions.find((p) => p.cos?.template?.name === "avis_general")!.cos;
    expect(m.template.components[0].parameters.map((p: { text: string }) => p.text)[2]).toBe("Dimecres el casal estarà tancat.");
    const resum = (await r.json(`${base}/cicles/${cicle.id}/whatsapp`)).cos;
    expect(resum.enviaments[0]).toMatchObject({ tipus: "general", recompte: { enviat: 1, no_enviable: 1 } });
  });

  it("un error de credencials atura l'enviament i deixa els missatges pendents", async () => {
    const { base, cicle, casal } = await escenari();
    const caducat = (async () => Response.json({ error: { code: 190, message: "Invalid OAuth access token" } }, { status: 401 })) as typeof fetch;
    const r = await clientWhatsapp("responsable_casal", casal.id, caducat);
    await activa(r, base);
    const c = await r.json(`${base}/cicles/${cicle.id}/whatsapp/activitats`, { method: "POST", json: {} });
    const d = (await r.json(`${base}/whatsapp/enviaments/${c.cos.enviament_id}/continua`, { method: "POST" })).cos;
    expect(d.aturat).toMatch(/testimoni/);
    expect(d.queden).toBeGreaterThan(0);
  });

  it("baixa voluntària: l'oferta a la llista d'espera surt sola per WhatsApp i la resposta queda anotada", async () => {
    const { base, r, cicle, meta } = await escenari();
    await activa(r, base);
    const persones = (await r.json(`${base}/cicles/${cicle.id}/comunicacions`)).cos.activitats[0].persones;
    const zapata = persones.find((p: any) => p.cognoms === "Zapata");
    const placa = await env.DB.prepare("SELECT versio FROM places WHERE id = ?").bind(zapata.placa_id).first<{ versio: number }>();
    const b = await r.json(`${base}/places/${zapata.placa_id}/baixa-voluntaria`, { method: "POST", json: { versio: placa!.versio, motiu: "Canvi d'horari" } });
    expect(b.status).toBe(200);
    expect(b.cos.whatsapp).toMatchObject({ enviat: true });
    const oferta = meta.peticions.find((p) => p.cos?.template?.name === "oferta_placa")!.cos;
    expect(oferta.to).toBe("34600000003");

    // Avisos de Meta: entregat i resposta amb el botó «No». No es perd la plaça automàticament.
    const wamid = (await env.DB.prepare("SELECT wamid FROM whatsapp_missatges WHERE plantilla = 'oferta_placa' AND cicle_id = ?").bind(cicle.id).first<{ wamid: string }>())!.wamid;
    const avis = JSON.stringify({ entry: [{ changes: [{ value: {
      statuses: [{ id: wamid, status: "delivered" }],
      messages: [{ from: "34600000003", context: { id: wamid }, type: "button", button: { text: "No, gràcies", payload: "No, gràcies" } }],
    } }] }] });
    const signa = async (cos: string, secret: string) => {
      const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return `sha256=${[...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(cos)))].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    };
    expect((await r.peticio("/api/whatsapp/webhook", { method: "POST", body: avis, headers: { "x-hub-signature-256": await signa(avis, "un-altre") } })).status).toBe(401);
    const ok = await r.peticio("/api/whatsapp/webhook", { method: "POST", body: avis, headers: { "x-hub-signature-256": await signa(avis, SECRETS.WHATSAPP_APP_SECRET) } });
    expect(ok.status).toBe(200);
    const m = await env.DB.prepare("SELECT estat, resposta FROM whatsapp_missatges WHERE wamid = ?").bind(wamid).first();
    expect(m).toEqual({ estat: "entregat", resposta: "no" });
    const bosch = await env.DB.prepare("SELECT estat FROM places WHERE id = ?").bind(oferta && b.cos.oferta.placa_id).first<{ estat: string }>();
    expect(bosch!.estat).toBe("oferta_pendent");
    // Cap número ni text de resposta desat.
    const fila = JSON.stringify(await env.DB.prepare("SELECT * FROM whatsapp_missatges WHERE wamid = ?").bind(wamid).first());
    expect(fila).not.toContain("600000003");
  });

  it("verificació del webhook i permisos", async () => {
    const { base, r, casal } = await escenari();
    expect((await r.peticio("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verificacio-ficticia&hub.challenge=12345")).status).toBe(200);
    expect((await r.peticio("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=no&hub.challenge=12345")).status).toBe(403);
    const consulta = await clientWhatsapp("consulta_casal", casal.id, metaFicticia().fetchMeta);
    expect((await consulta.json(`${base}/whatsapp`, { method: "PUT", json: { phone_number_id: "1234567890", idioma: "ca", actiu: true, ofertes_automatiques: true } })).status).toBe(403);
    await activa(r, base);
    const comprova = await r.json(`${base}/whatsapp/comprovacio`, { method: "POST" });
    expect(comprova.cos.numero).toEqual({ numero: "+34 600 00 00 00", nom_verificat: "Casal fictici", qualitat: "GREEN" });
  });
});
