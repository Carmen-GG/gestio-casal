import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { crearApp } from "../../worker/app";
import { ARA, crearEscenari, rellotgeFix } from "../setup/dades";

const CONFIG = {
  informacio_privacitat: "Text de prova fictici.",
  camps: { telefon: { actiu: true, obligatori: false }, email: { actiu: true, obligatori: false } },
};
const SECRETS_CORREU = { RESEND_API_KEY: "clau-ficticia", CORREU_REMITENT: "Casals <avisos@exemple.cat>" };
const SECRETS_WHATSAPP = { WHATSAPP_TOKEN: "testimoni-fictici" };

/** Serveis simulats (Resend i Meta): desen les peticions i responen bé, o malament si es demana. */
function serveisFicticis(opcions: { correuFalla?: boolean } = {}) {
  const peticions: { url: string; cos: any }[] = [];
  const fetchMeta = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const cos = init?.body ? JSON.parse(String(init.body)) : null;
    peticions.push({ url, cos });
    if (url.includes("resend.com")) {
      return opcions.correuFalla ? Response.json({ name: "application_error" }, { status: 500 }) : Response.json({ id: "correu-fictici-1" });
    }
    return Response.json({ messages: [{ id: "wamid.fictici" }] });
  }) as typeof fetch;
  return { peticions, fetchMeta };
}

async function escenari() {
  const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
  await env.DB.prepare("UPDATE cicles SET configuracio_formulari = ? WHERE id = ?").bind(JSON.stringify(CONFIG), e.cicle.id).run();
  return { ...e, ruta: `/api/public/casals/${e.casal.codi}/cicles/${e.cicle.id}/sollicituds` };
}

function enviador(fetchMeta: typeof fetch, secrets: Record<string, string>) {
  const app = crearApp({ rellotge: rellotgeFix(ARA), fetchMeta });
  return async (ruta: string, json: unknown, clau = crypto.randomUUID()) => {
    const r = await app.request(`http://localhost${ruta}`, {
      method: "POST", body: JSON.stringify(json), headers: { "Content-Type": "application/json", "Idempotency-Key": clau },
    }, { ...env, LIMIT_SOLLICITUDS: undefined, ...secrets });
    return { status: r.status, cos: await r.json() as any };
  };
}

const cos = (activitatId: string, dades: Record<string, string>) => ({
  dades: { data_naixement: "1980-05-01", nom: "Persona", cognom1: "Fictícia", ...dades },
  preferencies: [{ activitat_id: activitatId, ordre: 1 }],
  acceptacio_privacitat: true,
});

const avis = (cicleId: string) => env.DB.prepare(
  "SELECT a.* FROM avisos_rebuda a JOIN sollicituds s ON s.id = a.sollicitud_id WHERE s.cicle_id = ?",
).bind(cicleId).all<{ canal: string; estat: string; motiu: string | null; extern_id: string | null }>();

describe("avís de rebuda de la sol·licitud", () => {
  it("si hi ha correu, l'envia per correu amb el codi i les activitats, i no ho repeteix en un reintent", async () => {
    const { ruta, activa, cicle } = await escenari();
    const { peticions, fetchMeta } = serveisFicticis();
    const envia = enviador(fetchMeta, { ...SECRETS_CORREU, ...SECRETS_WHATSAPP });
    const clau = crypto.randomUUID();
    const r = await envia(ruta, cos(activa.id, { email: "persona@exemple.cat", telefon: "600000001" }), clau);
    expect(r.status).toBe(201);
    expect(peticions).toHaveLength(1);
    const correu = peticions[0]!;
    expect(correu.url).toBe("https://api.resend.com/emails");
    expect(correu.cos.to).toEqual(["persona@exemple.cat"]);
    expect(correu.cos.subject).toContain("Hem rebut la vostra sol·licitud");
    expect(correu.cos.text).toContain(r.cos.codi_confirmacio);
    expect(correu.cos.text).toContain("1. Taller fictici");
    expect((await avis(cicle.id)).results).toMatchObject([{ canal: "correu", estat: "enviat", motiu: null, extern_id: "correu-fictici-1" }]);

    expect((await envia(ruta, cos(activa.id, { email: "persona@exemple.cat", telefon: "600000001" }), clau)).status).toBe(200);
    expect(peticions).toHaveLength(1);
  });

  it("sense correu, l'envia per WhatsApp amb la plantilla si el casal el té actiu", async () => {
    const { ruta, activa, cicle, casal } = await escenari();
    await env.DB.prepare("INSERT INTO whatsapp_config (casal_id, phone_number_id, idioma, actiu, actualitzat_el) VALUES (?, '1234567890', 'ca', 1, ?)")
      .bind(casal.id, String(ARA)).run();
    const { peticions, fetchMeta } = serveisFicticis();
    const r = await enviador(fetchMeta, { ...SECRETS_CORREU, ...SECRETS_WHATSAPP })(ruta, cos(activa.id, { telefon: "600 00 00 02" }));
    expect(r.status).toBe(201);
    expect(peticions).toHaveLength(1);
    expect(peticions[0]!.url).toContain("/1234567890/messages");
    expect(peticions[0]!.cos.to).toBe("34600000002");
    expect(peticions[0]!.cos.template.name).toBe("sollicitud_rebuda");
    expect(JSON.stringify(peticions[0]!.cos.template.components)).toContain(r.cos.codi_confirmacio);
    expect((await avis(cicle.id)).results).toMatchObject([{ canal: "whatsapp", estat: "enviat", extern_id: "wamid.fictici" }]);
  });

  it("sense servei configurat o amb un fix no envia res, però la sol·licitud queda registrada", async () => {
    const { ruta, activa, cicle } = await escenari();
    const { peticions, fetchMeta } = serveisFicticis();
    const envia = enviador(fetchMeta, {});
    expect((await envia(ruta, cos(activa.id, { email: "persona@exemple.cat" }))).status).toBe(201);
    expect((await envia(ruta, cos(activa.id, { telefon: "930000000" }))).status).toBe(201);
    expect((await envia(ruta, cos(activa.id, { telefon: "600000003" }))).status).toBe(201);
    expect((await envia(ruta, cos(activa.id, {}))).status).toBe(201);
    expect(peticions).toHaveLength(0);
    const motius = (await avis(cicle.id)).results.map((a) => `${a.canal}:${a.estat}:${a.motiu}`).sort();
    expect(motius).toEqual([
      "cap:no_enviable:sense_contacte", "correu:no_enviable:servei_no_configurat",
      "whatsapp:no_enviable:servei_no_configurat", "whatsapp:no_enviable:telefon_fix",
    ]);
  });

  it("si el servei de correu falla, la sol·licitud es registra igualment i l'avís queda com a fallit", async () => {
    const { ruta, activa, cicle } = await escenari();
    const { fetchMeta } = serveisFicticis({ correuFalla: true });
    const r = await enviador(fetchMeta, SECRETS_CORREU)(ruta, cos(activa.id, { email: "persona@exemple.cat" }));
    expect(r.status).toBe(201);
    expect((await avis(cicle.id)).results).toMatchObject([{ canal: "correu", estat: "fallit", motiu: "error_servei" }]);
    // A l'avís no hi queda cap adreça.
    expect(JSON.stringify((await avis(cicle.id)).results)).not.toContain("persona@exemple.cat");
  });
});
