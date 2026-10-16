import { useState } from "react";
import { ErrorClientApi } from "../services/api";
import { serveiGestio } from "../services/gestio";
import type { EstatMissatgeWhatsapp, MissatgeWhatsappPlaca, ProgresEnviament } from "../types/gestio";
import { MissatgeError } from "./EstatsConsulta";

export const ETIQUETES_ESTAT_WHATSAPP: Record<EstatMissatgeWhatsapp, string> = {
  pendent: "Pendent d'enviar",
  enviat: "Enviat",
  entregat: "Entregat",
  llegit: "Llegit",
  fallit: "No s'ha pogut entregar",
  no_enviable: "No enviat",
};

/** Text curt de l'estat d'un missatge de WhatsApp Business per a una plaça. */
export function textMissatgeWhatsapp(m: MissatgeWhatsappPlaca): string {
  const resposta = m.resposta === "si" ? " · Ha respost: Sí" : m.resposta === "no" ? " · Ha respost: No" : m.resposta === "text" ? " · Ha respost (vegeu WhatsApp)" : "";
  return `WhatsApp Business: ${ETIQUETES_ESTAT_WHATSAPP[m.estat]}${m.estat === "fallit" && m.error_text ? ` (${m.error_text})` : ""}${resposta}`;
}

export interface EstatEnviament { id: string | null; total: number; progres: ProgresEnviament | null; enCurs: boolean }

/**
 * Envia un lot de WhatsApp Business: crea l'enviament i demana al servidor els lots
 * successius fins que no en queden. Si Meta atura l'enviament, els pendents es poden reprendre.
 */
export function useEnviamentWhatsapp(casalId: string) {
  const [estat, setEstat] = useState<EstatEnviament | null>(null);
  const [error, setError] = useState<ErrorClientApi | null>(null);

  async function bucle(id: string, total: number) {
    let progres: ProgresEnviament;
    do {
      progres = await serveiGestio.continuaEnviamentWhatsapp(casalId, id);
      setEstat({ id, total, progres, enCurs: progres.queden > 0 && !progres.aturat });
    } while (progres.queden > 0 && !progres.aturat);
    return progres;
  }

  async function executa(pas: () => Promise<ProgresEnviament>) {
    setError(null);
    try {
      return await pas();
    } catch (e) {
      setEstat((x) => (x ? { ...x, enCurs: false } : null));
      if (e instanceof ErrorClientApi) { setError(e); return null; }
      throw e;
    }
  }

  const envia = (crear: () => Promise<{ enviament_id: string; total: number }>) => executa(async () => {
    setEstat({ id: null, total: 0, progres: null, enCurs: true });
    const { enviament_id, total } = await crear();
    setEstat({ id: enviament_id, total, progres: null, enCurs: true });
    return bucle(enviament_id, total);
  });

  /** Reprèn un enviament aturat: només s'envien els missatges que han quedat pendents. */
  const repren = () => (estat?.id ? executa(() => { setEstat({ ...estat, enCurs: true }); return bucle(estat.id!, estat.total); }) : Promise.resolve(null));

  return { estat, error, envia, repren, neteja: () => { setEstat(null); setError(null); } };
}

/** Progrés i resultat d'un enviament. */
export function ProgresWhatsapp({ estat, error, onRepren }: { estat: EstatEnviament | null; error: ErrorClientApi | null; onRepren?: () => void }) {
  if (error) return <MissatgeError error={error} />;
  if (!estat) return null;
  const r = estat.progres?.recompte ?? {};
  const fets = estat.total - (estat.progres?.queden ?? estat.total);
  return (
    <div className={`avis ${estat.progres?.aturat ? "avis--error" : estat.enCurs ? "avis--info" : "avis--exit"}`} role="status" aria-live="polite">
      {estat.enCurs ? (
        <p>Enviant per WhatsApp Business… {fets} de {estat.total}. No tanqueu aquesta pàgina.</p>
      ) : (
        <p>
          <strong>Enviament acabat.</strong> Enviats: {(r.enviat ?? 0) + (r.entregat ?? 0) + (r.llegit ?? 0)}
          {r.no_enviable ? ` · No enviats (telèfon fix, sense telèfon o no vàlid): ${r.no_enviable}` : ""}
          {r.fallit ? ` · No s'han pogut entregar: ${r.fallit}` : ""}
          {r.pendent ? ` · Queden pendents: ${r.pendent}` : ""}
        </p>
      )}
      {estat.progres?.aturat && (
        <>
          <p>Meta ha aturat l'enviament: {estat.progres.aturat} Quan estigui resolt, repreneu-lo: només s'enviaran els pendents.</p>
          {onRepren && <button type="button" className="boto boto--secundari boto--petit" onClick={onRepren}>Reprèn l'enviament</button>}
        </>
      )}
    </div>
  );
}
