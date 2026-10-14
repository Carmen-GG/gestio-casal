import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CAMPS_PERSONALS } from "../../shared/domain/formulari";
import { ARA, crearEscenari } from "../setup/dades";

async function nova(e: Awaited<ReturnType<typeof crearEscenari>>, activitats: string[], rebuda_el = ARA) {
  return e.repos.sollicituds.registrarPublica({
    sollicitud_id: crypto.randomUUID(), participant_id: crypto.randomUUID(), casal_id: e.casal.id, cicle_id: e.cicle.id,
    codi_confirmacio: crypto.randomUUID(), clau_idempotencia: crypto.randomUUID(), resum_peticio: "r", privacitat_resum: "p",
    rebuda_el, clau_ordenacio: "ficticia persona",
    dades: { ...Object.fromEntries(CAMPS_PERSONALS.map((c) => [c, null])), nom: "Persona", cognom1: "Fictícia" } as never,
    preferencies: activitats.map((activitat_id, i) => ({ activitat_id, ordre: i + 1 })), id_peticio: null,
  });
}

const compta = async (taula: string, casalId: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${taula} WHERE casal_id = ?`).bind(casalId).first<{ n: number }>())!.n;

describe("repositori de sol·licituds: atomicitat", () => {
  it("si una activitat no és activa no desa res (ni participant ni auditoria)", async () => {
    const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    expect(await nova(e, [e.activa.id, e.esborrany.id])).toEqual({ tipus: "activitat_no_disponible" });
    expect(await compta("participants", e.casal.id)).toBe(0);
    expect(await compta("sollicituds", e.casal.id)).toBe(0);
    expect(await compta("registres_auditoria", e.casal.id)).toBe(0);
  });

  it("comprova dins de la transacció que el cicle accepta sol·licituds", async () => {
    const e = await crearEscenari({ estatCicle: "inscripcions_tancades" });
    expect(await nova(e, [e.activa.id])).toEqual({ tipus: "cicle_no_accepta" });
    const o = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    expect(await nova(o, [o.activa.id], "2027-01-01T00:00:00.000Z")).toEqual({ tipus: "cicle_no_accepta" });
    expect(await compta("participants", e.casal.id) + await compta("participants", o.casal.id)).toBe(0);
  });

  it("les sol·licituds no es poden esborrar ni canviar la constància", async () => {
    const e = await crearEscenari({ estatCicle: "inscripcions_obertes" });
    const r = await nova(e, [e.activa.id]);
    expect(r.tipus).toBe("registrada");
    const id = r.tipus === "registrada" ? r.sollicitud.id : "";
    await expect(env.DB.prepare("DELETE FROM sollicituds WHERE id = ?").bind(id).run()).rejects.toThrow();
    await expect(env.DB.prepare("UPDATE sollicituds SET privacitat_resum = 'x' WHERE id = ?").bind(id).run()).rejects.toThrow();
  });
});
