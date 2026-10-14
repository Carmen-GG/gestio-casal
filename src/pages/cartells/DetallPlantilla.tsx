import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ESTACIONS, ETIQUETES_ESTACIO, ETIQUETES_ESTAT_PLANTILLA, ETIQUETES_ROL, ETIQUETES_TIPUS_PLANTILLA, ROLS_CAMP, ROLS_IMATGE,
  avisosPlantilla, type EstatPlantilla, type RolCamp,
} from "../../../shared/domain/cartells";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampSeleccio, CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiCartells } from "../../services/cartells";
import type { CampPlantilla, PlantillaCartells } from "../../types/gestio";
import { useGestio, usePermisos } from "../gestio/context";
import { ImatgeFitxer } from "./ImatgeFitxer";

const ACCIONS_ESTAT: Record<EstatPlantilla, { cap: EstatPlantilla; text: string }[]> = {
  esborrany: [{ cap: "activa", text: "Activa la plantilla" }, { cap: "arxivada", text: "Arxiva" }],
  activa: [{ cap: "esborrany", text: "Torna-la a esborrany" }, { cap: "arxivada", text: "Arxiva" }],
  arxivada: [{ cap: "esborrany", text: "Recupera-la com a esborrany" }],
};

/** Fitxa d'una plantilla: disseny base, camps detectats i el seu rol, dades i estat. */
export function DetallPlantilla() {
  const { casalId = "", plantillaId = "" } = useParams();
  const { jo } = useGestio();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiCartells.plantilla(casalId, plantillaId, s), [casalId, plantillaId, versio], plantillaId);

  if (consulta.tipus === "carregant") return <Carregant />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const p = consulta.dades.plantilla;
  const potEditar = p.casal_id === null ? jo.pot_gestionar_plantilles_comunes : pot("cartells.plantilles");
  return <Fitxa key={p.versio} casalId={casalId} p={p} potEditar={potEditar} onDesada={() => setVersio((v) => v + 1)} />;
}

function Fitxa({ casalId, p, potEditar, onDesada }: { casalId: string; p: PlantillaCartells; potEditar: boolean; onDesada: () => void }) {
  const [camps, setCamps] = useState<CampPlantilla[]>(p.camps);
  const [dades, setDades] = useState({ nom: p.nom, estacio: p.estacio ?? "", tematica: p.tematica ?? "", identitat_grafica: p.identitat_grafica ?? "" });
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [exit, setExit] = useState("");
  const [enCurs, setEnCurs] = useState(false);
  const [confirmaArxiu, setConfirmaArxiu] = useState(false);
  const [descarregant, setDescarregant] = useState(false);

  const avisos = avisosPlantilla(camps, p.linies_titol, p.amb_qr);
  const canviat = JSON.stringify(camps) !== JSON.stringify(p.camps)
    || dades.nom !== p.nom || dades.estacio !== (p.estacio ?? "") || dades.tematica !== (p.tematica ?? "")
    || dades.identitat_grafica !== (p.identitat_grafica ?? "");

  async function desa(canvis: Record<string, unknown>, missatge: string) {
    setEnCurs(true);
    setError(null);
    try {
      await serveiCartells.actualitzarPlantilla(casalId, p.id, { versio: p.versio, ...canvis });
      setExit(missatge);
      onDesada();
    } catch (e) {
      setError(e instanceof ErrorClientApi ? e : new ErrorClientApi(0, "error_desconegut", "S'ha produït un error inesperat."));
    } finally {
      setEnCurs(false);
      setConfirmaArxiu(false);
    }
  }

  async function descarregaOriginal() {
    setDescarregant(true);
    try {
      const bytes = await serveiCartells.fitxer(casalId, p.fitxer_id);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.nom.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "")}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof ErrorClientApi ? e : new ErrorClientApi(0, "error_desconegut", "No s'ha pogut descarregar el fitxer."));
    } finally {
      setDescarregant(false);
    }
  }

  const canviaRol = (i: number, rol: string) =>
    setCamps((cs) => cs.map((c, j) => (j === i ? { ...c, rol: (rol || null) as RolCamp | null } : c)));
  const rolsUsats = new Set(camps.map((c) => c.rol).filter(Boolean));

  return (
    <div>
      <p className="subtitol">
        <Link to={`/gestio/${casalId}/cartells`}>PG-Cartells</Link> · <Link to={`/gestio/${casalId}/cartells/plantilles`}>Plantilles</Link>
      </p>
      <h1>{p.nom}</h1>
      <p>
        <span className={`etiqueta etiqueta--${p.estat}`}>{ETIQUETES_ESTAT_PLANTILLA[p.estat]}</span>{" "}
        {ETIQUETES_TIPUS_PLANTILLA[p.tipus]} · {p.casal_id === null ? "Comuna a tots els casals" : "Només d'aquest casal"} ·
        Sortida {p.format_sortida === "1080x1080" ? "imatge de 1080 × 1080 px" : p.format_sortida}
      </p>
      {exit && <AvisExit>{exit}</AvisExit>}
      {error && <MissatgeError error={error} />}

      <div className="fitxa-plantilla">
        <figure className="fitxa-plantilla__disseny">
          <div className="disseny-camps">
            {p.previsualitzacio_id
              ? <ImatgeFitxer casalId={casalId} fitxerId={p.previsualitzacio_id} alt={`Disseny base de la plantilla ${p.nom}`} className="disseny-camps__imatge" />
              : <div className="imatge-fitxer--buida" />}
            {camps.map((c) => (
              <span key={c.nom} className={`disseny-camps__camp ${c.rol ? "" : "disseny-camps__camp--sense"}`} aria-hidden="true"
                style={{
                  left: `${(c.x / p.pagina_amplada) * 100}%`, width: `${(c.amplada / p.pagina_amplada) * 100}%`,
                  top: `${(1 - (c.y + c.alcada) / p.pagina_alcada) * 100}%`, height: `${(c.alcada / p.pagina_alcada) * 100}%`,
                }}>
                {c.rol ? ETIQUETES_ROL[c.rol] : c.nom}
              </span>
            ))}
          </div>
          <figcaption>Disseny base sense els continguts d'exemple. Els requadres marquen on va cada camp.</figcaption>
        </figure>
        <div className="botonera">
          <button type="button" className="boto boto--secundari" onClick={descarregaOriginal} disabled={descarregant}>
            {descarregant ? "Descarregant…" : "Descarrega el PDF original"}
          </button>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="avis avis--alerta" role="status">
          <p>Aquesta plantilla encara no es pot activar:</p>
          <ul>{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}

      <Seccio titol="Camps de la plantilla">
        <p>Cada camp del PDF original rep un contingut. {potEditar ? "Si la proposta no és correcta, canvieu-la." : ""}</p>
        <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Taula de camps del PDF">
          <table className="taula">
            <thead><tr><th scope="col">Camp del PDF</th><th scope="col">Tipus</th><th scope="col">Lletra</th><th scope="col">Contingut</th></tr></thead>
            <tbody>
              {camps.map((c, i) => (
                <tr key={c.nom}>
                  <th scope="row">{c.nom}</th>
                  <td>{c.tipus === "text" ? "Text" : "Imatge"}</td>
                  <td>{c.tipus === "text" ? `${c.mida_lletra ?? "–"} pt${c.negreta ? ", negreta" : ""}` : "–"}</td>
                  <td>
                    {potEditar ? (
                      <select aria-label={`Contingut del camp ${c.nom}`} value={c.rol ?? ""} onChange={(e) => canviaRol(i, e.target.value)}>
                        <option value="">Cap (es deixa en blanc)</option>
                        {ROLS_CAMP.filter((r) => (c.tipus === "imatge") === ROLS_IMATGE.includes(r)).map((r) => (
                          <option key={r} value={r} disabled={r !== c.rol && rolsUsats.has(r)}>{ETIQUETES_ROL[r]}</option>
                        ))}
                      </select>
                    ) : (c.rol ? ETIQUETES_ROL[c.rol] : "Cap")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccio>

      <Seccio titol="Dades de la plantilla" obertaInicial={potEditar}>
        {potEditar ? (
          <div className="graella-camps">
            <CampText etiqueta="Nom" obligatori value={dades.nom} maxLength={150} onChange={(e) => setDades({ ...dades, nom: e.target.value })} />
            <CampSeleccio etiqueta="Estació" value={dades.estacio} onChange={(e) => setDades({ ...dades, estacio: e.target.value })}
              opcions={[{ valor: "", text: "Cap" }, ...ESTACIONS.map((e) => ({ valor: e, text: ETIQUETES_ESTACIO[e] }))]} />
            <CampText etiqueta="Temàtica" value={dades.tematica} maxLength={100} onChange={(e) => setDades({ ...dades, tematica: e.target.value })} />
            <CampText etiqueta="Identitat gràfica" value={dades.identitat_grafica} maxLength={100}
              ajuda="P. ex. «La comunitat comença amb tu»." onChange={(e) => setDades({ ...dades, identitat_grafica: e.target.value })} />
          </div>
        ) : (
          <dl className="dades">
            <dt>Estació</dt><dd>{p.estacio ? ETIQUETES_ESTACIO[p.estacio] : "Cap"}</dd>
            <dt>Temàtica</dt><dd>{p.tematica ?? "Cap"}</dd>
            <dt>Identitat gràfica</dt><dd>{p.identitat_grafica ?? "Cap"}</dd>
          </dl>
        )}
      </Seccio>

      {potEditar && (
        <div className="botonera">
          <button type="button" className="boto" disabled={!canviat || enCurs || !dades.nom.trim()} onClick={() => desa({
            camps, nom: dades.nom, estacio: dades.estacio || null, tematica: dades.tematica, identitat_grafica: dades.identitat_grafica,
          }, "S'han desat els canvis.")}>
            {enCurs ? "Desant…" : "Desa els canvis"}
          </button>
          {!canviat && ACCIONS_ESTAT[p.estat].map((a) => (
            <button key={a.cap} type="button" className="boto boto--secundari" disabled={enCurs || (a.cap === "activa" && avisos.length > 0)}
              onClick={() => (a.cap === "arxivada" ? setConfirmaArxiu(true) : desa({ estat: a.cap }, `La plantilla ara està en estat «${ETIQUETES_ESTAT_PLANTILLA[a.cap]}».`))}>
              {a.text}
            </button>
          ))}
        </div>
      )}

      <DialegConfirmacio obert={confirmaArxiu} titol="Arxivar la plantilla" textConfirmar="Arxiva" enCurs={enCurs}
        onCancelar={() => setConfirmaArxiu(false)} onConfirmar={() => desa({ estat: "arxivada" }, "La plantilla s'ha arxivat.")}>
        <p>Deixarà d'aparèixer per crear materials nous. Els materials ja fets i el PDF original es conserven, i la podeu recuperar més endavant.</p>
      </DialegConfirmacio>
    </div>
  );
}
