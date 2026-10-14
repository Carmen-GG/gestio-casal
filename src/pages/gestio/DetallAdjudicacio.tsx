import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ETIQUETES_CRITERI, ETIQUETES_ESTAT_EXECUCIO, ETIQUETES_METODE, ETIQUETES_MOTIU_NO_ADJUDICADA, ETIQUETES_RESULTAT,
} from "../../../shared/schemas/adjudicacio";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { descarrega, generaXlsx } from "../../fitxers/xlsx";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { FilaResultat, PersonaSenseActivitat } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";
import { usePermisos } from "./context";
import { nomComplet } from "./Sollicituds";

const ORDRE_RESULTAT = { admesa: 0, llista_espera: 1, no_adjudicada: 2 } as const;

/** Revisió d'una proposta d'adjudicació (o consulta d'una de confirmada) i confirmació amb motiu. */
export function DetallAdjudicacio() {
  const { casalId = "", execucioId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.execucio(casalId, execucioId, s), [casalId, execucioId, versio]);
  const [exit, setExit] = useState("");
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [confirmant, setConfirmant] = useState(false);
  const [enCurs, setEnCurs] = useState(false);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant la proposta…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const { execucio: e, cicle, grups, substitueix, pot_confirmar, sense_activitat } = consulta.dades;
  const p = e.resum.parametres;

  async function accio(fer: () => Promise<unknown>, missatge: string) {
    setError(null);
    setExit("");
    setEnCurs(true);
    try {
      await fer();
      setExit(missatge);
      setVersio((v) => v + 1);
    } catch (err) {
      if (err instanceof ErrorClientApi) setError(err);
      else throw err;
    } finally {
      setEnCurs(false);
      setConfirmant(false);
    }
  }

  const exporta = () => accio(async () => {
    const taula = await serveiGestio.exportacioAdjudicacio(casalId, execucioId);
    descarrega(await generaXlsx(taula), taula.fitxer);
  }, "S'ha descarregat el fitxer XLSX.");

  const exportaSense = () => accio(async () => {
    const taula = await serveiGestio.exportacioSenseActivitat(casalId, execucioId);
    descarrega(await generaXlsx(taula), taula.fitxer);
  }, "S'ha descarregat el llistat de persones sense cap activitat.");

  const sotaMinim = grups.filter((g) => g.sota_minim);

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}/cicles/${cicle.id}`}>Tornar al cicle «{cicle.nom}»</Link></p>
      <h1>Adjudicació v{e.versio}</h1>
      <p><span className={`etiqueta etiqueta--${e.estat}`}>{ETIQUETES_ESTAT_EXECUCIO[e.estat]}</span></p>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {error && <MissatgeError error={error} />}
      </div>

      <Seccio titol="Resum">
        <dl className="dades">
          <div><dt>Calculada</dt><dd>{formataDataHora(e.executada_el)} amb els paràmetres v{e.configuracio_versio}</dd></div>
          {p && <div><dt>Ordre de prioritat</dt><dd>{ETIQUETES_CRITERI[p.criteri_ordre]}{e.lletra_sorteig ? ` · lletra ${e.lletra_sorteig}` : ""}</dd></div>}
          {e.llavor_desempat && <div><dt>Llavor del sorteig</dt><dd className="codi">{e.llavor_desempat}</dd></div>}
          {p && <div><dt>Mètode</dt><dd>{ETIQUETES_METODE[p.metode]}</dd></div>}
          {p && <div><dt>Màxim d'activitats per persona</dt><dd>{p.maxim_activitats_per_persona ?? "Sense límit"}</dd></div>}
          {p?.prioritat_espera_anterior && <div><dt>Llista d'espera anterior</dt><dd>
            {e.resum.cicle_anterior
              ? `Prioritat respecte del cicle «${e.resum.cicle_anterior.nom}» (${e.resum.parelles_espera_anterior ?? 0} casos, preferències 1 a ${p.preferencia_maxima_espera_anterior})`
              : "No hi ha cap cicle anterior adjudicat"}
          </dd></div>}
          {e.resum.sortejos && e.resum.sortejos.length > 0 && <div><dt>Sortejos aplicats</dt><dd>
            {e.resum.sortejos.map((so) => `${e.resum.noms_activitats?.[so.activitat_id] ?? "Activitat"}: ${so.tipus === "lletra" ? "lletra" : "número"} ${so.valor}${so.origen === "manual" ? " (fet a mà)" : ""}`).join(" · ")}
          </dd></div>}
          {p?.prioritat_continuitat && <div><dt>Continuïtat</dt><dd>
            {e.resum.cicle_anterior ? `Respecte del cicle «${e.resum.cicle_anterior.nom}» (${e.resum.parelles_continuitat ?? 0} casos)` : "No hi ha cap cicle anterior adjudicat"}
          </dd></div>}
          <div><dt>Sol·licituds adjudicades</dt><dd>{e.resum.sollicituds ?? 0} ({e.resum.sollicituds_fora_adjudicacio ?? 0} no hi entren pel seu estat)</dd></div>
          <div><dt>Amb almenys una plaça</dt><dd>{e.resum.sollicituds_amb_placa ?? 0}</dd></div>
          <div><dt>Sense cap plaça</dt><dd>{e.resum.sollicituds_sense_placa ?? 0}</dd></div>
          {e.confirmada_el && <div><dt>Confirmada</dt><dd>{formataDataHora(e.confirmada_el)}</dd></div>}
          {e.motiu && <div><dt>Motiu</dt><dd>{e.motiu}</dd></div>}
        </dl>
        <div className="botonera">
          {pot_confirmar && pot("adjudicacio.confirmar") && (
            <button type="button" className={`boto ${substitueix ? "boto--perill" : ""}`} onClick={() => setConfirmant(true)}>
              {substitueix ? `Confirma i substitueix la v${substitueix.versio}` : "Confirma l'adjudicació"}
            </button>
          )}
          {pot("dades.exportar") && (
            <button type="button" className="boto boto--secundari" onClick={() => void exporta()} disabled={enCurs}>Exporta els resultats (XLSX)</button>
          )}
        </div>
        {e.estat === "proposta" && !pot_confirmar && (
          <p className="text-secundari">Per confirmar-la, el cicle ha d'estar «En procés d'adjudicació».</p>
        )}
        {sotaMinim.length > 0 && (
          <p className="avis avis--alerta">
            Per sota del mínim de participants: {sotaMinim.map((g) => `${g.activitat} (${e.resum.activitats?.[g.activitat_id]?.admeses ?? 0} de ${g.minim_participants})`).join(", ")}.
            És només un avís: l'aplicació no anul·la cap activitat.
          </p>
        )}
      </Seccio>

      <Seccio titol={`Persones sense cap activitat (${sense_activitat.length})`} obertaInicial={sense_activitat.length > 0}>
        {sense_activitat.length === 0 ? <p>Totes les persones han obtingut almenys una activitat.</p> : (
          <>
            <p className="text-secundari">Ordenades per nombre d'activitats demanades, per revisar si es pot fer alguna cosa a mà.</p>
            {pot("dades.exportar") && (
              <div className="botonera">
                <button type="button" className="boto boto--secundari" onClick={() => void exportaSense()} disabled={enCurs}>Exporta el llistat (XLSX)</button>
              </div>
            )}
            <TaulaSenseActivitat casalId={casalId} files={sense_activitat} />
          </>
        )}
      </Seccio>

      {grups.map((g) => {
        const r = e.resum.activitats?.[g.activitat_id];
        const files = [...g.resultats].sort((a, b) => ORDRE_RESULTAT[a.resultat] - ORDRE_RESULTAT[b.resultat]
          || (a.posicio_espera ?? 0) - (b.posicio_espera ?? 0));
        return (
          <Seccio key={g.activitat_id} titol={`${g.activitat} · ${r?.admeses ?? 0} de ${g.capacitat} places · ${r?.llista_espera ?? 0} en espera${g.sota_minim ? ` · per sota del mínim (${g.minim_participants})` : ""}`}
            obertaInicial={grups.length <= 6}>
            <TaulaResultats casalId={casalId} files={files} />
          </Seccio>
        );
      })}

      <DialegConfirmacio
        obert={confirmant}
        enCurs={enCurs}
        titol={substitueix ? "Substituir l'adjudicació confirmada" : "Confirmar l'adjudicació"}
        textConfirmar="Confirma"
        demanaMotiu={substitueix !== null}
        onCancelar={() => setConfirmant(false)}
        onConfirmar={(motiu) => void accio(() => serveiGestio.confirmarExecucio(casalId, execucioId, { confirmacio: true, ...(motiu ? { motiu } : {}) }),
          "Adjudicació confirmada. El cicle ara és «Adjudicat» i ja es poden gestionar les places.")}
      >
        <p>En confirmar-la es creen les places i les llistes d'espera, i el cicle passa a «Adjudicat».</p>
        {substitueix && (
          <p>Ja hi ha una adjudicació confirmada (v{substitueix.versio}). Quedarà com a substituïda i no s'esborrarà.
            Les renúncies i baixes registrades es mantenen.</p>
        )}
      </DialegConfirmacio>
    </div>
  );
}

function TaulaResultats({ casalId, files }: { casalId: string; files: FilaResultat[] }) {
  return (
    <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Resultats">
      <table className="taula taula--densa">
        <thead>
          <tr>
            <th scope="col">Núm.</th><th scope="col">Cognoms</th><th scope="col">Nom</th><th scope="col">Preferència</th>
            <th scope="col">Resultat</th><th scope="col">Observacions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={`${f.sollicitud_id}-${f.activitat_id}`}>
              <td><Link to={`/gestio/${casalId}/sollicituds/${f.sollicitud_id}`}>{f.numero}</Link></td>
              <td>{nomComplet(f.participant)}</td>
              <td>{f.participant.nom}</td>
              <td>{f.preferencia}</td>
              <td>{ETIQUETES_RESULTAT[f.resultat]}{f.posicio_espera ? ` (${f.posicio_espera})` : ""}</td>
              <td>{[f.per_espera_anterior ? "Prioritat: llista d'espera anterior" : null, f.per_continuitat ? "Per continuïtat" : null,
                f.motiu ? ETIQUETES_MOTIU_NO_ADJUDICADA[f.motiu as keyof typeof ETIQUETES_MOTIU_NO_ADJUDICADA] ?? f.motiu : null].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaulaSenseActivitat({ casalId, files }: { casalId: string; files: PersonaSenseActivitat[] }) {
  return (
    <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Persones sense cap activitat">
      <table className="taula taula--densa">
        <thead>
          <tr>
            <th scope="col">Núm.</th><th scope="col">Persona</th><th scope="col">Activitats demanades</th><th scope="col">Situació</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.sollicitud_id}>
              <td><Link to={`/gestio/${casalId}/sollicituds/${f.sollicitud_id}`}>{f.numero}</Link></td>
              <td>{nomComplet(f.participant)}, {f.participant.nom}</td>
              <td>{f.activitats_demanades}</td>
              <td>
                <ul className="llista-neta">
                  {f.detall.map((d) => (
                    <li key={d.preferencia}>
                      {d.preferencia}a · {d.activitat}: {d.resultat === "llista_espera" ? `llista d'espera, posició ${d.posicio_espera}` : d.motiu ?? "sense plaça"}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
