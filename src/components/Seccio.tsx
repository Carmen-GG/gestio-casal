import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { ancoraDe } from "./ancora";

/**
 * Secció plegable del panell. Quan està plegada només ocupa la capçalera.
 * El botó indica l'estat amb aria-expanded i és accessible amb teclat.
 * Té una àncora derivada del títol (p. ex. #sollicituds-rebudes): si l'adreça la porta,
 * la secció s'obre i s'hi desplaça la pàgina (és com hi porta el menú del panell).
 */
export function Seccio({ titol, children, obertaInicial = true, accions }: {
  titol: string; children: ReactNode; obertaInicial?: boolean; accions?: ReactNode;
}) {
  const ancora = ancoraDe(titol);
  const { hash } = useLocation();
  const [oberta, setOberta] = useState(obertaInicial || hash === `#${ancora}`);
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash !== `#${ancora}`) return;
    setOberta(true);
    ref.current?.scrollIntoView({ block: "start" });
    ref.current?.querySelector<HTMLButtonElement>(".seccio__commutador")?.focus({ preventScroll: true });
  }, [hash, ancora]);
  return (
    <section className="seccio" aria-labelledby={`${id}-titol`} id={ancora} ref={ref}>
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
