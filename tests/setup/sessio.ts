import { env } from "cloudflare:test";
import { crearApp } from "../../worker/app";
import { repositorisD1 } from "../../worker/repositories/d1";
import { resumSha256, testimoniAleatori } from "../../worker/lib/cripto";
import type { Rellotge } from "../../worker/lib/rellotge";
import { ARA, rellotgeFix } from "./dades";

/** Rellotge que es pot avançar dins d'una prova. */
export function rellotgeMobil(inici = ARA) {
  let t = Date.parse(inici);
  const r: Rellotge & { avanca: (ms: number) => void } = { ara: () => new Date(t), avanca: (ms) => { t += ms; } };
  return r;
}

export function client(rellotge: Rellotge = rellotgeFix(ARA), entorn: Partial<typeof env> = {}) {
  const app = crearApp({ rellotge });
  let galeta = "";
  const peticio = async (ruta: string, init: RequestInit & { json?: unknown } = {}) => {
    const { json, ...resta } = init;
    const headers = new Headers(resta.headers);
    if (galeta) headers.set("Cookie", galeta);
    if (json !== undefined) headers.set("Content-Type", "application/json");
    const r = await app.request(
      `http://localhost${ruta}`,
      { ...resta, headers, body: json !== undefined ? JSON.stringify(json) : resta.body },
      { ...env, ...entorn },
    );
    const setCookie = r.headers.get("Set-Cookie");
    if (setCookie) {
      const [parell] = setCookie.split(";");
      galeta = parell!.endsWith("=") ? "" : parell!;
    }
    return r;
  };
  return {
    peticio,
    get galeta() { return galeta; },
    set galeta(v: string) { galeta = v; },
    json: async <T = any>(ruta: string, init: RequestInit & { json?: unknown } = {}) => {
      const r = await peticio(ruta, init);
      return { status: r.status, cos: (await r.json()) as T };
    },
  };
}

let n = 0;
/** Crea un usuari fictici amb un rol i retorna un testimoni d'accés vàlid. */
export async function usuariAmbRol(rol: string, casalId: string | null, opcions: { caducaEl?: string } = {}) {
  const repos = repositorisD1(env.DB, rellotgeFix(ARA));
  const usuari = await repos.usuaris.crear({ email: `persona${n++}-${crypto.randomUUID()}@exemple.invalid`, nom_visible: "Persona de prova", proveidor_identitat: "dev" });
  await env.DB.prepare("INSERT INTO assignacions_rols (id, usuari_id, rol_codi, casal_id, atorgat_el) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), usuari.id, rol, casalId, ARA).run();
  const testimoni = testimoniAleatori();
  await repos.sessions.crearTestimoni(await resumSha256(testimoni), usuari.id, ARA, opcions.caducaEl ?? "2026-11-01T11:00:00.000Z");
  return { usuari, testimoni };
}

export async function clientAutenticat(rol: string, casalId: string | null, rellotge?: Rellotge) {
  const { usuari, testimoni } = await usuariAmbRol(rol, casalId);
  const c = client(rellotge);
  const r = await c.peticio("/api/auth/entrar", { method: "POST", json: { testimoni } });
  if (r.status !== 200) throw new Error(`no s'ha pogut iniciar sessió: ${r.status}`);
  return Object.assign(c, { usuari });
}
