import { useMemo, useState } from "react";
import type { ParticipantVisible } from "../../types/gestio";

export interface ColumnaActivitat {
  activitat_id: string;
  activitat: string;
  /** Situació de cada sol·licitud en aquesta activitat (text curt: «Admesa», «Espera 3»...). */
  files: { sollicitud_id: string; participant: ParticipantVisible; valor: string }[];
}

type Ordre = { columna: string; sentit: "asc" | "desc" };
const comparaText = new Intl.Collator("ca", { sensitivity: "base", numeric: true }).compare;

/**
 * Graella d'admesos i exclosos (petició de 2026-10-15): una fila per persona, per ordre
 * alfabètic, amb el telèfon, el nom, els cognoms i una columna per activitat. Cada
 * capçalera permet ordenar A-Z o Z-A i filtrar per un valor concret.
 */
export function GraellaAssignacions({ columnes, titol }: { columnes: ColumnaActivitat[]; titol: string }) {
  const [ordre, setOrdre] = useState<Ordre>({ columna: "cognoms", sentit: "asc" });
  const [filtres, setFiltres] = useState<Record<string, string>>({});

  const { files, definicions } = useMemo(() => {
    const perSollicitud = new Map<string, Record<string, string>>();
    for (const c of columnes) {
      for (const f of c.files) {
        const fila = perSollicitud.get(f.sollicitud_id) ?? {
          telefon: f.participant.telefon ?? "",
          nom: f.participant.nom,
          cognoms: [f.participant.cognom1, f.participant.cognom2].filter(Boolean).join(" "),
        };
        fila[c.activitat_id] = f.valor;
        perSollicitud.set(f.sollicitud_id, fila);
      }
    }
    const definicions = [
      { clau: "telefon", text: "Telèfon", activitat: false }, { clau: "nom", text: "Nom", activitat: false },
      { clau: "cognoms", text: "Cognoms", activitat: false },
      ...columnes.map((c) => ({ clau: c.activitat_id, text: c.activitat, activitat: true })),
    ];
    return { files: [...perSollicitud.entries()].map(([id, valors]) => ({ id, valors })), definicions };
  }, [columnes]);

  const visibles = files
    .filter((f) => Object.entries(filtres).every(([col, v]) => !v || (f.valors[col] ?? "") === (v === "(buit)" ? "" : v)))
    .sort((a, b) => {
      const signe = ordre.sentit === "asc" ? 1 : -1;
      const r = comparaText(a.valors[ordre.columna] ?? "", b.valors[ordre.columna] ?? "");
      // A igualtat, sempre per cognoms i nom.
      return r !== 0 ? r * signe : comparaText(`${a.valors.cognoms} ${a.valors.nom}`, `${b.valors.cognoms} ${b.valors.nom}`);
    });
  const filtresActius = Object.values(filtres).filter(Boolean).length;

  return (
    <div className="graella-assignacions">
      <p className="text-secundari" role="status">
        {visibles.length} de {files.length} persones{filtresActius ? ` (amb ${filtresActius} ${filtresActius === 1 ? "filtre" : "filtres"})` : ""}.{" "}
        {filtresActius > 0 && <button type="button" className="boto-enllac" onClick={() => setFiltres({})}>Treu els filtres</button>}
      </p>
      <div className="taula-contenidor taula-contenidor--alta" tabIndex={0} role="region" aria-label={titol}>
        <table className="taula taula--densa">
          <thead>
            <tr>
              {definicions.map((d) => {
                const valors = [...new Set(files.map((f) => f.valors[d.clau] ?? ""))].sort(comparaText);
                const ordenada = ordre.columna === d.clau;
                return (
                  <th key={d.clau} scope="col" aria-sort={ordenada ? (ordre.sentit === "asc" ? "ascending" : "descending") : undefined}>
                    <details className="filtre-columna">
                      <summary>
                        {d.text}
                        {ordenada && <span aria-hidden="true"> {ordre.sentit === "asc" ? "▲" : "▼"}</span>}
                        {filtres[d.clau] && <span className="filtre-columna__actiu"> · {filtres[d.clau]}</span>}
                      </summary>
                      <div className="filtre-columna__panell">
                        <button type="button" className="boto boto--secundari boto--petit" onClick={() => setOrdre({ columna: d.clau, sentit: "asc" })}>Ordena A → Z</button>
                        <button type="button" className="boto boto--secundari boto--petit" onClick={() => setOrdre({ columna: d.clau, sentit: "desc" })}>Ordena Z → A</button>
                        <label htmlFor={`filtre-${d.clau}`}>Mostra només</label>
                        <select id={`filtre-${d.clau}`} value={filtres[d.clau] ?? ""} onChange={(e) => setFiltres((f) => ({ ...f, [d.clau]: e.target.value }))}>
                          <option value="">Tots</option>
                          {valors.map((v) => <option key={v || "(buit)"} value={v || "(buit)"}>{v || "(buit)"}</option>)}
                        </select>
                      </div>
                    </details>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id}>
                {definicions.map((d) => {
                  const v = f.valors[d.clau] ?? "";
                  const classe = d.activitat ? (v === "Admesa" ? "cel-admesa" : v.startsWith("Espera") ? "cel-espera" : undefined) : undefined;
                  return <td key={d.clau} className={classe}>{v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
