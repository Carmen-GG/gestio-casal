import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearApp } from "../../worker/app";
import { ARA, crearEscenari, rellotgeFix } from "../setup/dades";
import { clientAutenticat } from "../setup/sessio";

const SECRETS = {
  WHATSAPP_TOKEN: "testimoni-fictici", WHATSAPP_APP_SECRET: "secret-fictici", WHATSAPP_VERIFY_TOKEN: "verificacio-ficticia",
  RESEND_API_KEY: "clau-correu-ficticia", CORREU_REMITENT: "Casals <avisos@exemple.invalid>",
};

/** Meta i servei de correu simulats: desen les peticions i responen segons el destí. */
function serveisFicticis() {
  const peticions: { url: string; cos: any }[] = [];
  const fetchMeta = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const cos = init?.body ? JSON.parse(String(init.body)) : null;
    peticions.push({ url, cos });
    if (url.includes("resend.com")) {
      if (cos.to[0].startsWith("rebota")) return Response.json({ name: "validation_error", message: "Invalid to" }, { status: 422 });
      return Response.json({ id: crypto.randomUUID() });
    }
    if (!url.includes("/messages")) return Response.json({ display_phone_number: "+34 600 00 00 00", verified_name: "Casals", quality_rating: "GREEN" });
    if (["34600000009", "34600000008"].includes(cos.to)) return Response.json({ error: { code: 131026, message: "Message undeliverable" } }, { status: 400 });
    return Response.json({ messages: [{ id: `wamid.${crypto.randomUUID()}` }] });
  }) as typeof fetch;
  return { peticions, fetchMeta };
}

/** Client amb sessió, amb els serveis simulats i, si cal, els secrets. */
async function clientAmbServeis(rol: string, casalId: string | null, fetchMeta: typeof fetch, secrets: object = SECRETS) {
  const c = await clientAutenticat(rol, casalId);
  const app = crearApp({ rellotge: rellotgeFix(ARA), fetchMeta });
  const peticio = (ruta: string, init: RequestInit & { json?: unknown } = {}) => {
    const { json, ...resta } = init;
    const headers = new Headers(resta.headers);
    headers.set("Cookie", c.galeta);
    if (json !== undefined) headers.set("Content-Type", "application/json");
    return app.request(`http://localhost${ruta}`, { ...resta, headers, body: json !== undefined ? JSON.stringify(json) : resta.body }, { ...env, ...secrets });
  };
  return { json: async (ruta: string, init: RequestInit & { json?: unknown } = {}) => { const r = await peticio(ruta, init); return { status: r.status, cos: await r.json() as any }; }, peticio };
}

const persona = (casalId: string, nom: string, cognom1: string, dades: Record<string, string>) =>
  env.DB.prepare(
    `INSERT INTO persones_plataforma (id, casal_id, clau, nom, cognom1, clau_ordenacio, dades, origens, text_basic, text_contacte, creat_el, actualitzat_el)
     VALUES (?, ?, ?, ?, ?, ?, ?, '["usuaris"]', '', '', ?, ?)`,
  ).bind(crypto.randomUUID(), casalId, `N:${crypto.randomUUID()}`, nom, cognom1, `${cognom1} ${nom}`.toLowerCase(),
    JSON.stringify({ nom, cognom1, ...dades }), ARA, ARA).run();

/** Dos casals amb responsable i persones usuàries fictícies (el casal A té WhatsApp propi). */
async function escenari() {
  const a = await crearEscenari();
  const b = await crearEscenari();
  const serveis = serveisFicticis();
  const admin = await clientAmbServeis("admin_central", null, serveis.fetchMeta);
  const responsables: Record<string, { email: string; usuari_id: string }> = {};
  for (const [k, prefix] of [[a, "resp"], [b, "rebota"]] as const) {
    const email = `${prefix}-${crypto.randomUUID()}@exemple.invalid`;
    const alta = await admin.json(`/api/gestio/administracio/casals/${k.casal.id}/responsables`, { method: "POST", json: { email, nom_visible: `Responsable ${k.casal.codi}` } });
    expect(alta.status).toBe(201);
    responsables[k.casal.id] = { email, usuari_id: alta.cos.assignacio.usuari_id };
  }
  await persona(a.casal.id, "Marta", "Zapata", { telefon_mobil: "600000101" });
  await persona(a.casal.id, "Jordi", "Àvila", { telefon_fix: "937000002" });
  await persona(a.casal.id, "Pau", "Sala", { telefon_mobil: "600000009" });
  await persona(a.casal.id, "Rita", "Puig", {});
  await persona(a.casal.id, "Leo", "Mas", { tutor_telefon: "600000102" });
  await persona(b.casal.id, "Marta", "Zapata", { telefon_mobil: "+34 600 000 101" });
  await persona(b.casal.id, "Oriol", "Vidal", { telefon_mobil: "600000201" });
  return { a, b, admin, serveis, responsables };
}

const enviaTot = async (admin: Awaited<ReturnType<typeof clientAmbServeis>>, id: string) => {
  let d: any;
  do d = (await admin.json(`/api/gestio/administracio/comunicats/${id}/continua`, { method: "POST" })).cos; while (d.queden > 0 && !d.aturat);
  return d;
};

const COMUNICAT = {
  assumpte: "Tancament per obres", text: "Dilluns el casal estarà tancat\nper obres a la calefacció.",
  correu_responsables: true, whatsapp_responsables: true, whatsapp_persones: true,
};

describe("comunicats de la superadministració", () => {
  it("envia per correu i WhatsApp i dona el resultat per casal amb els motius dels no contactats", async () => {
    const { a, b, admin, serveis, responsables } = await escenari();
    const resp = (casalId: string) => responsables[casalId]!.usuari_id;
    expect((await admin.json(`/api/gestio/administracio/usuaris/${resp(a.casal.id)}/telefon`, { method: "PUT", json: { telefon: "937000000" } })).status).toBe(400);
    expect((await admin.json(`/api/gestio/administracio/usuaris/${resp(a.casal.id)}/telefon`, { method: "PUT", json: { telefon: "611 00 00 01" } })).status).toBe(200);
    const centrals = await admin.json("/api/gestio/administracio/comunicats/whatsapp", {
      method: "PUT", json: { phone_number_id: "9990001", numero_visible: null, idioma: "ca", remitent: "servei de Casals Cívics i Comunitaris", actiu: true },
    });
    expect(centrals.status).toBe(200);
    await env.DB.prepare("INSERT INTO whatsapp_config (casal_id, phone_number_id, idioma, actiu, actualitzat_el) VALUES (?, '1110001', 'ca', 1, ?)")
      .bind(a.casal.id, ARA).run();

    const estat = (await admin.json("/api/gestio/administracio/comunicats")).cos;
    expect(estat.serveis).toEqual({ whatsapp: true, correu: true });
    expect(JSON.stringify(estat)).not.toContain("clau-correu-ficticia");
    const filaA = estat.casals.find((k: any) => k.id === a.casal.id);
    expect(filaA).toMatchObject({ whatsapp: "casal", persones: 5, persones_mobil: 3 });
    expect(filaA.responsables[0].te_mobil).toBe(true);
    expect(estat.casals.find((k: any) => k.id === b.casal.id).whatsapp).toBe("central");

    const nou = await admin.json("/api/gestio/administracio/comunicats", { method: "POST", json: { ...COMUNICAT, casal_ids: [a.casal.id, b.casal.id] } });
    expect(nou.status).toBe(201);
    expect(nou.cos.correu_manual).toBeNull();
    const fi = await enviaTot(admin, nou.cos.comunicat_id);
    expect(fi.aturat).toBeNull();

    // Correus a les dues responsables (un rebota); WhatsApp a la responsable amb mòbil des del número central.
    const correus = serveis.peticions.filter((p) => p.url.includes("resend.com"));
    expect(correus.map((p) => p.cos.to[0]).sort()).toEqual([responsables[a.casal.id]!.email, responsables[b.casal.id]!.email].sort());
    expect(correus[0]!.cos.subject).toBe("Tancament per obres");
    const wa = serveis.peticions.filter((p) => p.url.includes("/messages"));
    const perNumero = (id: string) => wa.filter((p) => p.url.includes(`/${id}/messages`)).map((p) => p.cos.to).sort();
    expect(perNumero("9990001")).toEqual(["34600000201", "34611000001"]);
    expect(perNumero("1110001")).toEqual(["34600000009", "34600000101", "34600000102"]);
    // La mateixa persona (mateix mòbil) a dos casals el rep una sola vegada; el text va en un sol paràgraf.
    const params = wa.find((p) => p.cos.to === "34611000001")!.cos.template.components[0].parameters.map((x: any) => x.text);
    expect(params).toEqual(["Responsable " + a.casal.codi, "servei de Casals Cívics i Comunitaris", "Dilluns el casal estarà tancat per obres a la calefacció."]);

    const r = (await admin.json(`/api/gestio/administracio/comunicats/${nou.cos.comunicat_id}`)).cos;
    const ra = r.casals.find((k: any) => k.casal_id === a.casal.id);
    expect(ra.persones).toMatchObject({ total: 5, contactades: 2, pendents: 0 });
    expect(ra.persones.no_contactades.map((p: any) => [p.nom, p.motiu])).toEqual([["Jordi Àvila", "telefon_fix"], ["Pau Sala", "sense_whatsapp"], ["Rita Puig", "sense_telefon"]]);
    expect(ra.persones.no_contactades[0].telefon).toBe("937000002");
    expect(ra.responsables[0]).toMatchObject({ correu: { estat: "enviat" }, whatsapp: { estat: "enviat" } });
    const rb = r.casals.find((k: any) => k.casal_id === b.casal.id);
    expect(rb.persones).toMatchObject({ total: 1, contactades: 1 });
    expect(rb.responsables[0]).toMatchObject({ correu: { estat: "fallit", motiu: "error_correu" }, whatsapp: { estat: "no_enviable", motiu: "sense_telefon" } });

    // No es desa cap telèfon ni correu dels destinataris.
    const { results } = await env.DB.prepare("SELECT * FROM comunicats_destinataris WHERE comunicat_id = ?").bind(nou.cos.comunicat_id).all();
    expect(JSON.stringify(results)).not.toMatch(/600000101|611000001|exemple\.invalid/);

    // Els avisos d'entrega de Meta actualitzen l'estat.
    const wamid = (results as any[]).find((d) => d.wamid)!.wamid;
    const avis = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: wamid, status: "read" }] } }] }] });
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRETS.WHATSAPP_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signatura = `sha256=${[...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(avis)))].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    const ok = await admin.peticio("/api/whatsapp/webhook", { method: "POST", body: avis, headers: { "x-hub-signature-256": signatura } });
    expect(((await ok.json()) as any).estats).toBe(1);
    expect((await env.DB.prepare("SELECT estat FROM comunicats_destinataris WHERE wamid = ?").bind(wamid).first<{ estat: string }>())!.estat).toBe("llegit");
  });

  it("a qui no li arriba el WhatsApp li envia per correu, un sol cop, també si Meta avisa més tard", async () => {
    const { a, admin, serveis } = await escenari();
    await env.DB.prepare("INSERT INTO whatsapp_config (casal_id, phone_number_id, idioma, actiu, actualitzat_el) VALUES (?, '1110001', 'ca', 1, ?)")
      .bind(a.casal.id, ARA).run();
    await persona(a.casal.id, "Laia", "Fix", { telefon_fix: "937000003", email: "laia@exemple.invalid" });
    await persona(a.casal.id, "Nil", "Sensewa", { telefon_mobil: "600000008", tutor_email: "tutor-nil@exemple.invalid" });
    await persona(a.casal.id, "Ona", "Sensetel", { email: "ona@exemple.invalid" });
    await persona(a.casal.id, "Pol", "Mobil", { telefon_mobil: "600000301", email: "pol@exemple.invalid" });
    const nou = await admin.json("/api/gestio/administracio/comunicats", {
      method: "POST", json: { ...COMUNICAT, correu_responsables: false, whatsapp_responsables: false, casal_ids: [a.casal.id] },
    });
    expect(nou.status).toBe(201);
    expect((await enviaTot(admin, nou.cos.comunicat_id)).aturat).toBeNull();
    const correus = () => serveis.peticions.filter((p) => p.url.includes("resend.com")).map((p) => p.cos.to[0]).sort();
    // Pol té mòbil i rep el WhatsApp: no li cal el correu.
    expect(correus()).toEqual(["laia@exemple.invalid", "ona@exemple.invalid", "tutor-nil@exemple.invalid"]);
    expect(serveis.peticions.find((p) => p.url.includes("resend.com"))!.cos.subject).toBe("Tancament per obres");

    // Meta avisa més tard que el WhatsApp d'en Pol no s'ha pogut entregar: se li envia per correu.
    const { results } = await env.DB.prepare("SELECT * FROM comunicats_destinataris WHERE comunicat_id = ? AND wamid IS NOT NULL").bind(nou.cos.comunicat_id).all<any>();
    const peticioPol = serveis.peticions.find((p) => p.cos?.to === "34600000301")!;
    expect(peticioPol).toBeTruthy();
    const signa = async (cos: string) => {
      const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRETS.WHATSAPP_APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return `sha256=${[...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(cos)))].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    };
    for (const d of results) {
      const avis = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: d.wamid, status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] }] } }] }] });
      const r = await admin.peticio("/api/whatsapp/webhook", { method: "POST", body: avis, headers: { "x-hub-signature-256": await signa(avis) } });
      expect(r.status).toBe(200);
    }
    expect(correus()).toContain("pol@exemple.invalid");
    // Un segon avís de fallada no torna a enviar el correu.
    const abans = correus().length;
    const d = results[0];
    const avis = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: d.wamid, status: "failed", errors: [{ code: 131026, title: "Message undeliverable" }] }] } }] }] });
    await admin.peticio("/api/whatsapp/webhook", { method: "POST", body: avis, headers: { "x-hub-signature-256": await signa(avis) } });
    expect(correus().length).toBe(abans);

    const r = (await admin.json(`/api/gestio/administracio/comunicats/${nou.cos.comunicat_id}`)).cos;
    const ra = r.casals.find((k: any) => k.casal_id === a.casal.id);
    // Contactades: les del primer enviament per WhatsApp que no han fallat després, i les quatre per correu.
    expect(ra.persones.per_correu).toBe(4);
    expect(ra.persones.no_contactades.map((p: any) => p.nom)).not.toContain("Laia Fix");
    expect(ra.persones.no_contactades.map((p: any) => p.nom)).toContain("Jordi Àvila");
  });

  it("sense WhatsApp Business ni servei de correu es prepara per enviar-ho a mà, un a un, amb el WhatsApp normal", async () => {
    const { a, serveis } = await escenari();
    const admin = await clientAmbServeis("admin_central", null, serveis.fetchMeta, {});
    const nou = await admin.json("/api/gestio/administracio/comunicats", { method: "POST", json: { ...COMUNICAT, casal_ids: [a.casal.id] } });
    expect(nou.status).toBe(201);
    expect(nou.cos.correu_manual).toHaveLength(1);
    expect(nou.cos).toMatchObject({ pendents: 0, manuals: 3 });
    // El servidor no envia res: la continuació no té res a fer (i no queda penjada pels manuals).
    expect((await admin.json(`/api/gestio/administracio/comunicats/${nou.cos.comunicat_id}/continua`, { method: "POST" })).cos.queden).toBe(0);
    expect(serveis.peticions).toHaveLength(0);

    const base = `/api/gestio/administracio/comunicats/${nou.cos.comunicat_id}`;
    const { missatges } = (await admin.json(`${base}/manuals`)).cos;
    expect(missatges.map((m: any) => [m.nom, m.telefon]).sort()).toEqual([["Leo Mas", "34600000102"], ["Marta Zapata", "34600000101"], ["Pau Sala", "34600000009"]]);
    const marta = missatges.find((m: any) => m.nom === "Marta Zapata");
    expect(marta.text).toContain("Hola, Marta!");
    expect(marta.text).toContain("Dilluns el casal estarà tancat");

    expect((await admin.json(`${base}/manuals/${marta.id}`, { method: "POST", json: { enviat: true } })).status).toBe(200);
    let r = (await admin.json(base)).cos.casals[0].persones;
    expect(r).toMatchObject({ total: 5, contactades: 1, pendents: 2 });
    // Qui no té mòbil surt amb el motiu.
    expect(Object.fromEntries(r.no_contactades.map((p: any) => [p.nom, p.motiu]))).toEqual({ "Jordi Àvila": "telefon_fix", "Rita Puig": "sense_telefon" });
    // Es pot desfer.
    await admin.json(`${base}/manuals/${marta.id}`, { method: "POST", json: { enviat: false } });
    r = (await admin.json(base)).cos.casals[0].persones;
    expect(r.contactades).toBe(0);
    expect((await admin.json(`${base}/manuals/no-existeix`, { method: "POST", json: { enviat: true } })).status).toBe(404);

    // Validació: cal algun canal i algun casal.
    expect((await admin.json("/api/gestio/administracio/comunicats", { method: "POST", json: { ...COMUNICAT, casal_ids: [] } })).status).toBe(400);
    expect((await admin.json("/api/gestio/administracio/comunicats", {
      method: "POST", json: { ...COMUNICAT, casal_ids: [a.casal.id], correu_responsables: false, whatsapp_responsables: false, whatsapp_persones: false },
    })).status).toBe(400);
  });

  it("només la superadministració hi té accés; cadascú pot posar el seu mòbil", async () => {
    const { a } = await escenari();
    const resp = await clientAutenticat("responsable_casal", a.casal.id);
    expect((await resp.json("/api/gestio/administracio/comunicats")).status).toBe(403);
    expect((await resp.json("/api/gestio/administracio/comunicats", { method: "POST", json: { ...COMUNICAT, casal_ids: [a.casal.id] } })).status).toBe(403);
    expect((await resp.json("/api/auth/telefon", { method: "PUT", json: { telefon: "622 33 44 55" } })).status).toBe(200);
    expect((await resp.json("/api/auth/jo")).cos.usuari.telefon).toBe("622 33 44 55");
    expect((await resp.json("/api/auth/telefon", { method: "PUT", json: { telefon: "" } })).status).toBe(200);
    expect((await resp.json("/api/auth/jo")).cos.usuari.telefon).toBeNull();
  });
});
