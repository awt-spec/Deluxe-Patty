import { rutaDeMarca } from "../marcas/archivo";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { createElement, type ReactElement } from "react";
import { enlaceWhatsAppConTexto } from "../anuncios/atribucion";
import type { PropiedadConFotos } from "../datos/tipos";
import { MAX_FOTOS_GALERIA } from "./diseno";
import { FichaPropiedad, registrarFuentes, type FotoFicha } from "./ficha";
import type { Marca } from "./marca";

export interface OpcionesFicha {
  propiedad: PropiedadConFotos;
  marca: Marca;
  /** Número de la asistente: el QR abre WhatsApp con la referencia de la propiedad. */
  whatsappAsistente: string | null;
}

/**
 * Fotos de la ficha, en orden: la mejorada cuando existe y la original si no (nunca una variante amueblada o
 * limpia). El PDF baja cada una: a lo sumo la portada y la galería.
 */
export function fotosDeFicha(propiedad: PropiedadConFotos): FotoFicha[] {
  return [...propiedad.fotos]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .slice(0, 1 + MAX_FOTOS_GALERIA)
    .map((f) => ({ src: f.mejorada_url ?? f.url, ilustrativa: false }));
}

/** PDF de la ficha. Una marca sin logo (la neutra) muestra su nombre. */
export async function generarFicha({ propiedad, marca, whatsappAsistente }: OpcionesFicha): Promise<Buffer> {
  registrarFuentes();
  const enlace = whatsappAsistente
    ? enlaceWhatsAppConTexto(whatsappAsistente, `Hola, me interesa la propiedad ${propiedad.codigo} (${propiedad.titulo}).`)
    : null;
  const qr = enlace
    ? await QRCode.toDataURL(enlace, { margin: 0, width: 300, color: { dark: marca.colores.profundo, light: marca.colores.base } })
    : null;
  // Un logo local (marcas/<corredor>/…) se resuelve solo dentro de marcas/.
  let logo: string | null = null;
  if (marca.logoSobreProfundo) {
    logo = /^https?:\/\//.test(marca.logoSobreProfundo) ? marca.logoSobreProfundo : rutaDeMarca(marca.logoSobreProfundo);
    if (!logo) throw new Error("El logo de la marca no es un archivo de marcas/ ni una dirección https");
  }
  const documento = createElement(FichaPropiedad, {
    propiedad,
    marca,
    logo,
    whatsapp: whatsappAsistente,
    enlaceWhatsApp: enlace,
    qr,
    fotos: fotosDeFicha(propiedad),
  });
  return renderToBuffer(documento as unknown as ReactElement<DocumentProps>);
}
