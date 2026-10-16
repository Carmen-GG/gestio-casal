import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { avuiLocal } from "../../../shared/domain/assistencia";
import { CATEGORIES_INCIDENCIA, ETIQUETES_CATEGORIA_INCIDENCIA, type CategoriaIncidencia } from "../../../shared/domain/territori";
import { errorsPerCamp } from "../../../shared/schemas/comuns";
import { incidenciaNova } from "../../../shared/schemas/territori";
import { Carregant, MissatgeError } from "../../components/EstatsConsulta";
import { AvisExit, CampAreaText, CampSeleccio, CampText } from "../../components/Formulari";
import { Seccio } from "../../components/Seccio";
import { useConsulta } from "../../hooks/useConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Incidencia } from "../../types/gestio";
import { formataData } from "../../utils/format";

const buida = () => ({ data: avuiLocal(new Date()), categoria: "" as CategoriaIncidencia | "", descripcio: "", activitat_id: "" });

/**
 * Incidències del casal (petició de 2026-10-16): les registra l'equip i la superadministració
 * les veu agrupades al quadre de comandament.
 */
export function Incidencies() {
  const { casalId = "" } = useParams();
  const [any, setAny] = useState<number | null>(new Date().getFullYear());
  const [versio, setVersio] = useState(0);
  const consulta = useConsulta((s) => serveiGestio.incidencies(casalId, any, s), [casalId, any, versio]);
  const [v, setV] = useState(buida);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<ErrorClientApi | null>(null);
  const [exit, setExit] = useState("");
  const [desant, setDesant] = useState(false);
  const [resolent, setResolent] = useState<string | null>(null);
  const [resolucio, setResolucio] = useState("");
  const [nomesObertes, setNomesObertes] = useState(false);

  async function executa(accio: () => Promise<string>) {
    setError(null); setExit(""); setDesant(true);
    try {
      setExit(await accio());
      setVersio((x) => x + 1);
    } catch (err) {
      if (err instanceof ErrorClientApi) { setError(err); setErrors(err.errorsCamps); } else throw err;
    } finally { setDesant(false); }
  }

  function envia(e: FormEvent) {
    e.preventDefault();
    const r = incidenciaNova.safeParse({ ...v, activitat_id: v.activitat_id || null });
    if (!r.success) { setErrors(errorsPerCamp(r.error)); return; }
    setErrors({});
    void executa(async () => {
      await serveiGestio.novaIncidencia(casalId, r.data);
      setV(buida());
      return "S'ha registrat la incidència.";
    });
  }

  const resol = (i: Incidencia) => executa(async () => {
    await serveiGestio.resoldreIncidencia(casalId, i.id, resolucio);
    setResolent(null); setResolucio("");
    return "La incidència s'ha marcat com a resolta.";
  });

  const anys = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div>
      <p className="subtitol"><Link to={`/gestio/${casalId}`}>Tornar al casal</Link></p>
      <h1>Incidències</h1>
      <p className="text-secundari">
        Registreu aquí les incidències del casal: instal·lacions, convivència, la tallerista que no ve, problemes amb l'aplicació…
        Descriviu què ha passat sense posar-hi noms ni dades de les persones.
      </p>
      <div aria-live="polite">
        {error && <MissatgeError error={error} />}
        {exit && <AvisExit>{exit}</AvisExit>}
      </div>

      <Seccio titol="Nova incidència">
        <form onSubmit={envia} noValidate>
          <div className="graella-camps">
            <CampText etiqueta="Data" type="date" obligatori value={v.data} error={errors.data} onChange={(e) => setV({ ...v, data: e.target.value })} />
            <CampSeleccio etiqueta="Categoria" obligatori value={v.categoria} error={errors.categoria}
              opcions={[{ valor: "", text: "Trieu-ne una" }, ...CATEGORIES_INCIDENCIA.map((c) => ({ valor: c, text: ETIQUETES_CATEGORIA_INCIDENCIA[c] }))]}
              onChange={(e) => setV({ ...v, categoria: e.target.value as CategoriaIncidencia })} />
            <CampSeleccio etiqueta="Activitat" value={v.activitat_id} error={errors.activitat_id}
              opcions={[{ valor: "", text: "Cap activitat concreta" }, ...(consulta.tipus === "dades" ? consulta.dades.activitats.map((a) => ({ valor: a.id, text: `${a.nom} (${a.cicle})` })) : [])]}
              onChange={(e) => setV({ ...v, activitat_id: e.target.value })} />
          </div>
          <CampAreaText etiqueta="Què ha passat" obligatori rows={3} maxLength={1000} value={v.descripcio} error={errors.descripcio}
            ajuda="Sense noms ni dades personals." onChange={(e) => setV({ ...v, descripcio: e.target.value })} />
          <button type="submit" className="boto" disabled={desant}>Registra la incidència</button>
        </form>
      </Seccio>

      <Seccio titol="Incidències registrades">
        <div className="barra-filtres">
          <label className="camp camp--en-linia">
            <span>Any</span>
            <select value={any ?? ""} onChange={(e) => setAny(e.target.value ? Number(e.target.value) : null)}>
              {anys.map((a) => <option key={a} value={a}>{a}</option>)}
              <option value="">Tots</option>
            </select>
          </label>
          <label className="casella"><input type="checkbox" checked={nomesObertes} onChange={(e) => setNomesObertes(e.target.checked)} /> Només les obertes</label>
        </div>
        {consulta.tipus === "carregant" && <Carregant text="Carregant les incidències…" />}
        {consulta.tipus === "error" && <MissatgeError error={consulta.error} onReintentar={consulta.reintentar} />}
        {consulta.tipus === "dades" && (() => {
          const files = consulta.dades.incidencies.filter((i) => !nomesObertes || i.estat === "oberta");
          if (files.length === 0) return <p>No hi ha cap incidència{any ? ` el ${any}` : ""}.</p>;
          return (
            <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Incidències registrades">
              <table className="taula">
                <thead><tr><th scope="col">Data</th><th scope="col">Categoria</th><th scope="col">Descripció</th><th scope="col">Estat</th><th scope="col">Accions</th></tr></thead>
                <tbody>
                  {files.map((i) => (
                    <tr key={i.id}>
                      <td className="sense-salt">{formataData(i.data)}</td>
                      <td>{ETIQUETES_CATEGORIA_INCIDENCIA[i.categoria]}{i.activitat && <><br /><span className="text-secundari">{i.activitat}</span></>}</td>
                      <td>{i.descripcio}{i.resolucio && <><br /><span className="text-secundari">Resolució: {i.resolucio}</span></>}</td>
                      <td><span className={`etiqueta ${i.estat === "oberta" ? "etiqueta--alerta" : "etiqueta--confirmada"}`}>{i.estat === "oberta" ? "Oberta" : "Resolta"}</span></td>
                      <td>
                        {i.estat === "oberta" && (resolent === i.id ? (
                          <div className="accions-fila">
                            <input aria-label="Com s'ha resolt (opcional)" placeholder="Com s'ha resolt (opcional)" maxLength={1000} value={resolucio} onChange={(e) => setResolucio(e.target.value)} />
                            <button type="button" className="boto boto--petit" disabled={desant} onClick={() => void resol(i)}>Marca-la resolta</button>
                            <button type="button" className="boto boto--secundari boto--petit" onClick={() => setResolent(null)}>Cancel·la</button>
                          </div>
                        ) : (
                          <button type="button" className="boto boto--secundari boto--petit" onClick={() => { setResolent(i.id); setResolucio(""); }}>Resol</button>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Seccio>
    </div>
  );
}
