import { describe, expect, it } from "vitest";
import { compteEtiquetes, compteMencions, errorsPeu, peuPerDefecte } from "../../shared/domain/instagram";

describe("Instagram: text de la publicació", () => {
  it("proposa un text amb el títol, les dades de l'activitat i l'adreça d'inscripció", () => {
    const text = peuPerDefecte(
      { tipus_acte: "Taller", titol_1: "Ioga", titol_2: "suau", dates: "Del 12 de gener al 23 de març de 2027", horaris: "Dilluns, de 10.00 a 11.30 h", adreca: "C. Fictici, 1" },
      { casal: "Casal de prova", urlInscripcio: "https://exemple.invalid/inscripcio/PROVA" },
    );
    expect(text).toBe([
      "Taller: Ioga suau",
      "",
      "📅 Del 12 de gener al 23 de març de 2027",
      "🕒 Dilluns, de 10.00 a 11.30 h",
      "📍 Casal de prova, C. Fictici, 1",
      "",
      "Inscripcions: https://exemple.invalid/inscripcio/PROVA",
    ].join("\n"));
    expect(peuPerDefecte({}, { casal: "Casal" })).toBe("📍 Casal");
  });

  it("compta etiquetes i mencions i avisa dels límits d'Instagram", () => {
    expect(compteEtiquetes("#casal #Terrassa i correu a#b")).toBe(2);
    expect(compteMencions("@casal_can.boada i nom@exemple.cat")).toBe(1);
    expect(errorsPeu("Hola #casal")).toEqual([]);
    expect(errorsPeu("x".repeat(2201))).toHaveLength(1);
    expect(errorsPeu(Array.from({ length: 31 }, (_, i) => `#e${i}`).join(" "))[0]).toMatch(/30 etiquetes/);
  });
});
