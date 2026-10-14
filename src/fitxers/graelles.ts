/**
 * Graelles d'assistència en XLSX real: un full per activitat, amb les persones
 * admeses per ordre alfabètic, una columna per sessió i, separada a sota, la
 * llista d'espera per posició. Preparades per imprimir en horitzontal.
 */
import type { DadesGraelles } from "../types/gestio";
import { carregaExcel, type ExcelJS } from "./xlsx";

const BLAU = "FF1F4E79";
const VORA = { style: "thin" as const, color: { argb: "FFB7C0CA" } };
const VORES = { top: VORA, left: VORA, bottom: VORA, right: VORA };

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Noms de full únics, de 31 caràcters com a màxim i sense els símbols que Excel no admet. */
export function nomsFulls(noms: string[]): string[] {
  const usats = new Set<string>();
  return noms.map((nom) => {
    const base = nom.replace(/[\\/?*[\]:]/g, " ").replace(/^'+|'+$/g, "").replace(/\s+/g, " ").trim().slice(0, 31) || "Activitat";
    let candidat = base;
    for (let i = 2; usats.has(candidat.toLowerCase()); i++) {
      const sufix = ` (${i})`;
      candidat = `${base.slice(0, 31 - sufix.length).trim()}${sufix}`;
    }
    usats.add(candidat.toLowerCase());
    return candidat;
  });
}

export async function generaGraelles(dades: DadesGraelles, excel?: ExcelJS): Promise<ArrayBuffer> {
  const E = excel ?? (await carregaExcel());
  const llibre = new E.Workbook();
  llibre.creator = "Casal · Gestió integral";
  llibre.created = new Date();
  const noms = nomsFulls(dades.graelles.map((g) => g.activitat));

  dades.graelles.forEach((g, idx) => {
    const columnesSessio = g.sessions.length > 0 ? g.sessions.map((s) => dataCurta(s.data))
      : Array.from({ length: g.columnes_buides }, () => "");
    const fixes = ["Núm.", "Cognoms i nom", ...(dades.telefon ? ["Telèfon"] : [])];
    const total = fixes.length + columnesSessio.length + 1; // + Observacions
    const full = llibre.addWorksheet(noms[idx]!, {
      pageSetup: {
        orientation: total > 8 ? "landscape" : "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      },
      headerFooter: { oddFooter: "&L&8" + `${dades.casal} · ${dades.cicle}`.replace(/&/g, "&&") + "&R&8Pàgina &P de &N" },
    });

    // Capçalera de l'activitat.
    const titol = full.addRow([g.activitat]);
    titol.font = { bold: true, size: 16, color: { argb: BLAU } };
    titol.height = 26;
    full.mergeCells(titol.number, 1, titol.number, total);
    const info = [
      ["Casal", dades.casal], ["Cicle", dades.cicle], ["Horari", g.horari ?? "—"],
      ["Places", String(g.capacitat)], ...(g.espai ? [["Espai", g.espai]] : []),
    ];
    for (const [etiqueta, valor] of info) {
      const r = full.addRow([etiqueta, valor]);
      r.getCell(1).font = { bold: true };
      full.mergeCells(r.number, 2, r.number, total);
    }
    full.addRow([]);

    // Persones admeses.
    const seccio = full.addRow([`PERSONES ADMESES (${g.admeses.length})`]);
    seccio.font = { bold: true, size: 12 };
    full.mergeCells(seccio.number, 1, seccio.number, total);
    const capcalera = full.addRow([...fixes, ...columnesSessio, "Observacions"]);
    capcalera.font = { bold: true, color: { argb: "FFFFFFFF" } };
    capcalera.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    capcalera.height = 24;
    capcalera.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLAU } }; c.border = VORES; });
    const filaCapcalera = capcalera.number;
    for (const p of g.admeses) {
      const marques = g.sessions.length > 0 ? p.marques : columnesSessio.map(() => "");
      const r = full.addRow([p.ordre, p.persona, ...(dades.telefon ? [p.telefon ?? ""] : []), ...marques, ""]);
      r.height = 22;
      r.alignment = { vertical: "middle", wrapText: true };
      r.eachCell({ includeEmpty: true }, (c, col) => {
        c.border = VORES;
        if (col > fixes.length && col < total) c.alignment = { horizontal: "center", vertical: "middle" };
      });
    }
    if (g.admeses.length > 0) {
      full.autoFilter = { from: { row: filaCapcalera, column: 1 }, to: { row: filaCapcalera + g.admeses.length, column: fixes.length } };
    }
    full.views = [{ state: "frozen", ySplit: filaCapcalera, xSplit: 2 }];
    full.pageSetup.printTitlesRow = `${filaCapcalera}:${filaCapcalera}`;
    const llegenda = full.addRow([dades.llegenda]);
    llegenda.font = { italic: true, size: 9, color: { argb: "FF4A5560" } };
    full.mergeCells(llegenda.number, 1, llegenda.number, total);

    // Llista d'espera, clarament separada.
    full.addRow([]);
    const titolEspera = full.addRow([`LLISTA D'ESPERA (${g.espera.length}) · per ordre de posició, no alfabètic`]);
    titolEspera.font = { bold: true, size: 12, color: { argb: "FF8A5A00" } };
    full.mergeCells(titolEspera.number, 1, titolEspera.number, total);
    if (g.espera.length === 0) {
      full.addRow(["Ningú en llista d'espera."]).font = { italic: true };
    } else {
      const ce = full.addRow(["Posició", "Cognoms i nom", ...(dades.telefon ? ["Telèfon"] : []), "Situació"]);
      ce.font = { bold: true };
      ce.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF1D6" } }; c.border = VORES; });
      for (const p of g.espera) {
        const r = full.addRow([p.posicio ?? "", p.persona, ...(dades.telefon ? [p.telefon ?? ""] : []), p.oferta_pendent ? "Plaça oferta, pendent de resposta" : ""]);
        r.height = 20;
        r.eachCell({ includeEmpty: true }, (c) => { c.border = VORES; });
      }
    }

    // Amplades.
    full.getColumn(1).width = 8;
    full.getColumn(2).width = Math.min(Math.max(...[...g.admeses, ...g.espera].map((p) => p.persona.length), 20) + 2, 42);
    if (dades.telefon) full.getColumn(3).width = 13;
    for (let c = fixes.length + 1; c < total; c++) full.getColumn(c).width = 7;
    full.getColumn(total).width = 28;
    // Les etiquetes de la capçalera (Casal, Cicle…) a la columna 1 no s'han de tallar.
    full.getColumn(1).alignment = { vertical: "middle" };
  });

  return llibre.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/**
 * Comprova el fitxer generat abans de lliurar-lo: es pot obrir, hi ha un full per
 * activitat i el nombre de persones admeses i en espera coincideix amb les dades.
 */
export async function validaGraelles(buffer: ArrayBuffer, dades: DadesGraelles, excel?: ExcelJS): Promise<string[]> {
  const E = excel ?? (await carregaExcel());
  const errors: string[] = [];
  const llibre = new E.Workbook();
  try {
    await llibre.xlsx.load(buffer);
  } catch {
    return ["El fitxer generat no és un XLSX vàlid."];
  }
  if (llibre.worksheets.length !== dades.graelles.length) {
    errors.push(`S'esperaven ${dades.graelles.length} fulls i n'hi ha ${llibre.worksheets.length}.`);
  }
  llibre.worksheets.forEach((full, i) => {
    const g = dades.graelles[i];
    if (!g) return;
    const persones: string[] = [];
    full.eachRow((fila) => { const v = fila.getCell(2).value; if (typeof v === "string") persones.push(v); });
    const admeses = g.admeses.map((p) => p.persona);
    const espera = g.espera.map((p) => p.persona);
    const comptades = [...admeses, ...espera].filter((nom) => persones.includes(nom)).length;
    const esperades = admeses.length + espera.length;
    const totes = persones.filter((v) => [...admeses, ...espera].includes(v)).length;
    if (comptades !== esperades || totes !== esperades) {
      errors.push(`«${g.activitat}»: el fitxer no conté exactament les ${esperades} persones de la base de dades.`);
    }
  });
  return errors;
}
