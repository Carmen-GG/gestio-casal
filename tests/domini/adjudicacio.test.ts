import { describe, expect, it } from "vitest";
import { adjudica, ordenaSollicituds, PARAMETRES_INICIALS, type ParametresAdjudicacio, type SollicitudMotor } from "../../shared/domain/adjudicacio";
import { clauOrdenacioPersona } from "../../shared/domain/ordenacio";

/** Sol·licitud fictícia: el número fixa l'ordre d'arribada. */
const s = (numero: number, cognom: string, prefs: string[], participant = `p${numero}`): SollicitudMotor => ({
  id: `s${numero}`, participant_id: participant, numero,
  rebuda_el: `2026-10-0${Math.min(numero, 9)}T10:00:${String(numero).padStart(2, "0")}.000Z`,
  clau_ordenacio: clauOrdenacioPersona({ cognom1: cognom, nom: "X" }),
  preferencies: prefs.map((activitat_id, i) => ({ activitat_id, ordre: i + 1 })),
});
const act = (id: string, capacitat: number, disponible = true) => ({ id, capacitat, disponible });
const params = (canvis: Partial<ParametresAdjudicacio> = {}): ParametresAdjudicacio => ({ ...PARAMETRES_INICIALS, ...canvis });

/** Resultat compacte: "sollicitud/activitat" → resultat (amb la posició d'espera). */
const mapa = (r: ReturnType<typeof adjudica>) => Object.fromEntries(r.resultats.map((x) =>
  [`${x.sollicitud_id}/${x.activitat_id}`, x.resultat === "llista_espera" ? `espera ${x.posicio_espera}` : x.resultat === "no_adjudicada" ? `no (${x.motiu})` : "admesa"]));

describe("motor d'adjudicació", () => {
  const sollicituds = [s(1, "Zapata", ["A", "B"]), s(2, "Àvila", ["A", "B"]), s(3, "Bosch", ["B", "A"])];

  it("per rondes: la 1a preferència de tothom va abans que la 2a", () => {
    const r = adjudica({ sollicituds, activitats: [act("A", 1), act("B", 1)], parametres: params() });
    expect(mapa(r)).toEqual({
      "s1/A": "admesa", "s1/B": "espera 1",
      "s2/A": "espera 1", "s2/B": "espera 2",
      "s3/B": "admesa", "s3/A": "espera 2",
    });
    expect(r.resum.activitats.A).toMatchObject({ capacitat: 1, sollicituds: 3, admeses: 1, llista_espera: 2 });
    expect(r.resum.sollicituds_sense_placa).toBe(1);
  });

  it("per persona: cada persona obté totes les preferències que pot abans de la següent", () => {
    const r = adjudica({ sollicituds, activitats: [act("A", 1), act("B", 1)], parametres: params({ metode: "per_persona" }) });
    expect(mapa(r)).toMatchObject({ "s1/A": "admesa", "s1/B": "admesa", "s3/B": "espera 2", "s3/A": "espera 2" });
  });

  it("aplica el màxim d'activitats per persona, també entre sol·licituds de la mateixa persona", () => {
    const r = adjudica({
      sollicituds: [s(1, "Zapata", ["A", "B"]), s(2, "Zapata", ["C"], "p1")],
      activitats: [act("A", 5), act("B", 5), act("C", 5)], parametres: params({ maxim_activitats_per_persona: 1 }),
    });
    expect(mapa(r)).toEqual({ "s1/A": "admesa", "s1/B": "no (maxim_activitats)", "s2/C": "no (maxim_activitats)" });
  });

  it("sense llista d'espera, qui no hi cap queda sense plaça", () => {
    const r = adjudica({ sollicituds, activitats: [act("A", 1), act("B", 5)], parametres: params({ llista_espera: false }) });
    expect(mapa(r)["s2/A"]).toBe("no (sense_llista_espera)");
    expect(mapa(r)["s2/B"]).toBe("admesa");
  });

  it("no adjudica activitats no disponibles ni parelles excloses", () => {
    const r = adjudica({
      sollicituds, activitats: [act("A", 5, false), act("B", 5)], parametres: params(), excloses: new Set(["s3:B"]),
    });
    expect(mapa(r)).toMatchObject({ "s1/A": "no (activitat_no_disponible)", "s3/B": "no (exclosa)", "s1/B": "admesa" });
  });

  it("la continuïtat dona prioritat dins de l'activitat només si està activada", () => {
    const continuitat = new Set(["s2:A"]);
    const sense = adjudica({ sollicituds, activitats: [act("A", 1), act("B", 5)], parametres: params(), continuitat });
    expect(mapa(sense)["s2/A"]).toBe("espera 1");
    const amb = adjudica({ sollicituds, activitats: [act("A", 1), act("B", 5)], parametres: params({ prioritat_continuitat: true }), continuitat });
    expect(mapa(amb)).toMatchObject({ "s2/A": "admesa", "s1/A": "espera 1" });
    expect(amb.resultats.find((x) => x.sollicitud_id === "s2" && x.activitat_id === "A")!.per_continuitat).toBe(true);
  });

  it("ordena per lletra sortejada començant per la lletra i tornant a l'A", () => {
    const ordre = ordenaSollicituds(sollicituds, "lletra", { lletra: "b" }).map((x) => x.id);
    expect(ordre).toEqual(["s3", "s1", "s2"]); // Bosch, Zapata, Àvila
    expect(() => ordenaSollicituds(sollicituds, "lletra", { lletra: "" })).toThrow("lletra_obligatoria");
  });

  it("el sorteig amb llavor és reproduïble i depèn de la llavor", () => {
    const molts = Array.from({ length: 30 }, (_, i) => s(i + 1, `Cognom${i}`, ["A"]));
    const a = ordenaSollicituds(molts, "aleatori", { llavor: "llavor-1" }).map((x) => x.id);
    expect(ordenaSollicituds(molts, "aleatori", { llavor: "llavor-1" }).map((x) => x.id)).toEqual(a);
    expect(ordenaSollicituds(molts, "aleatori", { llavor: "llavor-2" }).map((x) => x.id)).not.toEqual(a);
    expect([...a].sort()).toEqual(molts.map((x) => x.id).sort());
  });

  it("mai adjudica més places que la capacitat", () => {
    const molts = Array.from({ length: 40 }, (_, i) => s(i + 1, `C${i}`, ["A", "B", "C"].slice(0, 1 + (i % 3))));
    const r = adjudica({ sollicituds: molts, activitats: [act("A", 7), act("B", 3), act("C", 0)], parametres: params() });
    for (const [id, cap] of [["A", 7], ["B", 3], ["C", 0]] as const) {
      expect(r.resultats.filter((x) => x.activitat_id === id && x.resultat === "admesa").length).toBeLessThanOrEqual(cap);
      const posicions = r.resultats.filter((x) => x.activitat_id === id && x.resultat === "llista_espera").map((x) => x.posicio_espera);
      // Les posicions de la llista d'espera són 1, 2, 3... sense salts.
      expect([...posicions].sort((x, y) => x! - y!)).toEqual(posicions.map((_, i) => i + 1));
    }
    expect(r.resultats).toHaveLength(molts.reduce((n, x) => n + x.preferencies.length, 0));
  });
});
