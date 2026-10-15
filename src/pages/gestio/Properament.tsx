import { useParams } from "react-router";
import { PROPERAMENT } from "./menu";

/** Funcions del menú que encara no estan disponibles: només s'explica què faran. */
export function Properament() {
  const { clau = "" } = useParams();
  const f = PROPERAMENT[clau];
  return (
    <section aria-labelledby="titol-properament" className="estret">
      <h1 id="titol-properament">{f?.titol ?? "Funció no disponible"}</h1>
      <p className="avis avis--alerta">Aquesta funció encara no està disponible. És al pla de treball.</p>
      {f && <p>{f.descripcio}</p>}
    </section>
  );
}
