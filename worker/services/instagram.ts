import { ESTATS_EDITABLES } from "../../shared/domain/instagram";
import type { publicacioCrear } from "../../shared/schemas/instagram";
import { ErrorAplicacio, errors } from "../http/errors";
import { resumSha256, testimoniAleatori } from "../lib/cripto";
import { nouId } from "../lib/ids";
import { isoAra, type Rellotge } from "../lib/rellotge";
import { desxifra, xifra } from "../lib/xifratge";
import type { CompteInstagram, PublicacioInstagram, Repositoris } from "../repositories/tipus";
import { ClientInstagram, ErrorInstagram } from "./instagram-api";
import type { ContextOperacio } from "./traca";
import type { z } from "zod";

const US_CLAU = "instagram-testimoni";
/** Temps que l'adreça temporal de la imatge és vàlida mentre Instagram la descarrega. */
const VALIDESA_IMATGE_MS = 15 * 60 * 1000;
/** Es renova el testimoni (60 dies) si fa més d'una setmana que no s'ha renovat. */
const RENOVA_CADA_MS = 7 * 24 * 3600 * 1000;

/** Dades visibles d'una publicació (sense el resum de l'adreça temporal). */
export type PublicacioVisible = Omit<PublicacioInstagram, "imatge_testimoni_resum" | "imatge_caduca_el">;
const visible = ({ imatge_testimoni_resum: _r, imatge_caduca_el: _c, ...p }: PublicacioInstagram): PublicacioVisible => p;

export class ServeiInstagram {
  constructor(
    private readonly repos: Repositoris,
    private readonly rellotge: Rellotge,
    private readonly fitxers: R2Bucket | undefined,
    private readonly clau: string | undefined,
    private readonly client: ClientInstagram = new ClientInstagram(),
  ) {}

  private exigeixClau(): string {
    if (!this.clau) {
      throw new ErrorAplicacio(503, "instagram_no_configurat",
        "La connexió amb Instagram encara no està configurada en aquest servidor. Mentrestant, podeu descarregar la imatge i publicar-la a mà.");
    }
    return this.clau;
  }

  private auditoria(casalId: string, ctx: ContextOperacio, tipus: string, entitatId: string | null, resultat: "exit" | "error", detalls: Record<string, unknown> = {}) {
    return this.repos.auditoria.registrar({
      casal_id: casalId, usuari_id: ctx.usuariId, tipus_operacio: tipus, entitat: tipus.startsWith("instagram.compte") ? "instagram_compte" : "instagram_publicacio",
      entitat_id: entitatId, resultat, id_peticio: ctx.idPeticio ?? null, detalls,
    }, isoAra(this.rellotge));
  }

  // ---------- Compte ----------

  async estatCompte(casalId: string) {
    const c = await this.repos.instagram.compte(casalId);
    return {
      configurat: !!this.clau,
      compte: c ? { nom_usuari: c.nom_usuari, connectat_el: c.connectat_el, testimoni_caduca_el: c.testimoni_caduca_el } : null,
    };
  }

  /** Connecta (o torna a connectar) el compte del casal amb un testimoni d'accés de Meta. */
  async connectar(casalId: string, testimoni: string, ctx: ContextOperacio) {
    const clau = this.exigeixClau();
    let perfil: Awaited<ReturnType<ClientInstagram["perfil"]>>;
    try {
      perfil = await this.client.perfil(testimoni);
    } catch (e) {
      await this.auditoria(casalId, ctx, "instagram.compte_connectat", null, "error");
      if (e instanceof ErrorInstagram) {
        throw new ErrorAplicacio(422, "instagram_testimoni_no_valid",
          e.testimoniNoValid ? "Instagram no accepta aquest testimoni d'accés. Genereu-ne un de nou i torneu-ho a provar." : e.missatgeUsuari);
      }
      throw e;
    }
    if (perfil.tipus === "PERSONAL") {
      throw new ErrorAplicacio(422, "instagram_compte_personal", "Aquest compte d'Instagram és personal. Cal convertir-lo en compte professional (empresa o creador).");
    }
    const ara = isoAra(this.rellotge);
    // Si el testimoni es pot renovar, així se sap quan caduca; si és massa nou, es renovarà més endavant.
    let definitiu = testimoni;
    let caducaEl: string | null = null;
    try {
      const r = await this.client.renova(testimoni);
      definitiu = r.testimoni;
      caducaEl = r.caducaEnSegons ? new Date(this.rellotge.ara().getTime() + r.caducaEnSegons * 1000).toISOString() : null;
    } catch { /* es fa servir el testimoni tal com s'ha donat */ }
    await this.repos.instagram.desarCompte({
      casal_id: casalId, ig_usuari_id: perfil.igUsuariId, nom_usuari: perfil.nomUsuari,
      testimoni_xifrat: await xifra(definitiu, clau, US_CLAU), testimoni_caduca_el: caducaEl, testimoni_renovat_el: ara,
      connectat_per: ctx.usuariId ?? "", connectat_el: ara,
    });
    await this.auditoria(casalId, ctx, "instagram.compte_connectat", null, "exit", { nom_usuari: perfil.nomUsuari });
    return this.estatCompte(casalId);
  }

  async desconnectar(casalId: string, ctx: ContextOperacio) {
    if (!(await this.repos.instagram.compte(casalId))) throw errors.noTrobat("Aquest casal no té cap compte d'Instagram connectat.");
    await this.repos.instagram.esborrarCompte(casalId);
    await this.auditoria(casalId, ctx, "instagram.compte_desconnectat", null, "exit");
  }

  /** Testimoni en clar per publicar; el renova si fa dies que no es renova. */
  private async testimoni(compte: CompteInstagram, clau: string): Promise<string> {
    let testimoni: string;
    try {
      testimoni = await desxifra(compte.testimoni_xifrat, clau, US_CLAU);
    } catch {
      throw new ErrorAplicacio(409, "instagram_reconnectar", "Cal tornar a connectar el compte d'Instagram del casal.");
    }
    const ara = this.rellotge.ara();
    if (ara.getTime() - Date.parse(compte.testimoni_renovat_el) > RENOVA_CADA_MS) {
      try {
        const r = await this.client.renova(testimoni);
        testimoni = r.testimoni;
        const caducaEl = r.caducaEnSegons ? new Date(ara.getTime() + r.caducaEnSegons * 1000).toISOString() : compte.testimoni_caduca_el;
        await this.repos.instagram.renovarTestimoni(compte.casal_id, await xifra(testimoni, clau, US_CLAU), caducaEl, ara.toISOString());
      } catch { /* es prova amb el testimoni actual */ }
    }
    return testimoni;
  }

  // ---------- Publicacions ----------

  async publicacions(casalId: string) {
    return (await this.repos.instagram.publicacions(casalId, 100)).map(visible);
  }

  private async publicacioDelCasal(casalId: string, id: string) {
    const p = await this.repos.instagram.publicacio(id);
    if (!p || p.casal_id !== casalId) throw errors.noTrobat("No s'ha trobat la publicació.");
    return p;
  }

  async publicacio(casalId: string, id: string) {
    return visible(await this.publicacioDelCasal(casalId, id));
  }

  async crearPublicacio(casalId: string, d: z.output<typeof publicacioCrear>, ctx: ContextOperacio) {
    const fitxer = await this.repos.cartells.fitxer(d.fitxer_id);
    if (!fitxer || fitxer.casal_id !== casalId || fitxer.us !== "material") throw errors.noTrobat("No s'ha trobat la imatge del material.");
    if (fitxer.tipus_mime !== "image/jpeg") {
      throw new ErrorAplicacio(415, "instagram_imatge_no_jpeg", "Instagram només accepta imatges JPEG.");
    }
    const id = nouId();
    const ara = isoAra(this.rellotge);
    await this.repos.instagram.crearPublicacio({
      id, casal_id: casalId, fitxer_id: fitxer.id, titol: d.titol, peu: d.peu, creat_per: ctx.usuariId ?? "", creat_el: ara,
    });
    await this.auditoria(casalId, ctx, "instagram.publicacio_preparada", id, "exit");
    return this.publicacio(casalId, id);
  }

  private async aplica(p: PublicacioInstagram, versio: number, canvis: Parameters<Repositoris["instagram"]["actualitzarPublicacio"]>[2]) {
    if (!(await this.repos.instagram.actualitzarPublicacio(p.id, versio, canvis, isoAra(this.rellotge)))) {
      throw errors.conflicte("conflicte_concurrencia", "Algú altre ha modificat aquesta publicació. Torneu a carregar la pàgina.");
    }
  }

  /** Una publicació que s'ha quedat «publicant» més del previst es pot tornar a provar. */
  private editable(p: PublicacioInstagram) {
    if (ESTATS_EDITABLES.includes(p.estat)) return true;
    return p.estat === "publicant" && (!p.imatge_caduca_el || Date.parse(p.imatge_caduca_el) < this.rellotge.ara().getTime());
  }

  async actualitzar(casalId: string, id: string, d: { versio: number; peu?: string; descartar?: true }, ctx: ContextOperacio) {
    const p = await this.publicacioDelCasal(casalId, id);
    if (!this.editable(p)) throw errors.conflicte("publicacio_no_editable", "Aquesta publicació ja no es pot modificar.");
    await this.aplica(p, d.versio, { peu: d.peu ?? p.peu, ...(d.descartar ? { estat: "descartada" as const } : {}) });
    if (d.descartar) await this.auditoria(casalId, ctx, "instagram.publicacio_descartada", id, "exit");
    return this.publicacio(casalId, id);
  }

  async marcarManual(casalId: string, id: string, d: { versio: number; enllac?: string | null }, ctx: ContextOperacio) {
    const p = await this.publicacioDelCasal(casalId, id);
    if (!this.editable(p)) throw errors.conflicte("publicacio_no_editable", "Aquesta publicació ja no es pot modificar.");
    const ara = isoAra(this.rellotge);
    await this.aplica(p, d.versio, {
      estat: "publicada_manualment", enllac: d.enllac ?? null, error_missatge: null, imatge_testimoni_resum: null, imatge_caduca_el: null,
      publicat_per: ctx.usuariId, publicat_el: ara,
    });
    await this.auditoria(casalId, ctx, "instagram.publicacio_manual", id, "exit");
    return this.publicacio(casalId, id);
  }

  /**
   * Publica la imatge al compte del casal. Només s'arriba aquí després que una persona
   * hagi vist la previsualització i ho hagi confirmat (ho exigeix la petició).
   * `origen` és l'adreça pública de l'aplicació, d'on Instagram descarrega la imatge.
   */
  async publicar(casalId: string, id: string, versio: number, origen: string, ctx: ContextOperacio) {
    const clau = this.exigeixClau();
    const p = await this.publicacioDelCasal(casalId, id);
    if (!this.editable(p)) throw errors.conflicte("publicacio_no_editable", "Aquesta publicació ja s'ha publicat o s'ha descartat.");
    const compte = await this.repos.instagram.compte(casalId);
    if (!compte) throw errors.conflicte("instagram_sense_compte", "Aquest casal encara no té cap compte d'Instagram connectat.");

    // 1. Es reserva la publicació (evita publicar-la dues vegades) i s'obre l'adreça temporal de la imatge.
    const testimoniImatge = testimoniAleatori();
    const ara = this.rellotge.ara();
    await this.aplica(p, versio, {
      estat: "publicant", error_missatge: null,
      imatge_testimoni_resum: await resumSha256(`instagram-imatge:${testimoniImatge}`),
      imatge_caduca_el: new Date(ara.getTime() + VALIDESA_IMATGE_MS).toISOString(),
    });
    const versioActual = versio + 1;

    // 2. Es publica. Passi el que passi, l'adreça temporal es tanca en acabar.
    try {
      const testimoni = await this.testimoni(compte, clau);
      const url = `${origen}/api/public/instagram/imatges/${testimoniImatge}.jpg`;
      const r = await this.client.publicaImatge(compte.ig_usuari_id, testimoni, url, p.peu);
      const enllac = r.enllac && /^https:\/\/(www\.)?instagram\.com\//.test(r.enllac) ? r.enllac.slice(0, 300) : null;
      await this.aplica({ ...p, versio: versioActual }, versioActual, {
        estat: "publicada", ig_media_id: r.mediaId.slice(0, 64), enllac, imatge_testimoni_resum: null, imatge_caduca_el: null,
        publicat_per: ctx.usuariId, publicat_el: isoAra(this.rellotge),
      });
      await this.auditoria(casalId, ctx, "instagram.publicacio_publicada", id, "exit", { compte: compte.nom_usuari });
    } catch (e) {
      const missatge = e instanceof ErrorInstagram ? e.missatgeUsuari
        : e instanceof ErrorAplicacio ? e.missatge : "S'ha produït un error inesperat en publicar.";
      await this.repos.instagram.actualitzarPublicacio(id, versioActual, {
        estat: "error", error_missatge: missatge.slice(0, 500), imatge_testimoni_resum: null, imatge_caduca_el: null,
      }, isoAra(this.rellotge));
      await this.auditoria(casalId, ctx, "instagram.publicacio_publicada", id, "error");
      if (!(e instanceof ErrorInstagram) && !(e instanceof ErrorAplicacio)) throw e;
    }
    return this.publicacio(casalId, id);
  }

  /** Imatge per a Instagram mentre es publica (adreça temporal, sense sessió). */
  async imatgePublica(testimoniImatge: string): Promise<R2ObjectBody | null> {
    if (!this.fitxers || !/^[A-Za-z0-9_-]{20,100}$/.test(testimoniImatge)) return null;
    const p = await this.repos.instagram.publicacioPerImatge(await resumSha256(`instagram-imatge:${testimoniImatge}`));
    if (!p || p.estat !== "publicant" || !p.imatge_caduca_el || Date.parse(p.imatge_caduca_el) < this.rellotge.ara().getTime()) return null;
    const fitxer = await this.repos.cartells.fitxer(p.fitxer_id);
    if (!fitxer || fitxer.tipus_mime !== "image/jpeg") return null;
    return this.fitxers.get(fitxer.clau);
  }
}
