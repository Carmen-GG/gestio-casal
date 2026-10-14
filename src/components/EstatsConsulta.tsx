import type { ErrorClientApi } from "../services/api";

export function Carregant({ text = "Carregant…" }: { text?: string }) {
  return (
    <p className="carregant" role="status" aria-live="polite">
      <span className="carregant__indicador" aria-hidden="true" />
      {text}
    </p>
  );
}

export function MissatgeError({ error, onReintentar }: { error: ErrorClientApi; onReintentar?: () => void }) {
  return (
    <div className="avis avis--error" role="alert">
      <p>{error.missatgeUsuari}</p>
      {error.idPeticio && <p className="avis__detall">Referència de l'error: {error.idPeticio}</p>}
      {onReintentar && error.status !== 404 && (
        <button type="button" className="boto boto--secundari" onClick={onReintentar}>
          Torna-ho a provar
        </button>
      )}
    </div>
  );
}
