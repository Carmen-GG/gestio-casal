import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Entorn } from "../app";
import { errors } from "../http/errors";
import { resumSha256, testimoniAleatori } from "../lib/cripto";
import { UsuariAutenticat } from "./permisos";

/**
 * Sessions del panell de gestió.
 * - Galeta `__Host-` (HttpOnly, Secure, SameSite=Strict, Path=/): no accessible des de JavaScript
 *   ni enviada des d'altres llocs.
 * - A la base de dades només se'n desa el resum SHA-256.
 * - Caducitat absoluta de 8 hores i per inactivitat de 60 minuts.
 */
export const NOM_GALETA = "casal_sessio";
export const DURADA_SESSIO_MS = 8 * 60 * 60 * 1000;
export const INACTIVITAT_MAXIMA_MS = 60 * 60 * 1000;
const INTERVAL_ACTUALITZACIO_MS = 5 * 60 * 1000;

export async function iniciarSessio(c: Context<Entorn>, usuariId: string): Promise<void> {
  const ara = c.get("rellotge").ara();
  const valor = testimoniAleatori();
  await c.get("repos").sessions.crearSessio(
    await resumSha256(valor),
    usuariId,
    ara.toISOString(),
    new Date(ara.getTime() + DURADA_SESSIO_MS).toISOString(),
  );
  setCookie(c, NOM_GALETA, valor, {
    prefix: "host",
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: DURADA_SESSIO_MS / 1000,
  });
}

export async function tancarSessio(c: Context<Entorn>): Promise<void> {
  const valor = getCookie(c, NOM_GALETA, "host");
  if (valor) {
    await c.get("repos").sessions.revocarSessio(await resumSha256(valor), c.get("rellotge").ara().toISOString());
  }
  deleteCookie(c, NOM_GALETA, { prefix: "host", path: "/", secure: true });
}

async function usuariDeSessio(c: Context<Entorn>): Promise<UsuariAutenticat | null> {
  const valor = getCookie(c, NOM_GALETA, "host");
  if (!valor || valor.length > 100) return null;
  const repos = c.get("repos");
  const ara = c.get("rellotge").ara();
  const resum = await resumSha256(valor);
  const sessio = await repos.sessions.sessioVigent(resum, ara.toISOString());
  if (!sessio) return null;

  const inactivitat = ara.getTime() - Date.parse(sessio.darrer_us_el);
  if (inactivitat > INACTIVITAT_MAXIMA_MS) {
    await repos.sessions.revocarSessio(resum, ara.toISOString());
    return null;
  }
  if (inactivitat > INTERVAL_ACTUALITZACIO_MS) await repos.sessions.tocarSessio(resum, ara.toISOString());

  const usuari = await repos.usuaris.perId(sessio.usuari_id);
  if (!usuari || !usuari.actiu) return null;
  return new UsuariAutenticat(usuari, await repos.usuaris.permisos(usuari.id));
}

/** Exigeix una sessió vàlida. Es comprova al servidor a cada petició. */
export const requereixSessio: MiddlewareHandler<Entorn> = async (c, next) => {
  // Si un altre grup de rutes ja ha validat la sessió en aquesta petició, no cal repetir-ho.
  if (c.get("usuari")) return next();
  const usuari = await usuariDeSessio(c);
  if (!usuari) throw errors.noAutenticat();
  c.set("usuari", usuari);
  await next();
};
