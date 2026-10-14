import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import type { IndicadorsCicle } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";

function textInscripcions(i: IndicadorsCicle["inscripcions"]) {
  switch (i.estat) {
    case "pendents": return `Encara no obertes (obertura prevista: ${formataDataHora(i.obertura)})`;
    case "obertes": return `Obertes fins al ${formataDataHora(i.tancament)}`;
    case "fora_de_termini": return Date.now() < Date.parse(i.obertura)
      ? `Obriran el ${formataDataHora(i.obertura)}`
      : `El termini va acabar el ${formataDataHora(i.tancament)}: cal tancar les inscripcions`;
    case "tancades": return "Tancades";
  }
}

function textAdjudicacio(a: IndicadorsCicle["adjudicacio"]) {
  if (a.estat === "sense_proposta") return "Sense cap proposta";
  return a.estat === "confirmada"
    ? `Confirmada (versió ${a.versio}, ${formataDataHora(a.data!)})`
    : `Proposta pendent de confirmar (versió ${a.versio}, ${formataDataHora(a.data!)})`;
}

/** Quadre de comandament del cicle: xifres calculades al servidor a partir de la base de dades. */
export function Indicadors({ casalId, cicleId, versio }: { casalId: string; cicleId: string; versio: number }) {
  const consulta = useConsulta((s) => serveiGestio.indicadors(casalId, cicleId, s), [casalId, cicleId, versio], `${casalId}/${cicleId}`);
  if (consulta.tipus === "carregant") return <Carregant text="Calculant els indicadors…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  const t = d.totals;
  const pe = t.sollicituds_per_estat;
  const ambPlaces = d.adjudicacio.estat === "confirmada";

  return (
    <div>
      <dl className="dades">
        <div><dt>Inscripcions</dt><dd>{textInscripcions(d.inscripcions)}</dd></div>
        <div><dt>Adjudicació</dt><dd>{textAdjudicacio(d.adjudicacio)}</dd></div>
      </dl>

      <dl className="xifres" aria-label="Indicadors del cicle">
        <div><dt>Activitats</dt><dd>{t.activitats}</dd></div>
        <div><dt>Sol·licituds</dt><dd>{t.sollicituds}</dd></div>
        <div><dt>Persones inscrites</dt><dd>{t.persones}</dd></div>
        <div><dt>Places disponibles</dt><dd>{t.places_disponibles}</dd></div>
        <div><dt>Places ocupades</dt><dd>{ambPlaces ? t.places_ocupades : "—"}</dd></div>
        <div><dt>Persones en llista d'espera</dt><dd>{ambPlaces ? t.espera : "—"}</dd></div>
        <div><dt>Activitats sense inscripcions</dt><dd>{t.activitats_sense_inscripcions}</dd></div>
        <div><dt>Activitats amb més demanda que places</dt><dd>{t.activitats_mes_demanda}</dd></div>
      </dl>
      <p className="text-secundari">
        Sol·licituds: {pe.validada} validades · {pe.rebuda} rebudes · {pe.pendent_revisio} pendents de revisió
        {pe.anullada > 0 ? ` · ${pe.anullada} anul·lades (no es compten)` : ""}.
        {t.activitats_no_actives > 0 ? ` ${t.activitats_no_actives === 1 ? "Hi ha 1 activitat no activa, que no es compta." : `Hi ha ${t.activitats_no_actives} activitats no actives, que no es compten.`}` : ""}
        {!ambPlaces ? " Les places ocupades i la llista d'espera apareixen quan hi ha una adjudicació confirmada." : ""}
      </p>

      {d.activitats.length === 0 ? <p>Aquest cicle encara no té cap activitat activa.</p> : (
        <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Indicadors per activitat">
          <table className="taula taula--densa">
            <thead>
              <tr>
                <th scope="col">Activitat</th><th scope="col">Places</th><th scope="col">Sol·licituds</th><th scope="col">1a preferència</th>
                <th scope="col">Admeses</th><th scope="col">Llista d'espera</th><th scope="col">Lliures</th><th scope="col">Observacions</th>
              </tr>
            </thead>
            <tbody>
              {d.activitats.map((a) => (
                <tr key={a.id}>
                  <th scope="row">{a.nom}</th>
                  <td>{a.capacitat}</td><td>{a.sollicituds}</td><td>{a.primera_preferencia}</td>
                  <td>{ambPlaces ? a.admeses + (a.ofertes ? ` (+${a.ofertes} ofertes)` : "") : "—"}</td>
                  <td>{ambPlaces ? a.espera : "—"}</td>
                  <td>{ambPlaces ? a.lliures : "—"}</td>
                  <td>
                    {a.sense_inscripcions && <span className="etiqueta etiqueta--alerta">Sense inscripcions</span>}
                    {a.mes_demanda && <span className="etiqueta">Més demanda que places</span>}
                    {ambPlaces && a.minim_participants !== null && a.admeses < a.minim_participants && (
                      <span className="etiqueta etiqueta--alerta">Per sota del mínim ({a.minim_participants})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-secundari">Calculat el {formataDataHora(d.calculat_el)} a partir de les dades actuals.</p>
    </div>
  );
}
