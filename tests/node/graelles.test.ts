import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generaGraelles, nomsFulls, validaGraelles } from "../../src/fitxers/graelles";
import type { DadesGraelles } from "../../src/types/gestio";

const dades = (): DadesGraelles => ({
  casal: "Casal de prova", cicle: "Cicle fictici", telefon: true, llegenda: "P: Present · A: Absent",
  totals: { activitats: 2, admeses: 3, espera: 1 },
  graelles: [
    {
      activitat: "Ioga: nivell 1/2 [matins]", horari: "dl, dc · 10:00–11:30", capacitat: 2, espai: "Sala d'actes",
      sessions: [{ id: "s1", data: "2026-10-05" }, { id: "s2", data: "2026-10-07" }], columnes_buides: 0,
      admeses: [
        { ordre: 1, numero: 2, persona: "Àvila, Jordi", telefon: "600000002", marques: ["P", "A"] },
        { ordre: 2, numero: 1, persona: "D'Alòs, Núria", telefon: null, marques: ["P", ""] },
      ],
      espera: [{ posicio: 1, numero: 3, persona: "Bosch, Marta", telefon: "600000003", oferta_pendent: true }],
    },
    {
      activitat: "Ioga: nivell 1/2 [matins]", horari: null, capacitat: 10, espai: null,
      sessions: [], columnes_buides: 4,
      admeses: [{ ordre: 1, numero: 4, persona: "Zapata, Pere", telefon: null, marques: [] }],
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
    expect(textos[capcalera]).toBe("Núm. | Cognoms i nom | Telèfon | 05/10 | 07/10 | Observacions");
    expect(textos[capcalera + 1]).toBe("1 | Àvila, Jordi | 600000002 | P | A");
    expect(textos[capcalera + 2]).toBe("2 | D'Alòs, Núria | P");
    const espera = textos.findIndex((t) => t.startsWith("LLISTA D'ESPERA"));
    expect(espera).toBeGreaterThan(capcalera + 2);
    expect(textos[espera + 2]).toBe("1 | Bosch, Marta | 600000003 | Plaça oferta, pendent de resposta");
    expect(full.pageSetup.orientation).toBe("portrait");
    expect(full.getRow(filaCapcalera).font?.bold).toBe(true);
    expect(full.views[0]).toMatchObject({ state: "frozen", ySplit: filaCapcalera });
    // Sense sessions creades: columnes en blanc per escriure-hi les dates.
    let capcaleraSegon = 0;
    llibre.worksheets[1]!.eachRow((r, n) => { if (r.getCell(1).value === "Núm.") capcaleraSegon = n; });
    expect(llibre.worksheets[1]!.getRow(capcaleraSegon).cellCount).toBe(2 + 1 + 4 + 1);
  });

  it("detecta un fitxer que no coincideix amb les dades", async () => {
    const d = dades();
    const buffer = await generaGraelles(d, ExcelJS);
    const altres = dades();
    altres.graelles[0]!.admeses.push({ ordre: 3, numero: 9, persona: "Nova, Persona", telefon: null, marques: ["", ""] });
    expect(await validaGraelles(buffer, altres, ExcelJS)).toEqual([expect.stringContaining("Ioga")]);
    expect(await validaGraelles(new TextEncoder().encode("<xml/>").buffer as ArrayBuffer, d, ExcelJS)).toEqual(["El fitxer generat no és un XLSX vàlid."]);
  });
});
