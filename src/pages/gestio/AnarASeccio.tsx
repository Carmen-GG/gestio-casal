import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router";
import { ETIQUETES_ESTAT_CICLE, type EstatCicle } from "../../../shared/domain/cicles";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import { formataData } from "../../utils/format";

/** Cicles amb què es treballa des del menú (els tancats es consulten des de la llista de cicles). */
const ESTATS_EN_CURS: EstatCicle[] = ["esborrany", "preparacio", "inscripcions_obertes", "inscripcions_tancades", "adjudicacio_en_proces", "adjudicat", "publicat"];

const TITOLS: Record<string, string> = {
  activitats: "Gestionar activitats",
  "sollicituds-rebudes": "Gestionar inscripcions",
  "sorteig-per-activitat": "Sorteig públic",
  adjudicacio: "Assignació d'activitats",
  assistencia: "Assistència",
  "places-i-llistes-d-espera": "Informar assignacions",
  comunicacions: "Comunicacions segons activitat",
};

/** Seccions que són una pàgina pròpia del cicle i no una part de la pàgina del cicle. */
const PAGINES: Record<string, string> = { comunicacions: "comunicacions" };
const desti = (casalId: string, cicleId: string, seccio: string) =>
  PAGINES[seccio] ? `/gestio/${casalId}/cicles/${cicleId}/${PAGINES[seccio]}` : `/gestio/${casalId}/cicles/${cicleId}#${seccio}`;

/**
 * Entrada del menú que porta a una secció d'un cicle: si només hi ha un cicle en curs
 * hi va directament; si n'hi ha més, es tria.
 */
export function AnarASeccio() {
  const { casalId = "", seccio = "" } = useParams();
  const consulta = useConsulta((s) => serveiGestio.cicles(casalId, s), [casalId]);
  useEffect(() => { window.scrollTo(0, 0); }, [seccio]);

  if (consulta.tipus === "carregant") return <Carregant text="Carregant els cicles…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const enCurs = consulta.dades.cicles.filter((c) => ESTATS_EN_CURS.includes(c.estat));
  if (enCurs.length === 1) return <Navigate to={desti(casalId, enCurs[0]!.id, seccio)} replace />;

  return (
    <section aria-labelledby="titol-anar">
      <h1 id="titol-anar">{TITOLS[seccio] ?? "Trieu el cicle"}</h1>
      {enCurs.length === 0 ? (
        <p>No hi ha cap cicle en curs. <Link to={`/gestio/${casalId}#nou-cicle`}>Creeu un cicle</Link> per començar.</p>
      ) : (
        <>
          <p>Trieu el cicle:</p>
          <ul className="llista-targetes">
            {enCurs.map((c) => (
              <li key={c.id} className="targeta">
                <h2><Link to={desti(casalId, c.id, seccio)}>{c.nom}</Link></h2>
                <p className="text-secundari">{formataData(c.data_inici)} – {formataData(c.data_fi)} · {ETIQUETES_ESTAT_CICLE[c.estat]}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
