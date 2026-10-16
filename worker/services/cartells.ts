import { MIDA_MAXIMA_FITXER, TIPUS_MIME_PER_US, type EstatPlantilla, type TipusPlantilla, type UsFitxer } from "../../shared/domain/cartells";
import type { fotoCrear, plantillaActualitzar, plantillaCrear } from "../../shared/schemas/cartells";
import { ErrorAplicacio, errors } from "../http/errors";
import { resumSha256Bytes } from "../lib/cripto";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import type { FitxerCartells, FotoCartells, PlantillaCartells, Repositoris } from "../repositories/tipus";
import { escriuAmbTraca, type ContextOperacio } from "./traca";
import type { z } from "zod";

const EXTENSIONS: Record<string, string> = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png" };

/** Comprova la signatura del fitxer: no n'hi ha prou amb el tipus que declara el navegador. */
function signaturaCorrecta(tipusMime: string, b: Uint8Array): boolean {
  const comenca = (...bytes: number[]) => bytes.every((x, i) => b[i] === x);
  if (tipusMime === "application/pdf") return comenca(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
  if (tipusMime === "image/jpeg") return comenca(0xff, 0xd8, 0xff);
  if (tipusMime === "image/png") return comenca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  return false;
}

/** Transicions d'estat de les plantilles. Una plantilla no s'esborra mai: s'arxiva. */
const TRANSICIONS: Record<EstatPlantilla, EstatPlantilla[]> = {
  esborrany: ["activa", "arxivada"],
  activa: ["esborrany", "arxivada"],
  arxivada: ["esborrany"],
};

export class ServeiCartells {
  constructor(
    private readonly repos: Repositoris,
    private readonly rellotge: Rellotge,
    private readonly fitxers: R2Bucket,
  ) {}

  /**
   * Desa un fitxer a R2 i en registra les metadades. Si el mateix contingut ja s'havia pujat
   * per al mateix ús i àmbit, retorna el registre existent i no en crea cap de nou.
   */
  async pujarFitxer(
    d: { casalId: string | null; us: UsFitxer; nom: string; tipusMime: string; contingut: Uint8Array },
    ctx: ContextOperacio,
  ): Promise<{ fitxer: FitxerCartells; existent: boolean }> {
    if (!TIPUS_MIME_PER_US[d.us].includes(d.tipusMime)) {
      throw new ErrorAplicacio(415, "tipus_fitxer_no_permes", `Aquest tipus de fitxer no s'accepta per a «${d.us}».`);
    }
    if (d.contingut.byteLength === 0) throw errors.peticioInvalida("El fitxer és buit.");
    if (d.contingut.byteLength > MIDA_MAXIMA_FITXER[d.us]) {
      throw new ErrorAplicacio(413, "fitxer_massa_gran", "El fitxer supera la mida màxima permesa.");
    }
    if (!signaturaCorrecta(d.tipusMime, d.contingut)) {
      throw new ErrorAplicacio(415, "fitxer_no_valid", "El contingut del fitxer no correspon al tipus indicat.");
    }
    const sha256 = await resumSha256Bytes(d.contingut);
    const [existent] = await this.repos.cartells.fitxersPerContingut(sha256, d.us, d.casalId);
    if (existent) return { fitxer: existent, existent: true };

    const id = nouId();
    const fitxer: FitxerCartells = {
      id, casal_id: d.casalId, us: d.us, clau: `${d.casalId ?? "comu"}/${d.us}/${id}${EXTENSIONS[d.tipusMime]}`,
      tipus_mime: d.tipusMime, mida: d.contingut.byteLength, sha256, nom_original: d.nom,
      pujat_per: ctx.usuariId ?? "", pujat_el: isoAra(this.rellotge),
    };
    await this.fitxers.put(fitxer.clau, d.contingut, {
      httpMetadata: { contentType: d.tipusMime },
      sha256,
    });
    try {
      await this.repos.unitat.executar([
        this.repos.cartells.operacioCrearFitxer(fitxer),
        this.repos.auditoria.operacioRegistrar({
          casal_id: d.casalId, usuari_id: ctx.usuariId, tipus_operacio: "cartells.fitxer_pujat", entitat: "cartells_fitxer",
          entitat_id: id, resultat: "exit", id_peticio: ctx.idPeticio ?? null,
          detalls: { us: d.us, tipus_mime: d.tipusMime, mida: fitxer.mida },
        }, fitxer.pujat_el),
      ]);
    } catch (e) {
      // Sense registre a la base de dades, l'objecte quedaria orfe: s'elimina.
      await this.fitxers.delete(fitxer.clau).catch(() => undefined);
      throw e;
    }
    return { fitxer, existent: false };
  }

  /** Fitxer accessible des d'un casal: és del casal o és un recurs comú. */
  async fitxerDelCasal(casalId: string, id: string) {
    const fitxer = await this.repos.cartells.fitxer(id);
    if (!fitxer || (fitxer.casal_id !== null && fitxer.casal_id !== casalId)) throw errors.noTrobat("No s'ha trobat el fitxer.");
    const objecte = await this.fitxers.get(fitxer.clau);
    if (!objecte) throw new ErrorAplicacio(503, "fitxer_no_disponible", "El fitxer no està disponible a l'emmagatzematge.");
    return { fitxer, objecte };
  }

  // ---------- Fototeca ----------

  /**
   * Afegeix a la fototeca una foto ja pujada (foto i miniatura del mateix àmbit). Si la mateixa
   * foto ja hi és, la retorna sense duplicar-la (carpetes pujades dues vegades).
   */
  async afegirFoto(casalId: string | null, d: z.output<typeof fotoCrear>, ctx: ContextOperacio & { usuariId: string }) {
    const [fitxer, miniatura] = await Promise.all([this.repos.cartells.fitxer(d.fitxer_id), this.repos.cartells.fitxer(d.miniatura_id)]);
    if (!fitxer || fitxer.us !== "fotografia" || fitxer.casal_id !== casalId) throw errors.peticioInvalida("La foto no s'ha pujat correctament.");
    if (!miniatura || miniatura.us !== "previsualitzacio" || miniatura.casal_id !== casalId) throw errors.peticioInvalida("La miniatura no s'ha pujat correctament.");
    const existent = await this.repos.cartells.fotoPerFitxer(fitxer.id, casalId);
    if (existent) return { foto: existent, existent: true };
    const foto: FotoCartells = { id: nouId(), casal_id: casalId, ...d, pujada_per: ctx.usuariId, pujada_el: isoAra(this.rellotge) };
    await this.repos.cartells.crearFoto(foto);
    return { foto, existent: false };
  }

  async fotos(casalId: string | null) {
    return this.repos.cartells.fotos(casalId);
  }

  /** Foto visible des del casal: és del casal o és comuna. */
  async fotoDelCasal(casalId: string | null, id: string) {
    const foto = await this.repos.cartells.foto(id);
    if (!foto || (foto.casal_id !== null && foto.casal_id !== casalId)) throw errors.noTrobat("No s'ha trobat la foto.");
    return foto;
  }

  async retirarFoto(foto: FotoCartells, ctx: ContextOperacio & { usuariId: string }) {
    const ara = isoAra(this.rellotge);
    await this.repos.cartells.retirarFoto(foto.id, ctx.usuariId, ara);
    await this.repos.auditoria.registrar({
      casal_id: foto.casal_id, usuari_id: ctx.usuariId, tipus_operacio: "cartells.foto_retirada", entitat: "cartells_foto",
      entitat_id: foto.id, resultat: "exit", id_peticio: ctx.idPeticio ?? null, detalls: { carpeta: foto.carpeta },
    }, ara);
  }

  async plantilles(casalId: string | null, filtre: { tipus?: TipusPlantilla; nomesActives: boolean }) {
    return this.repos.cartells.plantilles({ casalId, tipus: filtre.tipus, estats: filtre.nomesActives ? ["activa"] : undefined });
  }

  async plantilla(id: string): Promise<PlantillaCartells> {
    const p = await this.repos.cartells.plantilla(id);
    if (!p) throw errors.noTrobat("No s'ha trobat la plantilla.");
    return p;
  }

  /** Crea una plantilla en esborrany a partir d'un PDF ja pujat al mateix àmbit (casal o comú). */
  async crearPlantilla(casalId: string | null, d: z.output<typeof plantillaCrear>, ctx: ContextOperacio) {
    const fitxer = await this.repos.cartells.fitxer(d.fitxer_id);
    if (!fitxer || fitxer.us !== "plantilla" || fitxer.casal_id !== casalId) {
      throw errors.peticioInvalida("Dades no vàlides.", { fitxer_id: "El fitxer no existeix o no és una plantilla d'aquest àmbit." });
    }
    const previsualitzacioId = d.previsualitzacio_id ?? null;
    if (previsualitzacioId !== null) {
      const imatge = await this.repos.cartells.fitxer(previsualitzacioId);
      if (!imatge || imatge.us !== "previsualitzacio" || imatge.casal_id !== casalId) {
        throw errors.peticioInvalida("Dades no vàlides.", { previsualitzacio_id: "La imatge de previsualització no és d'aquest àmbit." });
      }
    }
    if (await this.repos.cartells.plantillaPerFitxer(fitxer.id)) {
      throw errors.conflicte("plantilla_existent", "Aquest fitxer ja està carregat com a plantilla.");
    }
    for (const c of d.camps) {
      if (c.x + c.amplada > d.pagina_amplada + 1 || c.y + c.alcada > d.pagina_alcada + 1) {
        throw errors.peticioInvalida("Dades no vàlides.", { camps: `El camp «${c.nom}» queda fora de la pàgina.` });
      }
    }
    const id = nouId();
    const operacio = nouId();
    const ara = isoAra(this.rellotge);
    await escriuAmbTraca(this.repos, ara, {
      principal: this.repos.cartells.operacioCrearPlantilla(id, {
        casal_id: casalId, fitxer_id: fitxer.id, previsualitzacio_id: previsualitzacioId, nom: d.nom, tipus: d.tipus, estacio: d.estacio, linies_titol: d.linies_titol,
        amb_qr: d.amb_qr, tematica: d.tematica ?? null, identitat_grafica: d.identitat_grafica ?? null,
        pagina_amplada: d.pagina_amplada, pagina_alcada: d.pagina_alcada, format_sortida: d.format_sortida, camps: d.camps,
        creat_per: ctx.usuariId ?? "",
      }, ara, operacio),
      condicio: { taula: "cartells_plantilles", id, operacio },
      auditoria: {
        casal_id: casalId, tipus_operacio: "cartells.plantilla_creada", entitat: "cartells_plantilla", entitat_id: id,
        detalls: { fitxer_id: fitxer.id, tipus: d.tipus, camps: d.camps.length },
      },
      ctx,
    });
    return this.plantilla(id);
  }

  async actualitzarPlantilla(actual: PlantillaCartells, d: z.output<typeof plantillaActualitzar>, ctx: ContextOperacio) {
    if (actual.versio !== d.versio) {
      throw errors.conflicte("conflicte_concurrencia", "La plantilla s'ha modificat mentrestant. Recarregueu-la.");
    }
    const { versio: _v, ...canvis } = d;
    if (canvis.estat && canvis.estat !== actual.estat && !TRANSICIONS[actual.estat].includes(canvis.estat)) {
      throw errors.conflicte("transicio_no_permesa", "Aquest canvi d'estat no està permès.");
    }
    if (canvis.estat === "activa" || (actual.estat === "activa" && canvis.camps)) {
      const camps = canvis.camps ?? actual.camps;
      const rols = new Set(camps.map((c) => c.rol));
      if (!rols.has("titol_1") || !rols.has("fotografia")) {
        throw errors.conflicte("plantilla_incompleta", "Per activar la plantilla cal assignar com a mínim el títol i la fotografia.");
      }
    }
    const efectius = Object.fromEntries(Object.entries(canvis).filter(([k, v]) =>
      v !== undefined && JSON.stringify(v) !== JSON.stringify((actual as unknown as Record<string, unknown>)[k])));
    if (Object.keys(efectius).length === 0) return actual;

    const operacio = nouId();
    const ara = isoAra(this.rellotge);
    await escriuAmbTraca(this.repos, ara, {
      principal: this.repos.cartells.operacioActualitzarPlantilla(actual.id, actual.versio, efectius, ara, operacio),
      condicio: { taula: "cartells_plantilles", id: actual.id, operacio },
      auditoria: {
        casal_id: actual.casal_id, tipus_operacio: "cartells.plantilla_modificada", entitat: "cartells_plantilla", entitat_id: actual.id,
        detalls: { camps: Object.keys(efectius), ...(efectius.estat ? { des: actual.estat, cap: efectius.estat } : {}) },
      },
      ctx,
    });
    return this.plantilla(actual.id);
  }
}
