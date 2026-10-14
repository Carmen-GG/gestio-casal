import { Link } from "react-router";

export function NoTrobada() {
  return (
    <section aria-labelledby="titol-no-trobada">
      <h1 id="titol-no-trobada">Pàgina no trobada</h1>
      <p>La pàgina que busqueu no existeix o ha canviat d'adreça.</p>
      <p>
        <Link to="/">Torna a l'inici</Link>
      </p>
    </section>
  );
}
