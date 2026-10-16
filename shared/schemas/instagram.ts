/** Esquemes de validació de les peticions d'Instagram (servidor i formularis). */
import { z } from "zod";
import { errorsPeu } from "../domain/instagram";
import { textCurt, versio } from "./comuns";

const peu = z.string().max(4000).transform((s) => s.replace(/\r\n/g, "\n").trim())
  .superRefine((s, ctx) => { for (const message of errorsPeu(s)) ctx.addIssue({ code: "custom", message }); });

export const compteConnectar = z.strictObject({
  testimoni: z.string().trim().min(20, "El testimoni d'accés no és vàlid.").max(1000, "El testimoni d'accés no és vàlid.")
    .regex(/^[A-Za-z0-9._|-]+$/, "El testimoni d'accés no és vàlid."),
});

export const publicacioCrear = z.strictObject({
  fitxer_id: z.uuid(),
  titol: textCurt(120),
  peu,
});

export const publicacioActualitzar = z.strictObject({
  versio,
  peu: peu.optional(),
  /** Només es pot descartar una publicació pendent. */
  descartar: z.literal(true).optional(),
});

export const publicacioPublicar = z.strictObject({
  versio,
  /** Confirmació explícita de la persona: l'aplicació no publica mai sola. */
  confirmo: z.literal(true),
});

export const publicacioManual = z.strictObject({
  versio,
  enllac: z.url({ protocol: /^https$/, hostname: /^(www\.)?instagram\.com$/, error: "Ha de ser un enllaç d'instagram.com." })
    .max(300).nullable().optional(),
});
