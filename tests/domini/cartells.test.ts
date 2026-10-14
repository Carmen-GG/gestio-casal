import { describe, expect, it } from "vitest";
import { assignaRols, avisosPlantilla, metadadesDelNom, nomPlantilla, type CampPdf } from "../../shared/domain/cartells";

/** Camps reals de les plantilles originals d'Instagram (rectangle [x1, y1, x2, y2] i cos de lletra). */
const ig = (camps: [string, number[], number | null, boolean][]): CampPdf[] => camps.map(([nom, [x1, y1, x2, y2], mida, negreta]) => ({
  nom, tipus: mida === null ? "imatge" : "text", x: x1!, y: y1!, amplada: x2! - x1!, alcada: y2! - y1!,
  mida_lletra: mida, negreta, alineacio: 0, color: [0, 0, 0],
}));

const rols = (camps: CampPdf[]) => Object.fromEntries(assignaRols(camps, 2048).map((c) => [c.nom, c.rol]));

describe("rols dels camps de les plantilles", () => {
  it("Instagram, tardor, 2 línies amb QR (els noms Texto no segueixen l'ordre)", () => {
    const camps = ig([
      ["Texto1", [1303, 1572, 1988, 1702], 110, true],
      ["Texto2", [1305, 1464, 1990, 1595], 88, true],
      ["Texto4", [86, 1137, 1819, 1209], 64, true],
      ["Texto6", [84, 1059, 1818, 1132], 64, false],
      ["Imatge_af_image", [67, 199, 1985, 1042], null, false],
      ["Texto7", [948, 37, 2047, 171], 48, false],
      ["Texto3", [66, 1374, 1303, 1546], 160, true],
      ["Texto5", [68, 1211, 1991, 1375], 160, true],
      ["Codi QR", [1829, 1061, 1977, 1205], null, false],
    ]);
    expect(rols(camps)).toEqual({
      Texto1: "tipus_acte", Texto2: "destinataris", Texto4: "dates", Texto6: "horaris", Imatge_af_image: "fotografia",
      Texto7: "peu", Texto3: "titol_1", Texto5: "titol_2", "Codi QR": "qr",
    });
    expect(avisosPlantilla(assignaRols(camps, 2048), 2, true)).toEqual([]);
  });

  it("Instagram, estiu, 1 línia (Texto5 hi fa d'horari)", () => {
    const camps = ig([
      ["Texto1", [1302, 1572, 1987, 1702], 110, true],
      ["Texto2", [1302, 1464, 1987, 1595], 88, true],
      ["Texto3", [65, 1211, 1985, 1469], 185, true],
      ["Texto4", [101, 1131, 1980, 1204], 64, true],
      ["Texto5", [101, 1059, 1980, 1132], 64, false],
      ["Imatge_af_image", [65, 199, 1984, 1042], null, false],
      ["Texto6", [948, 37, 2047, 171], 48, false],
    ]);
    expect(rols(camps)).toMatchObject({ Texto3: "titol_1", Texto4: "dates", Texto5: "horaris", Texto6: "peu" });
  });

  it("cartells: rol pel nom del camp, i avisos si en falta algun", () => {
    const camps = ig([
      ["Tipus d'acte", [393, 983, 813, 1041], 47, true],
      ["Titular linia 1", [28, 771, 813, 936], 120, true],
      ["Nom CC1", [61, 180, 798, 220], 30, false],
      ["Adreça", [61, 104, 798, 141], 30, false],
      ["Logo_af_image1", [577, 4, 813, 84], null, false],
    ]);
    const amb = assignaRols(camps, 1190.55);
    expect(amb.map((c) => c.rol)).toEqual(["tipus_acte", "titol_1", "casal_1", "adreca", "logo_1"]);
    expect(avisosPlantilla(amb, 2, false)).toEqual([
      "No hi ha cap camp per a la línia 2 del títol.", "No hi ha cap camp per a la fotografia.",
    ]);
  });

  it("dos camps no reben mai el mateix rol", () => {
    const camps = ig([["Texto1", [1303, 1572, 1988, 1702], 110, true], ["Texto9", [1303, 1580, 1988, 1702], 110, true]]);
    expect(assignaRols(camps, 2048).map((c) => c.rol)).toEqual(["tipus_acte", null]);
  });
});

describe("metadades del nom del fitxer original", () => {
  it("llegeix tipus, estació, línies i QR", () => {
    expect(metadadesDelNom("base_tardor_DSI_QR_2L_IG.pdf")).toEqual({ tipus: "instagram", estacio: "tardor", linies_titol: 2, amb_qr: true });
    expect(metadadesDelNom("base_estiu_DSI_3L_CAR.pdf")).toEqual({ tipus: "cartell", estacio: "estiu", linies_titol: 3, amb_qr: false });
    expect(metadadesDelNom("cartell.pdf")).toBeNull();
    expect(nomPlantilla({ tipus: "instagram", estacio: "hivern", linies_titol: 2, amb_qr: true })).toBe("Instagram · hivern · títol de 2 línies · amb QR");
  });
});
