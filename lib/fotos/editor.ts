import OpenAI, { toFile } from "openai";
import { instruccion } from "../asistente/instrucciones";

// Imágenes con la API de OpenAI:
//  - mejorar: luz, color, nitidez y verticales sin cambiar nada del espacio (prompts/foto.md).
//  - amueblar: amuebla y decora un cuarto vacío sin tocar la arquitectura (prompts/foto-amueblar.md).
//  - limpiar: quita objetos que estorban (carros, basura, cables…) sin cambiar la casa (prompts/foto-limpiar.md).
//  - generar / editarLibre: lo que el corredor le pide a Patty (prompts/imagen.md).
// El modelo regenera la imagen: las originales nunca se tocan y el corredor revisa cada resultado.
// Cada llamada devuelve su costo estimado para sumarlo al gasto de IA del corredor.

export interface ImagenIA {
  imagen: Buffer;
  /** Costo estimado en dólares (por uso de tokens o, si la API no lo informa, un estimado fijo). */
  costoUsd: number;
}

export type EstiloAmueblado = "moderno" | "clasico" | "minimalista" | "tropical";

export const ESTILOS: Record<EstiloAmueblado, string> = {
  moderno: "moderno y cálido, tonos neutros, madera clara y textiles suaves",
  clasico: "clásico elegante, maderas oscuras, telas ricas y detalles tradicionales",
  minimalista: "minimalista, pocas piezas de líneas limpias, blanco, gris y madera",
  tropical: "tropical costarricense, fibras naturales, plantas, madera y colores frescos",
};

export interface EditorFotos {
  mejorar(imagen: Buffer, tipo: string): Promise<ImagenIA>;
  amueblar(imagen: Buffer, tipo: string, estilo: EstiloAmueblado, cuarto?: string): Promise<ImagenIA>;
  limpiar(imagen: Buffer, tipo: string, queQuitar: string): Promise<ImagenIA>;
  /** Imagen nueva desde una descripción (chat de Patty). */
  generar(descripcion: string, formato?: "cuadrada" | "vertical" | "horizontal"): Promise<ImagenIA>;
  /** Edita una foto adjunta según lo que pida el corredor (chat de Patty). */
  editarLibre(imagen: Buffer, tipo: string, pedido: string): Promise<ImagenIA>;
}

export const MODELO_FOTOS = process.env.OPENAI_MODELO_FOTOS ?? "gpt-image-2";

/**
 * Precios por millón de tokens (USD) para estimar el costo. Por defecto, los de gpt-image-1 (los más
 * altos de la familia): si el modelo es más barato, el estimado queda por encima y el tope frena antes.
 */
function precio(nombre: string, porDefecto: number): number {
  const v = Number(process.env[nombre]);
  return Number.isFinite(v) && v >= 0 && process.env[nombre] !== undefined ? v : porDefecto;
}

type Uso = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
} | null | undefined;

/** Costo estimado de una llamada a partir del uso que informa la API. */
export function costoImagen(uso: Uso): number {
  if (!uso || (!uso.input_tokens && !uso.output_tokens)) return precio("OPENAI_COSTO_IMAGEN_USD", 0.25);
  const texto = uso.input_tokens_details?.text_tokens ?? (uso.input_tokens_details ? 0 : (uso.input_tokens ?? 0));
  const imagenEntrada = uso.input_tokens_details?.image_tokens ?? 0;
  const salida = uso.output_tokens ?? 0;
  const costo =
    (texto * precio("OPENAI_PRECIO_TEXTO_ENTRADA", 5) +
      imagenEntrada * precio("OPENAI_PRECIO_IMAGEN_ENTRADA", 10) +
      salida * precio("OPENAI_PRECIO_IMAGEN_SALIDA", 40)) /
    1_000_000;
  return Math.round(costo * 10_000) / 10_000;
}

const extensionDe = (tipo: string) => (tipo.includes("png") ? "png" : tipo.includes("webp") ? "webp" : "jpg");

export function crearEditorOpenAI(client = new OpenAI()): EditorFotos {
  const editar = async (imagen: Buffer, tipo: string, prompt: string): Promise<ImagenIA> => {
    const res = await client.images.edit({
      model: MODELO_FOTOS,
      image: await toFile(imagen, `foto.${extensionDe(tipo)}`, { type: tipo }),
      prompt,
      size: "auto",
      quality: "high",
      output_format: "jpeg",
      output_compression: 90,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI no devolvió imagen");
    return { imagen: Buffer.from(b64, "base64"), costoUsd: costoImagen(res.usage as Uso) };
  };

  return {
    mejorar: (imagen, tipo) => editar(imagen, tipo, instruccion("foto")),

    amueblar: (imagen, tipo, estilo, cuarto) =>
      editar(
        imagen,
        tipo,
        `${instruccion("foto-amueblar")}\n\nEstilo: ${ESTILOS[estilo] ?? ESTILOS.moderno}.${cuarto ? `\nEs ${cuarto.slice(0, 80)}.` : ""}`,
      ),

    limpiar: (imagen, tipo, queQuitar) =>
      editar(imagen, tipo, `${instruccion("foto-limpiar")}\n\nQuita solo esto: ${queQuitar.slice(0, 300)}`),

    editarLibre: (imagen, tipo, pedido) => editar(imagen, tipo, `${instruccion("imagen")}\n\nPedido del corredor: ${pedido.slice(0, 1000)}`),

    async generar(descripcion, formato = "cuadrada") {
      const res = await client.images.generate({
        model: MODELO_FOTOS,
        prompt: `${instruccion("imagen")}\n\nPedido del corredor: ${descripcion.slice(0, 1000)}`,
        size: formato === "vertical" ? "1024x1536" : formato === "horizontal" ? "1536x1024" : "1024x1024",
        quality: "high",
        output_format: "jpeg",
        output_compression: 90,
      });
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI no devolvió imagen");
      return { imagen: Buffer.from(b64, "base64"), costoUsd: costoImagen(res.usage as Uso) };
    },
  };
}
