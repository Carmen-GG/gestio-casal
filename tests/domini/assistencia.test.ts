import { describe, expect, it } from "vitest";
import { avuiLocal, datesSessions, resumAssistencia, sotaLlindar } from "../../shared/domain/assistencia";

describe("assistència: domini", () => {
  it("genera les dates dels dies de la setmana dins del període (1 = dilluns)", () => {
    // Del dilluns 11/01/2027 al diumenge 24/01/2027, dilluns i dimecres.
    expect(datesSessions([1, 3], "2027-01-11", "2027-01-24")).toEqual(["2027-01-11", "2027-01-13", "2027-01-18", "2027-01-20"]);
    expect(datesSessions([7], "2027-01-11", "2027-01-17")).toEqual(["2027-01-17"]);
    expect(datesSessions([], "2027-01-11", "2027-01-24")).toEqual([]);
    expect(datesSessions([1], "2027-02-01", "2027-01-01")).toEqual([]);
    expect(datesSessions([1, 2, 3, 4, 5, 6, 7], "2020-01-01", "2030-01-01")).toHaveLength(200);
  });

  it("calcula el percentatge amb totes les absències i només amb prou dades", () => {
    expect(resumAssistencia(["present", "absent"])).toEqual({ presents: 1, absents: 1, justificades: 0, percentatge: null });
    // La falta justificada (FJ) és informativa: compta com a falta per al percentatge.
    expect(resumAssistencia(["present", "absencia_justificada", "absent", "present"])).toEqual({ presents: 2, absents: 2, justificades: 1, percentatge: 50 });
    expect(resumAssistencia(["present", "present", "absent", "absent"]).percentatge).toBe(50);
    expect(resumAssistencia(["present", "present", "present"]).percentatge).toBe(100);
  });

  it("identifica qui és per sota del llindar només si n'hi ha", () => {
    expect(sotaLlindar(60, 75)).toBe(true);
    expect(sotaLlindar(75, 75)).toBe(false);
    expect(sotaLlindar(null, 75)).toBe(false);
    expect(sotaLlindar(10, null)).toBe(false);
  });

  it("calcula la data local de Terrassa", () => {
    expect(avuiLocal(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
  });
});
