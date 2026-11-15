// Página de UN anuncio de Encuentra24 (datos ficticios) para probar "Leer este anuncio" de punta a punta: el payload
// RSC de Next.js partido en fragmentos (como el listado de e24.ts), JSON-LD, la galería con fotos del servidor de
// fotos de Encuentra24 (una diferida con data-src), una imagen de publicidad de otro servidor dentro de la galería,
// el logo pequeño fuera de ella y, si se pide, el enlace wa.me con la referencia de un anuncio de la asistente.

import { anuncioE24 } from "./e24";

export const ID_ANUNCIO = "31234567";
export const URL_ANUNCIO_E24 = `https://www.encuentra24.com/costa-rica-es/bienes-raices-venta-de-propiedades-casas/casa-en-escazu-san-rafael/${ID_ANUNCIO}`;
export const FOTO_E24 = (n: number) => `https://photos.encuentra24.com/t_or_fh_m/f_auto/v1/cr/31/23/45/67/${ID_ANUNCIO}_${n}.jpg`;
/** Publicidad dentro del carrusel: la extensión la manda, el servidor nunca la pide. */
export const FOTO_AJENA = "https://tpc.googlesyndication.com/simgad/1234567890/banner.jpg";
/** Una foto del JSON-LD alojada fuera de Encuentra24. */
export const FOTO_JSONLD_AJENA = "https://cdn.inmobiliaria-ficticia.example/fotos/fachada.jpg";
export const LOGO_E24 = "https://www.encuentra24.com/static/logo-e24.png";

export interface OpcionesAnuncio {
  /** Número de la asistente y referencia para el enlace wa.me de la descripción (anuncio preparado por la asistente). */
  whatsapp?: { numero: string; referencia: string | null };
  /** Quitar del texto y del JSON-LD el precio (para el caso de "falta lo esencial"). */
  sinPrecio?: boolean;
  /** Fotos de la galería (por defecto, 4 del servidor de fotos de Encuentra24). */
  fotos?: number;
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function paginaAnuncioE24(o: OpcionesAnuncio = {}): string {
  const nFotos = o.fotos ?? 4;
  const precio = o.sinPrecio ? null : 450000;
  const titulo = "Casa en condominio en San Rafael de Escazú";
  const descripcion = [
    "Casa de dos plantas en condominio con seguridad 24/7, a 5 minutos de Multiplaza.",
    "3 habitaciones, 2.5 baños, cocina abierta con isla, cuarto de pilas, jardín privado y 2 parqueos techados.",
    "Construcción 220 m², terreno 300 m².",
    precio ? "Precio: $450.000, negociable." : "Precio a convenir.",
  ].join(" ");
  const wa = o.whatsapp
    ? `https://wa.me/${o.whatsapp.numero.replace(/\D/g, "")}?text=${encodeURIComponent(
        o.whatsapp.referencia ? `Hola, me interesa la propiedad del anuncio ref. ${o.whatsapp.referencia}` : "Hola, me interesa la propiedad",
      )}`
    : null;

  const rsc = `7:["$","div",null,${JSON.stringify({
    ad: anuncioE24(ID_ANUNCIO, "Propietario", "Dueño de prueba", {
      title: titulo,
      description: descripcion,
      price: { currency: { symbol: "USD" }, amount: { value: precio, formatted: precio ? "$450,000" : "" } },
      principalImage: FOTO_E24(1),
      images: Array.from({ length: nFotos }, (_, i) => FOTO_E24(i + 1)),
      link: new URL(URL_ANUNCIO_E24).pathname,
    }),
  })}]\n`;
  const corte = Math.floor(rsc.length / 2);
  const push = (t: string) => `<script>self.__next_f.push([1,${JSON.stringify(t)}])</script>`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "SingleFamilyResidence",
    name: titulo,
    description: descripcion,
    numberOfRooms: 3,
    numberOfBathroomsTotal: 2.5,
    floorSize: { "@type": "QuantitativeValue", value: 220, unitCode: "MTK" },
    address: { "@type": "PostalAddress", addressLocality: "San Rafael, Escazú", addressRegion: "San José", addressCountry: "CR" },
    // Repite la primera foto (no debe salir dos veces) y trae una de afuera.
    image: [FOTO_E24(1), { "@type": "ImageObject", url: FOTO_JSONLD_AJENA }],
    ...(precio ? { offers: { "@type": "Offer", price: precio, priceCurrency: "USD" } } : {}),
  };

  const galeria = Array.from({ length: nFotos }, (_, i) =>
    // La última foto es diferida (todavía sin src, con data-src), como en los carruseles reales, y con alt: Chrome pinta
    // el texto y img.width deja de ser 0, pero extraerAnuncio (extension/background.js) la cuenta por su dirección.
    i === nFotos - 1 && nFotos > 2
      ? `<div class="swiper-slide"><img data-src="${FOTO_E24(i + 1)}" alt="Foto ${i + 1}"></div>`
      : `<div class="swiper-slide"><img src="${FOTO_E24(i + 1)}" alt="Foto ${i + 1}"></div>`,
  ).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${escapar(titulo)} | Encuentra24</title>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">{ roto </script>
</head><body>
<header><img src="${LOGO_E24}" width="120" height="40" alt="Encuentra24"><nav>Bienes raíces · Autos · Empleos</nav></header>
<main>
  <ol class="breadcrumb"><li>Bienes raíces</li><li>Venta de casas</li><li>San José</li><li>Escazú</li></ol>
  <h1>${escapar(titulo)}</h1>
  <div class="ad-price">${precio ? "$450,000" : "Precio a convenir"}</div>
  <div class="ad-gallery swiper">${galeria}
    <div class="swiper-slide"><img src="${FOTO_AJENA}" alt="Publicidad"></div>
  </div>
  <section class="ad-details"><ul><li>Recámaras: 3</li><li>Baños: 2.5</li><li>m² de construcción: 220</li><li>Ubicación: San Rafael, Escazú, San José</li></ul></section>
  <section class="ad-description"><p>${escapar(descripcion)}</p>
    ${wa ? `<p><a href="${escapar(wa)}">Escríbeme por WhatsApp</a></p>` : ""}
  </section>
  <a href="https://www.encuentra24.com/costa-rica-es/bienes-raices-venta-de-propiedades-casas/escazu">Ver más casas en Escazú</a>
</main>
<footer>© Encuentra24 · Términos · Privacidad</footer>
${push(rsc.slice(0, corte))}${push(rsc.slice(corte))}
</body></html>`;
}

/** Una imagen SVG de cierto tamaño (la extensión decide por el tamaño natural); se sirve con dirección .jpg. */
export function imagenDeTamano(ancho: number, alto: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}"><rect width="100%" height="100%" fill="#8a9"/></svg>`;
}
