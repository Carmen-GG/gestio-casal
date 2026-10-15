import { describe, expect, it } from "vitest";
import { netejaNomActivitat, proposaCamp } from "../../shared/domain/importacio";
import { CAMPS_IMPORTACIO_ACTIVITATS } from "../../shared/schemas/sollicituds";

describe("columnes i noms de la PGEc", () => {
  it("reconeix les capçaleres del llistat d'activitats", () => {
    expect(proposaCamp("Codi", CAMPS_IMPORTACIO_ACTIVITATS)).toBe("codi_extern");
    expect(proposaCamp("Nom activitat", CAMPS_IMPORTACIO_ACTIVITATS)).toBe("nom");
    expect(proposaCamp("Assistents previstos", CAMPS_IMPORTACIO_ACTIVITATS)).toBe("capacitat");
    expect(proposaCamp("Inscrits", CAMPS_IMPORTACIO_ACTIVITATS)).toBeNull();
  });

  it("treu el cicle del final del nom i deixa la resta igual", () => {
    expect(netejaNomActivitat("Pilates 1. 3r Cicle 2026")).toBe("Pilates 1");
    expect(netejaNomActivitat("Boxa i arts marcials 2. 3r Cicle 2026")).toBe("Boxa i arts marcials 2");
    expect(netejaNomActivitat("Reciclem la nostra roba. 3r Cicle 2026.")).toBe("Reciclem la nostra roba");
    expect(netejaNomActivitat("En Forma! 3r Cicle 2026")).toBe("En Forma!");
    expect(netejaNomActivitat("Defensa't. 1r cicle 2027")).toBe("Defensa't");
    expect(netejaNomActivitat("Ioga suau")).toBe("Ioga suau");
    expect(netejaNomActivitat("1r Cicle 2026")).toBe("1r Cicle 2026");
  });
});
