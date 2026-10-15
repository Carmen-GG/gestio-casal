import { describe, expect, it } from "vitest";
import { interpretaRangDates, interpretaRangHores, netejaNomActivitat, proposaCamp } from "../../shared/domain/importacio";
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

  it("reconeix les columnes que Carmen vol importar", () => {
    const camp = (c: string) => proposaCamp(c, CAMPS_IMPORTACIO_ACTIVITATS);
    expect(camp("Títol")).toBe("nom");
    expect(camp("FA")).toBe("codi_extern");
    expect(camp("Hora inici")).toBe("hora_inici");
    expect(camp("Hora final")).toBe("hora_fi");
    expect(camp("Data d'inici")).toBe("data_inici");
    expect(camp("Data final")).toBe("data_fi");
    expect(camp("Dates")).toBe("dates");
    expect(camp("Dia de la setmana")).toBe("dies");
    expect(camp("Capacitat")).toBe("capacitat");
    expect(camp("Aula")).toBe("espai");
    expect(camp("Persones a qui va dirigit")).toBe("destinataris");
  });

  it("llegeix intervals d'hores i de dates en una sola columna", () => {
    expect(interpretaRangHores("10:00 - 11:30")).toEqual({ inici: "10:00", fi: "11:30" });
    expect(interpretaRangHores("9.30 a 11.00h")).toEqual({ inici: "09:30", fi: "11:00" });
    expect(interpretaRangHores("Matins")).toBeNull();
    expect(interpretaRangDates("01/10/2026 - 18/12/2026")).toEqual({ inici: "2026-10-01", fi: "2026-12-18" });
    expect(interpretaRangDates("del 5-10-2026 al 14-12-2026")).toEqual({ inici: "2026-10-05", fi: "2026-12-14" });
    expect(interpretaRangDates("31/02/2026")).toBeNull();
  });
});
