import { useState } from "react";
import type { AccesAlta, CodiAcces } from "../types/gestio";
import { formataDataHora } from "../utils/format";

/** Text per fer arribar a la persona (per correu, missatge o en mà). */
export function instruccionsAcces(nom: string, email: string, codi: CodiAcces, casal?: string) {
  return [
    `Hola, ${nom}!`,
    `Ja tens accés al panell de gestió${casal ? ` del ${casal}` : ""}.`,
    `1. Entra a ${window.location.origin}/gestio/entrar?primer`,
    "2. A «Primer accés o contrasenya oblidada»,",
    `   escriu el teu correu (${email}) i aquest codi: ${codi.codi}`,
    "3. Crea la teva contrasenya. A partir d'aleshores entraràs amb el correu i la contrasenya.",
    `El codi només serveix una vegada i caduca el ${formataDataHora(codi.caduca_el)}.`,
  ].join("\n");
}

/**
 * Codi de primer accés acabat de generar. Només es mostra ara: l'aplicació no el desa
 * (només en guarda el resum), de manera que si es perd cal generar-ne un altre.
 */
export function CodiAccesLliurat({ nom, email, codi, casal }: { nom: string; email: string; codi: CodiAcces; casal?: string }) {
  const [copiat, setCopiat] = useState(false);
  const text = instruccionsAcces(nom, email, codi, casal);
  async function copia() {
    try {
      await navigator.clipboard.writeText(text);
      setCopiat(true);
    } catch {
      setCopiat(false);
    }
  }
  return (
    <div className="avis avis--info codi-acces" role="status">
      <p><strong>Codi de primer accés per a {nom}</strong> ({email})</p>
      <p className="codi-acces__codi">{codi.codi}</p>
      <p>Feu-li arribar aquest codi: amb el seu correu i el codi crearà la seva contrasenya. Només serveix una vegada i caduca el {formataDataHora(codi.caduca_el)}.</p>
      <p className="text-secundari">El codi no es torna a mostrar. Si es perd, en podeu generar un altre.</p>
      <div className="botonera">
        <button type="button" className="boto boto--secundari boto--petit" onClick={() => void copia()}>{copiat ? "Instruccions copiades" : "Copia les instruccions"}</button>
      </div>
    </div>
  );
}

/** Missatge després d'una alta, segons si cal codi o no. */
export function ResultatAlta({ nom, email, acces, casal }: { nom: string; email: string; acces: AccesAlta; casal?: string }) {
  if (acces.estat === "codi") return <CodiAccesLliurat nom={nom} email={email} codi={acces.codi} casal={casal} />;
  if (acces.estat === "te_contrasenya") return <p className="avis avis--exit" role="status">{nom} ja té contrasenya: pot entrar amb el seu correu.</p>;
  return (
    <p className="avis avis--alerta" role="status">
      {nom} també té accés a altres casals i encara no té contrasenya: el codi de primer accés li ha de donar la superadministració.
    </p>
  );
}
