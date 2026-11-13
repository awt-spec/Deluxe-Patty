import type { Propiedad } from "../datos/tipos";
import { precio } from "../formato";

// Texto para acompañar la imagen en redes. Lo arma el código con los datos de la casa (nunca el modelo):
// así no se inventa ninguna cifra.

export type Formato = "cuadrado" | "historia";
export const TAMANOS: Record<Formato, { ancho: number; alto: number; nombre: string }> = {
  cuadrado: { ancho: 1080, alto: 1080, nombre: "Publicación (cuadrada)" },
  historia: { ancho: 1080, alto: 1920, nombre: "Historia (vertical)" },
};

type DatosCasa = Pick<
  Propiedad,
  "titulo" | "operacion" | "tipo" | "precio" | "moneda" | "zona" | "canton" | "habitaciones" | "banos" | "m2_construccion" | "m2_terreno" | "amenidades" | "codigo"
>;

const TIPO: Record<string, string> = { casa: "Casa", apartamento: "Apartamento", lote: "Lote", local: "Local", oficina: "Oficina", finca: "Finca" };

/** "Casa en venta · Escazú". */
export function etiquetaCasa(p: Pick<DatosCasa, "tipo" | "operacion" | "zona" | "canton">): string {
  const lugar = p.zona ?? p.canton;
  return `${TIPO[p.tipo] ?? "Propiedad"} en ${p.operacion === "alquiler" ? "alquiler" : "venta"}${lugar ? ` · ${lugar}` : ""}`;
}

/** "$1.250.000" o "$2.500 al mes". */
export function precioCasa(p: Pick<DatosCasa, "precio" | "moneda" | "operacion">): string | null {
  if (!p.precio) return null;
  return `${precio(p.precio, p.moneda)}${p.operacion === "alquiler" ? " al mes" : ""}`;
}

/** Datos cortos: "4 habitaciones · 3,5 baños · 380 m²". */
export function datosCortos(p: Pick<DatosCasa, "habitaciones" | "banos" | "m2_construccion" | "m2_terreno">): string[] {
  return [
    p.habitaciones ? `${p.habitaciones} ${p.habitaciones === 1 ? "habitación" : "habitaciones"}` : null,
    p.banos ? `${String(p.banos).replace(".", ",")} ${p.banos === 1 ? "baño" : "baños"}` : null,
    p.m2_construccion ? `${Number(p.m2_construccion).toLocaleString("es-CR")} m²` : p.m2_terreno ? `${Number(p.m2_terreno).toLocaleString("es-CR")} m² de terreno` : null,
  ].filter((x): x is string => !!x);
}

/** La línea de contacto con el código de la casa (la misma en el texto original y la que el código repone). */
export function lineaContacto(p: Pick<DatosCasa, "codigo">, contacto: { nombre: string; whatsapp: string | null }, idioma: "es" | "en" = "es"): string {
  const wa = contacto.whatsapp ? `wa.me/${contacto.whatsapp.replace(/\D/g, "")}` : null;
  if (idioma === "en") {
    return wa ? `📲 More info and viewings on WhatsApp: ${wa} (code ${p.codigo})` : `📲 Message ${contacto.nombre} for more info (code ${p.codigo}).`;
  }
  return wa
    ? `📲 Más información y visitas por WhatsApp: ${wa} (código ${p.codigo})`
    : `📲 Escríbele a ${contacto.nombre} para más información (código ${p.codigo}).`;
}

/** Texto listo para copiar y pegar en Instagram o Facebook. */
export function textoPublicacion(p: DatosCasa, contacto: { nombre: string; whatsapp: string | null }): string {
  const lineas = [
    `${p.titulo}`,
    etiquetaCasa(p),
    precioCasa(p) ? `💰 ${precioCasa(p)}` : null,
    datosCortos(p).length ? `🏠 ${datosCortos(p).join(" · ")}` : null,
    p.amenidades.length ? `✨ ${p.amenidades.slice(0, 5).join(", ")}` : null,
    "",
    lineaContacto(p, contacto),
    "",
    ["#BienesRaicesCR", "#CostaRica", p.operacion === "alquiler" ? "#Alquiler" : "#Venta", p.zona ? `#${p.zona.replace(/[^\p{L}\p{N}]/gu, "")}` : null]
      .filter(Boolean)
      .join(" "),
  ];
  return lineas.filter((l) => l !== null).join("\n");
}
