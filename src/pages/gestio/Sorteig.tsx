import { useState } from "react";
import { Link } from "react-router";
import { DialegConfirmacio } from "../../components/DialegConfirmacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit } from "../../components/Formulari";
import { descarrega, generaXlsx } from "../../fitxers/xlsx";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { EstatSorteig, SorteigActivitat } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";

export const textSorteig = (so: Pick<SorteigActivitat, "tipus" | "valor">) => `${so.tipus === "lletra" ? "Lletra" : "Número"} ${so.valor}`;

/**
 * Sorteig de cada activitat amb més sol·licituds que places: números de sorteig
 * (si es fan servir números aleatoris), sortejos fets amb l'aplicació o a mà, i anul·lacions amb motiu.
 */
export function Sorteig({ casalId, cicleId, pot, versioCicle }: {
  casalId: string; cicleId: string; pot: (p: string) => boolean; versioCicle: number;
}) {
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.sorteig(casalId, cicleId, s), [casalId, cicleId, versio, versioCicle]);
  const [exit, setExit] = useState("");
  const [error, setError] = useState<ErrorClientApi | Error | null>(null);
  const [enCurs, setEnCurs] = useState(false);
  const [manual, setManual] = useState<{ id: string; nom: string } | null>(null);
  const [valor, setValor] = useState("");
  const [anullant, setAnullant] = useState<SorteigActivitat | null>(null);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant els sortejos…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  const p = d.parametres;

  async function accio(fer: () => Promise<unknown>, missatge: string) {
    setError(null);
    setExit("");
    setEnCurs(true);
    try {
      await fer();
      setExit(missatge);
      setVersio((v) => v + 1);
      setManual(null);
      setAnullant(null);
    } catch (e) {
      if (e instanceof Error) setError(e);
      else throw e;
    } finally {
      setEnCurs(false);
    }
  }

  if (!p || p.criteri_ordre !== "sorteig_activitat") {
    return <p>Els paràmetres d'adjudicació vigents no preveuen sorteig per activitat.</p>;
  }
  const potFer = d.pot_sortejar && pot("adjudicacio.executar");
  const aleatoria = p.tipus_sorteig === "numero" && p.numeracio_sorteig === "aleatoria";
  const valorValid = p.tipus_sorteig === "lletra" ? /^[A-Za-z]$/.test(valor)
    : /^\d+$/.test(valor) && Number(valor) >= 1 && Number(valor) <= (d.rang_numeros ?? 0);

  const exportaNumeros = () => accio(async () => {
    const taula = await serveiGestio.exportacioNumeros(casalId, cicleId);
    descarrega(await generaXlsx(taula), taula.fitxer);
  }, "S'ha descarregat la llista de números de sorteig.");

  return (
    <div>
      <div aria-live="polite">
        {exit && <AvisExit>{exit}</AvisExit>}
        {error && (error instanceof ErrorClientApi ? <MissatgeError error={error} /> : <p className="avis avis--error" role="alert">{error.message}</p>)}
      </div>
      <p className="text-secundari">
        {p.tipus_sorteig === "lletra"
          ? "Sorteig d'una lletra per activitat: es comença pel primer cognom que comença per aquesta lletra, en ordre alfabètic."
          : `Sorteig d'un número per activitat${d.rang_numeros ? `, entre 1 i ${d.rang_numeros}` : ""}: es comença per la persona amb aquest número ${p.numeracio_sorteig === "aleatoria" ? "de sorteig" : "de sol·licitud"} i es continua en ordre.`}
        {" "}Només cal sortejar les activitats amb més sol·licituds que places. Cada sorteig queda registrat amb la data, l'hora i qui l'ha fet.
      </p>

      {aleatoria && (
        <>
          <h3 className="subseccio">Números de sorteig</h3>
          <p>
            {d.numeros.assignats} sol·licituds tenen número
            {d.numeros.sense_numero > 0 ? ` · ${d.numeros.sense_numero} encara no en tenen` : ""}.
            Els números es fan a l'atzar una sola vegada i no es poden canviar. Publiqueu la llista abans del sorteig perquè cada persona sàpiga el seu.
          </p>
          <div className="botonera">
            {potFer && d.numeros.sense_numero > 0 && (
              <button type="button" className="boto" disabled={enCurs}
                onClick={() => void accio(() => serveiGestio.assignarNumeros(casalId, cicleId), "S'han assignat els números de sorteig.")}>
                {d.numeros.assignats > 0 ? "Assigna número a les que no en tenen" : "Assigna els números de sorteig"}
              </button>
            )}
            {pot("dades.exportar") && d.numeros.assignats > 0 && (
              <button type="button" className="boto boto--secundari" disabled={enCurs} onClick={() => void exportaNumeros()}>
                Exporta la llista de números (XLSX)
              </button>
            )}
          </div>
        </>
      )}

      <h3 className="subseccio">Activitats</h3>
      {potFer && (
        <p>
          <Link className="boto" to={`/gestio/${casalId}/cicles/${cicleId}/sorteig`}>Obre la pantalla de sorteig</Link>
          {" "}<span className="text-secundari">Pantalla completa per projectar-la o emetre-la en directe.</span>
        </p>
      )}
      <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Sortejos per activitat">
        <table className="taula taula--densa">
          <thead>
            <tr>
              <th scope="col">Activitat</th><th scope="col">Places</th><th scope="col">Sol·licituds</th>
              <th scope="col">Sorteig</th><th scope="col"><span className="visualment-amagat">Accions</span></th>
            </tr>
          </thead>
          <tbody>
            {d.activitats.map((a) => (
              <tr key={a.id}>
                <td>{a.nom}</td>
                <td>{a.capacitat}</td>
                <td>{a.sollicituds}</td>
                <td>
                  {a.sorteig ? (
                    <>
                      <strong>{textSorteig(a.sorteig)}</strong>
                      <div className="text-secundari">
                        {a.sorteig.origen === "manual" ? "Fet a mà" : "Fet amb l'aplicació"} · {formataDataHora(a.sorteig.realitzat_el)}
                        {a.sorteig.realitzat_per_nom ? ` · ${a.sorteig.realitzat_per_nom}` : ""}
                      </div>
                    </>
                  ) : a.necessita_sorteig ? <span className="etiqueta etiqueta--alerta">Cal fer-lo</span> : <span className="text-secundari">No cal: hi ha places per a tothom</span>}
                  {a.sorteig_altre_tipus && <div className="text-secundari">Hi ha un sorteig d'un altre tipus que ja no s'aplica.</div>}
                </td>
                <td>
                  {potFer && (
                    <div className="botonera">
                      {!a.sorteig && a.necessita_sorteig && (
                        <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs}
                          onClick={() => { setValor(""); setManual({ id: a.id, nom: a.nom }); }}>Registra un sorteig fet a mà</button>
                      )}
                      {a.sorteig && (
                        <button type="button" className="boto boto--secundari boto--petit" disabled={enCurs} onClick={() => setAnullant(a.sorteig)}>
                          Anul·la
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.historial.length > 0 && <HistorialSortejos historial={d.historial} />}

      <DialegConfirmacio obert={manual !== null} enCurs={enCurs} titol={`Sorteig fet a mà · ${manual?.nom ?? ""}`} textConfirmar="Registra el sorteig"
        onCancelar={() => setManual(null)}
        onConfirmar={(motiu) => {
          if (!manual || !valorValid) return;
          void accio(() => serveiGestio.ferSorteig(casalId, cicleId, manual.id, { valor_manual: valor, ...(motiu ? { motiu } : {}) }),
            `S'ha registrat el sorteig de «${manual.nom}».`);
        }}>
        <p>Per a un sorteig fet fora de l'aplicació (amb bombo, en directe…). Queda registrat que s'ha fet a mà.</p>
        <div className={`camp camp--compacte ${valor === "" || valorValid ? "" : "camp--error"}`}>
          <label htmlFor="valor-sorteig">{p.tipus_sorteig === "lletra" ? "Lletra sortejada" : `Número sortejat (1 a ${d.rang_numeros ?? "?"})`}</label>
          <input id="valor-sorteig" value={valor} inputMode={p.tipus_sorteig === "lletra" ? "text" : "numeric"} required
            onChange={(e) => setValor(p.tipus_sorteig === "lletra" ? e.target.value.slice(0, 1).toUpperCase() : e.target.value.trim())} />
          {valor !== "" && !valorValid && <p className="camp__missatge" role="alert">Valor no vàlid.</p>}
        </div>
      </DialegConfirmacio>

      <DialegConfirmacio obert={anullant !== null} enCurs={enCurs} titol="Anul·lar el sorteig" textConfirmar="Anul·la el sorteig" demanaMotiu
        onCancelar={() => setAnullant(null)}
        onConfirmar={(motiu) => anullant && void accio(() => serveiGestio.anullarSorteig(casalId, cicleId, anullant.id, motiu),
          "S'ha anul·lat el sorteig. Ja se'n pot fer un de nou.")}>
        <p>El sorteig «{anullant ? textSorteig(anullant) : ""}» de «{anullant?.activitat}» quedarà anul·lat, no s'esborrarà. Després se'n podrà fer un de nou.</p>
      </DialegConfirmacio>
    </div>
  );
}

function HistorialSortejos({ historial }: { historial: EstatSorteig["historial"] }) {
  return (
    <details className="grup-activitat">
      <summary>Registre de tots els sortejos ({historial.length})</summary>
      <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Registre de sortejos">
        <table className="taula taula--densa">
          <thead>
            <tr><th scope="col">Data i hora</th><th scope="col">Activitat</th><th scope="col">Resultat</th><th scope="col">Com</th><th scope="col">Estat</th></tr>
          </thead>
          <tbody>
            {historial.map((h) => (
              <tr key={h.id}>
                <td className="nowrap">{formataDataHora(h.realitzat_el)}</td>
                <td>{h.activitat}</td>
                <td>{textSorteig(h)}{h.rang_maxim ? ` (de 1 a ${h.rang_maxim})` : ""}</td>
                <td>{h.origen === "manual" ? "A mà" : "Aplicació"}{h.realitzat_per_nom ? ` · ${h.realitzat_per_nom}` : ""}{h.motiu ? ` · ${h.motiu}` : ""}</td>
                <td>{h.estat === "vigent" ? "Vigent" : `Anul·lat el ${formataDataHora(h.anullat_el!)}: ${h.motiu_anullacio}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
