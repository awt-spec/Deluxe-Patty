import type { Propiedad } from "../datos/tipos";
import { cifrasInventadas, cifrasPermitidas, traeCifra } from "./cifras";
import { lineaContacto, precioCasa } from "./texto";

// "Mejorar el texto con IA" de la imagen para redes. Claude reescribe el texto del corredor (que entra como
// dato, nunca como instrucciones) con los datos de la ficha que le pasa el código. El código revisa lo que
// vuelve: si trae una cifra que no está en la ficha ni en el texto de antes (un precio cambiado, metros o
// distancias inventados), se descarta; si se perdió el precio, el código o el contacto, los vuelve a poner.

export type ModoTexto = "mejorar" | "corto" | "vendedor" | "ingles";

export const MODOS_TEXTO: Record<ModoTexto, { boton: string; pedido: string }> = {
  mejorar: { boton: "Mejorarlo", pedido: "Mejora el texto: más claro, ordenado y atractivo, en español, con el mismo largo aproximado." },
  corto: { boton: "Más corto", pedido: "Hazlo más corto: la mitad o menos, en español, solo lo más importante." },
  vendedor: { boton: "Más vendedor", pedido: "Hazlo más vendedor y emotivo (sin exagerar ni prometer nada que no esté en la ficha), en español." },
  ingles: { boton: "En inglés", pedido: "Tradúcelo y adáptalo al inglés para compradores extranjeros, natural y vendedor." },
};

export const esModoTexto = (m: unknown): m is ModoTexto => typeof m === "string" && m in MODOS_TEXTO;

/** Lo que entra (el texto del corredor) y lo que sale: el límite de Instagram para una publicación. */
export const MAX_TEXTO_REDES = 2200;

export type CasaTexto = Pick<Propiedad, "codigo" | "precio" | "moneda" | "operacion">;
export type Contacto = { nombre: string; whatsapp: string | null };

export type RevisionTexto = { ok: true; texto: string; repuesto: string[] } | { ok: false; motivo: string };

export const MOTIVO_CIFRAS =
  "La IA puso un número que no está en la ficha de la casa, así que no usé su versión. Tu texto quedó como estaba.";

/**
 * Revisa el texto que propuso la IA. `ficha` es exactamente lo que se le pasó; `anterior`, el texto del corredor.
 */
export function revisarTextoIA(
  propuesto: string,
  o: { ficha: string; anterior: string; casa: CasaTexto; contacto: Contacto; modo: ModoTexto },
): RevisionTexto {
  let texto = propuesto.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!texto) return { ok: false, motivo: "La IA no devolvió texto. Inténtalo de nuevo." };
  if (texto.length > MAX_TEXTO_REDES + 200) return { ok: false, motivo: "La IA lo dejó demasiado largo. Inténtalo de nuevo." };

  const permitidas = cifrasPermitidas(o.ficha, o.anterior, o.contacto.whatsapp, lineaContacto(o.casa, o.contacto), precioCasa(o.casa));
  if (cifrasInventadas(texto, permitidas).length > 0) return { ok: false, motivo: MOTIVO_CIFRAS };

  // Lo que nunca se pierde: el precio, el código de la casa y el contacto. Si faltan, el código los repone.
  const repuesto: string[] = [];
  const agregar: string[] = [];
  const precio = precioCasa(o.casa);
  if (precio && o.casa.precio && !traeCifra(texto, Math.round(o.casa.precio))) {
    agregar.push(`💰 ${precio}`);
    repuesto.push("el precio");
  }
  const tieneCodigo = texto.toLowerCase().includes(o.casa.codigo.toLowerCase());
  const tieneContacto = !o.contacto.whatsapp || traeCifra(texto, o.contacto.whatsapp);
  if (!tieneCodigo || !tieneContacto) {
    agregar.push(lineaContacto(o.casa, o.contacto, o.modo === "ingles" ? "en" : "es"));
    repuesto.push(!tieneCodigo && !tieneContacto ? "el código y el contacto" : !tieneCodigo ? "el código" : "el contacto");
  }
  if (agregar.length) texto = `${texto}\n\n${agregar.join("\n")}`;
  return { ok: true, texto: texto.slice(0, MAX_TEXTO_REDES + 400), repuesto };
}

/** En la demo no se gasta IA: una versión simulada hecha por código, con los mismos datos. */
export function textoDemo(modo: ModoTexto, anterior: string): string {
  const lineas = anterior.split("\n");
  if (modo === "corto") {
    const llenas = lineas.filter((l) => l.trim());
    return [...llenas.slice(0, 3), "", ...llenas.slice(-2)].join("\n");
  }
  const nota: Record<ModoTexto, string> = {
    mejorar: "(Demostración: aquí la IA dejaría tu texto más claro y ordenado.)",
    corto: "",
    vendedor: "(Demostración: aquí la IA dejaría tu texto más vendedor.)",
    ingles: "(Demo: here the AI would translate your text into English.)",
  };
  return `${nota[modo]}\n\n${anterior}`;
}
