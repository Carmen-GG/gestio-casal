import { describe, expect, it } from "vitest";
import { clauOrdenacioPersona, comparaPersones, normalitzaText } from "../../shared/domain/ordenacio";

describe("ordenació alfabètica en català i castellà", () => {
  it("normalitza accents, ç, ñ, l·l i apòstrofs", () => {
    expect(normalitzaText("Àlvarez")).toBe("alvarez");
    expect(normalitzaText("Muñoz")).toBe("munoz");
    expect(normalitzaText("Garçon")).toBe("garcon");
    expect(normalitzaText("Col·lell")).toBe("collell");
    expect(normalitzaText("Col.lell")).toBe("collell");
    expect(normalitzaText("d'Alòs")).toBe("dalos");
    expect(normalitzaText("  Pérez   de la  Rosa ")).toBe("perez de la rosa");
  });

  it("ordena per primer cognom, segon cognom i nom", () => {
    const persones = [
      { nom: "Zoe", cognom1: "Ábalos", cognom2: "Prova" },
      { nom: "Anna", cognom1: "Garcia", cognom2: "López" },
      { nom: "Bru", cognom1: "Garcia", cognom2: null },
      { nom: "Èric", cognom1: "Òdena", cognom2: "Ferrer" },
      { nom: "Abel", cognom1: "Garcia", cognom2: "López" },
      { nom: "Carla", cognom1: "Oller", cognom2: null },
    ];
    const ordenades = [...persones].sort(comparaPersones).map((p) => `${p.cognom1} ${p.cognom2 ?? ""} ${p.nom}`.replace(/\s+/g, " "));
    expect(ordenades).toEqual([
      "Ábalos Prova Zoe",
      "Garcia Bru",
      "Garcia López Abel",
      "Garcia López Anna",
      "Òdena Ferrer Èric",
      "Oller Carla",
    ]);
  });

  it("un cognom curt va abans que un de compost que comença igual", () => {
    expect(clauOrdenacioPersona({ nom: "Zeta", cognom1: "Garcia" }) <
      clauOrdenacioPersona({ nom: "Alfa", cognom1: "Garcia López" })).toBe(true);
  });
});
