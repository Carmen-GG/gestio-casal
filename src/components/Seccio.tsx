import { useId, useState, type ReactNode } from "react";

/**
 * Secció plegable del panell. Quan està plegada només ocupa la capçalera.
 * El botó indica l'estat amb aria-expanded i és accessible amb teclat.
 */
export function Seccio({ titol, children, obertaInicial = true, accions }: {
  titol: string; children: ReactNode; obertaInicial?: boolean; accions?: ReactNode;
}) {
  const [oberta, setOberta] = useState(obertaInicial);
  const id = useId();
  return (
    <section className="seccio" aria-labelledby={`${id}-titol`}>
      <div className="seccio__capcalera">
        <h2 id={`${id}-titol`} className="seccio__titol">
          <button type="button" className="seccio__commutador" aria-expanded={oberta} aria-controls={`${id}-cos`}
            onClick={() => setOberta((o) => !o)}>
            <span className="seccio__icona" aria-hidden="true">{oberta ? "▾" : "▸"}</span>
            {titol}
          </button>
        </h2>
        {oberta && accions && <div className="seccio__accions">{accions}</div>}
      </div>
      <div id={`${id}-cos`} className="seccio__cos" hidden={!oberta}>
        {children}
      </div>
    </section>
  );
}
