import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CampText } from "../../components/Formulari";
import { MissatgeError } from "../../components/EstatsConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiAuth } from "../../services/gestio";

/**
 * Accés al panell amb un enllaç d'un sol ús (entorns de desenvolupament i proves).
 * El testimoni arriba al fragment de l'URL (#testimoni=...), que el navegador no envia
 * al servidor ni queda als registres; s'esborra de l'adreça immediatament.
 */
export function Entrar() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [testimoni, setTestimoni] = useState("");
  const [enviant, setEnviant] = useState(false);
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const automatic = useRef(false);
  const desti = params.get("tornar")?.startsWith("/gestio") ? params.get("tornar")! : "/gestio";

  async function entrar(valor: string) {
    setEnviant(true);
    setError(null);
    try {
      await serveiAuth.entrar(valor);
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

  return (
    <section aria-labelledby="titol-entrar" className="estret">
      <h1 id="titol-entrar">Accés al panell de gestió</h1>
      <p>
        Obriu l'enllaç d'accés que us ha facilitat la persona administradora, o enganxeu-ne aquí el codi.
        Cada enllaç només es pot utilitzar una vegada i caduca.
      </p>
      {error && <MissatgeError error={error} />}
      <form onSubmit={envia} noValidate>
        <CampText etiqueta="Codi d'accés" obligatori autoComplete="off" value={testimoni}
          onChange={(e) => setTestimoni(e.target.value)} />
        <button type="submit" className="boto" disabled={enviant || !testimoni.trim()}>
          {enviant ? "Comprovant…" : "Entra"}
        </button>
      </form>
    </section>
  );
}
