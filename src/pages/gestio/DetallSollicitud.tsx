import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ETIQUETES_CAMPS, type CampPersonal } from "../../../shared/domain/formulari";
import { activitatsAmbPreferenciaDuplicada, missatgeErrorPreferencies, validaPreferencies, type Preferencia } from "../../../shared/domain/preferencies";
import { ETIQUETES_ESTAT_ADJUDICACIO, ETIQUETES_ESTAT_SOLLICITUD, ESTATS_SOLLICITUD, type EstatSollicitud } from "../../../shared/schemas/sollicituds";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Activitat, DetallSollicitud as Detall } from "../../types/gestio";
import { formataData, formataDataHora } from "../../utils/format";
import { usePermisos } from "./context";
import { Historial } from "./Historial";
import { nomComplet } from "./Sollicituds";

const ORIGENS = { formulari_public: "Formulari públic", importacio: "Importació", gestio: "Administració del casal" } as const;
const CAMPS_EDITABLES: (CampPersonal | "codi_participant_intern")[] = [
  "nom", "cognom1", "cognom2", "data_naixement", "telefon", "email", "adreca", "codi_postal", "municipi", "lloc_naixement", "barri",
  "codi_participant_intern",
];
const etiqueta = (c: CampPersonal | "codi_participant_intern") => (c === "codi_participant_intern" ? "Codi intern de participant" : ETIQUETES_CAMPS[c]);

/** Detall d'una sol·licitud amb edició controlada (sempre amb motiu) i historial. */
export function DetallSollicitud() {
  const { casalId = "", sollicitudId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.sollicitud(casalId, sollicitudId, s), [casalId, sollicitudId, versio]);
  const [exit, setExit] = useState("");
  const [errorAccio, setErrorAccio] = useState<ErrorClientApi | null>(null);
  const [nouEstat, setNouEstat] = useState<EstatSollicitud | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [editant, setEditant] = useState<"dades" | "preferencies" | null>(null);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant la sol·licitud…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const s = consulta.dades.sollicitud;
  const gestiona = pot("sollicituds.gestionar");

  async function accio(fer: () => Promise<unknown>, missatge: string) {
    setErrorAccio(null);
    setExit("");
    setEnCurs(true);
    try {
      await fer();
      setExit(missatge);
      setEditant(null);
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof ErrorClientApi) setErrorAccio(e);
      else throw e;
    } finally {
      setEnCurs(false);
      setNouEstat(null);
    }
  }

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}/cicles/${s.cicle_id}`}>Tornar al cicle</Link></p>
      <h1>Sol·licitud núm. {s.numero}: {s.participant.nom} {nomComplet(s.participant)}</h1>
      <p>
        <span className={`etiqueta etiqueta--${s.estat}`}>{ETIQUETES_ESTAT_SOLLICITUD[s.estat]}</span>{" "}
        <span className="etiqueta">{ETIQUETES_ESTAT_ADJUDICACIO[s.estat_adjudicacio]}</span>
      </p>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {errorAccio && <MissatgeError error={errorAccio} />}
      </div>

      <Seccio titol="Registre">
        <dl className="dades">
          <div><dt>Rebuda el</dt><dd>{formataDataHora(s.rebuda_el)}</dd></div>
          <div><dt>Origen</dt><dd>{ORIGENS[s.origen]}</dd></div>
          <div><dt>Codi de confirmació</dt><dd className="codi">{s.codi_confirmacio}</dd></div>
          <div><dt>Protecció de dades acceptada</dt><dd>{s.privacitat_acceptada_el ? formataDataHora(s.privacitat_acceptada_el) : "No consta (importada o registrada al panell)"}</dd></div>
        </dl>
        {gestiona && (
          <div className="botonera">
            {ESTATS_SOLLICITUD.filter((e) => e !== s.estat).map((e) => (
              <button key={e} type="button" className={`boto ${e === "anullada" ? "boto--perill" : "boto--secundari"} boto--petit`} onClick={() => setNouEstat(e)}>
                Marca com a «{ETIQUETES_ESTAT_SOLLICITUD[e]}»
              </button>
            ))}
          </div>
        )}
      </Seccio>

      <Seccio titol="Dades de la persona" accions={gestiona && !editant ? (
        <button type="button" className="boto boto--secundari boto--petit" onClick={() => setEditant("dades")}>Edita les dades</button>
      ) : undefined}>
        {s.dades_restringides && <p className="text-secundari">No teniu permís per veure les dades de contacte.</p>}
        {editant === "dades" ? (
          <FormDades s={s} onCancelar={() => setEditant(null)} onDesar={(cos) => accio(() => serveiGestio.actualitzarDadesSollicitud(casalId, s.id, cos), "S'han desat les dades.")} />
        ) : (
          <dl className="dades">
            {CAMPS_EDITABLES.concat(["document_identitat"]).map((c) => {
              const v = s.participant[c];
              if (!v) return null;
              return <div key={c}><dt>{etiqueta(c)}</dt><dd>{c === "data_naixement" ? formataData(v) : v}</dd></div>;
            })}
          </dl>
        )}
        {pot("sollicituds.dades_contacte") && <AutoritzacioTutorSollicitud casalId={casalId} sollicitudId={s.id} />}
      </Seccio>

      <Seccio titol="Activitats sol·licitades" accions={gestiona && !editant ? (
        <button type="button" className="boto boto--secundari boto--petit" onClick={() => setEditant("preferencies")}>Modifica les preferències</button>
      ) : undefined}>
        {editant === "preferencies" ? (
          <FormPreferencies casalId={casalId} s={s} onCancelar={() => setEditant(null)}
            onDesar={(cos) => accio(() => serveiGestio.canviarPreferencies(casalId, s.id, cos), "S'han desat les preferències.")} />
        ) : (
          <ol>{s.preferencies.map((p) => <li key={p.activitat_id}>{p.activitat}{p.estat_activitat !== "activa" && <span className="text-secundari"> (activitat {p.estat_activitat})</span>}</li>)}</ol>
        )}
      </Seccio>

      <Seccio titol="Historial de canvis" obertaInicial={false}>
        <Historial casalId={casalId} entitat="sollicitud" id={s.id} versio={versio} />
      </Seccio>

      <DialegConfirmacio obert={nouEstat !== null} enCurs={enCurs} titol="Confirmeu el canvi d'estat" textConfirmar="Confirma el canvi" demanaMotiu
        onCancelar={() => setNouEstat(null)}
        onConfirmar={(motiu) => nouEstat && accio(() => serveiGestio.canviarEstatSollicitud(casalId, s.id, { versio: s.versio, estat: nouEstat, motiu }),
          `La sol·licitud ara és «${ETIQUETES_ESTAT_SOLLICITUD[nouEstat]}».`)}>
        <p>La sol·licitud passarà de «{ETIQUETES_ESTAT_SOLLICITUD[s.estat]}» a «{nouEstat ? ETIQUETES_ESTAT_SOLLICITUD[nouEstat] : ""}».</p>
        {nouEstat === "anullada" && <p className="avis avis--alerta">Una sol·licitud anul·lada no s'esborra: es conserva amb el seu número i el motiu.</p>}
      </DialegConfirmacio>
    </div>
  );
}

function FormDades({ s, onDesar, onCancelar }: { s: Detall; onDesar: (cos: unknown) => void; onCancelar: () => void }) {
  // Només es poden editar els camps visibles; els de contacte, si la persona té permís.
  const camps = CAMPS_EDITABLES.filter((c) => !s.dades_restringides || ["nom", "cognom1", "cognom2", "codi_participant_intern"].includes(c));
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(camps.map((c) => [c, s.participant[c] ?? ""])));
  const [motiu, setMotiu] = useState("");
  const [error, setError] = useState("");
  const envia = (e: FormEvent) => {
    e.preventDefault();
    if (motiu.trim().length < 3) { setError("Indiqueu el motiu del canvi."); return; }
    const dades = Object.fromEntries(camps.filter((c) => (s.participant[c] ?? "") !== v[c]).map((c) => [c, v[c]]));
    onDesar({ versio_participant: s.participant.versio, dades, motiu });
  };
  return (
    <form onSubmit={envia} noValidate className="formulari">
      <p className="text-secundari">Només es desen els camps que canvieu. Els camps que el cicle no recull no es poden omplir.</p>
      <div className="graella-camps">
        {camps.map((c) => (
          <CampText key={c} etiqueta={etiqueta(c)} obligatori={c === "nom" || c === "cognom1"} value={v[c]} type={c === "data_naixement" ? "date" : "text"}
            onChange={(e) => setV((x) => ({ ...x, [c]: e.target.value }))} />
        ))}
      </div>
      <CampText etiqueta="Motiu del canvi" obligatori value={motiu} onChange={(e) => { setMotiu(e.target.value); setError(""); }} error={error} maxLength={500} />
      <div className="botonera">
        <button type="submit" className="boto">Desa les dades</button>
        <button type="button" className="boto boto--secundari" onClick={onCancelar}>Cancel·la</button>
      </div>
    </form>
  );
}

function FormPreferencies({ casalId, s, onDesar, onCancelar }: { casalId: string; s: Detall; onDesar: (cos: unknown) => void; onCancelar: () => void }) {
  const activitats = useConsulta((sg) => serveiGestio.activitats(casalId, s.cicle_id, sg), [casalId, s.cicle_id]);
  const [prefs, setPrefs] = useState<Preferencia[]>(s.preferencies.map((p) => ({ activitat_id: p.activitat_id, ordre: p.ordre })));
  const [motiu, setMotiu] = useState("");
  const [error, setError] = useState("");
  if (activitats.tipus !== "dades") return activitats.tipus === "error" ? <MissatgeError error={activitats.error} /> : <Carregant />;
  const disponibles = activitats.dades.activitats.filter((a: Activitat) => a.estat === "activa" || prefs.some((p) => p.activitat_id === a.id));
  const dup = activitatsAmbPreferenciaDuplicada(prefs).activitats;
  const marca = (id: string, marcada: boolean) => setPrefs((ps) => {
    if (marcada) return [...ps, { activitat_id: id, ordre: ps.length + 1 }];
    const treta = ps.find((p) => p.activitat_id === id)?.ordre ?? 0;
    return ps.filter((p) => p.activitat_id !== id).map((p) => (p.ordre! > treta ? { ...p, ordre: p.ordre! - 1 } : p));
  });
  const envia = (e: FormEvent) => {
    e.preventDefault();
    const err = validaPreferencies(prefs);
    if (err) { setError(missatgeErrorPreferencies(err)); return; }
    if (motiu.trim().length < 3) { setError("Indiqueu el motiu del canvi."); return; }
    onDesar({ versio: s.versio, preferencies: prefs, motiu });
  };
  return (
    <form onSubmit={envia} noValidate className="formulari">
      {error && <p className="avis avis--error" role="alert">{error}</p>}
      <ul className="llista-simple">
        {disponibles.map((a) => {
          const p = prefs.find((x) => x.activitat_id === a.id);
          return (
            <li key={a.id} className={dup.includes(a.id) ? "fila-pref fila-pref--error" : "fila-pref"}>
              <label><input type="checkbox" checked={!!p} onChange={(e) => marca(a.id, e.target.checked)} /> {a.nom}</label>
              {p && (
                <select aria-label={`Preferència per a ${a.nom}`} value={p.ordre ?? ""}
                  onChange={(e) => setPrefs((ps) => ps.map((x) => (x.activitat_id === a.id ? { ...x, ordre: Number(e.target.value) || null } : x)))}>
                  <option value="">—</option>
                  {prefs.map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      <CampText etiqueta="Motiu del canvi" obligatori value={motiu} onChange={(e) => setMotiu(e.target.value)} maxLength={500} />
      <div className="botonera">
        <button type="submit" className="boto">Desa les preferències</button>
        <button type="button" className="boto boto--secundari" onClick={onCancelar}>Cancel·la</button>
      </div>
    </form>
  );
}

/** Autorització i signatura del pare, mare o tutor, si la persona era menor en enviar la sol·licitud. */
function AutoritzacioTutorSollicitud({ casalId, sollicitudId }: { casalId: string; sollicitudId: string }) {
  const consulta = useConsulta((sg) => serveiGestio.autoritzacioTutor(casalId, sollicitudId, sg), [casalId, sollicitudId]);
  if (consulta.tipus !== "dades" || !consulta.dades.autoritzacio) return null;
  const a = consulta.dades.autoritzacio;
  return (
    <div className="autoritzacio-tutor">
      <h3 className="subseccio">Autorització del pare, mare o tutor</h3>
      <dl className="dades">
        <div><dt>Nom i cognoms</dt><dd>{a.nom} {a.cognoms}</dd></div>
        <div><dt>DNI/NIE</dt><dd>{a.document_identitat}</dd></div>
        <div><dt>Autoritza la inscripció</dt><dd>Sí, el {formataDataHora(a.creat_el)}</dd></div>
      </dl>
      <img className="signatura-desada" src={a.signatura} alt={`Signatura de ${a.nom} ${a.cognoms}`} />
    </div>
  );
}
