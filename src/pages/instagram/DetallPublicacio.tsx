import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  ESTATS_EDITABLES, ETIQUETES_ESTAT_PUBLICACIO, MAXIM_CARACTERS_PEU, MAXIM_ETIQUETES, compteEtiquetes, errorsPeu,
} from "../../../shared/domain/instagram";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampAreaText, CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiCartells } from "../../services/cartells";
import { serveiInstagram, type EstatCompteInstagram, type PublicacioInstagram } from "../../services/instagram";
import { formataDataHora } from "../../utils/format";
import { usePermisos } from "../gestio/context";
import "./instagram.css";

const missatge = (e: unknown, perDefecte: string) => (e instanceof ErrorClientApi ? e.missatgeUsuari : perDefecte);

/** Una publicació: previsualització, text, publicació amb confirmació o publicació a mà des del mòbil. */
export function DetallPublicacio() {
  const { casalId = "", publicacioId = "" } = useParams();
  const pot = usePermisos(casalId);
  const consulta = useConsulta(async (s) => {
    const [compte, { publicacio }] = await Promise.all([serveiInstagram.compte(casalId, s), serveiInstagram.publicacio(casalId, publicacioId, s)]);
    const imatge = await serveiCartells.fitxer(casalId, publicacio.fitxer_id, s);
    return { compte, publicacio, imatge: new Blob([imatge], { type: "image/jpeg" }) };
  }, [casalId, publicacioId], publicacioId);

  if (!pot("instagram.publicar")) return <p role="alert" className="avis avis--error">No teniu permís per preparar publicacions d'Instagram en aquest casal.</p>;
  if (consulta.tipus === "carregant") return <Carregant />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  return <Detall key={consulta.dades.publicacio.versio} casalId={casalId} {...consulta.dades} onCanvi={consulta.reintentar} />;
}

function Detall({ casalId, compte, publicacio: inicial, imatge, onCanvi }: {
  casalId: string; compte: EstatCompteInstagram; publicacio: PublicacioInstagram; imatge: Blob; onCanvi: () => void;
}) {
  const [p, setP] = useState(inicial);
  const [peu, setPeu] = useState(inicial.peu);
  const [url, setUrl] = useState("");
  const [dialeg, setDialeg] = useState<"" | "publica" | "manual" | "descarta">("");
  const [enllacManual, setEnllacManual] = useState("");
  const [enCurs, setEnCurs] = useState(false);
  const [error, setError] = useState("");
  const [exit, setExit] = useState("");

  useEffect(() => {
    const u = URL.createObjectURL(imatge);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [imatge]);

  const editable = ESTATS_EDITABLES.includes(p.estat);
  const errorsText = errorsPeu(peu);
  const canviat = peu.trim() !== p.peu;
  const nomFitxer = `instagram-${p.titol.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "publicacio"}.jpg`;
  const fitxer = new File([imatge], nomFitxer, { type: "image/jpeg" });
  const potCompartir = typeof navigator.canShare === "function" && navigator.canShare({ files: [fitxer] });

  async function executa(accio: () => Promise<{ publicacio: PublicacioInstagram }>, textExit: string, perDefecte: string) {
    setEnCurs(true);
    setError("");
    setExit("");
    try {
      const r = await accio();
      setP(r.publicacio);
      setPeu(r.publicacio.peu);
      setDialeg("");
      if (r.publicacio.estat === "error") setError(r.publicacio.error_missatge ?? perDefecte);
      else setExit(textExit);
    } catch (e) {
      setDialeg("");
      setError(missatge(e, perDefecte));
      // Si la resposta no ha arribat (p. ex. temps esgotat), es torna a llegir l'estat real.
      if (e instanceof ErrorClientApi && e.status === 0) onCanvi();
    } finally {
      setEnCurs(false);
    }
  }

  const desaText = () => executa(() => serveiInstagram.actualitzar(casalId, p.id, { versio: p.versio, peu: peu.trim() }), "S'ha desat el text.", "No s'ha pogut desar el text.");

  function descarrega() {
    const a = document.createElement("a");
    a.href = url;
    a.download = nomFitxer;
    document.body.append(a);
    a.click();
    a.remove();
  }

  async function copiaText() {
    try {
      await navigator.clipboard.writeText(peu.trim());
      setExit("S'ha copiat el text. Enganxeu-lo a Instagram quan hi pugeu la imatge.");
    } catch {
      setError("No s'ha pogut copiar el text. Seleccioneu-lo i copieu-lo a mà.");
    }
  }

  async function comparteix() {
    try {
      await navigator.clipboard.writeText(peu.trim()).catch(() => undefined);
      await navigator.share({ files: [fitxer], text: peu.trim() });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("No s'ha pogut obrir el menú de compartir del dispositiu.");
    }
  }

  const nomCompte = compte.compte?.nom_usuari;

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}/instagram`}>Instagram</Link></p>
      <h1>{p.titol}</h1>
      <p>
        <span className={`etiqueta etiqueta-ig--${p.estat}`}>{ETIQUETES_ESTAT_PUBLICACIO[p.estat]}</span>
        {p.publicat_el && <> · {formataDataHora(p.publicat_el)}</>}
        {p.enllac && <> · <a href={p.enllac} target="_blank" rel="noreferrer">Obre-la a Instagram</a></>}
      </p>
      {exit && <AvisExit>{exit}</AvisExit>}
      {error && <p className="avis avis--error" role="alert">{error}</p>}

      <div className="ig-detall">
        <Previsualitzacio url={url} nomCompte={nomCompte} peu={peu} titol={p.titol} />

        <div>
          {editable && (
            <Seccio titol="Text de la publicació">
              <CampAreaText etiqueta="Text" rows={10} value={peu} onChange={(e) => setPeu(e.target.value)} maxLength={MAXIM_CARACTERS_PEU + 200}
                error={errorsText[0]}
                ajuda={`${[...peu.trim()].length} de ${MAXIM_CARACTERS_PEU} caràcters · ${compteEtiquetes(peu)} de ${MAXIM_ETIQUETES} etiquetes (#)`} />
              {canviat && (
                <div className="botonera">
                  <button type="button" className="boto" disabled={enCurs || errorsText.length > 0} onClick={() => void desaText()}>Desa el text</button>
                  <button type="button" className="boto boto--secundari" onClick={() => setPeu(p.peu)}>Desfés els canvis</button>
                </div>
              )}
            </Seccio>
          )}

          {editable && (
            <Seccio titol="Publicar al compte del casal">
              {nomCompte ? (
                <>
                  <p>Es publicarà la imatge amb aquest text al compte <strong>@{nomCompte}</strong>.</p>
                  <div className="botonera">
                    <button type="button" className="boto" disabled={enCurs || canviat || errorsText.length > 0} onClick={() => setDialeg("publica")}>
                      Publica a Instagram
                    </button>
                  </div>
                  {canviat && <p className="camp__ajuda">Deseu el text abans de publicar.</p>}
                </>
              ) : (
                <p>
                  El casal encara no té el compte d'Instagram connectat
                  {textConfiguracio(compte)}. Mentrestant, la podeu publicar des del mòbil amb les opcions de sota.
                </p>
              )}
            </Seccio>
          )}

          {editable && (
            <Seccio titol="Publicar des del mòbil" obertaInicial={!nomCompte}>
              <p>Descarregueu la imatge i copieu el text, o compartiu-los directament amb l'aplicació d'Instagram del mòbil. Després, marqueu-la com a publicada.</p>
              <div className="botonera">
                {potCompartir && <button type="button" className="boto" onClick={() => void comparteix()}>Comparteix a Instagram</button>}
                <button type="button" className="boto boto--secundari" onClick={descarrega} disabled={!url}>Descarrega la imatge</button>
                <button type="button" className="boto boto--secundari" onClick={() => void copiaText()}>Copia el text</button>
                <button type="button" className="boto boto--secundari" onClick={() => setDialeg("manual")} disabled={canviat}>Marca com a publicada</button>
              </div>
            </Seccio>
          )}

          {editable && (
            <div className="botonera">
              <button type="button" className="boto boto--secundari" onClick={() => setDialeg("descarta")}>Descarta aquesta publicació</button>
            </div>
          )}
        </div>
      </div>

      <DialegConfirmacio obert={dialeg === "publica"} titol={`Publicar a @${nomCompte ?? ""}`} textConfirmar="Publica ara" enCurs={enCurs}
        onCancelar={() => setDialeg("")}
        onConfirmar={() => void executa(() => serveiInstagram.publicar(casalId, p.id, p.versio), "S'ha publicat a Instagram.", "No s'ha pogut publicar.")}>
        <p>La imatge i el text es publicaran ara mateix al compte <strong>@{nomCompte}</strong> i les veurà tothom qui segueix el casal.</p>
        {url && <img src={url} alt="" className="ig-dialeg__imatge" />}
        <p className="ig-dialeg__text">{peu.trim() || "(sense text)"}</p>
        <p className="camp__ajuda">Un cop publicada, si cal canviar-la s'ha de fer des d'Instagram.</p>
      </DialegConfirmacio>

      <DialegConfirmacio obert={dialeg === "manual"} titol="Marcar com a publicada" textConfirmar="Marca com a publicada" enCurs={enCurs}
        onCancelar={() => setDialeg("")}
        onConfirmar={() => void executa(() => serveiInstagram.marcarManual(casalId, p.id, p.versio, enllacManual.trim() || null),
          "S'ha marcat com a publicada.", "No s'ha pogut desar.")}>
        <p>Marqueu-la quan ja l'hàgiu publicada des de l'aplicació d'Instagram.</p>
        <CampText etiqueta="Enllaç a la publicació" type="url" value={enllacManual} onChange={(e) => setEnllacManual(e.target.value)}
          placeholder="https://www.instagram.com/p/…" maxLength={300} />
      </DialegConfirmacio>

      <DialegConfirmacio obert={dialeg === "descarta"} titol="Descartar la publicació" textConfirmar="Descarta" enCurs={enCurs}
        onCancelar={() => setDialeg("")}
        onConfirmar={() => void executa(() => serveiInstagram.actualitzar(casalId, p.id, { versio: p.versio, descartar: true }),
          "S'ha descartat la publicació.", "No s'ha pogut descartar.")}>
        <p>La publicació deixarà d'aparèixer a la llista. No es publicarà.</p>
      </DialegConfirmacio>
    </div>
  );
}

const textConfiguracio = (c: EstatCompteInstagram) => (c.configurat ? " (ho pot fer la persona responsable a la pàgina d'Instagram)" : "");

/** Com es veurà la publicació a Instagram. */
function Previsualitzacio({ url, nomCompte, peu, titol }: { url: string; nomCompte?: string; peu: string; titol: string }) {
  return (
    <figure className="ig-previsualitzacio" aria-label="Previsualització de la publicació">
      <div className="ig-previsualitzacio__capcalera"><span className="ig-previsualitzacio__avatar" aria-hidden="true" />{nomCompte ? nomCompte : "compte del casal"}</div>
      {url ? <img src={url} alt={`Imatge de la publicació «${titol}»`} /> : <div className="ig-previsualitzacio__buida" />}
      <figcaption>
        <strong>{nomCompte ?? "casal"}</strong> <span className="ig-previsualitzacio__text">{peu.trim()}</span>
      </figcaption>
    </figure>
  );
}
