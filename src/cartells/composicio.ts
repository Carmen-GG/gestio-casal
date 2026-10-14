/**
 * Composició d'un material de PG-Cartells a partir d'una plantilla original.
 *
 * Es treuen els camps del formulari (amb els textos, fotos i logotips d'exemple) i es dibuixa
 * el contingut directament a la pàgina: el text queda com a text vectorial amb la lletra
 * incrustada, la fotografia retallada a la seva àrea i el codi QR com a quadrats vectorials.
 * El resultat és un PDF real, no una captura de pantalla.
 *
 * No depèn del navegador: rep les lletres com a bytes perquè també es pugui provar amb Node.
 */
import type { CampPlantilla, FormatSortida, RolCamp } from "../../shared/domain/cartells";
import { ETIQUETES_ROL } from "../../shared/domain/cartells";
import type { RolText, TextosMaterial } from "../../shared/domain/cartells-contingut";

export interface ImatgeMaterial { bytes: Uint8Array; tipus: "jpeg" | "png" }

export interface EntradaComposicio {
  plantillaPdf: ArrayBuffer | Uint8Array;
  camps: CampPlantilla[];
  formatSortida: FormatSortida;
  textos: TextosMaterial;
  fotografia?: ImatgeMaterial | null;
  logos?: { logo_1?: ImatgeMaterial | null; logo_2?: ImatgeMaterial | null };
  urlQr?: string | null;
  lletres: { regular: Uint8Array; negreta: Uint8Array };
}

/** `rol` null: avís general del material. */
export interface AvisMaterial { rol: RolCamp | null; missatge: string }

/** Per sota d'aquesta proporció de la mida original, el text es veu massa petit: s'avisa. */
export const REDUCCIO_MAXIMA = 0.7;
const MARGE = 2;
const INTERLINIAT = 1.15;
const A4: [number, number] = [595.28, 841.89];

/**
 * Cos de lletra perquè totes les línies càpiguen al rectangle: com a màxim el de la plantilla.
 * `amplades` són les amplades de cada línia a cos 1; `alcadaLletra` l'alçada de les majúscules a cos 1.
 */
export function cosAjustat(d: { amplades: number[]; alcadaLletra: number; amplada: number; alcada: number; cos: number }): number {
  const linies = Math.max(1, d.amplades.length);
  const perAmplada = Math.min(...d.amplades.map((a) => (a > 0 ? (d.amplada - 2 * MARGE) / a : Infinity)));
  const perAlcada = (d.alcada - 2 * MARGE) / (d.alcadaLletra + (linies - 1) * INTERLINIAT);
  return Math.max(0, Math.min(d.cos, perAmplada, perAlcada));
}

export async function composaMaterial(e: EntradaComposicio): Promise<{ pdf: Uint8Array; avisos: AvisMaterial[] }> {
  const lib = await import("pdf-lib");
  const { PDFDocument, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = lib;
  const { default: fontkit } = await import("@pdf-lib/fontkit");

  const doc = await PDFDocument.load(e.plantillaPdf, { updateMetadata: false });
  doc.registerFontkit(fontkit);
  const form = doc.getForm();
  for (const camp of form.getFields()) form.removeField(camp);
  const pagina = doc.getPage(0);
  const avisos: AvisMaterial[] = [];
  const avisa = (rol: RolCamp, missatge: string) => avisos.push({ rol, missatge });
  const buits: string[] = [];

  const lletres = {
    regular: await doc.embedFont(e.lletres.regular, { subset: true }),
    negreta: await doc.embedFont(e.lletres.negreta, { subset: true }),
  };
  const caracters = new Set(lletres.regular.getCharacterSet());

  const imatges = new Map<ImatgeMaterial, Awaited<ReturnType<typeof doc.embedPng>>>();
  const incrusta = async (img: ImatgeMaterial) => {
    if (!imatges.has(img)) imatges.set(img, img.tipus === "png" ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes));
    return imatges.get(img)!;
  };
  const retalla = (c: CampPlantilla, dibuixa: () => void) => {
    pagina.pushOperators(pushGraphicsState(), rectangle(c.x, c.y, c.amplada, c.alcada), clip(), endPath());
    dibuixa();
    pagina.pushOperators(popGraphicsState());
  };

  for (const c of e.camps) {
    if (!c.rol) continue;
    if (c.rol === "fotografia" || c.rol === "logo_1" || c.rol === "logo_2") {
      const img = c.rol === "fotografia" ? e.fotografia : e.logos?.[c.rol];
      if (!img) {
        if (c.rol === "fotografia") avisa(c.rol, "No s'ha triat cap fotografia: l'espai quedarà buit.");
        continue;
      }
      const incrustada = await incrusta(img);
      // La fotografia omple l'espai (es retalla el que sobra); els logotips hi caben sencers.
      const escala = c.rol === "fotografia"
        ? Math.max(c.amplada / incrustada.width, c.alcada / incrustada.height)
        : Math.min(c.amplada / incrustada.width, c.alcada / incrustada.height);
      const w = incrustada.width * escala, h = incrustada.height * escala;
      retalla(c, () => pagina.drawImage(incrustada, { x: c.x + (c.amplada - w) / 2, y: c.y + (c.alcada - h) / 2, width: w, height: h }));
      continue;
    }
    if (c.rol === "qr") {
      if (!e.urlQr) { avisa(c.rol, "No s'ha indicat l'adreça del codi QR: l'espai quedarà buit."); continue; }
      const QRCode = await import("qrcode");
      const { modules } = QRCode.create(e.urlQr, { errorCorrectionLevel: "M" });
      const marge = 2; // zona de silenci, en mòduls
      const costat = Math.min(c.amplada, c.alcada);
      const modul = costat / (modules.size + 2 * marge);
      const x0 = c.x + (c.amplada - costat) / 2, y0 = c.y + (c.alcada - costat) / 2;
      pagina.drawRectangle({ x: x0, y: y0, width: costat, height: costat, color: rgb(1, 1, 1) });
      for (let fila = 0; fila < modules.size; fila++) {
        for (let col = 0; col < modules.size; col++) {
          if (!modules.get(fila, col)) continue;
          pagina.drawRectangle({
            x: x0 + (col + marge) * modul, y: y0 + costat - (fila + marge + 1) * modul,
            width: modul, height: modul, color: rgb(0, 0, 0),
          });
        }
      }
      continue;
    }

    const text = (e.textos[c.rol as RolText] ?? "").trim();
    if (!text) {
      // Les línies 2 i 3 del títol poden quedar buides si el títol és curt.
      if (c.rol !== "titol_2" && c.rol !== "titol_3") buits.push(ETIQUETES_ROL[c.rol]);
      continue;
    }
    const absents = [...new Set([...text].filter((ch) => ch !== "\n" && !caracters.has(ch.codePointAt(0)!)))];
    if (absents.length) avisa(c.rol, `La lletra no té aquests caràcters, que no es veuran bé: ${absents.join(" ")}`);

    const lletra = c.negreta ? lletres.negreta : lletres.regular;
    const linies = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const alcadaLletra = lletra.heightAtSize(1, { descender: false });
    const cosOriginal = c.mida_lletra ?? 12;
    const cos = cosAjustat({
      amplades: linies.map((l) => lletra.widthOfTextAtSize(l, 1)), alcadaLletra,
      amplada: c.amplada, alcada: c.alcada, cos: cosOriginal,
    });
    if (cos < cosOriginal * REDUCCIO_MAXIMA) {
      avisa(c.rol, `El text «${ETIQUETES_ROL[c.rol]}» s'ha hagut de reduir al ${Math.round((cos / cosOriginal) * 100)} %: escurceu-lo perquè es llegeixi bé.`);
    }
    const alcadaBloc = alcadaLletra * cos + (linies.length - 1) * INTERLINIAT * cos;
    let y = c.y + (c.alcada + alcadaBloc) / 2 - alcadaLletra * cos;
    for (const linia of linies) {
      const amplada = lletra.widthOfTextAtSize(linia, cos);
      const x = c.alineacio === 2 ? c.x + c.amplada - MARGE - amplada
        : c.alineacio === 1 ? c.x + (c.amplada - amplada) / 2 : c.x + MARGE;
      pagina.drawText(linia, { x, y, size: cos, font: lletra, color: rgb(...c.color) });
      y -= INTERLINIAT * cos;
    }
  }

  if (buits.length) avisos.unshift({ rol: null, missatge: `Aquests textos són buits i l'espai quedarà en blanc: ${buits.join(", ")}.` });

  if (e.formatSortida !== "A4") return { pdf: await doc.save(), avisos };
  // Les plantilles de cartell són A3: es redueixen a A4 mantenint-ho tot vectorial i les proporcions.
  const a4 = await PDFDocument.create();
  const [incrustada] = await a4.embedPdf(await doc.save());
  const escala = Math.min(A4[0] / incrustada!.width, A4[1] / incrustada!.height);
  const w = incrustada!.width * escala, h = incrustada!.height * escala;
  a4.addPage(A4).drawPage(incrustada!, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
  return { pdf: await a4.save(), avisos };
}
