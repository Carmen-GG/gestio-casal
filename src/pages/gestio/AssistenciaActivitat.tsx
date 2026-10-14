import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ESTATS_ASSISTENCIA, ETIQUETES_ASSISTENCIA, type EstatAssistencia } from "../../../shared/domain/assistencia";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { FullAssistencia, Sessio } from "../../types/gestio";
import { formataData } from "../../utils/format";
import { usePermisos } from "./context";
import { Historial } from "./Historial";
import { nomComplet } from "./Sollicituds";

const ESTATS_SESSIO = { prevista: "Prevista", realitzada: "Feta", cancellada: "Cancel·lada" } as const;
const ABREV: Record<EstatAssistencia, string> = { present: "P", absent: "A", absencia_justificada: "J" };

/** Sessions i registre d'assistència d'una activitat. */
export function AssistenciaActivitat() {
  const { casalId = "", activitatId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.fullAssistencia(casalId, activitatId, s), [casalId, activitatId, versio]);
  const [exit, setExit] = useState("");
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [sessioOberta, setSessioOberta] = useState<string | null>(null);
  const [cancellant, setCancellant] = useState<Sessio | null>(null);
  const [historial, setHistorial] = useState<string | null>(null);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant l'assistència…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const f = consulta.dades;
  const registra = f.pot_registrar && pot("assistencia.registrar");
  const gestionaSessions = f.pot_crear_sessions && pot("assistencia.registrar");
  const sessio = f.sessions.find((s) => s.id === sessioOberta) ?? null;

  async function accio(fer: () => Promise<unknown>, missatge: string | ((r: unknown) => string)) {
    setError(null);
    setExit("");
    setEnCurs(true);
    try {
      const r = await fer();
      setExit(typeof missatge === "string" ? missatge : missatge(r));
      setVersio((v) => v + 1);
      return true;
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e);
      else throw e;
      return false;
    } finally {
      setEnCurs(false);
      setCancellant(null);
    }
  }

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}/cicles/${f.cicle.id}`}>Tornar al cicle «{f.cicle.nom}»</Link></p>
      <h1>Assistència · {f.activitat.nom}</h1>
      <p className="text-secundari">{[f.activitat.horari, `${f.activitat.capacitat} places`].filter(Boolean).join(" · ")}</p>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {error && <MissatgeError error={error} />}
      </div>
      {!f.pot_registrar && <p className="avis avis--alerta">L'assistència només es pot registrar quan el cicle està adjudicat o publicat.</p>}

      <Seccio titol={`Sessions (${f.sessions.filter((s) => s.estat !== "cancellada").length})`}>
        {gestionaSessions && (
          <div className="botonera">
            <button type="button" className="boto boto--secundari" disabled={enCurs}
              onClick={() => void accio(() => serveiGestio.generarSessions(casalId, activitatId),
                (r) => { const x = r as { creades: number; existents: number }; return `S'han creat ${x.creades} sessions (${x.existents} ja existien).`; })}>
              Genera el calendari de sessions
            </button>
          </div>
        )}
        {gestionaSessions && <NovaSessio enCurs={enCurs} onAfegir={(dades) => accio(() => serveiGestio.afegirSessio(casalId, activitatId, dades), "S'ha afegit la sessió.")} />}
        {f.sessions.length === 0 ? <p>Encara no hi ha sessions. Genereu el calendari a partir dels dies de l'activitat o afegiu-les una a una.</p> : (
          <ul className="llista-sessions">
            {f.sessions.map((s) => (
              <li key={s.id} className={s.id === sessioOberta ? "llista-sessions__activa" : undefined}>
                <span className={s.estat === "cancellada" ? "text-secundari" : undefined}>
                  <strong>{formataData(s.data)}</strong>{s.hora_inici ? ` · ${s.hora_inici}` : ""} · {ESTATS_SESSIO[s.estat]}
                  {s.estat === "cancellada" && s.motiu_cancellacio ? ` (${s.motiu_cancellacio})` : ""}
                  {s.marques > 0 ? ` · ${s.marques} marques` : ""}
                </span>
                <span className="accions-fila">
                  {s.estat !== "cancellada" && (
                    <button type="button" className="boto boto--secundari boto--petit" aria-expanded={s.id === sessioOberta}
                      onClick={() => setSessioOberta(s.id === sessioOberta ? null : s.id)}>
                      {registra && s.data <= f.avui ? "Registra l'assistència" : "Consulta"}
                    </button>
                  )}
                  {gestionaSessions && s.estat === "prevista" && s.marques === 0 && (
                    <button type="button" className="boto boto--perill boto--petit" onClick={() => setCancellant(s)}>Cancel·la</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccio>

      {sessio && (
        <Seccio key={sessio.id} titol={`Assistència del ${formataData(sessio.data)}`}>
          <RegistreSessio full={f} sessio={sessio} editable={registra && sessio.data <= f.avui} enCurs={enCurs}
            onDesar={(marques, motiu) => accio(() => serveiGestio.registrarAssistencia(casalId, sessio.id, { marques, ...(motiu ? { motiu } : {}) }),
              (r) => { const x = r as { noves: number; modificades: number }; return `Assistència desada: ${x.noves} marques noves i ${x.modificades} modificades.`; })} />
          {sessio.data > f.avui && <p className="text-secundari">Aquesta sessió encara no s'ha fet.</p>}
        </Seccio>
      )}

      <Seccio titol="Resum per persona">
        <ResumPersones full={f} onHistorial={(id) => setHistorial(historial === id ? null : id)} />
        {historial && <><h3 className="subseccio">Canvis en l'assistència</h3><Historial casalId={casalId} entitat="placa" id={historial} versio={versio} /></>}
      </Seccio>

      <DialegConfirmacio obert={cancellant !== null} enCurs={enCurs} titol="Cancel·lar la sessió" textConfirmar="Cancel·la la sessió" demanaMotiu
        onCancelar={() => setCancellant(null)}
        onConfirmar={(motiu) => cancellant && void accio(() => serveiGestio.cancellarSessio(casalId, cancellant.id, { versio: cancellant.versio, motiu }), "S'ha cancel·lat la sessió.")}>
        {cancellant && <p>Sessió del {formataData(cancellant.data)}. No es podrà registrar-hi assistència.</p>}
      </DialegConfirmacio>
    </div>
  );
}

function NovaSessio({ enCurs, onAfegir }: { enCurs: boolean; onAfegir: (d: { data: string; hora_inici?: string }) => Promise<boolean> }) {
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const envia = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    if (await onAfegir({ data, ...(hora ? { hora_inici: hora } : {}) })) { setData(""); setHora(""); }
  };
  return (
    <form onSubmit={(e) => void envia(e)} className="botonera">
      <label className="filtre">Data <input type="date" required value={data} onChange={(e) => setData(e.target.value)} /></label>
      <label className="filtre">Hora d'inici (opcional) <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
      <button type="submit" className="boto boto--secundari boto--petit" disabled={enCurs || !data}>Afegeix una sessió</button>
    </form>
  );
}

function RegistreSessio({ full, sessio, editable, enCurs, onDesar }: {
  full: FullAssistencia; sessio: Sessio; editable: boolean; enCurs: boolean;
  onDesar: (marques: { placa_id: string; estat: EstatAssistencia; versio: number | null }[], motiu?: string) => Promise<boolean>;
}) {
  const inicial = Object.fromEntries(full.persones.map((p) => [p.id, p.marques[sessio.id]?.estat ?? null])) as Record<string, EstatAssistencia | null>;
  const [marques, setMarques] = useState(inicial);
  const [demanaMotiu, setDemanaMotiu] = useState(false);
  const canvis = full.persones.filter((p) => marques[p.id] && marques[p.id] !== inicial[p.id]);
  const modifica = canvis.some((p) => inicial[p.id] !== null);
  const pendents = full.persones.filter((p) => !marques[p.id]).length;

  const desa = (motiu?: string) => void onDesar(canvis.map((p) => ({
    placa_id: p.id, estat: marques[p.id]!, versio: p.marques[sessio.id]?.versio ?? null,
  })), motiu).then((ok) => { if (ok) setDemanaMotiu(false); });

  if (full.persones.length === 0) return <p>No hi ha cap persona admesa en aquesta activitat.</p>;
  // El diàleg queda fora del formulari: un <form method="dialog"> no es pot niar.
  return (
    <>
    <form onSubmit={(e) => { e.preventDefault(); if (modifica) setDemanaMotiu(true); else desa(); }}>
      {editable && (
        <div className="botonera">
          <button type="button" className="boto boto--secundari boto--petit"
            onClick={() => setMarques((m) => Object.fromEntries(full.persones.map((p) => [p.id, m[p.id] ?? "present"])))}>
            Marca com a presents les que no tenen marca
          </button>
        </div>
      )}
      <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Registre d'assistència">
        <table className="taula taula--densa">
          <thead><tr><th scope="col">Persona</th>{ESTATS_ASSISTENCIA.map((e) => <th key={e} scope="col">{ETIQUETES_ASSISTENCIA[e]}</th>)}</tr></thead>
          <tbody>
            {full.persones.map((p) => (
              <tr key={p.id} className={p.estat !== "admesa" ? "fila--anullada" : undefined}>
                <th scope="row">{nomComplet(p.participant)}, {p.participant.nom}{p.estat !== "admesa" ? " (ja no té plaça)" : ""}</th>
                {ESTATS_ASSISTENCIA.map((e) => (
                  <td key={e}>
                    <input type="radio" name={`marca-${p.id}`} checked={marques[p.id] === e} disabled={!editable}
                      aria-label={`${ETIQUETES_ASSISTENCIA[e]}: ${nomComplet(p.participant)}, ${p.participant.nom}`}
                      onChange={() => setMarques((m) => ({ ...m, [p.id]: e }))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="botonera">
          <button type="submit" className="boto" disabled={enCurs || canvis.length === 0}>Desa l'assistència</button>
          <span className="text-secundari">{canvis.length} canvis per desar{pendents ? ` · ${pendents} persones sense marca` : ""}</span>
        </div>
      )}
    </form>
      <DialegConfirmacio obert={demanaMotiu} enCurs={enCurs} titol="Modificar marques ja registrades" textConfirmar="Desa els canvis" demanaMotiu
        onCancelar={() => setDemanaMotiu(false)} onConfirmar={(motiu) => desa(motiu)}>
        <p>Esteu canviant marques que ja estaven desades. El canvi i el motiu quedaran a l'historial.</p>
      </DialegConfirmacio>
    </>
  );
}

function ResumPersones({ full, onHistorial }: { full: FullAssistencia; onHistorial: (placaId: string) => void }) {
  const sessions = full.sessions.filter((s) => s.estat !== "cancellada");
  if (full.persones.length === 0) return <p>No hi ha cap persona admesa en aquesta activitat.</p>;
  return (
    <>
      <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Resum d'assistència">
        <table className="taula taula--densa">
          <thead>
            <tr>
              <th scope="col">Persona</th>
              {sessions.map((s) => <th key={s.id} scope="col" className="nowrap">{s.data.slice(8, 10)}/{s.data.slice(5, 7)}</th>)}
              <th scope="col">P</th><th scope="col">A</th><th scope="col">J</th><th scope="col">%</th><th scope="col"><span className="visualment-amagat">Historial</span></th>
            </tr>
          </thead>
          <tbody>
            {full.persones.map((p) => (
              <tr key={p.id} className={p.sota_llindar ? "fila--avis" : undefined}>
                <th scope="row">{nomComplet(p.participant)}, {p.participant.nom}</th>
                {sessions.map((s) => <td key={s.id}>{p.marques[s.id] ? ABREV[p.marques[s.id]!.estat] : ""}</td>)}
                <td>{p.resum.presents}</td><td>{p.resum.absents}</td><td>{p.resum.justificades}</td>
                <td>{p.resum.percentatge === null ? "—" : `${p.resum.percentatge}%`}{p.sota_llindar ? " · per sota del llindar" : ""}</td>
                <td><button type="button" className="boto boto--secundari boto--petit" onClick={() => onHistorial(p.id)}>Canvis</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-secundari">
        P: present · A: absent · J: absència justificada.
        {full.cicle.llindar_assistencia ? ` Llindar del cicle: ${full.cicle.llindar_assistencia}%.` : " El cicle no té llindar d'assistència."}
      </p>
    </>
  );
}
