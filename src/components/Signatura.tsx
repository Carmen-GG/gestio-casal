import { useEffect, useRef, useState } from "react";

/**
 * Requadre per signar amb el dit, un llapis o el ratolí. Retorna la signatura
 * com a imatge PNG (data URL), o null si el requadre és buit.
 */
export function Signatura({ id, etiqueta, error, onChange }: {
  id: string; etiqueta: string; error?: string; onChange: (png: string | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dibuixant = useRef(false);
  const darrer = useRef<{ x: number; y: number } | null>(null);
  const [buida, setBuida] = useState(true);

  // La mida interna del llenç segueix l'amplada visible (nítid en pantalles d'alta densitat).
  useEffect(() => {
    const c = canvas.current!;
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(c.clientWidth * escala);
    c.height = Math.round(c.clientHeight * escala);
    const ctx = c.getContext("2d")!;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  const punt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function comenca(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dibuixant.current = true;
    darrer.current = punt(e);
    const ctx = e.currentTarget.getContext("2d")!;
    const p = darrer.current;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
  }

  function mou(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibuixant.current || !darrer.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = punt(e);
    ctx.beginPath();
    ctx.moveTo(darrer.current.x, darrer.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    darrer.current = p;
  }

  function acaba() {
    if (!dibuixant.current) return;
    dibuixant.current = false;
    darrer.current = null;
    setBuida(false);
    onChange(canvas.current!.toDataURL("image/png"));
  }

  function esborra() {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setBuida(true);
    onChange(null);
  }

  return (
    <div className={`camp camp--ample ${error ? "camp--error" : ""}`}>
      <label htmlFor={id}>{etiqueta} <span className="camp__obligatori">(obligatori)</span></label>
      <p className="camp__ajuda" id={`${id}-ajuda`}>Signeu dins del requadre amb el dit o amb el ratolí.</p>
      <canvas id={id} ref={canvas} className="signatura" tabIndex={0} role="img"
        aria-label={buida ? "Requadre de signatura buit" : "Requadre de signatura signat"}
        aria-describedby={`${id}-ajuda`} aria-invalid={!!error}
        onPointerDown={comenca} onPointerMove={mou} onPointerUp={acaba} onPointerCancel={acaba} onPointerLeave={acaba} />
      <div className="botonera">
        <button type="button" className="boto boto--secundari boto--petit" onClick={esborra} disabled={buida}>Esborra la signatura</button>
      </div>
      {error && <p className="camp__missatge" role="alert">{error}</p>}
    </div>
  );
}
