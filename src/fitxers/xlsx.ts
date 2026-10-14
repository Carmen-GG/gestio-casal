/**
 * Lectura i escriptura de fitxers de full de càlcul al navegador.
 * Els XLSX es generen amb ExcelJS (fitxers Office Open XML reals, no XML amb
 * extensió .xls). La biblioteca es carrega només quan cal, per no afegir pes
 * a la resta de pàgines.
 */
import type { TaulaExportacio } from "../types/gestio";

export type ExcelJS = typeof import("exceljs");
export const carregaExcel = (): Promise<ExcelJS> => import("exceljs").then((m) => ((m as unknown as { default?: ExcelJS }).default ?? m) as ExcelJS);

export const TIPUS_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Genera un llibre XLSX amb una taula: capçalera fixa, filtres i amplades ajustades. */
export async function generaXlsx(taula: TaulaExportacio, excel?: ExcelJS): Promise<ArrayBuffer> {
  const E = excel ?? (await carregaExcel());
  const llibre = new E.Workbook();
  llibre.creator = "Casal · Gestió integral";
  llibre.created = new Date();
  const full = llibre.addWorksheet(nomFull(taula.titol), { views: [{ state: "frozen", ySplit: 1 }] });
  full.addRow(taula.columnes);
  for (const fila of taula.files) full.addRow(fila.map((v) => v ?? ""));
  const capcalera = full.getRow(1);
  capcalera.font = { bold: true, color: { argb: "FFFFFFFF" } };
  capcalera.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  capcalera.alignment = { vertical: "middle", wrapText: true };
  full.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: taula.columnes.length } };
  taula.columnes.forEach((nom, i) => {
    const mesLlarg = Math.max(nom.length, ...taula.files.map((f) => String(f[i] ?? "").length));
    full.getColumn(i + 1).width = Math.min(Math.max(mesLlarg + 2, 8), 50);
  });
  return llibre.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** Els noms de full d'Excel tenen un màxim de 31 caràcters i no admeten alguns símbols. */
export function nomFull(titol: string) {
  // Només la part principal del títol («Sol·licituds · Cicle…» → «Sol·licituds»).
  const principal = titol.split(/ · | \(/)[0]!;
  return principal.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Dades";
}

export function descarrega(dades: ArrayBuffer | Blob, nom: string, tipus = TIPUS_XLSX) {
  const blob = dades instanceof Blob ? dades : new Blob([dades], { type: tipus });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface TaulaLlegida {
  capcaleres: string[];
  files: string[][];
}

/** Llegeix un CSV o un XLSX i en retorna les capçaleres i les files com a text. */
export async function llegeixFitxer(fitxer: File): Promise<TaulaLlegida> {
  const nom = fitxer.name.toLowerCase();
  if (nom.endsWith(".xls")) {
    throw new Error("Els fitxers .xls antics no es poden llegir. Deseu-lo com a .xlsx o .csv des de l'Excel.");
  }
  if (nom.endsWith(".xlsx")) return llegeixXlsx(await fitxer.arrayBuffer());
  if (nom.endsWith(".csv") || nom.endsWith(".txt")) return llegeixCsv(decodificaText(await fitxer.arrayBuffer()));
  throw new Error("Format no admès. Feu servir un fitxer .xlsx o .csv.");
}

/** UTF-8 si és vàlid; si no, Windows-1252 (CSV desats amb l'Excel en català o castellà). */
export function decodificaText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** CSV (RFC 4180) amb separador detectat: punt i coma, coma o tabulador. */
export function llegeixCsv(text: string): TaulaLlegida {
  const primeraLinia = text.split(/\r?\n/, 1)[0] ?? "";
  const separador = [";", ",", "\t"].map((s) => [s, primeraLinia.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const files: string[][] = [];
  let fila: string[] = [];
  let camp = "";
  let cometes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (cometes) {
      if (c === '"' && text[i + 1] === '"') { camp += '"'; i++; }
      else if (c === '"') cometes = false;
      else camp += c;
    } else if (c === '"' && camp === "") cometes = true;
    else if (c === separador) { fila.push(camp); camp = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      fila.push(camp); files.push(fila); fila = []; camp = "";
    } else camp += c;
  }
  if (camp !== "" || fila.length) { fila.push(camp); files.push(fila); }
  const [capcaleres = [], ...resta] = files;
  return { capcaleres: capcaleres.map((c) => c.trim()), files: resta.filter((f) => f.some((v) => v.trim() !== "") || f.length > 1) };
}

const dosDigits = (n: number) => String(n).padStart(2, "0");

/** Converteix el valor d'una cel·la d'ExcelJS a text, conservant dates i hores. */
function textCella(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // ExcelJS retorna l'hora de rellotge de la cel·la en UTC.
    const data = `${v.getUTCFullYear()}-${dosDigits(v.getUTCMonth() + 1)}-${dosDigits(v.getUTCDate())}`;
    const hora = `${dosDigits(v.getUTCHours())}:${dosDigits(v.getUTCMinutes())}`;
    if (data === "1899-12-30") return hora;
    return hora === "00:00" ? data : `${data} ${hora}`;
  }
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if ("result" in o) return textCella(o.result);
    if (typeof o.text === "string") return o.text;
    return "";
  }
  return String(v);
}

export async function llegeixXlsx(buffer: ArrayBuffer, excel?: ExcelJS): Promise<TaulaLlegida> {
  const E = excel ?? (await carregaExcel());
  const llibre = new E.Workbook();
  await llibre.xlsx.load(buffer);
  const full = llibre.worksheets[0];
  if (!full) return { capcaleres: [], files: [] };
  const files: string[][] = [];
  const amplada = full.columnCount;
  full.eachRow({ includeEmpty: false }, (fila) => {
    files.push(Array.from({ length: amplada }, (_, i) => textCella(fila.getCell(i + 1).value).trim()));
  });
  const [capcaleres = [], ...resta] = files;
  return { capcaleres, files: resta };
}
