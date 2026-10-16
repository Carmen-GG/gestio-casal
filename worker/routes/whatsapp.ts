import { Hono } from "hono";
import type { Entorn } from "../app";
import { signaturaValida } from "../lib/whatsapp-meta";
import { ServeiWhatsapp } from "../services/whatsapp";

/**
 * Webhook de WhatsApp Business (Meta): verificació en registrar-lo i avisos d'entrega i
 * respostes. Sense sessió: s'autentica amb la signatura HMAC del secret de l'app.
 * No es registra mai el cos de l'avís (conté telèfons i textos de les persones).
 */
export const rutesWhatsapp = new Hono<Entorn>()
  .get("/webhook", (c) => {
    const esperat = c.env.WHATSAPP_VERIFY_TOKEN;
    const modo = c.req.query("hub.mode");
    const testimoni = c.req.query("hub.verify_token");
    const repte = c.req.query("hub.challenge") ?? "";
    if (!esperat || modo !== "subscribe" || testimoni !== esperat || !/^[\w-]{1,200}$/.test(repte)) return c.text("", 403);
    return c.text(repte, 200);
  })
  .post("/webhook", async (c) => {
    const secret = c.env.WHATSAPP_APP_SECRET;
    const cos = await c.req.text();
    if (!secret || !(await signaturaValida(cos, c.req.header("x-hub-signature-256"), secret))) return c.text("", 401);
    let dades: unknown;
    try {
      dades = JSON.parse(cos);
    } catch {
      return c.text("", 400);
    }
    const r = await new ServeiWhatsapp(c.get("repos"), c.get("rellotge"), c.env, c.get("fetchMeta")).processaAvis(dades);
    return c.json({ ok: true, ...r });
  });
