import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CampText } from "../../components/Formulari";
import { MissatgeError } from "../../components/EstatsConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiAuth } from "../../services/gestio";

/**
 * Accés al panell amb correu i contrasenya o, la primera vegada, amb un codi d'accés d'un sol ús.
 * El testimoni arriba al fragment de l'URL (#testimoni=...), que el navegador no envia
 * al servidor ni queda als registres; s'esborra de l'adreça immediatament.
 */
export function Entrar() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [testimoni, setTestimoni] = useState("");
  const [email, setEmail] = useState("");
  const [contrasenya, setContrasenya] = useState("");
  const [primer, setPrimer] = useState({ email: "", codi: "", contrasenya: "", repeticio: "" });
  const [errorPrimer, setErrorPrimer] = useState("");
  const [enviant, setEnviant] = useState(false);
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const automatic = useRef(false);
  const desti = params.get("tornar")?.startsWith("/gestio") ? params.get("tornar")! : "/gestio";

  async function entrar(valor: string | { email: string; contrasenya: string }) {
    setEnviant(true);
    setError(null);
    try {
      await (typeof valor === "string" ? serveiAuth.entrar(valor) : serveiAuth.entrarAmbContrasenya(valor.email, valor.contrasenya));
      navegar(desti, { replace: true });
    } catch (e) {
      setError(e instanceof ErrorClientApi ? e : new ErrorClientApi(0, "error", "No s'ha pogut iniciar la sessió."));
    } finally {
      setEnviant(false);
    }
  }

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const t = hash.get("testimoni");
    if (t && !automatic.current) {
      automatic.current = true;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      void entrar(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviaPrimer(e: FormEvent) {
    e.preventDefault();
    setErrorPrimer("");
    if (primer.contrasenya.length < 12) { setErrorPrimer("La contrasenya ha de tenir almenys 12 caràcters."); return; }
    if (primer.contrasenya !== primer.repeticio) { setErrorPrimer("Les dues contrasenyes no coincideixen."); return; }
    setEnviant(true);
    setError(null);
    try {
      await serveiAuth.primerAcces({ email: primer.email.trim(), codi: primer.codi.trim(), contrasenya: primer.contrasenya });
      navegar(desti, { replace: true });
    } catch (err) {
      setError(err instanceof ErrorClientApi ? err : new ErrorClientApi(0, "error", "No s'ha pogut completar el primer accés."));
    } finally {
      setEnviant(false);
    }
  }

  const envia = (e: FormEvent) => {
    e.preventDefault();
    if (testimoni.trim()) void entrar(testimoni.trim());
  };
  const enviaContrasenya = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim() && contrasenya) void entrar({ email: email.trim(), contrasenya });
  };

  return (
    <section aria-labelledby="titol-entrar" className="estret">
      <h1 id="titol-entrar">Accés al panell de gestió</h1>
      {error && <MissatgeError error={error} />}
      <form onSubmit={enviaContrasenya} noValidate className="formulari">
        <CampText etiqueta="Correu electrònic" type="email" obligatori autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <CampText etiqueta="Contrasenya" type="password" obligatori autoComplete="current-password" value={contrasenya}
          onChange={(e) => setContrasenya(e.target.value)} />
        <button type="submit" className="boto" disabled={enviant || !email.trim() || !contrasenya}>
          {enviant ? "Comprovant…" : "Entra"}
        </button>
      </form>
      <details className="acces-codi" open={params.has("primer")}>
        <summary>Primer accés o contrasenya oblidada</summary>
        <p>
          Escriviu el vostre correu i el codi que us ha fet arribar la persona responsable del casal (o la superadministració),
          i creeu la vostra contrasenya. El codi només serveix una vegada i caduca.
        </p>
        <form onSubmit={(e) => void enviaPrimer(e)} noValidate className="formulari">
          {errorPrimer && <p className="avis avis--error" role="alert">{errorPrimer}</p>}
          <CampText etiqueta="Correu electrònic" type="email" obligatori autoComplete="username" value={primer.email}
            onChange={(e) => setPrimer({ ...primer, email: e.target.value })} />
          <CampText etiqueta="Codi de primer accés" obligatori autoComplete="one-time-code" value={primer.codi}
            onChange={(e) => setPrimer({ ...primer, codi: e.target.value })} ajuda="Per exemple: ABCD-EFGH-JKLM" />
          <CampText etiqueta="Nova contrasenya" type="password" obligatori autoComplete="new-password" value={primer.contrasenya}
            onChange={(e) => setPrimer({ ...primer, contrasenya: e.target.value })} ajuda="Almenys 12 caràcters. Una frase que recordeu és una bona contrasenya." />
          <CampText etiqueta="Repetiu la contrasenya" type="password" obligatori autoComplete="new-password" value={primer.repeticio}
            onChange={(e) => setPrimer({ ...primer, repeticio: e.target.value })} />
          <button type="submit" className="boto" disabled={enviant || !primer.email.trim() || !primer.codi.trim() || !primer.contrasenya}>
            {enviant ? "Comprovant…" : "Crea la contrasenya i entra"}
          </button>
        </form>
      </details>
      <details className="acces-codi">
        <summary>Teniu un codi d'accés de proves?</summary>
        <p>Només per als entorns de proves: el codi d'accés provisional d'un sol ús.</p>
        <form onSubmit={envia} noValidate className="formulari">
          <CampText etiqueta="Codi d'accés" obligatori autoComplete="off" value={testimoni}
            onChange={(e) => setTestimoni(e.target.value)} />
          <button type="submit" className="boto boto--secundari" disabled={enviant || !testimoni.trim()}>
            Entra amb el codi
          </button>
        </form>
      </details>
    </section>
  );
}
