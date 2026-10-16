import { useState } from "react";
import { Link, useParams } from "react-router";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import { Assistencia } from "./Assistencia";
import { usePermisos } from "./context";

/**
 * Pàgina d'assistència d'un cicle, sense la resta del cicle: és la pantalla de qui només
 * passa llista (conserge, petició de 2026-10-16).
 */
export function AssistenciaCicle() {
  const { casalId = "", cicleId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const detall = useConsulta((s) => serveiGestio.cicle(casalId, cicleId, s), [casalId, cicleId, versio]);

  if (detall.tipus === "carregant") return <Carregant text="Carregant el cicle…" />;
  if (detall.tipus === "error") return <MissatgeError error={detall.error} onReintentar={detall.reintentar} />;
  const { cicle } = detall.dades;

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}`}>Tornar al casal</Link></p>
      <h1>Assistència · {cicle.nom}</h1>
      {["adjudicat", "publicat", "finalitzat"].includes(cicle.estat)
        ? <Assistencia casalId={casalId} cicle={cicle} pot={pot} onCanviCicle={() => setVersio((v) => v + 1)} />
        : <p>Aquest cicle encara no té les places adjudicades: l'assistència es podrà passar quan les tingui.</p>}
    </div>
  );
}
