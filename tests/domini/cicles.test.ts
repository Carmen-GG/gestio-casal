import { describe, expect, it } from "vitest";
import { acceptaSollicituds, tipusTransicioCicle, transicionsPermeses } from "../../shared/domain/cicles";

describe("transicions d'estat dels cicles", () => {
  it("permet el flux habitual", () => {
    expect(tipusTransicioCicle("preparacio", "inscripcions_obertes")).toBe("normal");
    expect(tipusTransicioCicle("inscripcions_obertes", "adjudicacio_en_proces")).toBe("normal");
    expect(tipusTransicioCicle("adjudicacio_en_proces", "adjudicat")).toBe("normal");
    expect(tipusTransicioCicle("adjudicat", "arxivat")).toBe("normal");
    expect(tipusTransicioCicle("preparacio", "arxivat")).toBe("normal");
  });

  it("exigeix confirmació per reobrir les inscripcions o recalcular una adjudicació", () => {
    expect(tipusTransicioCicle("adjudicacio_en_proces", "inscripcions_obertes")).toBe("requereix_confirmacio");
    expect(tipusTransicioCicle("adjudicat", "adjudicacio_en_proces")).toBe("requereix_confirmacio");
  });

  it("no permet salts no previstos", () => {
    expect(tipusTransicioCicle("preparacio", "adjudicat")).toBeNull();
    expect(tipusTransicioCicle("inscripcions_obertes", "preparacio")).toBeNull();
    expect(transicionsPermeses("arxivat")).toEqual([]);
  });
});

describe("acceptaSollicituds", () => {
  const cicle = {
    estat: "inscripcions_obertes" as const,
    obertura_inscripcions: "2026-10-01T07:00:00.000Z",
    tancament_inscripcions: "2026-10-31T22:00:00.000Z",
  };

  it("accepta dins de la finestra i amb l'estat obert", () => {
    expect(acceptaSollicituds(cicle, new Date("2026-10-15T10:00:00Z"))).toBe(true);
  });

  it("rebutja fora de dates encara que l'estat sigui obert", () => {
    expect(acceptaSollicituds(cicle, new Date("2026-09-30T10:00:00Z"))).toBe(false);
    expect(acceptaSollicituds(cicle, new Date("2026-10-31T22:00:01Z"))).toBe(false);
  });

  it("rebutja si l'estat no és obert", () => {
    expect(acceptaSollicituds({ ...cicle, estat: "adjudicacio_en_proces" }, new Date("2026-10-15T10:00:00Z"))).toBe(false);
  });
});
