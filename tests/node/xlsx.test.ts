import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { decodificaText, generaXlsx, llegeixCsv, llegeixXlsx } from "../../src/fitxers/xlsx";

describe("XLSX", () => {
  it("genera un fitxer XLSX real (ZIP Office Open XML) amb totes les files", async () => {
    const taula = { titol: "Sol·licituds · Cicle fictici", fitxer: "x.xlsx", columnes: ["Núm.", "Nom", "Primer cognom"],
      files: [[1, "Àlex", "Fictici"], [2, "Núria", null]] };
    const buffer = await generaXlsx(taula, ExcelJS);
    const bytes = new Uint8Array(buffer);
    // Capçalera ZIP («PK\x03\x04»): no és un XML disfressat de .xls.
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const llibre = new ExcelJS.Workbook();
    await llibre.xlsx.load(buffer);
    const full = llibre.worksheets[0]!;
    expect(full.name).toBe("Sol·licituds");
    expect(full.rowCount).toBe(3); // capçalera + 2 files: coincideix amb les dades
    expect(full.getRow(2).getCell(2).value).toBe("Àlex");
    expect(full.getRow(1).font?.bold).toBe(true);
  });

  it("llegeix un XLSX amb dates, hores i números com a text", async () => {
    const llibre = new ExcelJS.Workbook();
    const full = llibre.addWorksheet("Full1");
    full.addRow(["Nom", "Data", "Hora", "Places"]);
    full.addRow(["Ioga", new Date(Date.UTC(2027, 0, 11)), new Date(Date.UTC(1899, 11, 30, 9, 30)), 15]);
    full.addRow(["Registre", new Date(Date.UTC(2026, 9, 15, 9, 5)), null, 3]);
    const t = await llegeixXlsx(await llibre.xlsx.writeBuffer() as ArrayBuffer, ExcelJS);
    expect(t.capcaleres).toEqual(["Nom", "Data", "Hora", "Places"]);
    expect(t.files).toEqual([["Ioga", "2027-01-11", "09:30", "15"], ["Registre", "2026-10-15 09:05", "", "3"]]);
  });

  it("llegeix CSV amb punt i coma, cometes i codificació Windows-1252", () => {
    const t = llegeixCsv('Nom;Cognom;Notes\n"Jordi";Àvila;"Diu ""hola""; adeu"\n\nMarta;Pons;\n');
    expect(t.capcaleres).toEqual(["Nom", "Cognom", "Notes"]);
    expect(t.files).toEqual([["Jordi", "Àvila", 'Diu "hola"; adeu'], ["Marta", "Pons", ""]]);
    const latin1 = new Uint8Array([0x4e, 0xfa, 0x72, 0x69, 0x61]); // «Núria» en Windows-1252
    expect(decodificaText(latin1.buffer)).toBe("Núria");
  });
});
