import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Diàleg de confirmació per a operacions sensibles. Fa servir <dialog> natiu
 * (gestió del focus i tecla Escapada). Pot exigir un motiu escrit.
 */
export function DialegConfirmacio({ obert, titol, children, textConfirmar, demanaMotiu, onConfirmar, onCancelar, enCurs }: {
  obert: boolean; titol: string; children: ReactNode; textConfirmar: string; demanaMotiu?: boolean;
  onConfirmar: (motiu: string) => void; onCancelar: () => void; enCurs?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [motiu, setMotiu] = useState("");
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (obert && !d.open) { setMotiu(""); d.showModal(); }
    if (!obert && d.open) d.close();
  }, [obert]);

  return (
    <dialog ref={ref} className="dialeg" aria-labelledby={`${id}-titol`} onCancel={(e) => { e.preventDefault(); onCancelar(); }}>
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (!demanaMotiu || motiu.trim()) onConfirmar(motiu.trim()); }}>
        <h2 id={`${id}-titol`}>{titol}</h2>
        <div>{children}</div>
        {demanaMotiu && (
          <div className="camp">
            <label htmlFor={`${id}-motiu`}>Motiu <span className="camp__obligatori">(obligatori)</span></label>
            <textarea id={`${id}-motiu`} required value={motiu} onChange={(e) => setMotiu(e.target.value)} maxLength={500} />
          </div>
        )}
        <div className="dialeg__botons">
          <button type="button" className="boto boto--secundari" onClick={onCancelar} disabled={enCurs}>Cancel·la</button>
          <button type="submit" className="boto" disabled={enCurs || (demanaMotiu && !motiu.trim())}>
            {enCurs ? "Desant…" : textConfirmar}
          </button>
        </div>
      </form>
    </dialog>
  );
}
