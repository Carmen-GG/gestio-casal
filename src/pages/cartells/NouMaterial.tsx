import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ETIQUETES_ESTACIO, ETIQUETES_ROL, ETIQUETES_TIPUS_PLANTILLA, type RolCamp } from "../../../shared/domain/cartells";
import {
  ROLS_TEXT, errorUrlQr, slugFitxer, textosPerDefecte, type RolText, type TextosMaterial,
} from "../../../shared/domain/cartells-contingut";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { CampAreaText, CampSeleccio, CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import type { AvisMaterial, ImatgeMaterial } from "../../cartells/generador";
import { ErrorClientApi } from "../../services/api";
import { serveiCartells } from "../../services/cartells";
import { serveiGestio } from "../../services/gestio";
import type { Activitat, Casal, Cicle, PlantillaCartells } from "../../types/gestio";
import { useGestio, usePermisos } from "../gestio/context";
import { ImatgeFitxer } from "./ImatgeFitxer";

type ImatgeTriada = { nom: string; imatge: ImatgeMaterial };
type Resultat = { fitxer: Blob; nomFitxer: string; previsualitzacio: string; avisos: AvisMaterial[] };

const ROLS_IMATGE_TRIADA = ["fotografia", "logo_1", "logo_2"] as const;
type RolImatgeTriada = (typeof ROLS_IMATGE_TRIADA)[number];

/** Generador de materials: cartell en PDF o imatge per a Instagram a partir d'una plantilla activa. */
export function NouMaterial() {
  const { casalId = "" } = useParams();
  const { jo } = useGestio();
  const pot = usePermisos(casalId);
  const consulta = useConsulta(async (s) => {
    const [{ casal }, { plantilles }, cicles] = await Promise.all([
      serveiGestio.casal(casalId, s),
      serveiCartells.plantilles(casalId, undefined, s),
      pot("cicles.consultar") ? serveiGestio.cicles(casalId, s).then((r) => r.cicles) : Promise.resolve([] as Cicle[]),
    ]);
    return { casal, plantilles: plantilles.filter((p) => p.estat === "activa"), cicles };
  }, [casalId], casalId);

  if (!jo.casals.some((c) => c.id === casalId) || !pot("cartells.generar")) {
    return <p role="alert" className="avis avis--error">No teniu permís per generar materials de difusió en aquest casal.</p>;
  }
  if (consulta.tipus === "carregant") return <Carregant />;
  if (consulta.tipus === "error") return <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />;
  return <Generador casal={consulta.dades.casal} plantilles={consulta.dades.plantilles} cicles={consulta.dades.cicles}
    potActivitats={pot("activitats.consultar")} />;
}

function Generador({ casal, plantilles, cicles, potActivitats }: {
  casal: Casal; plantilles: PlantillaCartells[]; cicles: Cicle[]; potActivitats: boolean;
}) {
  const [cicleId, setCicleId] = useState(cicles[0]?.id ?? "");
  const [activitatId, setActivitatId] = useState("");
  const [plantillaId, setPlantillaId] = useState(plantilles[0]?.id ?? "");
  const [editats, setEditats] = useState<TextosMaterial>({});
  const [imatges, setImatges] = useState<Partial<Record<RolImatgeTriada, ImatgeTriada>>>({});
  const [urlQr, setUrlQr] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [enCurs, setEnCurs] = useState<"" | "generant" | RolImatgeTriada>("");
  const [error, setError] = useState<string>("");

  const activitats = useConsulta(
    (s) => (cicleId && potActivitats ? serveiGestio.activitats(casal.id, cicleId, s).then((r) => r.activitats) : Promise.resolve([] as Activitat[])),
    [casal.id, cicleId, potActivitats], `${casal.id}-${cicleId}`);
  const llistaActivitats = activitats.tipus === "dades" ? activitats.dades.filter((a) => a.estat !== "arxivada") : [];
  const activitat = llistaActivitats.find((a) => a.id === activitatId) ?? null;
  const cicle = cicles.find((c) => c.id === cicleId) ?? null;
  const plantilla = plantilles.find((p) => p.id === plantillaId) ?? null;

  const textos = useMemo<TextosMaterial>(() => ({
    ...textosPerDefecte({ activitat, cicle: activitat ? cicle : null, casal, liniesTitol: plantilla?.linies_titol ?? 2 }),
    ...editats,
  }), [activitat, cicle, casal, plantilla?.linies_titol, editats]);
  const rols = new Set<RolCamp>(plantilla?.camps.flatMap((c) => (c.rol ? [c.rol] : [])) ?? []);
  const rolsText = ROLS_TEXT.filter((r) => rols.has(r));
  const urlPerDefecte = `${window.location.origin}/inscripcio/${encodeURIComponent(casal.codi)}${cicleId ? `/${encodeURIComponent(cicleId)}` : ""}`;
  const adrecaQr = urlQr ?? urlPerDefecte;
  const errorQr = rols.has("qr") ? errorUrlQr(adrecaQr) : null;

  // Qualsevol canvi invalida el material generat: es torna a generar amb les dades actuals.
  useEffect(() => { setResultat(null); }, [plantillaId, textos, imatges, adrecaQr]);
  useEffect(() => () => { if (resultat) URL.revokeObjectURL(resultat.previsualitzacio); }, [resultat]);

  async function triaImatge(rol: RolImatgeTriada, fitxer: File | undefined) {
    if (!fitxer) { setImatges(({ [rol]: _, ...resta }) => resta); return; }
    setEnCurs(rol);
    setError("");
    try {
      const { preparaImatge } = await import("../../cartells/generador");
      const imatge = await preparaImatge(fitxer, rol === "fotografia" ? "fotografia" : "logotip");
      setImatges((im) => ({ ...im, [rol]: { nom: fitxer.name, imatge } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No s'ha pogut llegir la imatge.");
    } finally {
      setEnCurs("");
    }
  }

  async function genera() {
    if (!plantilla) return;
    setEnCurs("generant");
    setError("");
    try {
      const { generaMaterial, imatgeMaterial, AMPLADA_INSTAGRAM } = await import("../../cartells/generador");
      const plantillaPdf = await serveiCartells.fitxer(casal.id, plantilla.fitxer_id);
      const { pdf, avisos } = await generaMaterial({
        plantillaPdf, camps: plantilla.camps, formatSortida: plantilla.format_sortida, textos,
        fotografia: imatges.fotografia?.imatge, logos: { logo_1: imatges.logo_1?.imatge, logo_2: imatges.logo_2?.imatge },
        urlQr: rols.has("qr") && !errorQr ? adrecaQr.trim() : null,
      });
      const instagram = plantilla.tipus === "instagram";
      const imatge = await imatgeMaterial(pdf, instagram ? AMPLADA_INSTAGRAM : 900);
      const base = `${plantilla.tipus}-${slugFitxer(activitat?.nom ?? textos.titol_1 ?? plantilla.nom)}`;
      setResultat({
        fitxer: instagram ? imatge : new Blob([pdf.slice()], { type: "application/pdf" }),
        nomFitxer: `${base}.${instagram ? "png" : "pdf"}`,
        previsualitzacio: URL.createObjectURL(imatge),
        avisos,
      });
    } catch (e) {
      setError(e instanceof ErrorClientApi || e instanceof Error ? e.message : "No s'ha pogut generar el material.");
      if (import.meta.env.DEV) console.error(e);
    } finally {
      setEnCurs("");
    }
  }

  function descarrega() {
    if (!resultat) return;
    const url = URL.createObjectURL(resultat.fitxer);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultat.nomFitxer;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const canviaText = (rol: RolText, valor: string) => setEditats((t) => ({ ...t, [rol]: valor }));

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casal.id}/cartells`}>PG-Cartells</Link> · {casal.nom}</p>
      <h1>Nou material</h1>
      <p>Trieu l'activitat i la plantilla, reviseu els textos i genereu el cartell o la imatge. Els canvis als textos no modifiquen l'activitat.</p>
      {plantilles.length === 0 && (
        <p className="avis avis--alerta" role="status">
          No hi ha cap plantilla activa. <Link to={`/gestio/${casal.id}/cartells/plantilles`}>Reviseu les plantilles</Link>.
        </p>
      )}

      <Seccio titol="Contingut">
        <div className="graella-camps">
          {potActivitats && cicles.length > 0 && (
            <CampSeleccio etiqueta="Cicle" value={cicleId} obligatori
              onChange={(e) => { setCicleId(e.target.value); setActivitatId(""); setEditats({}); setUrlQr(null); }}
              opcions={cicles.map((c) => ({ valor: c.id, text: c.nom }))} />
          )}
          {potActivitats && cicleId && (
            <CampSeleccio etiqueta="Activitat" value={activitatId} disabled={activitats.tipus === "carregant"}
              ajuda="Els textos es proposen a partir de l'activitat. Sense activitat, s'escriuen a mà."
              onChange={(e) => { setActivitatId(e.target.value); setEditats({}); }}
              opcions={[{ valor: "", text: "Cap (contingut lliure)" }, ...llistaActivitats.map((a) => ({ valor: a.id, text: a.nom }))]} />
          )}
        </div>
        {activitats.tipus === "error" && <MissatgeError error={activitats.error} onReintentar={activitats.reintentar} />}
      </Seccio>

      {plantilles.length > 0 && (
        <Seccio titol="Plantilla">
          <div className="tria-plantilla">
            <div className="camp">
              <label htmlFor="plantilla-material">Plantilla</label>
              <select id="plantilla-material" value={plantillaId}
                onChange={(e) => { setPlantillaId(e.target.value); setEditats(({ titol_1: _1, titol_2: _2, titol_3: _3, ...resta }) => resta); }}>
                {(["cartell", "instagram"] as const).map((t) => (
                  <optgroup key={t} label={ETIQUETES_TIPUS_PLANTILLA[t]}>
                    {plantilles.filter((p) => p.tipus === t).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </optgroup>
                ))}
              </select>
              {plantilla && (
                <p className="camp__ajuda">
                  {ETIQUETES_TIPUS_PLANTILLA[plantilla.tipus]}{plantilla.estacio ? ` · ${ETIQUETES_ESTACIO[plantilla.estacio]}` : ""}
                  {` · ${plantilla.linies_titol} ${plantilla.linies_titol === 1 ? "línia" : "línies"} de títol`}
                  {plantilla.amb_qr ? " · amb codi QR" : ""}
                  {` · es lliura ${plantilla.format_sortida === "1080x1080" ? "com a imatge PNG de 1080 × 1080 px" : `en PDF ${plantilla.format_sortida}`}`}
                </p>
              )}
            </div>
            {plantilla?.previsualitzacio_id && (
              <ImatgeFitxer key={plantilla.id} casalId={casal.id} fitxerId={plantilla.previsualitzacio_id} alt="" className="tria-plantilla__imatge" />
            )}
          </div>
        </Seccio>
      )}

      {plantilla && (
        <Seccio titol="Textos">
          <div className="graella-camps">
            {rolsText.map((r) => (r === "peu" ? (
              <CampAreaText key={r} etiqueta={ETIQUETES_ROL[r]} rows={2} value={textos[r] ?? ""} maxLength={200}
                onChange={(e) => canviaText(r, e.target.value)} />
            ) : (
              <CampText key={r} etiqueta={ETIQUETES_ROL[r]} value={textos[r] ?? ""} maxLength={120} obligatori={r === "titol_1"}
                onChange={(e) => canviaText(r, e.target.value)} />
            )))}
          </div>
          {Object.keys(editats).length > 0 && (
            <div className="botonera">
              <button type="button" className="boto boto--secundari" onClick={() => setEditats({})}>Recupera els textos proposats</button>
            </div>
          )}
        </Seccio>
      )}

      {plantilla && (rols.has("fotografia") || rols.has("logo_1") || rols.has("logo_2") || rols.has("qr")) && (
        <Seccio titol="Imatges i codi QR">
          <div className="graella-camps">
            {ROLS_IMATGE_TRIADA.filter((r) => rols.has(r)).map((r) => (
              <div className="camp" key={r}>
                <label htmlFor={`imatge-${r}`}>{ETIQUETES_ROL[r]} <span className="camp__opcional">(JPEG o PNG)</span></label>
                <input id={`imatge-${r}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={enCurs !== "" && enCurs !== r}
                  onChange={(e) => void triaImatge(r, e.target.files?.[0])} aria-describedby={`imatge-${r}-ajuda`} />
                <p className="camp__ajuda" id={`imatge-${r}-ajuda`}>
                  {enCurs === r ? "Preparant la imatge…" : imatges[r] ? `Triada: ${imatges[r]!.nom}`
                    : r === "fotografia" ? "Feu servir només fotografies amb autorització de les persones que hi surten." : "Logotip de l'entitat col·laboradora."}
                </p>
              </div>
            ))}
            {rols.has("qr") && (
              <CampText etiqueta="Adreça del codi QR" value={adrecaQr} type="url" maxLength={300} obligatori error={errorQr ?? undefined}
                ajuda="Per defecte, el formulari públic d'inscripció del cicle. El codi només conté aquesta adreça, cap dada personal."
                onChange={(e) => setUrlQr(e.target.value)} />
            )}
          </div>
        </Seccio>
      )}

      {plantilla && (
        <Seccio titol="Resultat">
          {error && <p className="avis avis--error" role="alert">{error}</p>}
          <div className="botonera">
            <button type="button" className="boto" onClick={() => void genera()}
              disabled={enCurs !== "" || !!errorQr || !(textos.titol_1 ?? "").trim()}>
              {enCurs === "generant" ? "Generant…" : resultat ? "Torna a generar" : "Genera la previsualització"}
            </button>
            {resultat && (
              <button type="button" className="boto boto--secundari" onClick={descarrega}>
                {plantilla.tipus === "instagram" ? "Descarrega la imatge PNG" : "Descarrega el PDF"}
              </button>
            )}
          </div>
          {resultat && (
            <>
              {resultat.avisos.length > 0 && (
                <div className="avis avis--alerta" role="status">
                  <p>Reviseu el material abans de fer-lo servir:</p>
                  <ul>{resultat.avisos.map((a) => <li key={a.missatge}>{a.missatge}</li>)}</ul>
                </div>
              )}
              <figure className="resultat-material">
                <img src={resultat.previsualitzacio} alt={`Previsualització del material «${textos.titol_1 ?? ""}»`} />
                <figcaption>{resultat.nomFitxer}</figcaption>
              </figure>
            </>
          )}
        </Seccio>
      )}
    </div>
  );
}
