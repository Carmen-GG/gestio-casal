import { useEffect, useState } from "react";
import { serveiCartells } from "../../services/cartells";

/** Mostra una imatge desada al mòdul (el fitxer es demana amb la sessió, no és públic). */
export function ImatgeFitxer({ casalId, fitxerId, alt, className }: { casalId: string; fitxerId: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const control = new AbortController();
    let creada: string | null = null;
    setUrl(null);
    setError(false);
    serveiCartells.fitxer(casalId, fitxerId, control.signal)
      .then((b) => { creada = URL.createObjectURL(new Blob([b])); setUrl(creada); })
      .catch(() => { if (!control.signal.aborted) setError(true); });
    return () => { control.abort(); if (creada) URL.revokeObjectURL(creada); };
  }, [casalId, fitxerId]);
  if (error) return <p className="imatge-fitxer imatge-fitxer--buida">No s'ha pogut carregar la imatge.</p>;
  if (!url) return <div className="imatge-fitxer imatge-fitxer--buida" aria-hidden="true" />;
  return <img src={url} alt={alt} className={className ?? "imatge-fitxer"} />;
}
