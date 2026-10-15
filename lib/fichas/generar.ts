import path from "node:path";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { createElement, type ReactElement } from "react";
import { enlaceWhatsAppConTexto } from "../anuncios/atribucion";
import type { PropiedadConFotos } from "../datos/tipos";
import { FichaPropiedad, registrarFuentes } from "./ficha";
import type { Marca } from "./marca";

export interface OpcionesFicha {
  propiedad: PropiedadConFotos;
  marca: Marca;
  /** Número de la asistente: el QR abre WhatsApp con la referencia de la propiedad. */
  whatsappAsistente: string | null;
}

/** PDF de la ficha. Usa la foto mejorada cuando existe y la original si no. */
export async function generarFicha({ propiedad, marca, whatsappAsistente }: OpcionesFicha): Promise<Buffer> {
  registrarFuentes();
  const fotos = [...propiedad.fotos]
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((f) => f.mejorada_url ?? f.url);
  const qr = whatsappAsistente
    ? await QRCode.toDataURL(
        enlaceWhatsAppConTexto(whatsappAsistente, `Hola, me interesa la propiedad ${propiedad.codigo} (${propiedad.titulo}).`),
        {
        margin: 0,
        width: 300,
          color: { dark: marca.colores.profundo, light: marca.colores.base },
        },
      )
    : null;
  // Un logo local (marcas/<corredor>/…) se resuelve desde la raíz del proyecto.
  const logo = /^https?:\/\//.test(marca.logoSobreProfundo)
    ? marca.logoSobreProfundo
    : path.join(process.cwd(), marca.logoSobreProfundo);
  const documento = createElement(FichaPropiedad, {
    propiedad,
    marca: { ...marca, logoSobreProfundo: logo },
    whatsapp: whatsappAsistente,
    qr,
    fotos,
  });
  return renderToBuffer(documento as unknown as ReactElement<DocumentProps>);
}
