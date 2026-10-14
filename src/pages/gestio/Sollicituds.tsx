import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ETIQUETES_ESTAT_ADJUDICACIO, ETIQUETES_ESTAT_SOLLICITUD, ESTATS_SOLLICITUD } from "../../../shared/schemas/sollicituds";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import type { Activitat, FilaSollicitud } from "../../types/gestio";
import { formataDataHora } from "../../utils/format";

type Vista = "inscripcio" | "alfabetic" | "activitat";
type Ordre = "inscripcio" | "alfabetic" | "preferencies" | "estat";

const VISTES: { valor: Vista; text: string }[] = [
  { valor: "inscripcio", text: "Ordre d'inscripció" },
  { valor: "alfabetic", text: "Ordre alfabètic" },
  { valor: "activitat", text: "Per activitat" },
];

const ORIGENS = { formulari_public: "Formulari", importacio: "Importació", gestio: "Panell" } as const;

export const nomComplet = (p: FilaSollicitud["participant"]) => [p.cognom1, p.cognom2].filter(Boolean).join(" ");

/**
 * Llistat de sol·licituds d'un cicle amb tres vistes, cerca, filtres, ordenació
 * per columnes i paginació. Les dades de contacte només apareixen si la persona
 * usuària té permís per veure-les (ho decideix el servidor).
 */
export function LlistatSollicituds({ casalId, cicleId, activitats, versio = 0 }: {
  casalId: string; cicleId: string; activitats: Activitat[];
  /** Canvia quan una altra secció modifica dades que afecten el llistat (p. ex. places). */
  versio?: number;
}) {
  const [vista, setVista] = useState<Vista>("inscripcio");
  const [ordre, setOrdre] = useState<{ camp: Ordre; desc: boolean } | null>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [activitat, setActivitat] = useState("");
  const [estat, setEstat] = useState("");
  const [pagina, setPagina] = useState(1);
  const mida = 50;

  const params: Record<string, string> = { vista, pagina: String(pagina), mida: String(mida) };
  if (ordre && vista !== "activitat") { params.ordre = ordre.camp; params.dir = ordre.desc ? "desc" : "asc"; }
  if (q) params.q = q;
  if (activitat) params.activitat = activitat;
  if (estat) params.estat = estat;
  const consulta = useConsulta((s) => serveiGestio.sollicituds(casalId, cicleId, params, s), [casalId, cicleId, JSON.stringify(params), versio]);

  const cerca = (e: FormEvent) => { e.preventDefault(); setQ(text.trim()); setPagina(1); };
  const canviaVista = (v: Vista) => { setVista(v); setOrdre(null); setPagina(1); };
  const ordena = (camp: Ordre) => {
    setOrdre((o) => (o?.camp === camp ? { camp, desc: !o.desc } : { camp, desc: false }));
    setPagina(1);
  };

  return (
    <div>
      <div className="barra-filtres">
        <fieldset className="selector-vista">
          <legend className="visualment-amagat">Mode de visualització</legend>
          {VISTES.map((v) => (
            <label key={v.valor} className={`selector-vista__opcio ${vista === v.valor ? "selector-vista__opcio--activa" : ""}`}>
              <input type="radio" name="vista" value={v.valor} checked={vista === v.valor} onChange={() => canviaVista(v.valor)} />
              {v.text}
            </label>
          ))}
        </fieldset>
        <form onSubmit={cerca} className="cerca" role="search">
          <label htmlFor="cerca-sollicituds" className="visualment-amagat">Cerca per nom, cognoms o número</label>
          <input id="cerca-sollicituds" type="search" placeholder="Nom, cognoms o número" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="boto boto--secundari boto--petit">Cerca</button>
          {q && <button type="button" className="boto boto--secundari boto--petit" onClick={() => { setText(""); setQ(""); setPagina(1); }}>Neteja</button>}
        </form>
        <label className="filtre">
          Activitat
          <select value={activitat} onChange={(e) => { setActivitat(e.target.value); setPagina(1); }}>
            <option value="">Totes</option>
            {activitats.filter((a) => a.estat !== "arxivada").map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        </label>
        <label className="filtre">
          Estat
          <select value={estat} onChange={(e) => { setEstat(e.target.value); setPagina(1); }}>
            <option value="">Tots</option>
            {ESTATS_SOLLICITUD.map((e) => <option key={e} value={e}>{ETIQUETES_ESTAT_SOLLICITUD[e]}</option>)}
          </select>
        </label>
      </div>

      {consulta.tipus === "carregant" && <Carregant text="Carregant les sol·licituds…" />}
      {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
      {consulta.tipus === "dades" && (consulta.dades.vista === "activitat" ? (
        consulta.dades.grups.length === 0 ? <p>No hi ha activitats en aquest cicle.</p> : (
          <div className="grups-activitat">
            {consulta.dades.grups.map((g) => (
              <details key={g.activitat_id} className="grup-activitat" open={consulta.dades.vista === "activitat" && consulta.dades.grups.length <= 6}>
                <summary>
                  <strong>{g.activitat}</strong> <span className="text-secundari">· {g.files.length} sol·licituds · {g.capacitat} places</span>
                </summary>
                {g.files.length === 0 ? <p className="text-secundari">Cap sol·licitud.</p> : (
                  <TaulaFiles casalId={casalId} files={g.files} ambPreferencia />
                )}
              </details>
            ))}
          </div>
        )
      ) : (
        <>
          <p className="text-secundari" aria-live="polite">
            {consulta.dades.total === 0 ? "No hi ha cap sol·licitud amb aquests criteris." :
              `${consulta.dades.total} sol·licituds · pàgina ${consulta.dades.pagina} de ${Math.max(1, Math.ceil(consulta.dades.total / mida))}`}
          </p>
          {consulta.dades.files.length > 0 && (
            <TaulaFiles casalId={casalId} files={consulta.dades.files} ordre={ordre ?? { camp: vista === "alfabetic" ? "alfabetic" : "inscripcio", desc: false }} onOrdena={ordena} />
          )}
          {consulta.dades.total > mida && (
            <nav className="paginacio" aria-label="Paginació">
              <button type="button" className="boto boto--secundari boto--petit" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
              <span>Pàgina {pagina} de {Math.ceil(consulta.dades.total / mida)}</span>
              <button type="button" className="boto boto--secundari boto--petit" disabled={pagina * mida >= consulta.dades.total} onClick={() => setPagina((p) => p + 1)}>Següent</button>
            </nav>
          )}
        </>
      ))}
    </div>
  );
}

function CapcaleraOrdenable({ camp, text, ordre, onOrdena }: {
  camp: Ordre; text: string; ordre?: { camp: Ordre; desc: boolean }; onOrdena?: (c: Ordre) => void;
}) {
  if (!onOrdena) return <th scope="col">{text}</th>;
  const actiu = ordre?.camp === camp;
  return (
    <th scope="col" aria-sort={actiu ? (ordre!.desc ? "descending" : "ascending") : "none"}>
      <button type="button" className="ordenable" onClick={() => onOrdena(camp)}>
        {text} <span aria-hidden="true">{actiu ? (ordre!.desc ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  );
}

function TaulaFiles({ casalId, files, ambPreferencia, ordre, onOrdena }: {
  casalId: string; files: (FilaSollicitud & { ordre?: number })[]; ambPreferencia?: boolean;
  ordre?: { camp: Ordre; desc: boolean }; onOrdena?: (c: Ordre) => void;
}) {
  // Les columnes de contacte només surten si hi ha cap valor (i si es poden veure).
  const telefon = files.some((f) => f.participant.telefon);
  const correu = files.some((f) => f.participant.email);
  return (
    <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Sol·licituds">
      <table className="taula taula--densa">
        <thead>
          <tr>
            <CapcaleraOrdenable camp="inscripcio" text="Núm." ordre={ordre} onOrdena={onOrdena} />
            <th scope="col">Registre</th>
            <CapcaleraOrdenable camp="alfabetic" text="Cognoms" ordre={ordre} onOrdena={onOrdena} />
            <th scope="col">Nom</th>
            {telefon && <th scope="col">Telèfon</th>}
            {correu && <th scope="col">Correu</th>}
            {ambPreferencia
              ? <th scope="col">Preferència</th>
              : <CapcaleraOrdenable camp="preferencies" text="Activitats" ordre={ordre} onOrdena={onOrdena} />}
            <CapcaleraOrdenable camp="estat" text="Estat" ordre={ordre} onOrdena={onOrdena} />
            <th scope="col">Adjudicació</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.id} className={f.estat === "anullada" ? "fila--anullada" : undefined}>
              <td><Link to={`/gestio/${casalId}/sollicituds/${f.id}`}>{f.numero}</Link></td>
              <td className="nowrap">{formataDataHora(f.rebuda_el)}<div className="text-secundari">{ORIGENS[f.origen]}</div></td>
              <td><Link to={`/gestio/${casalId}/sollicituds/${f.id}`}>{nomComplet(f.participant)}</Link></td>
              <td>{f.participant.nom}</td>
              {telefon && <td className="nowrap">{f.participant.telefon ?? ""}</td>}
              {correu && <td>{f.participant.email ?? ""}</td>}
              <td>{ambPreferencia ? f.ordre : f.nombre_preferencies}</td>
              <td><span className={`etiqueta etiqueta--${f.estat}`}>{ETIQUETES_ESTAT_SOLLICITUD[f.estat]}</span></td>
              <td>{ETIQUETES_ESTAT_ADJUDICACIO[f.estat_adjudicacio]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
