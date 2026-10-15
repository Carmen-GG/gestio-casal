import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { comprovaContrasenya, resumContrasenya } from "../../worker/auth/contrasenya";
import { client, clientAutenticat } from "../setup/sessio";

const NOVA = "una frase prou llarga per entrar";

describe("contrasenya del panell", () => {
  it("el resum no conté la contrasenya i només valida la correcta", async () => {
    const r = await resumContrasenya(NOVA);
    expect(r).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(r).not.toContain(NOVA);
    expect(await resumContrasenya(NOVA)).not.toBe(r); // sal diferent cada vegada
    expect(await comprovaContrasenya(NOVA, r)).toBe(true);
    expect(await comprovaContrasenya("una altra frase qualsevol", r)).toBe(false);
    expect(await comprovaContrasenya(NOVA, null)).toBe(false);
  });

  it("es fixa des del panell i després permet entrar amb el correu, sense caducar", async () => {
    const c = await clientAutenticat("admin_central", null);
    expect((await c.json("/api/auth/jo")).cos.te_contrasenya).toBe(false);

    expect((await c.json("/api/auth/contrasenya", { method: "POST", json: { nova: "curta" } })).status).toBe(400);
    expect((await c.json("/api/auth/contrasenya", { method: "POST", json: { nova: NOVA } })).status).toBe(200);
    expect((await c.json("/api/auth/jo")).cos.te_contrasenya).toBe(true);
    const fila = await env.DB.prepare("SELECT contrasenya_resum FROM usuaris WHERE id = ?").bind(c.usuari.id).first<{ contrasenya_resum: string }>();
    expect(fila!.contrasenya_resum).not.toContain(NOVA);

    // Per canviar-la cal l'actual.
    const senseActual = await c.json("/api/auth/contrasenya", { method: "POST", json: { nova: "una altra frase llarga" } });
    expect(senseActual.status).toBe(400);
    expect(senseActual.cos.error.detalls).toHaveProperty("actual");

    const nou = client(undefined, { LIMIT_ENTRADA: undefined });
    const dolenta = await nou.json("/api/auth/entrar-contrasenya", { method: "POST", json: { email: c.usuari.email, contrasenya: "no és aquesta" } });
    expect(dolenta.status).toBe(401);
    expect(dolenta.cos.error.codi).toBe("credencials_no_valides");
    const desconegut = await nou.json("/api/auth/entrar-contrasenya", { method: "POST", json: { email: "ningu@exemple.invalid", contrasenya: NOVA } });
    expect(desconegut.status).toBe(401);
    expect(desconegut.cos.error.missatge).toBe(dolenta.cos.error.missatge); // no revela si el correu existeix

    // Dues vegades seguides: la contrasenya no és d'un sol ús. El correu no distingeix majúscules.
    for (const email of [c.usuari.email, c.usuari.email.toUpperCase()]) {
      const altre = client(undefined, { LIMIT_ENTRADA: undefined });
      expect((await altre.json("/api/auth/entrar-contrasenya", { method: "POST", json: { email, contrasenya: NOVA } })).status).toBe(200);
      expect((await altre.json("/api/auth/jo")).status).toBe(200);
    }
  });

  it("una persona desactivada no pot entrar encara que la contrasenya sigui correcta", async () => {
    const c = await clientAutenticat("admin_central", null);
    await c.json("/api/auth/contrasenya", { method: "POST", json: { nova: NOVA } });
    await env.DB.prepare("UPDATE usuaris SET actiu = 0 WHERE id = ?").bind(c.usuari.id).run();
    const r = await client(undefined, { LIMIT_ENTRADA: undefined })
      .json("/api/auth/entrar-contrasenya", { method: "POST", json: { email: c.usuari.email, contrasenya: NOVA } });
    expect(r.status).toBe(401);
  });

  it("limita els intents seguits", async () => {
    const limitador = { limit: async () => ({ success: false }) } as unknown as RateLimit;
    const r = await client(undefined, { LIMIT_ENTRADA: limitador })
      .json("/api/auth/entrar-contrasenya", { method: "POST", json: { email: "algu@exemple.invalid", contrasenya: "x" } });
    expect(r.status).toBe(429);
  });

  it("canviar la contrasenya exigeix sessió", async () => {
    expect((await client().json("/api/auth/contrasenya", { method: "POST", json: { nova: NOVA } })).status).toBe(401);
  });
});
