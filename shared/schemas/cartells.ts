/** Esquemes de validació de les peticions de PG-Cartells (servidor i formularis). */
import { z } from "zod";
import { ESTACIONS, ESTATS_PLANTILLA, FORMATS_SORTIDA, ROLS_CAMP, TIPUS_PLANTILLA, USOS_FITXER } from "../domain/cartells";
import { textCurt, textOpcional, versio } from "./comuns";

const coordenada = z.number().finite().min(0).max(20000);
const color = z.number().min(0).max(1);

export const campPlantilla = z.strictObject({
  nom: z.string().min(1).max(120),
  tipus: z.enum(["text", "imatge"]),
  x: coordenada,
  y: coordenada,
  amplada: coordenada.positive(),
  alcada: coordenada.positive(),
  mida_lletra: z.number().finite().positive().max(1000).nullable(),
  negreta: z.boolean(),
  alineacio: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  color: z.tuple([color, color, color]),
  rol: z.enum(ROLS_CAMP).nullable(),
});

const camps = z.array(campPlantilla).min(1, "La plantilla no té cap camp.").max(80)
  .refine((cs) => {
    const rols = cs.map((c) => c.rol).filter(Boolean);
    return new Set(rols).size === rols.length;
  }, "Dos camps no poden tenir el mateix rol.");

export const plantillaCrear = z.strictObject({
  fitxer_id: z.uuid(),
  previsualitzacio_id: z.uuid().nullable().optional(),
  nom: textCurt(150),
  tipus: z.enum(TIPUS_PLANTILLA),
  estacio: z.enum(ESTACIONS).nullable(),
  linies_titol: z.number().int().min(1).max(3),
  amb_qr: z.boolean(),
  tematica: textOpcional(100).optional(),
  identitat_grafica: textOpcional(100).optional(),
  pagina_amplada: z.number().finite().positive().max(20000),
  pagina_alcada: z.number().finite().positive().max(20000),
  format_sortida: z.enum(FORMATS_SORTIDA),
  camps,
});

export const plantillaActualitzar = z.strictObject({
  versio,
  nom: textCurt(150).optional(),
  estat: z.enum(ESTATS_PLANTILLA).optional(),
  estacio: z.enum(ESTACIONS).nullable().optional(),
  tematica: textOpcional(100).optional(),
  identitat_grafica: textOpcional(100).optional(),
  format_sortida: z.enum(FORMATS_SORTIDA).optional(),
  camps: camps.optional(),
});

export const consultaPujada = z.strictObject({
  us: z.enum(USOS_FITXER),
  nom: z.string().trim().min(1).max(200),
});
