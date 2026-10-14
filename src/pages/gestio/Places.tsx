import { useState } from "react";
import { Link } from "react-router";
import { ACCIONS_OCUPEN_PLACA, ACCIONS_PLACA, ETIQUETES_ESTAT_PLACA, type AccioPlaca } from "../../../shared/schemas/adjudicacio";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { descarrega, generaXlsx } from "../../fitxers/xlsx";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { FilaPlaca, RespostaPlaces } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";
import { nomComplet } from "./Sollicituds";

type Grup = RespostaPlaces["grups"][number];

/**
 * Places i llistes d'espera després de confirmar l'adjudicació: renúncies,
 * baixes, ofertes de vacants i acceptacions. Cada acció exigeix un motiu.
 */
export function Places({ casalId, cicleId, pot, versioCicle, onCanvi }: {
  casalId: string; cicleId: string; pot: (p: string) => boolean; versioCicle: number; onCanvi?: () => void;
}) {
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.places(casalId, cicleId, s), [casalId, cicleId, versio, versioCicle]);
  const [pendent, setPendent] = useState<{ placa: FilaPlaca; accio: AccioPlaca } | null>(null);
  const [exit, setExit] = useState("");
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [moviments, setMoviments] = useState<string | null>(null);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant les places…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  if (!d.execucio_confirmada) return <p>Encara no hi ha cap adjudicació confirmada en aquest cicle.</p>;
  const gestiona = d.gestionable && pot("places.gestionar");

  async function accio(fer: () => Promise<unknown>, missatge: string) {
    setError(null);
    setExit("");
    setEnCurs(true);
    try {
      await fer();
      setExit(missatge);
      setVersio((v) => v + 1);
      onCanvi?.();
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e);
      else throw e;
    } finally {
      setEnCurs(false);
      setPendent(null);
    }
  }

  const exporta = (tipus: "admesos" | "espera") => accio(async () => {
    const taula = await serveiGestio.exportacioPlaces(casalId, cicleId, tipus);
    descarrega(await generaXlsx(taula), taula.fitxer);
  }, "S'ha descarregat el fitxer XLSX.");

  return (
    <div>
      <p className="text-secundari">
        Situació segons l'adjudicació confirmada v{d.execucio_confirmada.versio} ({formataDataHora(d.execucio_confirmada.confirmada_el)}) i els canvis posteriors.
        {!d.gestionable && " Les places només es poden modificar quan el cicle està adjudicat o publicat."}
      </p>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {error && <MissatgeError error={error} />}
      </div>
      {pot("dades.exportar") && (
        <div className="botonera">
          <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={() => void exporta("admesos")}>Exporta les persones admeses (XLSX)</button>
          <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={() => void exporta("espera")}>Exporta la llista d'espera (XLSX)</button>
        </div>
      )}
      <div className="grups-activitat">
        {d.grups.map((g) => (
          <details key={g.activitat_id} className="grup-activitat" open={d.grups.length <= 4}>
            <summary>
              <strong>{g.activitat}</strong>{" "}
              <span className="text-secundari">· {g.ocupades} de {g.capacitat} places ocupades · {g.lliures} lliures · {g.espera} en espera</span>
              {g.minim_participants !== null && g.ocupades < g.minim_participants && (
                <span className="etiqueta etiqueta--alerta">Per sota del mínim ({g.minim_participants})</span>
              )}
            </summary>
            <TaulaPlaces casalId={casalId} grup={g} gestiona={gestiona} onAccio={(placa, a) => setPendent({ placa, accio: a })}
              moviments={moviments} onMoviments={(id) => setMoviments((m) => (m === id ? null : id))} />
          </details>
        ))}
      </div>

      <DialegConfirmacio
        obert={pendent !== null}
        enCurs={enCurs}
        titol={pendent ? ACCIONS_PLACA[pendent.accio].text : ""}
        textConfirmar="Confirma"
        demanaMotiu
        onCancelar={() => setPendent(null)}
        onConfirmar={(motiu) => pendent && void accio(
          () => serveiGestio.mourePlaca(casalId, pendent.placa.id, { accio: pendent.accio, versio: pendent.placa.versio, motiu }),
          `${nomComplet(pendent.placa.participant)}: ${ETIQUETES_ESTAT_PLACA[ACCIONS_PLACA[pendent.accio].cap].toLowerCase()}.`)}
      >
        {pendent && (
          <p>
            {nomComplet(pendent.placa.participant)}, {pendent.placa.participant.nom} (núm. {pendent.placa.numero}):
            de «{ETIQUETES_ESTAT_PLACA[pendent.placa.estat]}» a «{ETIQUETES_ESTAT_PLACA[ACCIONS_PLACA[pendent.accio].cap]}».
            {(pendent.accio === "renunciar" || pendent.accio === "donar_baixa") && " Aquest canvi no es pot desfer des del panell."}
          </p>
        )}
      </DialegConfirmacio>
    </div>
  );
}

function TaulaPlaces({ casalId, grup, gestiona, onAccio, moviments, onMoviments }: {
  casalId: string; grup: Grup; gestiona: boolean; onAccio: (p: FilaPlaca, a: AccioPlaca) => void;
  moviments: string | null; onMoviments: (id: string) => void;
}) {
  // Només s'ofereixen les accions possibles: les que ocupen plaça requereixen places lliures.
  const accions = (p: FilaPlaca) => (Object.keys(ACCIONS_PLACA) as AccioPlaca[]).filter((a) =>
    (ACCIONS_PLACA[a].des as readonly string[]).includes(p.estat) && (!ACCIONS_OCUPEN_PLACA.includes(a) || grup.lliures > 0));
  return (
    <div className="taula-contenidor" tabIndex={0} role="region" aria-label={`Places de ${grup.activitat}`}>
      <table className="taula taula--densa">
        <thead>
          <tr>
            <th scope="col">Núm.</th><th scope="col">Cognoms</th><th scope="col">Nom</th><th scope="col">Pref.</th>
            <th scope="col">Estat</th><th scope="col">Darrer canvi</th><th scope="col"><span className="visualment-amagat">Accions</span></th>
          </tr>
        </thead>
        <tbody>
          {grup.places.map((p) => (
            <FilaPlacaVista key={p.id} casalId={casalId} p={p} accions={gestiona ? accions(p) : []} onAccio={onAccio}
              obert={moviments === p.id} onMoviments={() => onMoviments(p.id)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaPlacaVista({ casalId, p, accions, onAccio, obert, onMoviments }: {
  casalId: string; p: FilaPlaca; accions: AccioPlaca[]; onAccio: (p: FilaPlaca, a: AccioPlaca) => void; obert: boolean; onMoviments: () => void;
}) {
  return (
    <>
      <tr className={p.estat === "renuncia" || p.estat === "baixa" ? "fila--anullada" : undefined}>
        <td><Link to={`/gestio/${casalId}/sollicituds/${p.sollicitud_id}`}>{p.numero}</Link></td>
        <td>{nomComplet(p.participant)}</td>
        <td>{p.participant.nom}</td>
        <td>{p.preferencia}</td>
        <td><span className={`etiqueta etiqueta--${p.estat}`}>{ETIQUETES_ESTAT_PLACA[p.estat]}{p.posicio_espera && p.estat === "llista_espera" ? ` (${p.posicio_espera})` : ""}</span></td>
        <td className="nowrap">{formataDataHora(p.actualitzat_el)}</td>
        <td>
          <div className="accions-fila">
            {accions.map((a) => (
              <button key={a} type="button" className={`boto boto--petit ${a === "renunciar" || a === "donar_baixa" ? "boto--perill" : "boto--secundari"}`}
                onClick={() => onAccio(p, a)}>{ACCIONS_PLACA[a].text}</button>
            ))}
            <button type="button" className="boto boto--secundari boto--petit" aria-expanded={obert} onClick={onMoviments}>Moviments</button>
          </div>
        </td>
      </tr>
      {obert && (
        <tr>
          <td colSpan={7}><Moviments casalId={casalId} placaId={p.id} /></td>
        </tr>
      )}
    </>
  );
}

function Moviments({ casalId, placaId }: { casalId: string; placaId: string }) {
  const consulta = useConsulta((s) => serveiGestio.movimentsPlaca(casalId, placaId, s), [casalId, placaId]);
  if (consulta.tipus === "carregant") return <Carregant text="Carregant els moviments…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  return (
    <ol className="historial">
      {consulta.dades.moviments.map((m) => (
        <li key={m.id}>
          <strong>{formataDataHora(m.creat_el)}</strong>{" · "}
          {m.estat_anterior ? `${ETIQUETES_ESTAT_PLACA[m.estat_anterior]} → ` : ""}{ETIQUETES_ESTAT_PLACA[m.estat_nou]}
          {m.motiu && <div className="text-secundari">{m.motiu}</div>}
        </li>
      ))}
    </ol>
  );
}
