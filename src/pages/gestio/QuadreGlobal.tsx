import { useState } from "react";
import { Link } from "react-router";
import { ETIQUETES_ESTAT_CICLE } from "../../../shared/domain/cicles";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { Seccio } from "../../components/Seccio";
import { descarrega, generaXlsx } from "../../fitxers/xlsx";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import type { QuadreGlobal as Dades, RecomptesGlobals } from "../../types/gestio";

const pc = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("ca")} %`);
const curta = (iso: string) => iso.split("-").reverse().join("/");
const n = (v: number) => v.toLocaleString("ca");

/** Columnes comunes a les taules per casal i per cicle. */
const COLUMNES: { clau: keyof RecomptesGlobals; text: string }[] = [
  { clau: "activitats", text: "Activitats" },
  { clau: "places_ofertes", text: "Places ofertes" },
  { clau: "sollicituds", text: "Sol·licituds" },
  { clau: "admeses", text: "Admeses" },
  { clau: "espera", text: "Llista d'espera" },
  { clau: "renuncies", text: "Renúncies" },
  { clau: "baixes_voluntaries", text: "Baixes voluntàries" },
  { clau: "baixes", text: "Baixes per assistència" },
  { clau: "sessions_realitzades", text: "Sessions fetes" },
  { clau: "percentatge_assistencia", text: "Assistència" },
];
const valor = (r: RecomptesGlobals, c: keyof RecomptesGlobals) =>
  (c === "percentatge_assistencia" ? pc(r[c]) : n(r[c] as number));

/**
 * Quadre de comandament de la superadministració: indicadors de tots els casals i cicles
 * (petició de 2026-10-15). Només recomptes: cap dada personal.
 */
export function QuadreGlobal() {
  const [any, setAny] = useState<number | null>(null);
  const [tots, setTots] = useState(false);
  const consulta = useConsulta((s) => serveiGestio.quadreGlobal(any, s), [any]);

  if (consulta.tipus === "carregant") return <Carregant text="Calculant els indicadors de tots els casals…" />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const d = consulta.dades;
  const t = d.totals;
  const casals = d.casals.filter((k) => tots || k.cicles > 0 || k.persones_plataforma > 0 || k.equip > 0);

  return (
    <div>
      <p className="subtitol"><Link to="/gestio">Superadministració</Link></p>
      <h1>Quadre de comandament</h1>
      <div className="barra-filtres">
        <label className="camp camp--en-linia">
          <span>Any dels cicles</span>
          <select value={any ?? ""} onChange={(e) => setAny(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Tots</option>
            {d.anys.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <button type="button" className="boto boto--secundari boto--petit" onClick={() => void exporta(d)}>Descarrega l'informe (Excel)</button>
      </div>

      <ul className="xifres" aria-label="Totals">
        <li><strong>{n(t.casals)}</strong><span>casals ({n(t.casals_amb_responsable)} amb responsable)</span></li>
        <li><strong>{n(t.cicles)}</strong><span>cicles ({n(t.casals_amb_cicles)} casals amb cicles)</span></li>
        <li><strong>{n(t.activitats)}</strong><span>activitats ({n(t.places_ofertes)} places)</span></li>
        <li><strong>{n(t.sollicituds)}</strong><span>sol·licituds</span></li>
        <li><strong>{n(t.persones_diferents)}</strong><span>persones inscrites diferents</span></li>
        <li><strong>{n(t.admeses)}</strong><span>places adjudicades</span></li>
        <li><strong>{n(t.espera)}</strong><span>en llista d'espera</span></li>
        <li><strong>{n(t.baixes_voluntaries + t.renuncies)}</strong><span>renúncies i baixes voluntàries</span></li>
        <li><strong>{n(t.sessions_realitzades)}</strong><span>sessions fetes</span></li>
        <li><strong>{pc(t.percentatge_assistencia)}</strong><span>d'assistència</span></li>
        <li><strong>{n(t.persones_plataforma)}</strong><span>persones usuàries importades (PGEc)</span></li>
        <li><strong>{n(t.equip)}</strong><span>persones als equips dels casals</span></li>
      </ul>
      <p className="text-secundari">
        Les persones diferents es compten per casal (mateix document o mateix nom i data de naixement); qui va a dos casals compta a tots dos.
        L'assistència és el percentatge de presències sobre totes les marques; les faltes justificades compten com a faltes.
      </p>

      <Seccio titol="Per casal">
        <label className="casella"><input type="checkbox" checked={tots} onChange={(e) => setTots(e.target.checked)} /> Mostra també els casals sense activitat</label>
        <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Indicadors per casal">
          <table className="taula taula--densa">
            <thead>
              <tr>
                <th scope="col">Casal</th><th scope="col" className="num">Cicles</th>
                {COLUMNES.map((c) => <th key={c.clau} scope="col" className="num">{c.text}</th>)}
                <th scope="col" className="num">Persones diferents</th><th scope="col" className="num">Persones PGEc</th>
                <th scope="col" className="num">Equip</th><th scope="col">Responsable</th>
              </tr>
            </thead>
            <tbody>
              {casals.map((k) => (
                <tr key={k.casal_id}>
                  <th scope="row"><Link to={`/gestio/${k.casal_id}`}>{k.casal}</Link></th>
                  <td className="num">{n(k.cicles)}</td>
                  {COLUMNES.map((c) => <td key={c.clau} className="num">{valor(k, c.clau)}</td>)}
                  <td className="num">{n(k.persones_diferents)}</td><td className="num">{n(k.persones_plataforma)}</td>
                  <td className="num">{n(k.equip)}</td><td>{k.responsables > 0 ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccio>

      <Seccio titol="Per cicle">
        {d.cicles.length === 0 ? <p>No hi ha cap cicle{any ? ` de l'any ${any}` : ""}.</p> : (
          <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Indicadors per cicle">
            <table className="taula taula--densa">
              <thead>
                <tr>
                  <th scope="col">Casal</th><th scope="col">Cicle</th><th scope="col">Estat</th><th scope="col">Dates</th>
                  {COLUMNES.map((c) => <th key={c.clau} scope="col" className="num">{c.text}</th>)}
                  <th scope="col" className="num">Persones</th>
                </tr>
              </thead>
              <tbody>
                {d.cicles.map((c) => (
                  <tr key={c.cicle_id}>
                    <td>{c.casal}</td>
                    <th scope="row"><Link to={`/gestio/${c.casal_id}/cicles/${c.cicle_id}`}>{c.cicle}</Link></th>
                    <td>{ETIQUETES_ESTAT_CICLE[c.estat] ?? c.estat}</td>
                    <td className="sense-salt">{curta(c.data_inici)} – {curta(c.data_fi)}</td>
                    {COLUMNES.map((k) => <td key={k.clau} className="num">{valor(c, k.clau)}</td>)}
                    <td className="num">{n(c.persones)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccio>
    </div>
  );
}

/** Informe global en dos fitxers Excel: per casal i per cicle. */
async function exporta(d: Dades) {
  const sufix = d.any ? `-${d.any}` : "";
  const num = (r: RecomptesGlobals) => COLUMNES.map((c) => r[c.clau] as number | null);
  descarrega(await generaXlsx({
    titol: "Quadre per casal", fitxer: `quadre-global-casals${sufix}.xlsx`,
    columnes: ["Casal", "Municipi", "Cicles", ...COLUMNES.map((c) => c.text === "Assistència" ? "Assistència (%)" : c.text), "Persones diferents", "Persones PGEc", "Equip", "Té responsable"],
    files: d.casals.map((k) => [k.casal, k.municipi, k.cicles, ...num(k), k.persones_diferents, k.persones_plataforma, k.equip, k.responsables > 0 ? "Sí" : "No"]),
  }), `quadre-global-casals${sufix}.xlsx`);
  descarrega(await generaXlsx({
    titol: "Quadre per cicle", fitxer: `quadre-global-cicles${sufix}.xlsx`,
    columnes: ["Casal", "Cicle", "Any", "Estat", "Data d'inici", "Data de final", ...COLUMNES.map((c) => c.text === "Assistència" ? "Assistència (%)" : c.text), "Persones"],
    files: d.cicles.map((c) => [c.casal, c.cicle, c.any, ETIQUETES_ESTAT_CICLE[c.estat] ?? c.estat, c.data_inici, c.data_fi, ...num(c), c.persones]),
  }), `quadre-global-cicles${sufix}.xlsx`);
}
