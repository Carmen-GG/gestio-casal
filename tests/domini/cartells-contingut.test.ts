import { describe, expect, it } from "vitest";
import {
  errorUrlQr, liniesNomCasal, reparteixLinies, slugFitxer, textAdreca, textDates, textHorari, textosPerDefecte,
} from "../../shared/domain/cartells-contingut";

const casal = { nom: "Casal Cívic i Comunitari Terrassa – Can Boada", municipi: "Terrassa", adreca: "C. de Mossèn Jacint Verdaguer, 1" };

describe("textos per defecte dels materials", () => {
  it("dates en català amb apostrofació", () => {
    expect(textDates("2027-01-12", "2027-03-23")).toBe("Del 12 de gener al 23 de març de 2027");
    expect(textDates("2026-12-01", "2027-04-11")).toBe("De l'1 de desembre de 2026 a l'11 d'abril de 2027");
    expect(textDates("2027-10-05", null)).toBe("5 d'octubre de 2027");
    expect(textDates("2027-08-05", "2027-08-05")).toBe("5 d'agost de 2027");
    expect(textDates(null, null)).toBe("");
  });

  it("horari a partir dels dies i les hores, o el text escrit a mà", () => {
    expect(textHorari({ dies_setmana: [1, 3], hora_inici: "10:00", hora_fi: "11:30", horari_text: null }))
      .toBe("Dilluns i dimecres, de 10.00 a 11.30 h");
    expect(textHorari({ dies_setmana: [2, 4, 5], hora_inici: "17:00", hora_fi: null, horari_text: null }))
      .toBe("Dimarts, dijous i divendres, a les 17.00 h");
    expect(textHorari({ dies_setmana: [1], hora_inici: "10:00", hora_fi: "11:00", horari_text: " Un dissabte al mes " }))
      .toBe("Un dissabte al mes");
  });

  it("reparteix el títol en línies equilibrades sense partir paraules", () => {
    expect(reparteixLinies("Ioga suau i respiració conscient", 2)).toEqual(["Ioga suau i", "respiració conscient"]);
    expect(reparteixLinies("Taller de cuina de mercat per a tothom", 3)).toEqual(["Taller de", "cuina de mercat", "per a tothom"]);
    expect(reparteixLinies("Pilates", 2)).toEqual(["Pilates", ""]);
    expect(reparteixLinies("Ball en línia", 1)).toEqual(["Ball en línia"]);
  });

  it("nom del casal en dues línies i adreça amb el municipi", () => {
    expect(liniesNomCasal(casal.nom, casal.municipi)).toEqual(["Casal Cívic i Comunitari", "Terrassa – Can Boada"]);
    expect(textAdreca(casal)).toBe("C. de Mossèn Jacint Verdaguer, 1 · Terrassa");
    expect(textAdreca({ ...casal, adreca: null })).toBe("Terrassa");
  });

  it("proposta completa per a una activitat", () => {
    const textos = textosPerDefecte({
      casal, liniesTitol: 2, cicle: { data_inici: "2027-01-11", data_fi: "2027-03-26" },
      activitat: {
        nom: "Ioga suau i respiració conscient", categoria: "Taller", dies_setmana: [1, 3], hora_inici: "10:00", hora_fi: "11:30",
        horari_text: null, data_inici: null, data_fi: null,
      },
    });
    expect(textos).toMatchObject({
      tipus_acte: "TALLER", titol_1: "Ioga suau i", titol_2: "respiració conscient",
      dates: "De l'11 de gener al 26 de març de 2027", horaris: "Dilluns i dimecres, de 10.00 a 11.30 h",
      casal_1: "Casal Cívic i Comunitari", casal_2: "Terrassa – Can Boada",
      peu: "Casal Cívic i Comunitari Terrassa – Can Boada\nC. de Mossèn Jacint Verdaguer, 1 · Terrassa",
    });
    // Sense activitat (contingut lliure) només es proposen les dades del casal.
    expect(textosPerDefecte({ casal, liniesTitol: 2, cicle: null, activitat: null }).titol_1).toBeUndefined();
  });

  it("el codi QR només accepta adreces web", () => {
    expect(errorUrlQr("https://casal.example/inscripcio/CAN-BOADA/abc")).toBeNull();
    expect(errorUrlQr("")).not.toBeNull();
    expect(errorUrlQr("mailto:algu@exemple.cat")).not.toBeNull();
    expect(errorUrlQr("https://usuari:clau@exemple.cat/")).not.toBeNull();
    expect(errorUrlQr(`https://exemple.cat/${"a".repeat(300)}`)).not.toBeNull();
  });

  it("noms de fitxer", () => {
    expect(slugFitxer("Ioga suau i respiració · Col·lectiu")).toBe("ioga-suau-i-respiracio-collectiu");
    expect(slugFitxer("···")).toBe("material");
  });
});
