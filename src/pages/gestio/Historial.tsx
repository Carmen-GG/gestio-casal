import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import { formataDataHora } from "../../utils/format";

const ACCIONS: Record<string, string> = {
  creacio: "Creació", modificacio: "Modificació", canvi_estat: "Canvi d'estat", arxivat: "Arxivat",
  duplicacio: "Duplicació", importacio: "Importació",
};

const valor = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function Historial({ casalId, entitat, id, versio }: { casalId: string; entitat: string; id: string; versio: number }) {
  const consulta = useConsulta((s) => serveiGestio.historial(casalId, entitat, id, s), [casalId, entitat, id, versio]);
  if (consulta.tipus === "carregant") return <Carregant />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  const entrades = [...consulta.dades.historial].reverse();
  if (entrades.length === 0) return <p>No hi ha canvis registrats.</p>;
  return (
    <ol className="historial">
      {entrades.map((e) => (
        <li key={e.id}>
          <strong>{ACCIONS[e.accio] ?? e.accio}</strong> · {formataDataHora(e.creat_el)}
          {e.motiu && <div>Motiu: {e.motiu}</div>}
          {(e.accio === "modificacio" || e.accio === "canvi_estat" || e.accio === "arxivat") && (
            <ul>
              {Object.entries(e.canvis).map(([camp, c]) => {
                const canvi = c as { abans: unknown; despres: unknown };
                return <li key={camp}>{camp}: {valor(canvi.abans)} → {valor(canvi.despres)}</li>;
              })}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
