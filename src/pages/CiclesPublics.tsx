import { Link, useParams } from "react-router";
import { ETIQUETES_ESTAT_CICLE } from "../../shared/domain/cicles";
import { Carregant, MissatgeError } from "../components/EstatsConsulta";
import { useConsulta } from "../hooks/useConsulta";
import { serveiPublic } from "../services/public";
import { formataData, formataDataHora } from "../utils/format";

export function CiclesPublics() {
  const { codiCasal = "" } = useParams();
  const consulta = useConsulta((s) => serveiPublic.cicles(codiCasal, s), [codiCasal]);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant els cicles…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;

  const { casal, cicles } = consulta.dades;
  return (
    <section aria-labelledby="titol-cicles">
      <p className="subtitol">{casal.nom}</p>
      <h1 id="titol-cicles">Cicles d'activitats</h1>
      {cicles.length === 0 ? (
        <p>Ara mateix no hi ha cap cicle d'activitats publicat.</p>
      ) : (
        <ul className="llista-targetes">
          {cicles.map((c) => (
            <li key={c.id} className="targeta">
              <h2>
                <Link to={`/inscripcio/${casal.codi}/${c.id}`}>{c.nom}</Link>
              </h2>
              <p>
                Del {formataData(c.data_inici)} al {formataData(c.data_fi)}
              </p>
              <p>
                <span className={`etiqueta ${c.accepta_sollicituds ? "etiqueta--obert" : ""}`}>
                  {c.accepta_sollicituds ? "Inscripcions obertes" : ETIQUETES_ESTAT_CICLE[c.estat]}
                </span>
              </p>
              <p className="text-secundari">
                Termini d'inscripció: del {formataDataHora(c.obertura_inscripcions)} al{" "}
                {formataDataHora(c.tancament_inscripcions)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
