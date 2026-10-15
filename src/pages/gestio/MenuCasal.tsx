import { useRef } from "react";
import { NavLink } from "react-router";
import { MENU, type DestiMenu, type ElementMenu } from "./menu";

function enllac(casalId: string, d: DestiMenu): string {
  if ("seccio" in d) return `/gestio/${casalId}/anar/${d.seccio}`;
  if ("properament" in d) return `/gestio/${casalId}/properament/${d.properament}`;
  return d.ruta.startsWith("#") ? `/gestio/${casalId}${d.ruta}` : `/gestio/${casalId}/${d.ruta}`;
}

/** Menú lateral del panell d'un casal. En pantalles estretes es plega. */
const AMPLE = "(min-width: 60rem)";

export function MenuCasal({ casalId, permisos }: { casalId: string; permisos: string[] }) {
  // En pantalla ampla el menú és sempre visible; al mòbil comença plegat i es plega en triar.
  const plegable = useRef<HTMLDetailsElement>(null);
  const obertInicial = typeof window !== "undefined" && window.matchMedia?.(AMPLE).matches;
  const enTriar = () => { if (plegable.current && !window.matchMedia(AMPLE).matches) plegable.current.open = false; };
  const visibles = (els: ElementMenu[]): ElementMenu[] =>
    els.filter((e) => !e.permis || permisos.includes(e.permis)).map((e) => ({ ...e, fills: e.fills && visibles(e.fills) }));

  const llista = (els: ElementMenu[], nivell: number) => (
    <ul className={`menu-casal__llista menu-casal__llista--${nivell}`}>
      {els.map((e) => (
        <li key={e.text}>
          {e.desti ? (
            <NavLink to={enllac(casalId, e.desti)} end className="menu-casal__enllac" onClick={enTriar}>{e.text}</NavLink>
          ) : <span className="menu-casal__grup">{e.text}</span>}
          {e.fills && e.fills.length > 0 && llista(e.fills, nivell + 1)}
        </li>
      ))}
    </ul>
  );

  return (
    <nav className="menu-casal" aria-label="Menú del casal">
      <details ref={plegable} open={obertInicial} className="menu-casal__plegable">
        <summary>Menú</summary>
        {llista(visibles(MENU), 1)}
      </details>
    </nav>
  );
}
