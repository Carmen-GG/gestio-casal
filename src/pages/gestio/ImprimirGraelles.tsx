import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import type { DadesGraelles } from "../../types/gestio";
import { formataData } from "../../utils/format";

const DIES = ["dg", "dl", "dt", "dc", "dj", "dv", "ds"];
const diaSetmana = (iso: string) => DIES[new Date(`${iso}T00:00:00Z`).getUTCDay()];
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** Files en blanc al final de la graella per apuntar-hi incorporacions a mà. */
const FILES_BLANQUES = 2;

/**
 * Graelles d'assistència per imprimir (petició de 2026-10-15): una pàgina A4 apaïsada
 * per activitat amb totes les dates, les persones admeses per ordre alfabètic i, a
 * sota, la llista d'espera per ordre d'adjudicació. Sempre amb nom, cognoms i telèfon.
 * És HTML amb estils d'impressió: el navegador en fa un PDF vectorial amb «Desa com a PDF».
 */
export function ImprimirGraelles() {
  const { casalId = "", cicleId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const nomesActivitat = params.get("activitat");
  const consulta = useConsulta((s) => serveiGestio.graelles(casalId, cicleId, true, s), [casalId, cicleId]);

  useEffect(() => {
    document.body.classList.add("pagina-impressio");
    return () => document.body.classList.remove("pagina-impressio");
  }, []);

  if (consulta.tipus === "carregant") return <Carregant text="Preparant les graelles…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  const graelles = nomesActivitat ? d.graelles.filter((g) => g.activitat_id === nomesActivitat) : d.graelles;

  return (
    <div className="graelles-impressio">
      <div className="no-imprimir graelles-impressio__barra">
        <p className="subtitol"><Link to={`/gestio/${casalId}/cicles/${cicleId}/assistencia`}>Tornar a les graelles d'assistència</Link></p>
        <h1>Graelles d'assistència · {d.cicle}</h1>
        {d.graelles.length === 0 ? <p>No hi ha cap activitat amb places adjudicades.</p> : (
          <div className="botonera">
            <label className="filtre" htmlFor="tria-activitat">Activitat</label>
            <select id="tria-activitat" value={nomesActivitat ?? ""}
              onChange={(e) => setParams(e.target.value ? { activitat: e.target.value } : {}, { replace: true })}>
              <option value="">Totes ({d.graelles.length})</option>
              {d.graelles.map((g) => <option key={g.activitat_id} value={g.activitat_id}>{g.activitat}</option>)}
            </select>
            <button type="button" className="boto" onClick={() => window.print()}>
              Imprimeix {graelles.length === 1 ? "la graella" : `les ${graelles.length} graelles`}
            </button>
          </div>
        )}
        <p className="text-secundari">
          Una pàgina A4 apaïsada per activitat. Per tenir-les en PDF, trieu «Desa com a PDF» a la finestra d'impressió.
          {!d.telefon && " No teniu permís per veure els telèfons: les graelles surten sense."}
        </p>
      </div>
      {graelles.map((g) => <FullGraella key={g.activitat_id} d={d} g={g} />)}
    </div>
  );
}

function FullGraella({ d, g }: { d: DadesGraelles; g: DadesGraelles["graelles"][number] }) {
  const dates = g.sessions.length > 0 ? g.sessions.map((s) => s.data) : null;
  const buides = dates ? 0 : g.columnes_buides;
  const columnesDies = dates?.length ?? buides;
  // Amb moltes dates, la lletra es fa més petita perquè tot càpiga a l'amplada de la pàgina.
  const densitat = columnesDies > 28 ? "molt-densa" : columnesDies > 18 ? "densa" : "normal";
  return (
    <section className={`full-graella full-graella--${densitat}`} aria-label={`Graella de ${g.activitat}`}>
      <header className="full-graella__capcalera">
        <div>
          <h2>{g.activitat}</h2>
          <p>{[g.horari, g.espai ? `Aula ${g.espai}` : null, `Del ${formataData(g.data_inici)} al ${formataData(g.data_fi)}`].filter(Boolean).join(" · ")}</p>
        </div>
        <p className="full-graella__casal">{d.casal}<br />{d.cicle}</p>
      </header>

      <h3>Persones admeses ({g.admeses.length} de {g.capacitat} places)</h3>
      <table className="full-graella__taula">
        <thead>
          <tr>
            <th scope="col" className="col-num">#</th>
            <th scope="col" className="col-nom">Nom</th>
            <th scope="col" className="col-cognoms">Cognoms</th>
            {d.telefon && <th scope="col" className="col-telefon">Telèfon</th>}
            {dates ? dates.map((x) => (
              <th key={x} scope="col" className="col-dia"><span>{diaSetmana(x)}</span>{dataCurta(x)}</th>
            )) : Array.from({ length: buides }, (_, i) => <th key={i} scope="col" className="col-dia"><span className="visualment-amagat">Dia {i + 1}</span></th>)}
            <th scope="col" className="col-pc">%</th>
          </tr>
        </thead>
        <tbody>
          {g.admeses.map((p) => {
            const marques = p.marques.filter(Boolean);
            const pc = marques.length >= 3 ? Math.round((marques.filter((m) => m === "X").length / marques.length) * 100) : null;
            return (
              <tr key={p.numero}>
                <td className="col-num">{p.ordre}</td>
                <td className="col-nom">{p.nom}</td>
                <td className="col-cognoms">{p.cognoms}</td>
                {d.telefon && <td className="col-telefon">{p.telefon ?? ""}</td>}
                {dates ? p.marques.map((m, i) => <td key={i} className={`col-dia marca-impresa--${m || "buida"}`}>{m}</td>)
                  : Array.from({ length: buides }, (_, i) => <td key={i} className="col-dia" />)}
                <td className="col-pc">{pc === null ? "" : `${pc}%`}</td>
              </tr>
            );
          })}
          {Array.from({ length: FILES_BLANQUES }, (_, i) => (
            <tr key={`buida-${i}`} className="fila-blanca" aria-hidden="true">
              <td className="col-num" /><td className="col-nom" /><td className="col-cognoms" />{d.telefon && <td className="col-telefon" />}
              {Array.from({ length: columnesDies }, (_, j) => <td key={j} className="col-dia" />)}<td className="col-pc" />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="full-graella__llegenda">X: assisteix · F: falta · FJ: falta justificada (compta com a falta per al %)</p>

      <h3>Llista d'espera ({g.espera.length}) · per ordre d'adjudicació</h3>
      {g.espera.length === 0 ? <p className="full-graella__buit">Ningú en llista d'espera.</p> : (
        <table className="full-graella__taula full-graella__taula--espera">
          <thead>
            <tr>
              <th scope="col" className="col-num">Pos.</th><th scope="col" className="col-nom">Nom</th><th scope="col" className="col-cognoms">Cognoms</th>
              {d.telefon && <th scope="col" className="col-telefon">Telèfon</th>}<th scope="col">Situació</th>
            </tr>
          </thead>
          <tbody>
            {g.espera.map((p) => (
              <tr key={p.numero}>
                <td className="col-num">{p.posicio ?? ""}</td><td className="col-nom">{p.nom}</td><td className="col-cognoms">{p.cognoms}</td>
                {d.telefon && <td className="col-telefon">{p.telefon ?? ""}</td>}
                <td>{p.oferta_pendent ? "Plaça oferta, pendent de resposta" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
