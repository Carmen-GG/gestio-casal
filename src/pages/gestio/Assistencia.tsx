import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { MINIM_SESSIONS_PERCENTATGE } from "../../../shared/domain/assistencia";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { generaGraelles, validaGraelles } from "../../fitxers/graelles";
import { descarrega, generaXlsx } from "../../fitxers/xlsx";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Cicle } from "../../types/gestio";

/**
 * Resum d'assistència del cicle: activitats amb sessions i percentatges,
 * llindar configurable, graelles XLSX i exportació de les dades.
 */
export function Assistencia({ casalId, cicle, pot, onCanviCicle }: {
  casalId: string; cicle: Cicle; pot: (p: string) => boolean; onCanviCicle: () => void;
}) {
  const consulta = useConsulta((s) => serveiGestio.resumAssistencia(casalId, cicle.id, s), [casalId, cicle.id, cicle.versio]);
  const [exit, setExit] = useState("");
  const [error, setError] = useState<ErrorClientApi | Error | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [telefon, setTelefon] = useState(false);
  const [llindar, setLlindar] = useState(cicle.llindar_assistencia?.toString() ?? "");

  async function accio(fer: () => Promise<unknown>, missatge: string) {
    setError(null);
    setExit("");
    setEnCurs(true);
    try {
      await fer();
      setExit(missatge);
    } catch (e) {
      if (e instanceof Error) setError(e);
      else throw e;
    } finally {
      setEnCurs(false);
    }
  }

  const graelles = () => accio(async () => {
    const dades = await serveiGestio.graelles(casalId, cicle.id, telefon);
    if (dades.graelles.length === 0) throw new Error("No hi ha cap activitat amb places adjudicades.");
    const buffer = await generaGraelles(dades);
    // Validació del fitxer abans de lliurar-lo.
    const errors = await validaGraelles(buffer, dades);
    if (errors.length) throw new Error(`No s'ha pogut generar un fitxer correcte: ${errors.join(" ")}`);
    descarrega(buffer, `graelles-assistencia-${cicle.nom.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase().slice(0, 50)}.xlsx`);
    return dades.totals;
  }, "S'han descarregat les graelles d'assistència (XLSX, un full per activitat).");

  const exporta = () => accio(async () => {
    const taula = await serveiGestio.exportacioAssistencia(casalId, cicle.id);
    descarrega(await generaXlsx(taula), taula.fitxer);
  }, "S'ha descarregat el fitxer XLSX.");

  const llindarValid = llindar === "" || (/^\d+$/.test(llindar) && Number(llindar) >= 1 && Number(llindar) <= 100);
  const desaLlindar = (e: FormEvent) => {
    e.preventDefault();
    if (!llindarValid) return;
    void accio(async () => {
      await serveiGestio.actualitzarCicle(casalId, cicle.id, { versio: cicle.versio, llindar_assistencia: llindar === "" ? null : Number(llindar) });
      onCanviCicle();
    }, "S'ha desat el llindar d'assistència.");
  };

  return (
    <div>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {error && (error instanceof ErrorClientApi ? <MissatgeError error={error} /> : <p className="avis avis--error" role="alert">{error.message}</p>)}
      </div>

      {pot("dades.exportar") && (
        <>
          <h3 className="subseccio">Graelles d'assistència (XLSX)</h3>
          <p className="text-secundari">
            Un full per activitat amb les persones admeses per ordre alfabètic, una columna per sessió i la llista d'espera a part.
            Preparat per imprimir. Si es modifica fora de l'aplicació, els canvis no es traslladen sols: cal registrar-los aquí.
          </p>
          <div className="botonera">
            {pot("sollicituds.dades_contacte") && (
              <label className="casella">
                <input type="checkbox" checked={telefon} onChange={(e) => setTelefon(e.target.checked)} /> Inclou el telèfon
              </label>
            )}
            <button type="button" className="boto" disabled={enCurs} onClick={() => void graelles()}>
              {enCurs ? "Generant…" : "Descarrega les graelles"}
            </button>
            <button type="button" className="boto boto--secundari" disabled={enCurs} onClick={() => void exporta()}>Exporta les dades d'assistència</button>
          </div>
        </>
      )}

      <h3 className="subseccio">Assistència per activitat</h3>
      {consulta.tipus === "carregant" && <Carregant text="Carregant l'assistència…" />}
      {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
      {consulta.tipus === "dades" && (consulta.dades.activitats.length === 0 ? <p>No hi ha activitats en aquest cicle.</p> : (
        <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Assistència per activitat">
          <table className="taula taula--densa">
            <thead>
              <tr>
                <th scope="col">Activitat</th><th scope="col">Horari</th><th scope="col">Admeses</th><th scope="col">Sessions</th>
                <th scope="col">Fetes</th><th scope="col">Assistència mitjana</th><th scope="col">Per sota del llindar</th>
              </tr>
            </thead>
            <tbody>
              {consulta.dades.activitats.map((a) => (
                <tr key={a.activitat_id}>
                  <td><Link to={`/gestio/${casalId}/activitats/${a.activitat_id}/assistencia`}>{a.activitat}</Link></td>
                  <td>{a.horari ?? ""}</td>
                  <td>{a.admeses}</td>
                  <td>
                    {a.sessions}{a.cancellades ? ` (+${a.cancellades} cancel·lades)` : ""}
                    {a.nombre_sessions_previst !== null && a.sessions !== a.nombre_sessions_previst && (
                      <div className="text-secundari">Previstes a la fitxa: {a.nombre_sessions_previst}</div>
                    )}
                  </td>
                  <td>{a.realitzades}</td>
                  <td>{a.mitjana === null ? "—" : `${a.mitjana}%`}</td>
                  <td>{consulta.dades.llindar_assistencia === null ? "—" : a.sota_llindar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-secundari">
        El percentatge compta les presències sobre totes les sessions registrades (totes les absències compten igual)
        i només es calcula a partir de {MINIM_SESSIONS_PERCENTATGE} sessions. No comporta cap pèrdua de plaça automàtica.
      </p>

      {pot("cicles.gestionar") && cicle.estat !== "arxivat" && (
        <form onSubmit={desaLlindar} className="botonera botonera--camp">
          <div className={`camp camp--compacte ${llindarValid ? "" : "camp--error"}`}>
            <label htmlFor="llindar">Llindar d'assistència (%)</label>
            <input id="llindar" inputMode="numeric" value={llindar} onChange={(e) => setLlindar(e.target.value.trim())} aria-describedby="llindar-ajuda" />
            <p id="llindar-ajuda" className="camp__ajuda">Regla del casal: per sota del llindar (per defecte, 80%) es perd la plaça. Mai és automàtic: cal confirmar-ho persona per persona. Deixeu-lo buit si no n'hi ha.</p>
            {!llindarValid && <p className="camp__missatge" role="alert">Ha de ser un número entre 1 i 100.</p>}
          </div>
          <button type="submit" className="boto boto--secundari" disabled={enCurs}>Desa el llindar</button>
        </form>
      )}
    </div>
  );
}
