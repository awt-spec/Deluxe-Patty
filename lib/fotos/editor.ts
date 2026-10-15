import OpenAI, { toFile } from "openai";
import { instruccion } from "../asistente/instrucciones";

// Mejora de fotos con la API de imágenes de OpenAI. El modelo regenera la imagen: la instrucción
// (prompts/foto.md) le pide corregir solo luz, color, nitidez y verticales sin cambiar nada del
// espacio, y el corredor revisa cada foto antes de publicarla. La original nunca se toca.

export interface EditorFotos {
  mejorar(imagen: Buffer, tipo: string): Promise<Buffer>;
}

export const MODELO_FOTOS = process.env.OPENAI_MODELO_FOTOS ?? "gpt-image-2";

export function crearEditorOpenAI(client = new OpenAI()): EditorFotos {
  return {
    async mejorar(imagen, tipo) {
      const extension = tipo.includes("png") ? "png" : tipo.includes("webp") ? "webp" : "jpg";
      const res = await client.images.edit({
        model: MODELO_FOTOS,
        image: await toFile(imagen, `foto.${extension}`, { type: tipo }),
        prompt: instruccion("foto"),
        size: "auto",
        quality: "high",
        output_format: "jpeg",
        output_compression: 90,
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI no devolvió imagen");
      return Buffer.from(b64, "base64");
    },
  };
}
