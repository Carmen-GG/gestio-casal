import { Link, useParams } from "react-router";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiCartells } from "../../services/cartells";
import { useGestio, usePermisos } from "../gestio/context";

/** Tauler de PG-Cartells: punt d'entrada del mòdul per a un casal. */
export function CartellsInici() {
  const { casalId = "" } = useParams();
  const { jo } = useGestio();
  const pot = usePermisos(casalId);
  const casal = jo.casals.find((c) => c.id === casalId);
  const consulta = useConsulta((s) => serveiCartells.plantilles(casalId, undefined, s), [casalId]);

  if (!casal || !pot("cartells.consultar")) return <p role="alert" className="avis avis--error">No teniu accés a PG-Cartells en aquest casal.</p>;

  return (
    <div>
      <p className="subtitol">{casal.nom}</p>
      <h1>PG-Cartells</h1>
      <p>Materials de difusió fets amb les plantilles institucionals «La comunitat comença amb tu».</p>
      {consulta.tipus === "carregant" && <Carregant />}
      {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
      {consulta.tipus === "dades" && (() => {
        const actives = consulta.dades.plantilles.filter((p) => p.estat === "activa");
        return (
          <dl className="xifres">
            <div><dt>Plantilles de cartell</dt><dd>{actives.filter((p) => p.tipus === "cartell").length}</dd></div>
            <div><dt>Plantilles d'Instagram</dt><dd>{actives.filter((p) => p.tipus === "instagram").length}</dd></div>
            {pot("cartells.plantilles") && (
              <div><dt>En esborrany</dt><dd>{consulta.dades.plantilles.filter((p) => p.estat === "esborrany").length}</dd></div>
            )}
          </dl>
        );
      })()}
      <ul className="llista-seccions">
        <li>
          <Link to={`/gestio/${casalId}/cartells/plantilles`}>Plantilles</Link>
          <span> · Cartells i publicacions d'Instagram disponibles{pot("cartells.plantilles") ? ", i càrrega de plantilles noves" : ""}.</span>
        </li>
      </ul>
    </div>
  );
}
