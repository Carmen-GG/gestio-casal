import { useState } from "react";
import { Link, useParams } from "react-router";
import { ETIQUETES_ESTAT_PUBLICACIO } from "../../../shared/domain/instagram";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampAreaText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiInstagram, type EstatCompteInstagram } from "../../services/instagram";
import { formataData, formataDataHora } from "../../utils/format";
import { useGestio, usePermisos } from "../gestio/context";
import "./instagram.css";

/** Instagram del casal: compte connectat i publicacions preparades a partir dels materials de PG-Cartells. */
export function Instagram() {
  const { casalId = "" } = useParams();
  const { jo } = useGestio();
  const pot = usePermisos(casalId);
  const casal = jo.casals.find((c) => c.id === casalId);
  const consulta = useConsulta(async (s) => {
    const [compte, { publicacions }] = await Promise.all([serveiInstagram.compte(casalId, s), serveiInstagram.publicacions(casalId, s)]);
    return { compte, publicacions };
  }, [casalId], casalId);

  if (!casal || !pot("instagram.publicar")) {
    return <p role="alert" className="avis avis--error">No teniu permís per preparar publicacions d'Instagram en aquest casal.</p>;
  }
  if (consulta.tipus === "carregant") return <Carregant />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const { compte, publicacions } = consulta.dades;
  const visibles = publicacions.filter((p) => p.estat !== "descartada");

  return (
    <div>
      <p className="subtitol">{casal.nom}</p>
      <h1>Instagram</h1>
      <p>
        Les imatges d'Instagram que feu a PG-Cartells es preparen aquí per publicar-les al compte del casal.
        L'aplicació no publica mai sola: cada publicació la revisa i la confirma una persona.
      </p>

      <Seccio titol="Compte del casal">
        <Compte casalId={casalId} estat={compte} potConfigurar={pot("casal.configurar")} onCanvi={consulta.reintentar} />
      </Seccio>

      <Seccio titol="Publicacions" accions={pot("cartells.generar") ? <Link className="boto" to={`/gestio/${casalId}/cartells/nou?tipus=instagram`}>Nova imatge</Link> : undefined}>
        {visibles.length === 0 ? (
          <p>Encara no hi ha cap publicació. Feu una imatge d'Instagram a «Nou material» i premeu «Prepara la publicació a Instagram».</p>
        ) : (
          <div className="taula-contenidor">
            <table className="taula">
              <thead><tr><th>Publicació</th><th>Estat</th><th>Data</th></tr></thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/gestio/${casalId}/instagram/${p.id}`}>{p.titol}</Link></td>
                    <td><span className={`etiqueta etiqueta-ig--${p.estat}`}>{ETIQUETES_ESTAT_PUBLICACIO[p.estat]}</span></td>
                    <td>{formataDataHora(p.publicat_el ?? p.creat_el)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccio>
    </div>
  );
}

function Compte({ casalId, estat, potConfigurar, onCanvi }: {
  casalId: string; estat: EstatCompteInstagram; potConfigurar: boolean; onCanvi: () => void;
}) {
  const [testimoni, setTestimoni] = useState("");
  const [formulari, setFormulari] = useState(false);
  const [desconnectant, setDesconnectant] = useState(false);
  const [enCurs, setEnCurs] = useState(false);
  const [error, setError] = useState("");
  const [exit, setExit] = useState("");

  async function connecta() {
    setEnCurs(true);
    setError("");
    try {
      const r = await serveiInstagram.connectar(casalId, testimoni.trim());
      setTestimoni("");
      setFormulari(false);
      setExit(`S'ha connectat el compte @${r.compte?.nom_usuari ?? ""}.`);
      onCanvi();
    } catch (e) {
      setError(e instanceof ErrorClientApi ? e.missatgeUsuari : "No s'ha pogut connectar el compte.");
    } finally {
      setEnCurs(false);
    }
  }

  async function desconnecta() {
    setEnCurs(true);
    try {
      await serveiInstagram.desconnectar(casalId);
      setDesconnectant(false);
      setExit("S'ha desconnectat el compte d'Instagram.");
      onCanvi();
    } catch (e) {
      setError(e instanceof ErrorClientApi ? e.missatgeUsuari : "No s'ha pogut desconnectar el compte.");
    } finally {
      setEnCurs(false);
    }
  }

  const caduca = estat.compte?.testimoni_caduca_el;
  const caducaAviat = caduca ? Date.parse(caduca) - Date.now() < 10 * 24 * 3600 * 1000 : false;

  return (
    <div>
      {exit && <AvisExit>{exit}</AvisExit>}
      {error && <p className="avis avis--error" role="alert">{error}</p>}
      {estat.compte ? (
        <>
          <p>Connectat al compte <strong>@{estat.compte.nom_usuari}</strong> des del {formataData(estat.compte.connectat_el)}.</p>
          {caduca && (
            <p className={caducaAviat ? "avis avis--alerta" : "camp__ajuda"}>
              El permís de publicació es renova sol cada vegada que es publica; si no es fa servir, caduca el {formataData(caduca)}.
            </p>
          )}
        </>
      ) : estat.configurat ? (
        <p>Aquest casal encara no té el compte d'Instagram connectat. Mentrestant, podeu preparar les publicacions i publicar-les des del mòbil.</p>
      ) : (
        <p>La publicació directa a Instagram encara no està activada en aquest servidor. Podeu preparar les publicacions i publicar-les des del mòbil.</p>
      )}

      {potConfigurar && estat.configurat && !formulari && (
        <div className="botonera">
          <button type="button" className={estat.compte ? "boto boto--secundari" : "boto"} onClick={() => { setFormulari(true); setExit(""); }}>
            {estat.compte ? "Torna a connectar" : "Connecta el compte d'Instagram"}
          </button>
          {estat.compte && <button type="button" className="boto boto--secundari" onClick={() => setDesconnectant(true)}>Desconnecta</button>}
        </div>
      )}

      {formulari && (
        <form className="ig-connexio" onSubmit={(e) => { e.preventDefault(); void connecta(); }}>
          <p>Per connectar el compte cal un <strong>testimoni d'accés</strong> de Meta del compte professional d'Instagram del casal:</p>
          <ol>
            <li>A <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">Meta for Developers</a>, obriu l'aplicació del casal i aneu a <em>Instagram › Configuració de l'API amb l'inici de sessió d'Instagram</em>.</li>
            <li>A «Genera testimonis d'accés», afegiu el compte del casal i premeu <em>Genera el testimoni</em>.</li>
            <li>Copieu el testimoni i enganxeu-lo aquí. Es desa xifrat i no es tornarà a mostrar.</li>
          </ol>
          <CampAreaText etiqueta="Testimoni d'accés" obligatori rows={3} value={testimoni} autoComplete="off" spellCheck={false}
            onChange={(e) => setTestimoni(e.target.value)} />
          <div className="botonera">
            <button type="submit" className="boto" disabled={enCurs || testimoni.trim().length < 20}>{enCurs ? "Comprovant…" : "Connecta"}</button>
            <button type="button" className="boto boto--secundari" onClick={() => { setFormulari(false); setTestimoni(""); setError(""); }}>Cancel·la</button>
          </div>
        </form>
      )}

      <DialegConfirmacio obert={desconnectant} titol="Desconnectar el compte d'Instagram" textConfirmar="Desconnecta" enCurs={enCurs}
        onConfirmar={() => void desconnecta()} onCancelar={() => setDesconnectant(false)}>
        <p>L'aplicació deixarà de poder publicar a @{estat.compte?.nom_usuari}. Les publicacions ja fetes no canvien.</p>
      </DialegConfirmacio>
    </div>
  );
}
