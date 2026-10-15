import { useState } from "react";
import { MissatgeError } from "../../components/EstatsConsulta";
import { ErrorClientApi } from "../../services/api";
import { serveiGestio } from "../../services/gestio";
import type { Activitat } from "../../types/gestio";

const DIES = [[1, "Dl", "dilluns"], [2, "Dt", "dimarts"], [3, "Dc", "dimecres"], [4, "Dj", "dijous"], [5, "Dv", "divendres"], [6, "Ds", "dissabte"], [7, "Dg", "diumenge"]] as const;

type Fila = { dies: number[]; inici: string; fi: string };
const filaDe = (a: Activitat): Fila => ({ dies: [...a.dies_setmana].sort(), inici: a.hora_inici ?? "", fi: a.hora_fi ?? "" });
const igual = (x: Fila, y: Fila) => x.dies.join() === y.dies.join() && x.inici === y.inici && x.fi === y.fi;

/**
 * Dies i hores de totes les activitats del cicle en una sola taula (p. ex. després d'importar
 * el llistat de la PGEc, que no porta horaris). Només s'envien les files canviades; el servidor
 * torna a validar cada activitat.
 */
export function HorarisActivitats({ casalId, activitats, onDesat }: {
  casalId: string; activitats: Activitat[]; onDesat: (missatge: string) => void;
}) {
  const editables = activitats.filter((a) => a.estat !== "arxivada");
  const [files, setFiles] = useState<Record<string, Fila>>(() => Object.fromEntries(editables.map((a) => [a.id, filaDe(a)])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<ErrorClientApi | null>(null);
  const [desant, setDesant] = useState(false);

  const fila = (a: Activitat) => files[a.id] ?? filaDe(a);
  const canvia = (id: string, f: Partial<Fila>) => setFiles((x) => ({ ...x, [id]: { ...(x[id] as Fila), ...f } }));
  const canviades = editables.filter((a) => !igual(fila(a), filaDe(a)));

  async function desa() {
    setDesant(true);
    setErrorGeneral(null);
    const nous: Record<string, string> = {};
    let fetes = 0;
    for (const a of canviades) {
      const f = fila(a);
      if (f.inici && f.fi && f.fi <= f.inici) { nous[a.id] = "L'hora de finalització ha de ser posterior a la d'inici."; continue; }
      try {
        await serveiGestio.actualitzarActivitat(casalId, a.id, {
          versio: a.versio, dies_setmana: f.dies, hora_inici: f.inici || null, hora_fi: f.fi || null,
        });
        fetes++;
      } catch (e) {
        if (!(e instanceof ErrorClientApi)) throw e;
        nous[a.id] = Object.values(e.errorsCamps)[0] ?? e.message;
        if (e.status === 409) setErrorGeneral(e);
      }
    }
    setErrors(nous);
    setDesant(false);
    if (fetes) onDesat(fetes === 1 ? "S'ha desat l'horari d'1 activitat." : `S'han desat els horaris de ${fetes} activitats.`);
  }

  if (editables.length === 0) return <p>Aquest cicle encara no té activitats.</p>;
  return (
    <div>
      <p className="text-secundari">Marqueu els dies i escriviu les hores. Només es desen les files que canvieu.</p>
      {errorGeneral && <MissatgeError error={errorGeneral} />}
      <div className="taula-contenidor" tabIndex={0} role="region" aria-label="Dies i horaris de les activitats">
        <table className="taula taula--densa taula-horaris">
          <thead>
            <tr>
              <th scope="col">Activitat</th>
              {DIES.map(([n, curt, llarg]) => <th key={n} scope="col"><abbr title={llarg}>{curt}</abbr></th>)}
              <th scope="col">Inici</th><th scope="col">Fi</th>
            </tr>
          </thead>
          <tbody>
            {editables.map((a) => {
              const f = fila(a);
              return (
                <tr key={a.id} className={igual(f, filaDe(a)) ? undefined : "fila-canviada"}>
                  <th scope="row">
                    {a.nom}
                    {errors[a.id] && <div className="camp__missatge" role="alert">{errors[a.id]}</div>}
                  </th>
                  {DIES.map(([n, , llarg]) => (
                    <td key={n}>
                      <input type="checkbox" aria-label={`${a.nom}: ${llarg}`} checked={f.dies.includes(n)}
                        onChange={(e) => canvia(a.id, { dies: e.target.checked ? [...f.dies, n].sort() : f.dies.filter((d) => d !== n) })} />
                    </td>
                  ))}
                  <td><input type="time" aria-label={`${a.nom}: hora d'inici`} value={f.inici} onChange={(e) => canvia(a.id, { inici: e.target.value })} /></td>
                  <td><input type="time" aria-label={`${a.nom}: hora de finalització`} value={f.fi} onChange={(e) => canvia(a.id, { fi: e.target.value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="botonera">
        <button type="button" className="boto" disabled={desant || canviades.length === 0} onClick={() => void desa()}>
          {desant ? "Desant…" : canviades.length ? `Desa els horaris (${canviades.length} canvis)` : "Desa els horaris"}
        </button>
      </div>
    </div>
  );
}
