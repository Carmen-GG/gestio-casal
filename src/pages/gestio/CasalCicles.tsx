import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ETIQUETES_ESTAT_CICLE } from "../../../shared/domain/cicles";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
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

  if (!casal) return <p role="alert" className="avis avis--error">No teniu accés a aquest casal.</p>;

  return (
    <div>
      <p className="subtitol">{casal.codi}</p>
      <h1>{casal.nom}</h1>
      {pot("usuaris.gestionar") && (
        <p><Link to={`/gestio/${casalId}/usuaris`}>Persones autoritzades</Link></p>
      )}
      {exit && <AvisExit>{exit}</AvisExit>}

      <Seccio titol="Cicles d'activitats">
        {consulta.tipus === "carregant" && <Carregant />}
        {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
        {consulta.tipus === "dades" && (consulta.dades.cicles.length === 0 ? (
          <p>Encara no hi ha cap cicle.</p>
        ) : (
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Cicles">
            <table className="taula">
              <thead><tr><th scope="col">Cicle</th><th scope="col">Any</th><th scope="col">Dates</th><th scope="col">Estat</th></tr></thead>
              <tbody>
                {consulta.dades.cicles.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/gestio/${casalId}/cicles/${c.id}`}>{c.nom}</Link></td>
                    <td>{c.any}</td>
                    <td>{formataData(c.data_inici)} – {formataData(c.data_fi)}</td>
                    <td><span className="etiqueta">{ETIQUETES_ESTAT_CICLE[c.estat]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Seccio>

      {pot("cicles.gestionar") && (
        <Seccio titol="Nou cicle" obertaInicial={false}>
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
