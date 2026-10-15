import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generaGraelles, nomsFulls, validaGraelles } from "../../src/fitxers/graelles";
import type { DadesGraelles } from "../../src/types/gestio";

const dades = (): DadesGraelles => ({
  casal: "Casal de prova", cicle: "Cicle fictici", telefon: true, llegenda: "X: Assisteix · F: Falta · FJ: Falta justificada",
  totals: { activitats: 2, admeses: 3, espera: 1 },
  graelles: [
    {
      activitat_id: "a1", activitat: "Ioga: nivell 1/2 [matins]", horari: "dl, dc · 10:00–11:30", capacitat: 2, espai: "Sala d'actes", data_inici: "2026-10-05", data_fi: "2026-12-18",
      sessions: [{ id: "s1", data: "2026-10-05" }, { id: "s2", data: "2026-10-07" }], columnes_buides: 0,
      admeses: [
        { ordre: 1, numero: 2, nom: "Jordi", cognoms: "Àvila", telefon: "600000002", marques: ["X", "FJ"] },
        { ordre: 2, numero: 1, nom: "Núria", cognoms: "D'Alòs", telefon: null, marques: ["X", ""] },
      ],
      espera: [{ posicio: 1, numero: 3, nom: "Marta", cognoms: "Bosch", telefon: "600000003", oferta_pendent: true }],
    },
    {
      activitat_id: "a2", activitat: "Ioga: nivell 1/2 [matins]", horari: null, capacitat: 10, espai: null, data_inici: "2026-10-05", data_fi: "2026-12-18",
      sessions: [], columnes_buides: 4,
      admeses: [{ ordre: 1, numero: 4, nom: "Pere", cognoms: "Zapata", telefon: null, marques: [] }],
      espera: [],
    },
  ],
});

describe("graelles d'assistència XLSX", () => {
  it("fa noms de full vàlids i únics", () => {
    expect(nomsFulls(["Ioga: nivell 1/2 [matins]", "Ioga: nivell 1/2 [matins]", "'Pintura'", "Una activitat amb un nom molt i molt llarg"]))
      .toEqual(["Ioga  nivell 1 2  matins".replace(/\s+/g, " "), "Ioga nivell 1 2 matins (2)", "Pintura", "Una activitat amb un nom molt i"]);
  });

  it("genera un full per activitat amb admeses, sessions i la llista d'espera separada", async () => {
    const d = dades();
    const buffer = await generaGraelles(d, ExcelJS);
    expect([...new Uint8Array(buffer).slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(await validaGraelles(buffer, d, ExcelJS)).toEqual([]);
    const llibre = new ExcelJS.Workbook();
    await llibre.xlsx.load(buffer);
    expect(llibre.worksheets.map((f) => f.name)).toEqual(["Ioga nivell 1 2 matins", "Ioga nivell 1 2 matins (2)"]);
    const full = llibre.worksheets[0]!;
    const files: unknown[][] = [];
    let filaCapcalera = 0;
    full.eachRow((r, n) => {
      files.push((r.values as unknown[]).slice(1));
      if (r.getCell(1).value === "Núm.") filaCapcalera = n;
    });
    const textos = files.map((f) => f.filter((v) => v !== null && v !== undefined && v !== "").join(" | "));
    const capcalera = textos.findIndex((t) => t.startsWith("Núm."));
    expect(textos[capcalera]).toBe("Núm. | Nom | Cognoms | Telèfon | 05/10 | 07/10 | Observacions");
    expect(textos[capcalera + 1]).toBe("1 | Jordi | Àvila | 600000002 | X | FJ");
    expect(textos[capcalera + 2]).toBe("2 | Núria | D'Alòs | X");
    const espera = textos.findIndex((t) => t.startsWith("LLISTA D'ESPERA"));
    expect(espera).toBeGreaterThan(capcalera + 2);
    expect(textos[espera + 2]).toBe("1 | Marta | Bosch | 600000003 | Plaça oferta, pendent de resposta");
    expect(full.pageSetup.orientation).toBe("portrait");
    expect(full.getRow(filaCapcalera).font?.bold).toBe(true);
    expect(full.views[0]).toMatchObject({ state: "frozen", ySplit: filaCapcalera });
    // Sense sessions creades: columnes en blanc per escriure-hi les dates.
    let capcaleraSegon = 0;
    llibre.worksheets[1]!.eachRow((r, n) => { if (r.getCell(1).value === "Núm.") capcaleraSegon = n; });
    expect(llibre.worksheets[1]!.getRow(capcaleraSegon).cellCount).toBe(3 + 1 + 4 + 1);
  });

  it("detecta un fitxer que no coincideix amb les dades", async () => {
    const d = dades();
    const buffer = await generaGraelles(d, ExcelJS);
    const altres = dades();
    altres.graelles[0]!.admeses.push({ ordre: 3, numero: 9, nom: "Persona", cognoms: "Nova", telefon: null, marques: ["", ""] });
    expect(await validaGraelles(buffer, altres, ExcelJS)).toEqual([expect.stringContaining("Ioga")]);
    expect(await validaGraelles(new TextEncoder().encode("<xml/>").buffer as ArrayBuffer, d, ExcelJS)).toEqual(["El fitxer generat no és un XLSX vàlid."]);
  });
});
