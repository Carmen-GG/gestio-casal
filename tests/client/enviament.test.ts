import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorClientApi } from "../../src/services/api";
import { serveiPublic } from "../../src/services/public";

afterEach(() => vi.unstubAllGlobals());

describe("client: enviament de sol·licituds", () => {
  it("un error de connexió és un error, mai una confirmació", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const e = await serveiPublic.enviarSollicitud("CAN-BOADA", "x", {}, "clau-de-prova-0001").catch((x) => x);
    expect(e).toBeInstanceOf(ErrorClientApi);
    expect(e.codi).toBe("sense_connexio");
  });

  it("envia la clau d'idempotència i la conserva en el reintent", async () => {
    const claus: (string | null)[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      claus.push(new Headers(init.headers).get("Idempotency-Key"));
      return new Response(JSON.stringify({ error: { codi: "error_intern", missatge: "Error" } }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }));
    for (let i = 0; i < 2; i++) {
      await expect(serveiPublic.enviarSollicitud("CAN-BOADA", "x", {}, "clau-de-prova-0001")).rejects.toBeInstanceOf(ErrorClientApi);
    }
    expect(claus).toEqual(["clau-de-prova-0001", "clau-de-prova-0001"]);
  });

  it("una resposta que no és JSON no es tracta com a èxit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } })));
    await expect(serveiPublic.enviarSollicitud("CAN-BOADA", "x", {}, "clau-de-prova-0001")).rejects.toMatchObject({ codi: "resposta_invalida" });
  });
});
