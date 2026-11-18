import type { CasaSitio } from "@/lib/sitio/importar";

// Exportación del sitio (`exportar-propiedades`) con la MISMA forma que la real (noviembre de 2026), datos ficticios:
//  - casas de la semilla del sitio (id con texto) con 30+ fotos en `property-media/images/…`;
//  - casas de su base (id uuid) con la carpeta en la llave codificada (`carpeta%2Farchivo.jpeg`);
//  - casas traídas de Encuentra24 al sitio SIN fotos (`imagenes: []`): el sitio tampoco las muestra (filtra `hasPhotos`).

export const HOST_EXPORTACION = "abcdefghijklmnopqrst.supabase.co";
const base = `https://${HOST_EXPORTACION}/storage/v1/object/public/property-media`;

export const fotoSemilla = (casa: string, n: number) => `${base}/images/${casa}-${String(n).padStart(2, "0")}.jpg`;
export const fotoCarpeta = (carpeta: string, n: number) => `${base}/${carpeta}%2F${String(n).padStart(2, "0")}-foto.jpeg`;

type CasaExportada = CasaSitio & { id: string; slug: string; parqueos: number | null; video_url: string | null };

const comun = {
  descripcion: { es: "Casa de prueba.", en: "Test home." },
  destacados: null,
  operacion: "sale",
  tipo: "house",
  moneda: "USD",
  region: "gam",
  provincia: "San José",
  canton: "Santa Ana",
  distrito: "Pozos",
  habitaciones: 4,
  banos: 4,
  parqueos: 2,
  m2_construccion: 500,
  m2_terreno: 800,
  amenidades: ["pool"],
  video_url: null,
  url_e24: null,
  estado: "available",
  oculta: false,
} as const;

export function exportacionReal(): { generado: string; propiedades: CasaExportada[] } {
  return {
    generado: "2026-11-18T00:00:00.000Z",
    propiedades: [
      {
        ...comun,
        codigo: "DP-AAAAA1",
        id: "lindora-prueba-2200k",
        slug: "casa-prueba-lindora",
        titulo: { es: "Casa de prueba en Bosques de Lindora", en: "Test home" },
        ubicacion: "Bosques de Lindora",
        precio: 2200000,
        imagenes: Array.from({ length: 35 }, (_, i) => fotoSemilla("lindora", i + 1)),
      },
      {
        ...comun,
        codigo: "DP-AAAAA2",
        id: "00000000-0000-4000-8000-0000000000a2",
        slug: "casa-prueba-malinches",
        titulo: { es: "Casa de prueba en Parques del Sol", en: "Test home" },
        ubicacion: "Valle del Sol",
        precio: 900000,
        imagenes: Array.from({ length: 25 }, (_, i) => fotoCarpeta("malinches", i + 1)),
      },
      {
        ...comun,
        codigo: "DP-AAAAA3",
        id: "00000000-0000-4000-8000-0000000000a3",
        slug: "31000000-venta-prueba-santa-ana",
        titulo: { es: "VENTA SANTA ANA POZOS CASA DE PRUEBA", en: "" },
        ubicacion: "Pozos, Santa Ana",
        precio: 450000,
        url_e24: "https://www.encuentra24.com/costa-rica-es/bienes-raices-venta-de-propiedades-casas/prueba/31000000",
        imagenes: [],
      },
      {
        ...comun,
        codigo: "DP-AAAAA4",
        id: "00000000-0000-4000-8000-0000000000a4",
        slug: "32000000-alquiler-prueba-escazu",
        titulo: { es: "ALQUILER ESCAZU CASA DE PRUEBA", en: "" },
        ubicacion: "Escazú",
        canton: "Escazú",
        distrito: "San Rafael",
        operacion: "rent",
        precio: 3000,
        imagenes: [],
        oculta: true,
      },
    ],
  };
}
