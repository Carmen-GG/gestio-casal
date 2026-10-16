import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  ABREVIATURES_ASSISTENCIA, ESTATS_ASSISTENCIA, ETIQUETES_ASSISTENCIA, resumAssistencia, type EstatAssistencia,
} from "../../../shared/domain/assistencia";
import { missatgeOferta } from "../../../shared/domain/whatsapp";
import { BotoWhatsapp } from "../../components/BotoWhatsapp";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { FilaPlaca, FullAssistencia, PersonaAssistencia, ResultatBaixaVoluntaria, Sessio } from "../../types/gestio";
import { formataData } from "../../utils/format";
import { usePermisos } from "./context";
import { Historial } from "./Historial";

const ESTATS_SESSIO = { prevista: "Prevista", realitzada: "Feta", cancellada: "Cancel·lada" } as const;
const DIES = ["dg", "dl", "dt", "dc", "dj", "dv", "ds"];
const cognoms = (p: { cognom1: string | null; cognom2: string | null }) => [p.cognom1, p.cognom2].filter(Boolean).join(" ");
const nomICognoms = (p: { nom: string | null; cognom1: string | null; cognom2: string | null }) => `${p.nom ?? ""} ${cognoms(p)}`.trim();
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diaSetmana = (iso: string) => DIES[new Date(`${iso}T00:00:00Z`).getUTCDay()];
/** La data d'inici només té sentit al missatge si encara no ha arribat. */
const dataFutura = (data: string | null, avui: string) => (data && data > avui ? data : null);

/** Marques pendents de desar: sessió → plaça → estat. */
type Canvis = Record<string, Record<string, EstatAssistencia>>;

/**
 * Graella d'assistència d'una activitat (petició de 2026-10-15): telèfon, nom, cognoms,
 * % d'assistència i una columna per dia on es marca X, F o FJ. A sota, la llista
 * d'espera per ordre d'adjudicació. La baixa voluntària demana el motiu, en desa la
 * data i ofereix la plaça a la persona següent de la llista d'espera.
 */
export function AssistenciaActivitat() {
  const { casalId = "", activitatId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.fullAssistencia(casalId, activitatId, s), [casalId, activitatId, versio]);
  const [exit, setExit] = useState("");
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [canvis, setCanvis] = useState<Canvis>({});
  const [demanaMotiu, setDemanaMotiu] = useState(false);
  const [cancellant, setCancellant] = useState<Sessio | null>(null);
  const [historial, setHistorial] = useState("");
  const [perduaPlaca, setPerduaPlaca] = useState<PersonaAssistencia | null>(null);
  const [baixa, setBaixa] = useState<{ placa: FilaPlaca; oferta: boolean } | null>(null);
  const [resultatBaixa, setResultatBaixa] = useState<{ persona: string; r: ResultatBaixaVoluntaria } | null>(null);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant l'assistència…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const f = consulta.dades;
  const registra = f.pot_registrar && pot("assistencia.registrar");
  const gestionaPlaces = f.pot_registrar && pot("places.gestionar");
  const gestionaSessions = f.pot_crear_sessions && pot("assistencia.registrar");
  const sessions = f.sessions.filter((s) => s.estat !== "cancellada");
  const nombreCanvis = Object.values(canvis).reduce((n, c) => n + Object.keys(c).length, 0);
  const modificaMarques = Object.entries(canvis).some(([sessio, c]) => Object.keys(c).some((placa) => {
    const persona = f.persones.find((p) => p.id === placa);
    return persona?.marques[sessio] !== undefined;
  }));

  async function accio<T>(fer: () => Promise<T>, missatge: string | ((r: T) => string)) {
    setError(null);
    setExit("");
    setEnCurs(true);
    try {
      const r = await fer();
      setExit(typeof missatge === "string" ? missatge : missatge(r));
      setVersio((v) => v + 1);
      return r;
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e);
      else throw e;
      return null;
    } finally {
      setEnCurs(false);
      setCancellant(null);
      setPerduaPlaca(null);
    }
  }

  /** Desa totes les marques canviades, sessió per sessió. Si una falla, les anteriors ja han quedat desades. */
  async function desa(motiu?: string) {
    setDemanaMotiu(false);
    const perSessio = Object.entries(canvis).filter(([, c]) => Object.keys(c).length > 0);
    let desades = 0;
    const ok = await accio(async () => {
      for (const [sessioId, marques] of perSessio) {
        await serveiGestio.registrarAssistencia(casalId, sessioId, {
          marques: Object.entries(marques).map(([placa_id, estat]) => ({
            placa_id, estat, versio: f.persones.find((p) => p.id === placa_id)?.marques[sessioId]?.versio ?? null,
          })),
          ...(motiu ? { motiu } : {}),
        });
        desades++;
        setCanvis((c) => { const n = { ...c }; delete n[sessioId]; return n; });
      }
      return desades;
    }, (n) => `S'ha desat l'assistència de ${n} ${n === 1 ? "dia" : "dies"}.`);
    if (ok === null && desades > 0) setVersio((v) => v + 1);
  }

  async function confirmaBaixa(motiu: string) {
    if (!baixa) return;
    const { placa } = baixa;
    const persona = nomICognoms(placa.participant);
    setBaixa(null);
    const r = await accio(() => serveiGestio.baixaVoluntaria(casalId, placa.id, { versio: placa.versio, motiu }),
      (x) => `S'ha registrat la baixa de ${persona} amb data ${formataData(x.data)}.`);
    if (r) setResultatBaixa({ persona, r });
  }

  const marcaDe = (p: PersonaAssistencia, sessioId: string): EstatAssistencia | "" =>
    canvis[sessioId]?.[p.id] ?? p.marques[sessioId]?.estat ?? "";
  const canviaMarca = (p: PersonaAssistencia, sessioId: string, valor: EstatAssistencia | "") => setCanvis((c) => {
    const n = { ...c, [sessioId]: { ...c[sessioId] } };
    const desada = p.marques[sessioId]?.estat;
    if (valor === "" || valor === desada) delete n[sessioId]![p.id];
    else n[sessioId]![p.id] = valor;
    return n;
  });
  const percentatge = (p: PersonaAssistencia) =>
    resumAssistencia(sessions.map((s) => marcaDe(p, s.id)).filter((m): m is EstatAssistencia => m !== "")).percentatge;

  const admeses = f.persones.filter((p) => p.estat === "admesa");
  const exParticipants = f.persones.filter((p) => p.estat !== "admesa");

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}/cicles/${f.cicle.id}/assistencia`}>Tornar a les graelles d'assistència</Link></p>
      <h1>Assistència · {f.activitat.nom}</h1>
      <p className="text-secundari">
        {[f.activitat.horari, f.activitat.espai ? `Aula ${f.activitat.espai}` : null, `${f.activitat.capacitat} places`, `${admeses.length} persones admeses`].filter(Boolean).join(" · ")}
      </p>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {error && <MissatgeError error={error} />}
      </div>
      {resultatBaixa && <AvisOferta {...resultatBaixa} onTanca={() => setResultatBaixa(null)} />}
      {!f.pot_registrar && <p className="avis avis--alerta">L'assistència només es pot registrar quan el cicle està adjudicat o publicat.</p>}

      <Seccio titol="Graella d'assistència">
        {sessions.length === 0 ? (
          <p>Encara no hi ha dies a la graella. {gestionaSessions ? "Genereu el calendari a partir dels dies de l'activitat (a «Calendari de sessions», més avall)." : ""}</p>
        ) : admeses.length + exParticipants.length === 0 ? <p>No hi ha cap persona admesa en aquesta activitat.</p> : (
          <>
            <p className="text-secundari">
              Marqueu cada dia: <strong>X</strong> assisteix, <strong>F</strong> falta, <strong>FJ</strong> falta justificada.
              La FJ és informativa, però per al % compta com a falta. Els dies que encara no han arribat no es poden marcar.
            </p>
            <div className="taula-contenidor taula-contenidor--alta" tabIndex={0} role="region" aria-label="Graella d'assistència">
              <table className="taula taula--densa graella-assistencia">
                <thead>
                  <tr>
                    <th scope="col">Telèfon</th><th scope="col">Nom</th><th scope="col">Cognoms</th><th scope="col">%</th><th scope="col">Baixa</th>
                    {sessions.map((s) => (
                      <th key={s.id} scope="col" className="graella-assistencia__dia">
                        <span className="graella-assistencia__setmana">{diaSetmana(s.data)}</span> {dataCurta(s.data)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...admeses, ...exParticipants].map((p) => {
                    const pc = percentatge(p);
                    const actiu = p.estat === "admesa";
                    return (
                      <tr key={p.id} className={!actiu ? "fila--inactiva" : p.sota_llindar ? "fila--avis" : undefined}>
                        <td className="nowrap">{p.participant.telefon ?? "—"}</td>
                        <td>{p.participant.nom}</td>
                        <td>{cognoms(p.participant)}</td>
                        <td className="nowrap"><strong>{pc === null ? "—" : `${pc}%`}</strong></td>
                        <td className="graella-assistencia__baixa">
                          {actiu && gestionaPlaces && (
                            <label className="casella">
                              <input type="checkbox" checked={false} disabled={enCurs || nombreCanvis > 0}
                                onChange={() => setBaixa({ placa: p, oferta: false })} />
                              <span className="visualment-amagat">Baixa voluntària de {nomICognoms(p.participant)}</span>
                            </label>
                          )}
                          {actiu && gestionaPlaces && p.sota_llindar && (
                            <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={() => setPerduaPlaca(p)}>Perd la plaça</button>
                          )}
                          {p.baixa_voluntaria && <span title={p.baixa_voluntaria.motiu}>Baixa el {dataCurta(p.baixa_voluntaria.data)}</span>}
                          {!actiu && !p.baixa_voluntaria && <span>{p.estat === "baixa" ? "Baixa" : "Renúncia"}</span>}
                        </td>
                        {sessions.map((s) => {
                          const v = marcaDe(p, s.id);
                          const pendent = canvis[s.id]?.[p.id] !== undefined;
                          const editable = registra && actiu && s.data <= f.avui;
                          return (
                            <td key={s.id} className={`graella-assistencia__marca${v ? ` marca--${v}` : ""}${pendent ? " cel-canviada" : ""}`}>
                              {editable ? (
                                <select value={v} aria-label={`${nomICognoms(p.participant)}, ${formataData(s.data)}`}
                                  onChange={(e) => canviaMarca(p, s.id, e.target.value as EstatAssistencia | "")}>
                                  <option value="">·</option>
                                  {ESTATS_ASSISTENCIA.map((e) => <option key={e} value={e}>{ABREVIATURES_ASSISTENCIA[e]}</option>)}
                                </select>
                              ) : v ? <abbr title={ETIQUETES_ASSISTENCIA[v]}>{ABREVIATURES_ASSISTENCIA[v]}</abbr> : ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {registra && (
              <div className="botonera barra-desar">
                <button type="button" className="boto" disabled={enCurs || nombreCanvis === 0}
                  onClick={() => (modificaMarques ? setDemanaMotiu(true) : void desa())}>
                  {enCurs ? "Desant…" : "Desa l'assistència"}
                </button>
                {nombreCanvis > 0 && (
                  <>
                    <span className="text-secundari">{nombreCanvis} {nombreCanvis === 1 ? "marca" : "marques"} per desar</span>
                    <button type="button" className="boto boto--secundari boto--petit" onClick={() => setCanvis({})}>Desfés els canvis</button>
                  </>
                )}
              </div>
            )}
            {gestionaPlaces && nombreCanvis > 0 && <p className="text-secundari">Deseu les marques abans de donar de baixa ningú.</p>}
            <p className="text-secundari">
              {f.cicle.llindar_assistencia
                ? `Llindar del cicle: ${f.cicle.llindar_assistencia}%. Per sota, la persona perd la plaça només quan algú ho confirma amb «Perd la plaça».`
                : "El cicle no té llindar d'assistència."}
              {" "}La casella «Baixa» és per a les baixes voluntàries: demana el motiu i en desa la data.
            </p>
          </>
        )}
      </Seccio>

      <LlistaEspera full={f} gestiona={gestionaPlaces} enCurs={enCurs}
        onAccepta={(p) => void accio(() => serveiGestio.mourePlaca(casalId, p.id, { accio: "acceptar_oferta", versio: p.versio, motiu: "Ha acceptat la plaça oferta." }),
          `${nomICognoms(p.participant)} ha acceptat la plaça i ja surt a la graella.`)}
        onRebutja={(p) => setBaixa({ placa: p, oferta: true })} />

      {sessions.length > 0 && (
        <Seccio titol="Assistència de la tallerista">
          <p className="text-secundari">
            {f.activitat.tallerista ? `Tallerista: ${f.activitat.tallerista}. ` : "Aquesta activitat no té cap tallerista indicada (es pot posar a la fitxa de l'activitat). "}
            Marqueu els dies que la tallerista no ha vingut: compta al quadre de comandament de la superadministració.
          </p>
          <ul className="llista-sessions">
            {sessions.map((s) => (
              <li key={s.id}>
                <label className="casella">
                  <input type="checkbox" checked={s.tallerista_absent === 1} disabled={!registra || enCurs}
                    onChange={(e) => void accio(() => serveiGestio.faltaTallerista(casalId, s.id, { absent: e.target.checked }),
                      e.target.checked ? `S'ha anotat que la tallerista no va venir el ${formataData(s.data)}.` : `S'ha tret la falta de la tallerista del ${formataData(s.data)}.`)} />
                  {" "}<strong>{formataData(s.data)}</strong>{s.hora_inici ? ` · ${s.hora_inici}` : ""} · {s.tallerista_absent === 1 ? "No ha vingut" : "Ha vingut"}
                </label>
              </li>
            ))}
          </ul>
        </Seccio>
      )}

      <Seccio titol="Calendari de sessions">
        <details open={sessions.length === 0}>
          <summary>Dies de l'activitat ({sessions.length}){f.sessions.length > sessions.length ? ` i ${f.sessions.length - sessions.length} ${f.sessions.length - sessions.length === 1 ? "cancel·lat" : "cancel·lats"}` : ""}</summary>
          {gestionaSessions && (
            <div className="botonera">
              <button type="button" className="boto boto--secundari" disabled={enCurs}
                onClick={() => void accio(() => serveiGestio.generarSessions(casalId, activitatId),
                  (x) => `S'han creat ${x.creades} sessions (${x.existents} ja existien).`)}>
                Genera el calendari de sessions
              </button>
            </div>
          )}
          {gestionaSessions && <NovaSessio enCurs={enCurs} onAfegir={async (dades) => (await accio(() => serveiGestio.afegirSessio(casalId, activitatId, dades), "S'ha afegit la sessió.")) !== null} />}
          {f.sessions.length > 0 && (
            <ul className="llista-sessions">
              {f.sessions.map((s) => (
                <li key={s.id}>
                  <span className={s.estat === "cancellada" ? "text-secundari" : undefined}>
                    <strong>{formataData(s.data)}</strong>{s.hora_inici ? ` · ${s.hora_inici}` : ""} · {ESTATS_SESSIO[s.estat]}
                    {s.estat === "cancellada" && s.motiu_cancellacio ? ` (${s.motiu_cancellacio})` : ""}
                  </span>
                  {gestionaSessions && s.estat === "prevista" && s.marques === 0 && (
                    <button type="button" className="boto boto--perill boto--petit" onClick={() => setCancellant(s)}>Cancel·la</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      </Seccio>

      {f.persones.length > 0 && (
        <Seccio titol="Canvis en l'assistència">
          <label className="filtre" htmlFor="historial-persona">Persona</label>
          <select id="historial-persona" className="selector-simple" value={historial} onChange={(e) => setHistorial(e.target.value)}>
            <option value="">Trieu una persona</option>
            {f.persones.map((p) => <option key={p.id} value={p.id}>{cognoms(p.participant)}, {p.participant.nom}</option>)}
          </select>
          {historial && <Historial casalId={casalId} entitat="placa" id={historial} versio={versio} />}
        </Seccio>
      )}

      <DialegConfirmacio obert={demanaMotiu} enCurs={enCurs} titol="Modificar marques ja desades" textConfirmar="Desa els canvis" demanaMotiu
        onCancelar={() => setDemanaMotiu(false)} onConfirmar={(motiu) => void desa(motiu)}>
        <p>Esteu canviant marques que ja estaven desades. El canvi i el motiu quedaran a l'historial.</p>
      </DialegConfirmacio>

      <DialegConfirmacio obert={baixa !== null} enCurs={enCurs} titol={baixa?.oferta ? "No accepta la plaça" : "Baixa voluntària"}
        textConfirmar={baixa?.oferta ? "Desa i ofereix-la a la següent" : "Dona de baixa"} demanaMotiu
        onCancelar={() => setBaixa(null)} onConfirmar={(motiu) => void confirmaBaixa(motiu)}>
        {baixa && (
          <>
            <p>
              <strong>{nomICognoms(baixa.placa.participant)}</strong>{" "}
              {baixa.oferta ? "no vol la plaça que se li ha ofert." : `deixa l'activitat «${f.activitat.nom}».`}
              {" "}Es desarà el motiu i la data d'avui per als indicadors.
            </p>
            <p>
              {f.espera.some((p) => p.estat === "llista_espera" && p.id !== baixa.placa.id)
                ? "La plaça s'oferirà a la persona següent de la llista d'espera, i us prepararem el missatge de WhatsApp."
                : "No hi ha ningú més a la llista d'espera: la plaça quedarà lliure."}
            </p>
          </>
        )}
      </DialegConfirmacio>

      <DialegConfirmacio obert={perduaPlaca !== null} enCurs={enCurs} titol="Pèrdua de plaça per assistència" textConfirmar="Treu-li la plaça"
        onCancelar={() => setPerduaPlaca(null)}
        onConfirmar={() => perduaPlaca && void accio(() => serveiGestio.baixaPerAssistencia(casalId, perduaPlaca.id, { versio: perduaPlaca.versio }),
          `${nomICognoms(perduaPlaca.participant)} ha perdut la plaça per assistència.`)}>
        {perduaPlaca && (
          <>
            <p>
              <strong>{nomICognoms(perduaPlaca.participant)}</strong> té una assistència del {perduaPlaca.resum.percentatge}%,
              inferior al llindar del {f.cicle.llindar_assistencia}%. Segons la regla del casal, perd la plaça.
            </p>
            <p>La plaça passarà a «Baixa» i quedarà lliure per oferir-la a la llista d'espera des de «Places». El motiu queda a l'historial.</p>
          </>
        )}
      </DialegConfirmacio>

      <DialegConfirmacio obert={cancellant !== null} enCurs={enCurs} titol="Cancel·lar la sessió" textConfirmar="Cancel·la la sessió" demanaMotiu
        onCancelar={() => setCancellant(null)}
        onConfirmar={(motiu) => cancellant && void accio(() => serveiGestio.cancellarSessio(casalId, cancellant.id, { versio: cancellant.versio, motiu }), "S'ha cancel·lat la sessió.")}>
        {cancellant && <p>Sessió del {formataData(cancellant.data)}. No es podrà registrar-hi assistència.</p>}
      </DialegConfirmacio>
    </div>
  );
}

/** Resultat d'una baixa: a qui s'ha ofert la plaça i el botó per avisar-la per WhatsApp. */
function AvisOferta({ persona, r, onTanca }: { persona: string; r: ResultatBaixaVoluntaria; onTanca: () => void }) {
  const o = r.oferta;
  return (
    <section className="avis avis--info avis-oferta" aria-label="Plaça oferta a la llista d'espera">
      <p><strong>Baixa de {persona} desada ({formataData(r.data)}).</strong></p>
      {o ? (
        <>
          <p>
            La plaça s'ha ofert a <strong>{nomICognoms(o)}</strong>{o.posicio ? `, número ${o.posicio} de la llista d'espera` : ""}
            {o.telefon ? ` (telèfon ${o.telefon})` : ""}. Queda pendent que l'accepti.
          </p>
          {r.whatsapp?.enviat ? (
            <p><strong>S'ha enviat l'oferta per WhatsApp Business.</strong> Quan respongui, ho veureu a «Comunicacions segons activitat»; marqueu-ho a la llista d'espera («Ha acceptat» o «No la vol»).</p>
          ) : (
            <>
              {r.whatsapp && (
                <p className="avis avis--alerta">
                  No s'ha pogut enviar per WhatsApp Business{r.whatsapp.motiu === "telefon_fix" ? ": té un telèfon fix" : r.whatsapp.motiu === "sense_telefon" ? ": no té telèfon"
                    : r.whatsapp.motiu === "sense_whatsapp" ? ": el número no té WhatsApp" : r.whatsapp.error ? `: ${r.whatsapp.error}` : ""}. Truqueu-la o envieu-ho a mà.
                </p>
              )}
              <BotoWhatsapp telefon={o.telefon} persona={nomICognoms(o)}
                text={missatgeOferta({ nom: o.nom ?? "", ...r.missatge })} />
              <p className="text-secundari">
                WhatsApp s'obrirà amb el missatge escrit; només cal prémer Envia. Si la persona no té WhatsApp, l'aplicació us ho dirà: aleshores, truqueu-la.
                Quan respongui, marqueu-ho a la llista d'espera («Ha acceptat» o «No la vol»).
              </p>
            </>
          )}
        </>
      ) : <p>{r.sense_oferta}</p>}
      <button type="button" className="boto boto--secundari boto--petit" onClick={onTanca}>Entesos</button>
    </section>
  );
}

function LlistaEspera({ full, gestiona, enCurs, onAccepta, onRebutja }: {
  full: FullAssistencia; gestiona: boolean; enCurs: boolean; onAccepta: (p: FilaPlaca) => void; onRebutja: (p: FilaPlaca) => void;
}) {
  return (
    <Seccio titol={`Llista d'espera (${full.espera.length})`}>
      {full.espera.length === 0 ? <p>Ningú en llista d'espera.</p> : (
        <>
          <p className="text-secundari">Per ordre d'adjudicació: quan s'allibera una plaça, s'ofereix a la primera persona.</p>
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Llista d'espera">
            <table className="taula taula--densa">
              <thead><tr><th scope="col">Posició</th><th scope="col">Telèfon</th><th scope="col">Nom</th><th scope="col">Cognoms</th><th scope="col">Situació</th></tr></thead>
              <tbody>
                {full.espera.map((p) => (
                  <tr key={p.id}>
                    <td>{p.posicio_espera ?? "—"}</td>
                    <td className="nowrap">{p.participant.telefon ?? "—"}</td>
                    <td>{p.participant.nom}</td>
                    <td>{cognoms(p.participant)}</td>
                    <td>
                      {p.estat === "oferta_pendent" ? (
                        <div className="accions-fila accions-fila--horitzontal">
                          <span>Plaça oferta, pendent de resposta</span>
                          {gestiona && (
                            <>
                              <button type="button" className="boto boto--petit" disabled={enCurs} onClick={() => onAccepta(p)}>Ha acceptat</button>
                              <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={() => onRebutja(p)}>No la vol</button>
                              <BotoWhatsapp petit telefon={p.participant.telefon} persona={nomICognoms(p.participant)}
                                text={missatgeOferta({ nom: p.participant.nom, casal: full.casal.nom, activitat: full.activitat.nom, horari: full.activitat.horari,
                                  espai: full.activitat.espai, data_inici: dataFutura(full.activitat.data_inici ?? full.cicle.data_inici, full.avui) })} />
                            </>
                          )}
                        </div>
                      ) : "En espera"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Seccio>
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
