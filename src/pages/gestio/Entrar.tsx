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
      <details className="acces-codi">
        <summary>Encara no teniu contrasenya? Entreu amb un codi d'accés</summary>
        <p>
          Escriviu el codi d'accés que us ha facilitat la persona administradora. Cada codi només serveix una vegada
          i caduca. Un cop dins, fixeu la vostra contrasenya a «El meu compte».
        </p>
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
