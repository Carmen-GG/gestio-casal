import { useId, useState } from "react";
import { assignaRols, avisosPlantilla, metadadesDelNom, nomPlantilla, type MetadadesNom } from "../../../shared/domain/cartells";
import { analitzaPlantilla, imatgePrimeraPagina, plantillaSenseCamps } from "../../cartells/pdf";
import { ErrorClientApi } from "../../services/api";
import { serveiCartells } from "../../services/cartells";

type Resultat = { nom: string; estat: "en_curs" | "creada" | "activada" | "existent" | "error"; missatge?: string };

const TEXT_ESTAT: Record<Resultat["estat"], string> = {
  en_curs: "Processant…",
  creada: "Carregada en esborrany",
  activada: "Carregada i activada",
  existent: "Ja estava carregada",
  error: "No s'ha pogut carregar",
};

/** Amplada de la imatge de previsualització que es desa amb cada plantilla. */
const AMPLADA_PREVISUALITZACIO = 600;

/**
 * Carrega plantilles PDF originals: llegeix els camps al navegador, proposa el rol de cada camp,
 * desa el PDF tal qual i crea la plantilla. El PDF original no es modifica.
 */
export function CarregaPlantilles({ casalId, potCasal, potComunes, onCarregades }: {
  casalId: string; potCasal: boolean; potComunes: boolean; onCarregades: () => void;
}) {
  const id = useId();
  const [ambit, setAmbit] = useState<"comu" | "casal">(potComunes ? "comu" : "casal");
  const [activar, setActivar] = useState(true);
  const [fitxers, setFitxers] = useState<File[]>([]);
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [enCurs, setEnCurs] = useState(false);

  async function carregaUna(fitxer: File, actualitza: (r: Omit<Resultat, "nom">) => void) {
    const ambitId = ambit === "comu" ? null : casalId;
    const bytes = await fitxer.arrayBuffer();
    let analisi;
    try {
      analisi = await analitzaPlantilla(bytes);
    } catch {
      return actualitza({ estat: "error", missatge: "El fitxer no és un PDF vàlid d'una sola pàgina." });
    }
    if (analisi.camps.length === 0) return actualitza({ estat: "error", missatge: "El PDF no té camps de formulari: no és una plantilla." });
    const quadrat = Math.abs(analisi.pagina_amplada - analisi.pagina_alcada) < 1;
    const meta: MetadadesNom = metadadesDelNom(fitxer.name)
      ?? { tipus: quadrat ? "instagram" : "cartell", estacio: null, linies_titol: 1, amb_qr: analisi.camps.some((c) => /qr/i.test(c.nom)) };
    const camps = assignaRols(analisi.camps, analisi.pagina_alcada);

    const neta = await plantillaSenseCamps(bytes);
    const imatge = await imatgePrimeraPagina(neta, AMPLADA_PREVISUALITZACIO);
    const pdf = await serveiCartells.pujarFitxer(ambitId, "plantilla", fitxer);
    const previ = await serveiCartells.pujarFitxer(ambitId, "previsualitzacio",
      new File([imatge], fitxer.name.replace(/\.pdf$/i, "") + ".png", { type: "image/png" }));
    let plantilla;
    try {
      plantilla = (await serveiCartells.crearPlantilla(ambitId, {
        fitxer_id: pdf.fitxer.id, previsualitzacio_id: previ.fitxer.id, nom: nomPlantilla(meta),
        tipus: meta.tipus, estacio: meta.estacio, linies_titol: meta.linies_titol, amb_qr: meta.amb_qr,
        pagina_amplada: analisi.pagina_amplada, pagina_alcada: analisi.pagina_alcada,
        // Els cartells es lliuren en A4 i les publicacions d'Instagram en quadrat de 1080 px.
        format_sortida: meta.tipus === "instagram" ? "1080x1080" : "A4",
        camps,
      })).plantilla;
    } catch (e) {
      if (e instanceof ErrorClientApi && e.codi === "plantilla_existent") return actualitza({ estat: "existent" });
      throw e;
    }
    const avisos = avisosPlantilla(camps, meta.linies_titol, meta.amb_qr);
    if (activar && avisos.length === 0) {
      await serveiCartells.actualitzarPlantilla(casalId, plantilla.id, { versio: plantilla.versio, estat: "activa" });
      return actualitza({ estat: "activada" });
    }
    actualitza({ estat: "creada", missatge: avisos.length ? `Reviseu-la abans d'activar-la: ${avisos.join(" ")}` : undefined });
  }

  async function carrega() {
    setEnCurs(true);
    setResultats(fitxers.map((f) => ({ nom: f.name, estat: "en_curs" })));
    // Una per una: cada plantilla pot fer diversos MB.
    for (const [i, fitxer] of fitxers.entries()) {
      const actualitza = (r: Omit<Resultat, "nom">) => setResultats((rs) => rs.map((x, j) => (j === i ? { nom: x.nom, ...r } : x)));
      try {
        await carregaUna(fitxer, actualitza);
      } catch (e) {
        if (import.meta.env.DEV) console.error(e);
        actualitza({ estat: "error", missatge: e instanceof ErrorClientApi ? e.missatgeUsuari : "S'ha produït un error inesperat." });
      }
    }
    setEnCurs(false);
    setFitxers([]);
    onCarregades();
  }

  return (
    <div>
      <p>
        Trieu els PDF originals de les plantilles (formularis PDF amb camps). El fitxer es desa tal com és.
        L'aplicació detecta els camps i proposa què va a cadascun; ho podeu revisar a la fitxa de cada plantilla.
      </p>
      <fieldset className="camp">
        <legend>On s'ha de poder fer servir</legend>
        {potComunes && (
          <label className="opcio"><input type="radio" name={`${id}-ambit`} checked={ambit === "comu"} onChange={() => setAmbit("comu")} disabled={enCurs} />
            A tots els casals (plantilla comuna)</label>
        )}
        {potCasal && (
          <label className="opcio"><input type="radio" name={`${id}-ambit`} checked={ambit === "casal"} onChange={() => setAmbit("casal")} disabled={enCurs} />
            Només en aquest casal</label>
        )}
      </fieldset>
      <div className="camp">
        <label htmlFor={`${id}-fitxers`}>Fitxers PDF</label>
        <input id={`${id}-fitxers`} type="file" accept="application/pdf,.pdf" multiple disabled={enCurs}
          onChange={(e) => { setFitxers([...(e.target.files ?? [])]); setResultats([]); }} />
      </div>
      <label className="opcio">
        <input type="checkbox" checked={activar} onChange={(e) => setActivar(e.target.checked)} disabled={enCurs} />
        Activa directament les plantilles que tinguin tots els camps necessaris
      </label>
      <div className="botonera">
        <button type="button" className="boto" onClick={carrega} disabled={enCurs || fitxers.length === 0}>
          {enCurs ? "Carregant…" : fitxers.length > 1 ? `Carrega ${fitxers.length} plantilles` : "Carrega la plantilla"}
        </button>
      </div>
      {resultats.length > 0 && (
        <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Resultat de la càrrega">
          <table className="taula">
            <thead><tr><th scope="col">Fitxer</th><th scope="col">Resultat</th></tr></thead>
            <tbody aria-live="polite">
              {resultats.map((r) => (
                <tr key={r.nom}>
                  <td>{r.nom}</td>
                  <td>{TEXT_ESTAT[r.estat]}{r.missatge ? `. ${r.missatge}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
