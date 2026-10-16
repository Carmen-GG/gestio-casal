import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crearEscenari } from "../setup/dades";
import { client, clientAutenticat, usuariAmbRol } from "../setup/sessio";

// Imatge mínima: només la signatura JPEG i uns quants bytes. Cap contingut real.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const TESTIMONI = "IGAAprovaTestimoniFictici0123456789abcdef";
const TESTIMONI_RENOVAT = "IGAAprovaTestimoniRenovat0123456789abcdef";

type Resposta = { status?: number; cos: unknown };
const json = (r: Resposta) => new Response(JSON.stringify(r.cos), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });

/** Simula l'API d'Instagram: registra les crides i respon segons la ruta. */
function simulaInstagram(respostes: (url: URL, init: RequestInit | undefined) => Promise<Resposta> | Resposta) {
  const crides: { url: URL; init?: RequestInit }[] = [];
  const original = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada, init) => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    if (url.hostname !== "graph.instagram.com") return original(entrada, init);
    crides.push({ url, init });
    return json(await respostes(url, init));
  });
  return crides;
}

afterEach(() => { vi.restoreAllMocks(); });

async function escenari() {
  const e = await crearEscenari();
  const responsable = await clientAutenticat("responsable_casal", e.casal.id);
  const difusio = await clientAutenticat("difusio_casal", e.casal.id);
  const gestor = await clientAutenticat("gestor_casal", e.casal.id);
  const base = `/api/gestio/casals/${e.casal.id}/instagram`;
  const material = async (cos = JPEG, tipus = "image/jpeg") => {
    const r = await difusio.json(`/api/gestio/casals/${e.casal.id}/cartells/fitxers?us=material&nom=instagram-taller.jpg`,
      { method: "POST", headers: { "Content-Type": tipus }, body: cos });
    return r.cos.fitxer.id as string;
  };
  return { ...e, responsable, difusio, gestor, base, material };
}

const perfilCorrecte = (url: URL): Resposta => {
  if (url.pathname.endsWith("/me")) return { cos: { user_id: "17841400000000001", username: "casal_prova", account_type: "BUSINESS" } };
  if (url.pathname === "/refresh_access_token") return { cos: { access_token: TESTIMONI_RENOVAT, token_type: "bearer", expires_in: 5184000 } };
  return { status: 404, cos: { error: { message: "ruta no simulada", code: 100 } } };
};

describe("Instagram: compte del casal", () => {
  it("connecta el compte amb el testimoni, el desa xifrat i no el retorna mai", async () => {
    const { responsable, base, casal } = await escenari();
    const crides = simulaInstagram(perfilCorrecte);
    expect((await responsable.json(`${base}/compte`)).cos).toEqual({ configurat: true, compte: null });

    const r = await responsable.json(`${base}/compte`, { method: "PUT", json: { testimoni: TESTIMONI } });
    expect(r.status).toBe(200);
    expect(r.cos.compte).toMatchObject({ nom_usuari: "casal_prova", testimoni_caduca_el: "2026-12-31T10:00:00.000Z" });
    expect(JSON.stringify(r.cos)).not.toContain("IGAA");
    // El testimoni viatja a la capçalera, no a l'adreça (excepte la renovació, que ho exigeix).
    expect(crides[0]!.url.search).not.toContain("IGAA");
    expect(new Headers(crides[0]!.init?.headers).get("Authorization")).toBe(`Bearer ${TESTIMONI}`);

    const fila = await env.DB.prepare("SELECT * FROM instagram_comptes WHERE casal_id = ?").bind(casal.id).first<Record<string, string>>();
    expect(fila!.ig_usuari_id).toBe("17841400000000001");
    expect(fila!.testimoni_xifrat).not.toContain("IGAA");

    expect((await responsable.json(`${base}/compte/desconnecta`, { method: "POST", json: {} })).cos).toEqual({ configurat: true, compte: null });
  });

  it("rebutja un testimoni que Instagram no accepta i els comptes personals", async () => {
    const { responsable, base } = await escenari();
    simulaInstagram(() => ({ status: 400, cos: { error: { message: "Invalid OAuth access token", code: 190 } } }));
    const r = await responsable.json(`${base}/compte`, { method: "PUT", json: { testimoni: TESTIMONI } });
    expect(r.status).toBe(422);
    expect(r.cos.error.codi).toBe("instagram_testimoni_no_valid");
    vi.restoreAllMocks();
    simulaInstagram(() => ({ cos: { user_id: "1", username: "persona", account_type: "PERSONAL" } }));
    expect((await responsable.json(`${base}/compte`, { method: "PUT", json: { testimoni: TESTIMONI } })).cos.error.codi).toBe("instagram_compte_personal");
  });

  it("comprova els permisos: connectar és de la responsable; publicar, de difusió", async () => {
    const { difusio, gestor, base } = await escenari();
    simulaInstagram(perfilCorrecte);
    expect((await gestor.json(`${base}/publicacions`)).status).toBe(403);
    expect((await difusio.json(`${base}/publicacions`)).status).toBe(200);
    expect((await difusio.json(`${base}/compte`, { method: "PUT", json: { testimoni: TESTIMONI } })).status).toBe(403);
  });

  it("sense el secret del servidor no es pot connectar cap compte", async () => {
    const e = await crearEscenari();
    const { testimoni } = await usuariAmbRol("responsable_casal", e.casal.id);
    const c = client(undefined, { INSTAGRAM_CLAU: undefined });
    await c.peticio("/api/auth/entrar", { method: "POST", json: { testimoni } });
    const base = `/api/gestio/casals/${e.casal.id}/instagram`;
    expect((await c.json(`${base}/compte`)).cos.configurat).toBe(false);
    const r = await c.json(`${base}/compte`, { method: "PUT", json: { testimoni: TESTIMONI } });
    expect(r.status).toBe(503);
    expect(r.cos.error.codi).toBe("instagram_no_configurat");
  });
});

describe("Instagram: publicacions", () => {
  it("prepara una publicació amb una imatge JPEG del casal i en permet editar el text", async () => {
    const { difusio, base, material } = await escenari();
    const fitxerId = await material();
    const r = await difusio.json(`${base}/publicacions`, { method: "POST", json: { fitxer_id: fitxerId, titol: "Taller fictici", peu: "Text #casal" } });
    expect(r.status).toBe(201);
    expect(r.cos.publicacio).toMatchObject({ estat: "esborrany", peu: "Text #casal", versio: 1 });
    expect(r.cos.publicacio.imatge_testimoni_resum).toBeUndefined();

    const editada = await difusio.json(`${base}/publicacions/${r.cos.publicacio.id}`, { method: "PATCH", json: { versio: 1, peu: "Text nou" } });
    expect(editada.cos.publicacio).toMatchObject({ peu: "Text nou", versio: 2 });
    expect((await difusio.json(`${base}/publicacions/${r.cos.publicacio.id}`, { method: "PATCH", json: { versio: 1, peu: "x" } })).status).toBe(409);

    // Instagram només accepta JPEG; el text té límits d'etiquetes.
    const png = await material(PNG, "image/png");
    expect((await difusio.json(`${base}/publicacions`, { method: "POST", json: { fitxer_id: png, titol: "T", peu: "" } })).status).toBe(415);
    const massaEtiquetes = Array.from({ length: 31 }, (_, i) => `#e${i}`).join(" ");
    expect((await difusio.json(`${base}/publicacions`, { method: "POST", json: { fitxer_id: fitxerId, titol: "T", peu: massaEtiquetes } })).status).toBe(400);
  });

  it("publica només amb confirmació, deixa descarregar la imatge a Instagram mentre publica i no la torna a publicar", async () => {
    const { responsable, difusio, base, material } = await escenari();
    let imatgeDescarregada: Uint8Array | null = null;
    let urlImatge = "";
    const crides = simulaInstagram(async (url, init) => {
      if (url.pathname.endsWith("/me") || url.pathname === "/refresh_access_token") return perfilCorrecte(url);
      if (url.pathname.endsWith("/17841400000000001/media")) {
        const cos = JSON.parse(String(init?.body));
        urlImatge = cos.image_url;
        // Instagram descarrega la imatge des de l'adreça temporal (sense sessió).
        const r = await client().peticio(new URL(cos.image_url).pathname);
        if (r.ok) imatgeDescarregada = new Uint8Array(await r.arrayBuffer());
        return { cos: { id: "contenidor-1" } };
      }
      if (url.pathname.endsWith("/contenidor-1")) return { cos: { status_code: "FINISHED", id: "contenidor-1" } };
      if (url.pathname.endsWith("/media_publish")) return { cos: { id: "media-1" } };
      if (url.pathname.endsWith("/media-1")) return { cos: { permalink: "https://www.instagram.com/p/PROVA/", id: "media-1" } };
      return { status: 404, cos: { error: { message: "no simulat", code: 100 } } };
    });
    await responsable.json(`${base}/compte`, { method: "PUT", json: { testimoni: TESTIMONI } });
    const fitxerId = await material();
    const { cos: { publicacio } } = await difusio.json(`${base}/publicacions`, { method: "POST", json: { fitxer_id: fitxerId, titol: "Taller", peu: "Text de prova" } });

    // Sense confirmació explícita no es publica.
    expect((await difusio.json(`${base}/publicacions/${publicacio.id}/publica`, { method: "POST", json: { versio: 1 } })).status).toBe(400);

    const r = await difusio.json(`${base}/publicacions/${publicacio.id}/publica`, { method: "POST", json: { versio: 1, confirmo: true } });
    expect(r.status).toBe(200);
    expect(r.cos.publicacio).toMatchObject({ estat: "publicada", ig_media_id: "media-1", enllac: "https://www.instagram.com/p/PROVA/" });
    expect(imatgeDescarregada).toEqual(JPEG);
    expect(urlImatge).toMatch(/^http:\/\/localhost\/api\/public\/instagram\/imatges\/[A-Za-z0-9_-]+\.jpg$/);
    const publicar = crides.find((c) => c.url.pathname.endsWith("/media"))!;
    expect(JSON.parse(String(publicar.init?.body))).toMatchObject({ caption: "Text de prova" });
    expect(new Headers(publicar.init?.headers).get("Authorization")).toBe(`Bearer ${TESTIMONI_RENOVAT}`);

    // L'adreça temporal es tanca en acabar, i no es pot publicar dues vegades.
    expect((await client().peticio(new URL(urlImatge).pathname)).status).toBe(404);
    expect((await difusio.json(`${base}/publicacions/${publicacio.id}/publica`, { method: "POST", json: { versio: r.cos.publicacio.versio, confirmo: true } })).status).toBe(409);
  });

  it("si Instagram falla, la publicació queda amb l'error i es pot tornar a provar o marcar com a publicada a mà", async () => {
    const { responsable, difusio, base, material } = await escenari();
    simulaInstagram(perfilCorrecte);
    await responsable.json(`${base}/compte`, { method: "PUT", json: { testimoni: TESTIMONI } });
    vi.restoreAllMocks();
    simulaInstagram(() => ({ status: 400, cos: { error: { message: "Error validating access token", code: 190 } } }));
    const fitxerId = await material();
    const { cos: { publicacio } } = await difusio.json(`${base}/publicacions`, { method: "POST", json: { fitxer_id: fitxerId, titol: "Taller", peu: "Text" } });

    const r = await difusio.json(`${base}/publicacions/${publicacio.id}/publica`, { method: "POST", json: { versio: 1, confirmo: true } });
    expect(r.status).toBe(200);
    expect(r.cos.publicacio.estat).toBe("error");
    expect(r.cos.publicacio.error_missatge).toMatch(/tornar a connectar/);

    const manual = await difusio.json(`${base}/publicacions/${publicacio.id}/manual`, {
      method: "POST", json: { versio: r.cos.publicacio.versio, enllac: "https://www.instagram.com/p/MANUAL/" },
    });
    expect(manual.cos.publicacio).toMatchObject({ estat: "publicada_manualment", enllac: "https://www.instagram.com/p/MANUAL/", error_missatge: null });
    expect((await difusio.json(`${base}/publicacions/${publicacio.id}/manual`, { method: "POST", json: { versio: 1, enllac: "https://exemple.invalid/x" } })).status).toBe(400);
  });

  it("no deixa veure ni publicar publicacions d'un altre casal", async () => {
    const { difusio, base, material } = await escenari();
    const fitxerId = await material();
    const { cos: { publicacio } } = await difusio.json(`${base}/publicacions`, { method: "POST", json: { fitxer_id: fitxerId, titol: "Taller", peu: "" } });
    const altre = await crearEscenari();
    const aliena = await clientAutenticat("difusio_casal", altre.casal.id);
    const baseAltre = `/api/gestio/casals/${altre.casal.id}/instagram`;
    expect((await aliena.json(`${baseAltre}/publicacions/${publicacio.id}`)).status).toBe(404);
    expect((await aliena.json(`${baseAltre}/publicacions`, { method: "POST", json: { fitxer_id: fitxerId, titol: "T", peu: "" } })).status).toBe(404);
    expect((await aliena.json(`${base}/publicacions`)).status).toBe(403);
  });
});
