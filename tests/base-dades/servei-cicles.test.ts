import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ServeiCicles } from "../../worker/services/cicles";
import { ErrorAplicacio } from "../../worker/http/errors";
import { ARA, crearEscenari, rellotgeFix } from "../setup/dades";

async function errorDe(promesa: Promise<unknown>): Promise<ErrorAplicacio> {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof ErrorAplicacio) return e;
    throw e;
  }
  throw new Error("s'esperava un error");
}

describe("ServeiCicles.canviarEstat", () => {
  it("canvia l'estat i deixa historial i auditoria", async () => {
    const { repos, casal, cicle } = await crearEscenari();
    const servei = new ServeiCicles(repos, rellotgeFix(ARA));
    const resultat = await servei.canviarEstat(casal.id, cicle.id, "inscripcions_obertes", { usuariId: null });
    expect(resultat.estat).toBe("inscripcions_obertes");
    expect(resultat.versio).toBe(cicle.versio + 1);

    const historial = await repos.historial.llistar("cicle", cicle.id);
    expect(historial).toHaveLength(1);
    expect(historial[0]!.canvis).toEqual({ estat: { abans: "preparacio", despres: "inscripcions_obertes" } });
    const auditoria = await repos.auditoria.llistar({ entitat: "cicle", entitatId: cicle.id });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.tipus_operacio).toBe("cicle.canvi_estat");
  });

  it("rebutja transicions no permeses", async () => {
    const { repos, casal, cicle } = await crearEscenari();
    const err = await errorDe(new ServeiCicles(repos, rellotgeFix(ARA)).canviarEstat(casal.id, cicle.id, "adjudicat", { usuariId: null }));
    expect(err.codi).toBe("transicio_no_permesa");
  });

  it("exigeix confirmació i motiu per reobrir un cicle tancat", async () => {
    const { repos, casal, cicle } = await crearEscenari({ estatCicle: "adjudicacio_en_proces" });
    const servei = new ServeiCicles(repos, rellotgeFix(ARA));
    expect((await errorDe(servei.canviarEstat(casal.id, cicle.id, "inscripcions_obertes", { usuariId: null }))).codi)
      .toBe("confirmacio_requerida");
    expect((await errorDe(servei.canviarEstat(casal.id, cicle.id, "inscripcions_obertes", { usuariId: null, confirmacio: true, motiu: "  " }))).codi)
      .toBe("confirmacio_requerida");
    const reobert = await servei.canviarEstat(casal.id, cicle.id, "inscripcions_obertes", {
      usuariId: null, confirmacio: true, motiu: "Ampliació de termini acordada",
    });
    expect(reobert.estat).toBe("inscripcions_obertes");
    const [entrada] = await repos.historial.llistar("cicle", cicle.id);
    expect(entrada!.motiu).toBe("Ampliació de termini acordada");
  });

  it("no troba cicles d'un altre casal (accés horitzontal)", async () => {
    const a = await crearEscenari();
    const b = await crearEscenari();
    const err = await errorDe(new ServeiCicles(a.repos, rellotgeFix(ARA)).canviarEstat(b.casal.id, a.cicle.id, "preparacio", { usuariId: null }));
    expect(err.status).toBe(404);
  });

  it("en un conflicte de concurrència no canvia res ni escriu historial", async () => {
    const { repos, casal, cicle } = await crearEscenari();
    // Una altra persona modifica el cicle després que el servei l'hagi llegit.
    const reposConcurrent = {
      ...repos,
      cicles: {
        ...repos.cicles,
        perId: async (cId: string, id: string) => {
          const llegit = await repos.cicles.perId(cId, id);
          await env.DB.prepare("UPDATE cicles SET versio = versio + 1 WHERE id = ?").bind(id).run();
          return llegit;
        },
        operacioCanviEstat: repos.cicles.operacioCanviEstat.bind(repos.cicles),
      },
    };
    const err = await errorDe(new ServeiCicles(reposConcurrent, rellotgeFix(ARA)).canviarEstat(casal.id, cicle.id, "inscripcions_obertes", { usuariId: null }));
    expect(err.codi).toBe("conflicte_concurrencia");
    expect((await repos.cicles.perId(casal.id, cicle.id))!.estat).toBe("preparacio");
    expect(await repos.historial.llistar("cicle", cicle.id)).toHaveLength(0);
    expect(await repos.auditoria.llistar({ entitat: "cicle", entitatId: cicle.id })).toHaveLength(0);
  });
});
