import { Link, useParams } from "react-router";
import { Carregant, MissatgeError } from "../components/EstatsConsulta";
import { useConsulta } from "../hooks/useConsulta";
import { serveiPublic } from "../services/public";
import { formataData, formataHorari } from "../utils/format";
import { FormulariInscripcio } from "./FormulariInscripcio";

export function ActivitatsCicle() {
  const { codiCasal = "", cicleId = "" } = useParams();
  const consulta = useConsulta((s) => serveiPublic.activitats(codiCasal, cicleId, s), [codiCasal, cicleId]);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant les activitats…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;

  const { casal, cicle, activitats, formulari } = consulta.dades;
  const formulariDisponible = cicle.accepta_sollicituds && activitats.length > 0 && formulari.informacio_privacitat !== "";
  return (
    <section aria-labelledby="titol-activitats">
      <p className="subtitol">
        <Link to={`/inscripcio/${casal.codi}`}>{casal.nom}</Link>
      </p>
      <h1 id="titol-activitats">{cicle.nom}</h1>
      <p>
        Del {formataData(cicle.data_inici)} al {formataData(cicle.data_fi)}. Data prevista de comunicació de la
        resolució: {formataData(cicle.data_resolucio_prevista)}.
      </p>
      {formulariDisponible ? (
        <FormulariInscripcio casal={casal} cicle={cicle} activitats={activitats} formulari={formulari} />
      ) : cicle.accepta_sollicituds && activitats.length > 0 ? (
        <p className="avis avis--alerta">El formulari d'inscripció d'aquest cicle encara no està disponible. Adreceu-vos al casal.</p>
      ) : null}
      {!cicle.accepta_sollicituds && <p className="avis avis--alerta">Ara mateix no s'accepten sol·licituds per a aquest cicle.</p>}
      {formulariDisponible ? null : activitats.length === 0 ? (
        <p>Aquest cicle encara no té activitats publicades.</p>
      ) : (
        <ul className="llista-targetes">
          {activitats.map((a) => (
            <li key={a.id} className="targeta">
              <h2>{a.nom}</h2>
              {a.categoria && <p className="etiqueta">{a.categoria}</p>}
              <p>{formataHorari(a)}</p>
              {a.data_inici && a.data_fi && (
                <p className="text-secundari">
                  Del {formataData(a.data_inici)} al {formataData(a.data_fi)}
                </p>
              )}
              {a.espai && <p className="text-secundari">Espai: {a.espai}</p>}
              {a.descripcio && <p>{a.descripcio}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
