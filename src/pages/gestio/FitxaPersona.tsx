import { Link, useParams, useSearchParams } from "react-router";
import { ETIQUETES_ESTAT_PLACA } from "../../../shared/schemas/adjudicacio";
import type { EstatPlaca } from "../../../shared/schemas/adjudicacio";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import { formataData, formataDataHora } from "../../utils/format";

const ORIGENS: Record<string, string> = { usuaris: "llistat d'usuaris", carnets: "llistat de carnets", altres: "altres llistats" };

const estatActivitat = (a: { estat: string | null; posicio_espera: number | null; sollicitud_anullada: boolean }) => {
  if (a.sollicitud_anullada) return "Sol·licitud anul·lada";
  if (!a.estat) return "Sense adjudicar";
  if (a.estat === "llista_espera" && a.posicio_espera) return `Llista d'espera (${a.posicio_espera})`;
  return ETIQUETES_ESTAT_PLACA[a.estat as EstatPlaca] ?? a.estat;
};

/** Fitxa d'una persona de la PGEc: totes les dades que es poden veure i les seves inscripcions al casal. */
export function FitxaPersona() {
  const { casalId = "", personaId = "" } = useParams();
  const [params] = useSearchParams();
  const consulta = useConsulta((s) => serveiGestio.fitxaPersona(casalId, personaId, s), [casalId, personaId]);
  const tornar = `/gestio/${casalId}/persones${params.toString() ? `?${params}` : ""}`;

  if (consulta.tipus === "carregant") return <Carregant text="Carregant la fitxa…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const { persona, grups, dades_restringides, participacio } = consulta.dades;

  return (
    <div>
      <p className="subtitol"><Link to={tornar}>Tornar a la cerca</Link></p>
      <h1>{persona.nom} {persona.cognoms}</h1>
      <p className="text-secundari">
        Dades importades del {persona.origens.map((o) => ORIGENS[o] ?? o).join(" i del ")} de la PGEc; actualitzades el {formataDataHora(persona.actualitzat_el)}.
        {" "}El document es mostra emmascarat.
      </p>
      {dades_restringides && <p className="text-secundari">No teniu permís per veure les dades de contacte, l'adreça ni les del tutor/a.</p>}

      {grups.map((g) => (
        <Seccio key={g.grup} titol={g.titol}>
          <dl className="dades">
            {g.camps.map((c) => (
              <div key={c.camp}>
                <dt>{c.etiqueta}</dt>
                <dd className={c.tipus === "document" ? "codi" : undefined}>{c.tipus === "data" && /^\d{4}-\d{2}-\d{2}$/.test(c.valor) ? formataData(c.valor) : c.valor}</dd>
              </div>
            ))}
          </dl>
        </Seccio>
      ))}

      <Seccio titol="Inscripcions al casal">
        {participacio.length === 0 ? (
          <p className="text-secundari">No consta cap sol·licitud d'aquesta persona a l'aplicació (es busca pel document o pel nom, cognoms i data de naixement).</p>
        ) : (
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Inscripcions al casal">
            <table className="taula taula--densa">
              <thead><tr><th scope="col">Cicle</th><th scope="col">Activitat</th><th scope="col">Preferència</th><th scope="col">Situació</th></tr></thead>
              <tbody>
                {participacio.flatMap((c) => c.activitats.map((a, i) => (
                  <tr key={`${c.cicle_id}-${a.activitat_id}`}>
                    {i === 0 && <th scope="row" rowSpan={c.activitats.length}><Link to={`/gestio/${casalId}/cicles/${c.cicle_id}`}>{c.cicle}</Link></th>}
                    <td>{a.activitat}</td>
                    <td>{a.preferencia}</td>
                    <td>{estatActivitat(a)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </Seccio>
    </div>
  );
}
