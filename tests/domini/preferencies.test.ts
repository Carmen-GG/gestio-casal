import { describe, expect, it } from "vitest";
import { activitatsAmbPreferenciaDuplicada, validaPreferencies } from "../../shared/domain/preferencies";
import { esDocumentIdentitatValid } from "../../shared/schemas/public";

const p = (activitat_id: string, ordre: number | null) => ({ activitat_id, ordre });

describe("preferències", () => {
  it("accepta preferències 1..n sense repetir", () => {
    expect(validaPreferencies([p("a", 2), p("b", 1), p("c", 3)])).toBeNull();
  });

  it("detecta i marca totes les activitats amb el mateix número", () => {
    const err = validaPreferencies([p("a", 1), p("b", 1), p("c", 2), p("d", 2), p("e", 3)]);
    expect(err).toEqual({ tipus: "duplicades", activitats: ["a", "b", "c", "d"], ordres: [1, 2] });
    expect(activitatsAmbPreferenciaDuplicada([p("a", 1), p("b", 2)]).activitats).toEqual([]);
  });

  it("detecta preferències buides, fora de rang i salts", () => {
    expect(validaPreferencies([])).toEqual({ tipus: "cap_activitat" });
    expect(validaPreferencies([p("a", 1), p("b", null)])).toEqual({ tipus: "sense_ordre", activitats: ["b"] });
    expect(validaPreferencies([p("a", 1), p("b", 3)])).toEqual({ tipus: "fora_de_rang", activitats: ["b"] });
    expect(validaPreferencies([p("a", 1), p("a", 2)])).toEqual({ tipus: "activitat_repetida", activitats: ["a"] });
  });
});

describe("DNI/NIE", () => {
  it("comprova la lletra de control amb documents fictícis", () => {
    expect(esDocumentIdentitatValid("00000000T")).toBe(true);
    expect(esDocumentIdentitatValid("00000000-t")).toBe(true);
    expect(esDocumentIdentitatValid("00000000A")).toBe(false);
    expect(esDocumentIdentitatValid("X0000000T")).toBe(true);
    expect(esDocumentIdentitatValid("Y0000000Z")).toBe(true);
    expect(esDocumentIdentitatValid("1234")).toBe(false);
  });
});
