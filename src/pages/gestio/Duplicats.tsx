import { useState } from "react";
import { Link } from "react-router";
import { ETIQUETES_ESTAT_SOLLICITUD } from "../../../shared/schemas/sollicituds";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { FilaSollicitud, ParellaDuplicada } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";
import { nomComplet } from "./Sollicituds";

const MOTIUS: Record<ParellaDuplicada["motius"][number], string> = {
  mateix_nom: "Mateix nom i cognoms",
  mateix_email: "Mateix correu",
  mateix_telefon: "Mateix telèfon",
  mateix_document: "Mateix DNI/NIE",
  mateix_codi_intern: "Mateix codi intern",
  mateixa_persona: "Mateixa persona registrada",
};

/**
 * Possibles duplicats per revisar a mà. No s'esborra res: la revisió només
 * deixa constància de la decisió. Per anul·lar una sol·licitud cal anar al seu detall.
 */
export function Duplicats({ casalId, cicleId, potGestionar }: { casalId: string; cicleId: string; potGestionar: boolean }) {
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.duplicats(casalId, cicleId, s), [casalId, cicleId, versio]);
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [mostraRevisats, setMostraRevisats] = useState(false);

  if (consulta.tipus === "carregant") return <Carregant />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const pendents = consulta.dades.parelles.filter((p) => !p.revisio);
  const revisats = consulta.dades.parelles.filter((p) => p.revisio);

  async function revisa(p: ParellaDuplicada, decisio: "no_duplicat" | "duplicat") {
    setError(null);
    try {
      await serveiGestio.revisarDuplicat(casalId, cicleId, { a: p.a.id, b: p.b.id, decisio });
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e);
      else throw e;
    }
  }

  const fitxa = (f: FilaSollicitud) => (
    <div>
      <Link to={`/gestio/${casalId}/sollicituds/${f.id}`}>Núm. {f.numero}: {f.participant.nom} {nomComplet(f.participant)}</Link>
      <div className="text-secundari">{formataDataHora(f.rebuda_el)} · {ETIQUETES_ESTAT_SOLLICITUD[f.estat]}</div>
    </div>
  );

  const llista = (parelles: ParellaDuplicada[]) => (
    <ul className="llista-duplicats">
      {parelles.map((p) => (
        <li key={`${p.a.id}-${p.b.id}`} className="targeta">
          <div className="duplicat__parella">{fitxa(p.a)}{fitxa(p.b)}</div>
          <p>{p.motius.map((m) => <span key={m} className="etiqueta">{MOTIUS[m]}</span>)}</p>
          {p.revisio && <p className="text-secundari">Revisat: {p.revisio.decisio === "duplicat" ? "és un duplicat" : "no és un duplicat"} ({formataDataHora(p.revisio.revisat_el)})</p>}
          {potGestionar && (
            <div className="botonera">
              <button type="button" className="boto boto--secundari boto--petit" onClick={() => revisa(p, "no_duplicat")}>No és un duplicat</button>
              <button type="button" className="boto boto--secundari boto--petit" onClick={() => revisa(p, "duplicat")}>És un duplicat</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <p className="text-secundari">
        Coincidències per revisar a mà. No s'elimina cap sol·licitud automàticament: si n'hi ha una de sobrera, obriu-la i
        anul·leu-la indicant el motiu.
      </p>
      {error && <MissatgeError error={error} />}
      {pendents.length === 0 ? <p>No hi ha possibles duplicats pendents de revisar.</p> : llista(pendents)}
      {revisats.length > 0 && (
        <>
          <button type="button" className="boto boto--secundari boto--petit" onClick={() => setMostraRevisats((x) => !x)}>
            {mostraRevisats ? "Amaga" : "Mostra"} les {revisats.length} parelles ja revisades
          </button>
          {mostraRevisats && llista(revisats)}
        </>
      )}
    </div>
  );
}
