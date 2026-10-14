import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { useConsulta } from "../../hooks/useConsulta";
import { serveiGestio } from "../../services/gestio";
import { formataDataHora } from "../../utils/format";
import { ETIQUETES_ESTAT_CICLE, esEstatCicle } from "../../../shared/domain/cicles";

const ESTATS_ACTIVITAT: Record<string, string> = { esborrany: "Esborrany", activa: "Activa", inactiva: "Inactiva", arxivada: "Arxivada" };
const ESTATS_SOLLICITUD: Record<string, string> = { rebuda: "Rebuda", validada: "Validada", pendent_revisio: "Pendent de revisió", anullada: "Anul·lada" };

const ACCIONS: Record<string, string> = {
  creacio: "Creació", modificacio: "Modificació", canvi_estat: "Canvi d'estat", arxivat: "Arxivat",
  duplicacio: "Duplicació", importacio: "Importació",
};

const valor = (v: unknown, camp?: string) => {
  if (v === null || v === undefined || v === "") return "—";
  if (camp === "estat" && typeof v === "string") return esEstatCicle(v) ? ETIQUETES_ESTAT_CICLE[v] : (ESTATS_ACTIVITAT[v] ?? ESTATS_SOLLICITUD[v] ?? v);
  if (Array.isArray(v)) return v.join("; ") || "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
};

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
                const canvi = c as { abans: unknown; despres: unknown; modificat?: boolean };
                // Dades personals: l'historial només desa que el camp ha canviat, no el valor.
                if (canvi.modificat) return <li key={camp}>{camp}: modificat</li>;
                return <li key={camp}>{camp}: {valor(canvi.abans, camp)} → {valor(canvi.despres, camp)}</li>;
              })}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
