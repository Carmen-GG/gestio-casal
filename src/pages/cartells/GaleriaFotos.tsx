import { useMemo, useState } from "react";
import type { FotoCartells } from "../../types/gestio";
import { ImatgeFitxer } from "./ImatgeFitxer";

const PER_PAGINA = 48;
const SENSE_CARPETA = "(sense carpeta)";

/**
 * Galeria de la fototeca: les carpetes a l'esquerra (o a dalt al mòbil) i les miniatures de la
 * carpeta triada. Amb `onTria` serveix per escollir una foto; amb `onRetira`, per gestionar-les.
 */
export function GaleriaFotos({ casalId, fotos, onTria, onRetira, ocupat }: {
  casalId: string;
  fotos: FotoCartells[];
  onTria?: (f: FotoCartells) => void;
  onRetira?: (f: FotoCartells) => void;
  ocupat?: boolean;
}) {
  const carpetes = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fotos) m.set(f.carpeta || SENSE_CARPETA, (m.get(f.carpeta || SENSE_CARPETA) ?? 0) + 1);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "ca"));
  }, [fotos]);
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [cerca, setCerca] = useState("");
  const [limit, setLimit] = useState(PER_PAGINA);
  const actual = carpeta ?? carpetes[0]?.[0] ?? null;
  const text = cerca.trim().toLowerCase();
  const visibles = fotos.filter((f) => text
    ? `${f.carpeta}/${f.nom}`.toLowerCase().includes(text)
    : (f.carpeta || SENSE_CARPETA) === actual);

  if (fotos.length === 0) return <p>Encara no hi ha cap foto a la fototeca.</p>;
  return (
    <div className="galeria-fotos">
      <div className="galeria-fotos__carpetes">
        <label className="camp">
          <span>Cerca per nom o carpeta</span>
          <input type="search" value={cerca} onChange={(e) => { setCerca(e.target.value); setLimit(PER_PAGINA); }} />
        </label>
        {!text && (
          <ul className="llista-neta" aria-label="Carpetes">
            {carpetes.map(([nom, n]) => (
              <li key={nom}>
                <button type="button" className={`boto-enllac${nom === actual ? " boto-enllac--actiu" : ""}`} aria-current={nom === actual}
                  onClick={() => { setCarpeta(nom); setLimit(PER_PAGINA); }}>
                  {nom} <span className="text-secundari">({n})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        {visibles.length === 0 && <p>No hi ha cap foto que coincideixi.</p>}
        <ul className="galeria-fotos__graella">
          {visibles.slice(0, limit).map((f) => (
            <li key={f.id}>
              <figure>
                <ImatgeFitxer casalId={casalId} fitxerId={f.miniatura_id} alt={f.nom} className="galeria-fotos__miniatura" />
                <figcaption title={`${f.carpeta ? `${f.carpeta}/` : ""}${f.nom}`}>
                  {f.nom}{f.casal_id === null && <span className="etiqueta">Comuna</span>}
                </figcaption>
              </figure>
              <div className="accions-fila">
                {onTria && <button type="button" className="boto boto--petit" disabled={ocupat} onClick={() => onTria(f)}>Tria-la</button>}
                {onRetira && f.casal_id !== null && <button type="button" className="boto boto--secundari boto--petit" disabled={ocupat} onClick={() => onRetira(f)}>Retira</button>}
              </div>
            </li>
          ))}
        </ul>
        {visibles.length > limit && (
          <button type="button" className="boto boto--secundari" onClick={() => setLimit((l) => l + PER_PAGINA)}>
            Mostra'n més ({visibles.length - limit})
          </button>
        )}
      </div>
    </div>
  );
}
