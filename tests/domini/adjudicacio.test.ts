import { describe, expect, it } from "vitest";
import {
  activitatsAmbSorteig, adjudica, normalitzaParametres, ordenaSollicituds, PARAMETRES_INICIALS,
  type ParametresAdjudicacio, type Sorteig, type SollicitudMotor,
} from "../../shared/domain/adjudicacio";
import { clauOrdenacioPersona } from "../../shared/domain/ordenacio";

/** Regles generals (un sol ordre per al cicle), com abans del sorteig per activitat. */
const GENERALS: ParametresAdjudicacio = { ...PARAMETRES_INICIALS, criteri_ordre: "inscripcio", prioritat_espera_anterior: false };

/** Sol·licitud fictícia: el número fixa l'ordre d'arribada. */
const s = (numero: number, cognom: string, prefs: string[], participant = `p${numero}`): SollicitudMotor => ({
  id: `s${numero}`, participant_id: participant, numero,
  rebuda_el: `2026-10-0${Math.min(numero, 9)}T10:00:${String(numero).padStart(2, "0")}.000Z`,
  clau_ordenacio: clauOrdenacioPersona({ cognom1: cognom, nom: "X" }),
  preferencies: prefs.map((activitat_id, i) => ({ activitat_id, ordre: i + 1 })),
});
const act = (id: string, capacitat: number, disponible = true) => ({ id, capacitat, disponible });
const params = (canvis: Partial<ParametresAdjudicacio> = {}): ParametresAdjudicacio => ({ ...GENERALS, ...canvis });

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

describe("regla del casal: espera anterior, preferència i sorteig per activitat", () => {
  const regla = (canvis: Partial<ParametresAdjudicacio> = {}): ParametresAdjudicacio => ({ ...PARAMETRES_INICIALS, ...canvis });
  const sortejos = (m: Record<string, Sorteig>) => new Map(Object.entries(m));
  const ordreAdmeses = (r: ReturnType<typeof adjudica>, activitat: string) => r.resultats
    .filter((x) => x.activitat_id === activitat && x.resultat !== "no_adjudicada")
    .sort((a, b) => (a.resultat === b.resultat ? (a.posicio_espera ?? 0) - (b.posicio_espera ?? 0) : a.resultat === "admesa" ? -1 : 1))
    .map((x) => `${x.sollicitud_id}:${x.resultat === "admesa" ? "A" : `E${x.posicio_espera}`}`);

  it("els valors inicials són la regla del casal", () => {
    expect(PARAMETRES_INICIALS).toMatchObject({
      criteri_ordre: "sorteig_activitat", metode: "per_rondes", prioritat_espera_anterior: true, preferencia_maxima_espera_anterior: 2,
    });
  });

  it("sorteig de número: es comença pel número sortejat i es torna a començar per l'1", () => {
    const cinc = [1, 2, 3, 4, 5].map((n) => s(n, `C${n}`, ["A"]));
    const r = adjudica({ sollicituds: cinc, activitats: [act("A", 2)], parametres: regla(), sortejos: sortejos({ A: { tipus: "numero", valor: "4" } }) });
    expect(ordreAdmeses(r, "A")).toEqual(["s4:A", "s5:A", "s1:E1", "s2:E2", "s3:E3"]);
  });

  it("cada activitat té el seu sorteig", () => {
    const tres = [1, 2, 3].map((n) => s(n, `C${n}`, n === 3 ? ["B", "A"] : ["A", "B"]));
    const r = adjudica({
      sollicituds: [...tres, s(4, "D", ["B"])], activitats: [act("A", 1), act("B", 1)], parametres: regla(),
      sortejos: sortejos({ A: { tipus: "numero", valor: "2" }, B: { tipus: "numero", valor: "4" } }),
    });
    expect(ordreAdmeses(r, "A")).toEqual(["s2:A", "s1:E1", "s3:E2"]);
    // A B, la 1a preferència (s3, s4) passa davant de la 2a (s1, s2); entre s3 i s4, el sorteig (4) dona la plaça a s4.
    expect(ordreAdmeses(r, "B")).toEqual(["s4:A", "s3:E1", "s1:E2", "s2:E3"]);
  });

  it("sorteig de lletra: per la inicial del primer cognom, tornant a començar per l'A", () => {
    const persones = [s(1, "Abril", ["A"]), s(2, "Martí", ["A"]), s(3, "Pons", ["A"]), s(4, "Riera", ["A"])];
    const r = adjudica({
      sollicituds: persones, activitats: [act("A", 2)], parametres: regla({ tipus_sorteig: "lletra" }),
      sortejos: sortejos({ A: { tipus: "lletra", valor: "P" } }),
    });
    expect(ordreAdmeses(r, "A")).toEqual(["s3:A", "s4:A", "s1:E1", "s2:E2"]);
  });

  it("numeració aleatòria: s'usa el número de sorteig de cada sol·licitud", () => {
    const amb = [s(1, "A", ["A"]), s(2, "B", ["A"]), s(3, "C", ["A"])].map((x, i) => ({ ...x, numero_sorteig: [3, 1, 2][i] }));
    const r = adjudica({
      sollicituds: amb, activitats: [act("A", 1)], parametres: regla({ numeracio_sorteig: "aleatoria" }),
      sortejos: sortejos({ A: { tipus: "numero", valor: "2" } }),
    });
    // Números: s1=3, s2=1, s3=2. Sorteig 2 → s3 (2), s1 (3), s2 (1).
    expect(ordreAdmeses(r, "A")).toEqual(["s3:A", "s1:E1", "s2:E2"]);
  });

  it("la llista d'espera anterior té prioritat absoluta, encara que sigui la 2a preferència", () => {
    const persones = [s(1, "A", ["A"]), s(2, "B", ["A"]), s(3, "C", ["B", "A"]), s(4, "D", ["A"])];
    const r = adjudica({
      sollicituds: persones, activitats: [act("A", 1), act("B", 5)], parametres: regla(),
      sortejos: sortejos({ A: { tipus: "numero", valor: "1" } }), espera_anterior: new Set(["s3:A", "s4:A"]),
    });
    // s3 i s4 tenen prioritat a A i passen davant de tothom. Entre elles, també primer la preferència:
    // s4 (1a) davant de s3 (2a), encara que el sorteig (1) afavoreixi s3. La resta, darrere.
    expect(ordreAdmeses(r, "A")).toEqual(["s4:A", "s3:E1", "s1:E2", "s2:E3"]);
    expect(r.resultats.find((x) => x.sollicitud_id === "s3" && x.activitat_id === "A")).toMatchObject({ per_espera_anterior: true, posicio_espera: 1 });
    expect(r.resum.activitats.A).toMatchObject({ per_espera_anterior: 2, admeses: 1 });
    // Sense la regla activada, la llista anterior no compta.
    const sense = adjudica({
      sollicituds: persones, activitats: [act("A", 1), act("B", 5)], parametres: regla({ prioritat_espera_anterior: false }),
      sortejos: sortejos({ A: { tipus: "numero", valor: "1" } }), espera_anterior: new Set(["s3:A", "s4:A"]),
    });
    expect(ordreAdmeses(sense, "A")[0]).toBe("s1:A");
  });

  it("respecta el màxim d'activitats per persona també amb prioritat", () => {
    const persones = [s(1, "A", ["B", "A"]), s(2, "B", ["A"])];
    const r = adjudica({
      sollicituds: persones, activitats: [act("A", 1), act("B", 1)], parametres: regla({ maxim_activitats_per_persona: 1 }),
      espera_anterior: new Set(["s1:A"]),
    });
    // s1 té prioritat a A (2a preferència): l'obté, i ja no pot tenir B.
    expect(mapa(r)).toEqual({ "s1/B": "no (maxim_activitats)", "s1/A": "admesa", "s2/A": "espera 1" });
  });

  it("indica quines activitats necessiten sorteig (més sol·licituds que places)", () => {
    const persones = [s(1, "A", ["A", "B"]), s(2, "B", ["A"]), s(3, "C", ["A", "C"])];
    expect(activitatsAmbSorteig({ sollicituds: persones, activitats: [act("A", 2), act("B", 1), act("C", 0, false)] })).toEqual(["A"]);
    expect(activitatsAmbSorteig({ sollicituds: persones, activitats: [act("A", 2)], excloses: new Set(["s3:A"]) })).toEqual([]);
  });

  it("el sorteig per activitat exigeix el mètode per rondes", () => {
    expect(() => adjudica({ sollicituds: [s(1, "A", ["A"])], activitats: [act("A", 1)], parametres: regla({ metode: "per_persona" }) }))
      .toThrow("sorteig_activitat_requereix_rondes");
  });

  it("els paràmetres desats abans conserven el comportament anterior", () => {
    const antics = { ...GENERALS } as Partial<ParametresAdjudicacio>;
    delete antics.prioritat_espera_anterior; delete antics.tipus_sorteig; delete antics.numeracio_sorteig; delete antics.preferencia_maxima_espera_anterior;
    expect(normalitzaParametres(antics as ParametresAdjudicacio)).toMatchObject({ prioritat_espera_anterior: false, criteri_ordre: "inscripcio" });
  });
});

describe("grups d'activitats que no es poden acumular", () => {
  // E1 i E2 són esportives (grup 1), B1, B2 i B3 de ball (grup 2), L lliure.
  const activitats = [
    { ...act("E1", 5), grup: 1 }, { ...act("E2", 5), grup: 1 },
    { ...act("B1", 5), grup: 2 }, { ...act("B2", 5), grup: 2 }, { ...act("B3", 5), grup: 2 }, act("L", 5),
  ];

  it("no dona a una persona més activitats d'un grup que el màxim, ni la posa en llista d'espera", () => {
    const sollicituds = [s(1, "Abad", ["E1", "E2", "B1", "B2", "B3", "L"])];
    const r = adjudica({ sollicituds, activitats, parametres: params(), limits_grups: { 1: 1, 2: 2 } });
    expect(mapa(r)).toEqual({
      "s1/E1": "admesa", "s1/E2": "no (maxim_grup)",
      "s1/B1": "admesa", "s1/B2": "admesa", "s1/B3": "no (maxim_grup)",
      "s1/L": "admesa",
    });
  });

  it("una llista d'espera no ocupa el màxim del grup: la persona pot obtenir la següent del grup", () => {
    const plena = [{ ...act("E1", 1), grup: 1 }, { ...act("E2", 5), grup: 1 }];
    const sollicituds = [s(1, "Abad", ["E1"]), s(2, "Bosch", ["E1", "E2"])];
    const r = adjudica({ sollicituds, activitats: plena, parametres: params(), limits_grups: { 1: 1 } });
    expect(mapa(r)).toEqual({ "s1/E1": "admesa", "s2/E1": "espera 1", "s2/E2": "admesa" });
  });

  it("compta per persona encara que tingui dues sol·licituds, i sense límit el grup no té efecte", () => {
    const sollicituds = [s(1, "Abad", ["E1"], "p"), s(2, "Abad", ["E2"], "p")];
    expect(mapa(adjudica({ sollicituds, activitats, parametres: params(), limits_grups: { 1: 1 } })))
      .toEqual({ "s1/E1": "admesa", "s2/E2": "no (maxim_grup)" });
    expect(mapa(adjudica({ sollicituds, activitats, parametres: params() })))
      .toEqual({ "s1/E1": "admesa", "s2/E2": "admesa" });
  });
});
