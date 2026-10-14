import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { SorteigActivitat } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";
import { usePermisos } from "./context";

const LLETRES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pantalla de sorteig per projectar o emetre en directe (per exemple amb Instagram Live
 * Producer o gravant-la amb el mòbil). El resultat el decideix el servidor amb un
 * generador criptogràfic i queda registrat; l'animació és només visual.
 */
export function PantallaSorteig() {
  const { casalId = "", cicleId = "" } = useParams();
  const pot = usePermisos(casalId);
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.sorteig(casalId, cicleId, s), [casalId, cicleId, versio], `${casalId}/${cicleId}`);
  const [activitatId, setActivitatId] = useState("");
  const [mostrat, setMostrat] = useState<string | null>(null);
  const [resultat, setResultat] = useState<SorteigActivitat | null>(null);
  const [sortejant, setSortejant] = useState(false);
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const panell = useRef<HTMLDivElement>(null);

  const dades = consulta.tipus === "dades" ? consulta.dades : null;
  const pendents = dades?.activitats.filter((a) => a.necessita_sorteig) ?? [];
  // Per defecte, la primera activitat que encara no té sorteig.
  useEffect(() => {
    if (!dades || activitatId) return;
    const primera = pendents.find((a) => !a.sorteig) ?? pendents[0];
    if (primera) setActivitatId(primera.id);
  }, [dades, activitatId, pendents]);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant el sorteig…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  const p = d.parametres;
  const activitat = d.activitats.find((a) => a.id === activitatId) ?? null;
  const vigent = resultat?.activitat_id === activitatId ? resultat : activitat?.sorteig ?? null;
  const potFer = d.pot_sortejar && pot("adjudicacio.executar");
  const lletra = p?.tipus_sorteig === "lletra";
  const rang = d.rang_numeros ?? 0;

  async function sorteja() {
    if (!activitat) return;
    setError(null);
    setResultat(null);
    setSortejant(true);
    const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const aleatori = () => (lletra ? LLETRES[Math.floor(Math.random() * 26)]! : String(1 + Math.floor(Math.random() * Math.max(rang, 1))));
    const interval = reduit ? null : setInterval(() => setMostrat(aleatori()), 80);
    try {
      const [r] = await Promise.all([serveiGestio.ferSorteig(casalId, cicleId, activitat.id, {}), espera(reduit ? 0 : 2000)]);
      setResultat(r.sorteig);
      setVersio((v) => v + 1);
    } catch (e) {
      if (e instanceof ErrorClientApi) setError(e);
      else throw e;
    } finally {
      if (interval) clearInterval(interval);
      setMostrat(null);
      setSortejant(false);
    }
  }

  const pantallaCompleta = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void panell.current?.requestFullscreen?.();
  };

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}/cicles/${cicleId}`}>Tornar al cicle «{d.cicle.nom}»</Link></p>
      <h1>Pantalla de sorteig</h1>
      {!p || p.criteri_ordre !== "sorteig_activitat" ? <p>Els paràmetres d'adjudicació vigents no preveuen sorteig per activitat.</p> : (
        <>
          <div className="botonera">
            <label className="filtre">
              Activitat
              <select value={activitatId} onChange={(e) => { setActivitatId(e.target.value); setResultat(null); setError(null); }}>
                {pendents.map((a) => <option key={a.id} value={a.id}>{a.nom}{a.sorteig ? " (ja sortejada)" : ""}</option>)}
              </select>
            </label>
            <button type="button" className="boto boto--secundari" onClick={pantallaCompleta}>Pantalla completa</button>
          </div>
          {pendents.length === 0 && <p>Cap activitat té més sol·licituds que places: no cal fer cap sorteig.</p>}
          {error && <MissatgeError error={error} />}

          {activitat && (
            <div ref={panell} className="pantalla-sorteig" aria-live="polite">
              <p className="pantalla-sorteig__cicle">{d.cicle.nom}</p>
              <h2 className="pantalla-sorteig__activitat">{activitat.nom}</h2>
              <p className="pantalla-sorteig__dades">{activitat.sollicituds} sol·licituds · {activitat.capacitat} places</p>
              <p className="pantalla-sorteig__regla">
                {lletra ? "Sorteig d'una lletra (A–Z): es comença pel primer cognom amb aquesta lletra." : `Sorteig d'un número entre 1 i ${rang}: es comença per la persona amb aquest número.`}
              </p>
              <div className={`pantalla-sorteig__valor ${sortejant ? "pantalla-sorteig__valor--girant" : ""}`} aria-hidden={sortejant}>
                {sortejant ? (mostrat ?? "…") : vigent ? vigent.valor : "?"}
              </div>
              {sortejant && <p className="visualment-amagat">Sortejant…</p>}
              {!sortejant && vigent && (
                <p className="pantalla-sorteig__registre">
                  {lletra ? "Lletra" : "Número"} sortejat: <strong>{vigent.valor}</strong> · {formataDataHora(vigent.realitzat_el)}
                  {vigent.origen === "manual" ? " · registrat a mà" : ""} · ref. {vigent.id.slice(0, 8)}
                </p>
              )}
              {potFer && !vigent && (
                <button type="button" className="boto pantalla-sorteig__boto" onClick={() => void sorteja()} disabled={sortejant}>
                  {sortejant ? "Sortejant…" : "Fes el sorteig"}
                </button>
              )}
              {vigent && !sortejant && (() => {
                const seguent = pendents.find((a) => !a.sorteig && a.id !== activitatId);
                return seguent ? (
                  <button type="button" className="boto boto--secundari pantalla-sorteig__boto"
                    onClick={() => { setActivitatId(seguent.id); setResultat(null); }}>Següent: {seguent.nom}</button>
                ) : <p className="pantalla-sorteig__registre">Totes les activitats ja tenen sorteig.</p>;
              })()}
            </div>
          )}
          <p className="text-secundari">
            El número o la lletra el decideix el servidor amb un generador aleatori segur i queda registrat amb la data, l'hora i qui l'ha fet.
            Per repetir un sorteig cal anul·lar-lo amb un motiu des de la secció «Sorteig per activitat» del cicle.
            Per emetre'l en directe, podeu gravar la pantalla amb el mòbil o compartir-la amb Instagram Live Producer (per exemple, amb OBS).
          </p>
        </>
      )}
    </div>
  );
}
