import { analitzaTelefon, enllacWhatsapp } from "../../shared/domain/whatsapp";

/**
 * Botó que obre WhatsApp amb el missatge ja escrit, o l'avís que correspon si el
 * telèfon és fix, no n'hi ha o no és vàlid (aleshores cal trucar o contactar d'una altra manera).
 */
export function BotoWhatsapp({ telefon, text, persona, petit }: { telefon: string | null; text: string; persona: string; petit?: boolean }) {
  const t = analitzaTelefon(telefon);
  if (t.internacional) {
    return (
      <a className={`boto boto--whatsapp${petit ? " boto--petit" : ""}`} href={enllacWhatsapp(t.internacional, text)} target="_blank" rel="noopener noreferrer">
        Envia per WhatsApp<span className="visualment-amagat"> a {persona} (s'obre en una finestra nova)</span>
      </a>
    );
  }
  const avis = t.tipus === "fix" ? `El telèfon ${telefon} és fix: no té WhatsApp. Cal trucar.`
    : t.tipus === "sense" ? "No té telèfon. Cal contactar d'una altra manera."
    : `El telèfon «${telefon}» no sembla vàlid. Reviseu-lo a la sol·licitud.`;
  return <p className="avis avis--alerta avis--compacte" role="status">{avis}</p>;
}
