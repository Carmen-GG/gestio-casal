import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ETIQUETES_ESTAT_CICLE } from "../../../shared/domain/cicles";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { AvisExit } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Cicle } from "../../types/gestio";
import { formataData } from "../../utils/format";
import { useGestio, usePermisos } from "./context";
import { FormCicle } from "./FormCicle";

export function CasalCicles() {
  const { casalId = "" } = useParams();
  const { jo } = useGestio();
  const pot = usePermisos(casalId);
  const navegar = useNavigate();
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.cicles(casalId, s), [casalId, versio]);
  const casal = jo.casals.find((c) => c.id === casalId);
  const [exit, setExit] = useState("");
  const [eliminant, setEliminant] = useState<Cicle | null>(null);
  const [errorEliminar, setErrorEliminar] = useState<ErrorClientApi | null>(null);
  const [enCurs, setEnCurs] = useState(false);

  async function elimina(motiu: string) {
    if (!eliminant) return;
    setEnCurs(true); setErrorEliminar(null); setExit("");
    try {
      const r = await serveiGestio.eliminarCicle(casalId, eliminant.id, { versio: eliminant.versio, motiu });
      setExit(`S'ha eliminat el cicle «${eliminant.nom}»${r.activitats ? ` i les seves ${r.activitats} activitats` : ""}.`);
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof ErrorClientApi) setErrorEliminar(e); else throw e;
    } finally { setEnCurs(false); setEliminant(null); }
  }
  // Conserge: només passa llista, així que cada cicle porta directament a l'assistència.
  const nomesAssistencia = pot("assistencia.registrar") && !pot("sollicituds.consultar") && !pot("cicles.gestionar");
  const senseCicles = consulta.tipus === "dades" && consulta.dades.cicles.length === 0;

  if (!casal) return <p role="alert" className="avis avis--error">No teniu accés a aquest casal.</p>;

  return (
    <div>
      <p className="subtitol">{casal.codi}</p>
      <h1>{casal.nom}</h1>
      {pot("usuaris.gestionar") && (
        <p><Link to={`/gestio/${casalId}/usuaris`}>Equip del casal</Link></p>
      )}
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {errorEliminar && <MissatgeError error={errorEliminar} />}
      </div>
      {nomesAssistencia && <p>Trieu un cicle per passar llista a les activitats i imprimir les graelles d'assistència.</p>}

      <Seccio titol="Cicles d'activitats">
        {consulta.tipus === "carregant" && <Carregant />}
        {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
        {consulta.tipus === "dades" && (consulta.dades.cicles.length === 0 ? (
          <p>
            Encara no hi ha cap cicle.
            {pot("cicles.gestionar") && " Per començar, creeu-ne un a la secció «Nou cicle»: després hi podreu afegir les activitats i obrir les inscripcions."}
          </p>
        ) : (
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Cicles">
            <table className="taula">
              <thead><tr><th scope="col">Cicle</th><th scope="col">Any</th><th scope="col">Dates</th><th scope="col">Estat</th>{pot("cicles.gestionar") && <th scope="col">Accions</th>}</tr></thead>
              <tbody>
                {consulta.dades.cicles.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/gestio/${casalId}/cicles/${c.id}${nomesAssistencia ? "/assistencia" : ""}`}>{c.nom}</Link></td>
                    <td>{c.any}</td>
                    <td>{formataData(c.data_inici)} – {formataData(c.data_fi)}</td>
                    <td><span className="etiqueta">{ETIQUETES_ESTAT_CICLE[c.estat]}</span></td>
                    {pot("cicles.gestionar") && (
                      <td><button type="button" className="boto boto--perill boto--petit" onClick={() => { setErrorEliminar(null); setEliminant(c); }}>Elimina</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Seccio>

      <DialegConfirmacio obert={eliminant !== null} enCurs={enCurs} titol="Eliminar el cicle" textConfirmar="Elimina el cicle" demanaMotiu
        onCancelar={() => setEliminant(null)} onConfirmar={(motiu) => void elimina(motiu)}>
        <p>S'eliminarà el cicle «{eliminant?.nom}» amb totes les seves activitats. No es pot desfer.</p>
        <p>Només es pot eliminar si encara no té inscripcions, places, assistència ni comunicacions. Si ja en té, l'aplicació no l'eliminarà: arxiveu-lo.</p>
      </DialegConfirmacio>

      {pot("cicles.gestionar") && (
        // Sense cap cicle, el formulari s'obre directament: és el primer pas al casal.
        <Seccio key={senseCicles ? "obert" : "tancat"} titol="Nou cicle" obertaInicial={senseCicles}>
          <FormCicle textBoto="Crea el cicle" onDesar={async (dades) => {
            const { cicle } = await serveiGestio.crearCicle(casalId, dades);
            setExit(`S'ha creat el cicle «${cicle.nom}».`);
            setVersio((v) => v + 1);
            navegar(`/gestio/${casalId}/cicles/${cicle.id}`);
          }} />
        </Seccio>
      )}
    </div>
  );
}
