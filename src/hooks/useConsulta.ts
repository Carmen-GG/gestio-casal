import { useCallback, useEffect, useState } from "react";
import { ErrorClientApi } from "../services/api";

export type EstatConsulta<T> =
  | { tipus: "carregant" }
  | { tipus: "error"; error: ErrorClientApi }
  | { tipus: "dades"; dades: T };

/**
 * Gestió uniforme dels estats de càrrega i error d'una consulta a l'API.
 * Cancel·la la petició si el component es desmunta o canvien les dependències.
 */
export function useConsulta<T>(
  consulta: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[],
): EstatConsulta<T> & { reintentar: () => void } {
  const [estat, setEstat] = useState<EstatConsulta<T>>({ tipus: "carregant" });
  const [intent, setIntent] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    setEstat({ tipus: "carregant" });
    consulta(control.signal)
      .then((dades) => {
        if (!control.signal.aborted) setEstat({ tipus: "dades", dades });
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        const error =
          e instanceof ErrorClientApi
            ? e
            : new ErrorClientApi(0, "error_desconegut", "S'ha produït un error inesperat. Torneu-ho a provar més tard.");
        setEstat({ tipus: "error", error });
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, intent]);

  const reintentar = useCallback(() => setIntent((n) => n + 1), []);
  return { ...estat, reintentar };
}
