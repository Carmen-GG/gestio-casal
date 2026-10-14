import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Comuns = { etiqueta: string; error?: string; ajuda?: string; obligatori?: boolean };

function Envolcall({ id, etiqueta, error, ajuda, obligatori, children }: Comuns & { id: string; children: ReactNode }) {
  return (
    <div className={`camp ${error ? "camp--error" : ""}`}>
      <label htmlFor={id}>
        {etiqueta} {obligatori ? <span className="camp__obligatori">(obligatori)</span> : <span className="camp__opcional">(opcional)</span>}
      </label>
      {children}
      {ajuda && <p className="camp__ajuda" id={`${id}-ajuda`}>{ajuda}</p>}
      {error && <p className="camp__missatge" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}

const descrit = (id: string, error?: string, ajuda?: string) =>
  [error ? `${id}-error` : "", ajuda ? `${id}-ajuda` : ""].filter(Boolean).join(" ") || undefined;

export function CampText(props: Comuns & InputHTMLAttributes<HTMLInputElement>) {
  const { etiqueta, error, ajuda, obligatori, ...input } = props;
  const id = useId();
  return (
    <Envolcall id={id} etiqueta={etiqueta} error={error} ajuda={ajuda} obligatori={obligatori}>
      <input id={id} required={obligatori} aria-invalid={!!error} aria-describedby={descrit(id, error, ajuda)} {...input} />
    </Envolcall>
  );
}

export function CampAreaText(props: Comuns & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { etiqueta, error, ajuda, obligatori, ...area } = props;
  const id = useId();
  return (
    <Envolcall id={id} etiqueta={etiqueta} error={error} ajuda={ajuda} obligatori={obligatori}>
      <textarea id={id} required={obligatori} aria-invalid={!!error} aria-describedby={descrit(id, error, ajuda)} {...area} />
    </Envolcall>
  );
}

export function CampSeleccio(props: Comuns & SelectHTMLAttributes<HTMLSelectElement> & { opcions: { valor: string; text: string }[] }) {
  const { etiqueta, error, ajuda, obligatori, opcions, ...select } = props;
  const id = useId();
  return (
    <Envolcall id={id} etiqueta={etiqueta} error={error} ajuda={ajuda} obligatori={obligatori}>
      <select id={id} required={obligatori} aria-invalid={!!error} aria-describedby={descrit(id, error, ajuda)} {...select}>
        {opcions.map((o) => <option key={o.valor} value={o.valor}>{o.text}</option>)}
      </select>
    </Envolcall>
  );
}

export function AvisExit({ children }: { children: ReactNode }) {
  return <p className="avis avis--exit" role="status">{children}</p>;
}
