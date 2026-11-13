import path from "node:path";
import { Document, Font, Image, Link, Page, Rect, Svg, Text, View } from "@react-pdf/renderer";
import type { PropiedadConFotos } from "../datos/tipos";
import { MAX_FOTOS_GALERIA, reticulaGaleria, tamanoTitulo } from "./diseno";
import type { Marca } from "./marca";
import {
  EncabezadoDelgado,
  FilaCifras,
  Icono,
  MARGEN_PAGINA as M,
  mezclar,
  PieDePagina,
  Rombo,
  TarjetaCifra,
  tipografiaDe,
  type NombreIcono,
} from "./piezas-pdf";

// Ficha de propiedad en PDF (A4 vertical), como un folleto: portada con la foto a sangre, página de datos,
// galería y cierre con el contacto. Tipografías del manual de Deluxe (Playfair Display para títulos y cifras,
// Inter para texto) o, sin marca, todo en Inter. Solo datos de la propiedad: nada se inventa ni se rellena.

const fuente = (paquete: string, archivo: string) =>
  path.join(process.cwd(), "node_modules", "@fontsource", paquete, "files", archivo);

let fuentesRegistradas = false;
export function registrarFuentes() {
  if (fuentesRegistradas) return;
  Font.register({
    family: "Playfair",
    fonts: [
      { src: fuente("playfair-display", "playfair-display-latin-400-normal.woff"), fontWeight: 400 },
      { src: fuente("playfair-display", "playfair-display-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: fuente("playfair-display", "playfair-display-latin-500-normal.woff"), fontWeight: 500 },
    ],
  });
  Font.register({
    family: "Inter",
    fonts: [
      { src: fuente("inter", "inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: fuente("inter", "inter-latin-500-normal.woff"), fontWeight: 500 },
      { src: fuente("inter", "inter-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((palabra) => [palabra]);
  fuentesRegistradas = true;
}

export interface FotoFicha {
  src: string;
  /** Versión hecha con IA (amueblada o limpia): lleva el rótulo "Imagen ilustrativa". */
  ilustrativa: boolean;
}

export interface DatosFicha {
  propiedad: PropiedadConFotos;
  marca: Marca;
  /** Logo ya resuelto (archivo de marcas/ o https), o null para mostrar el nombre. */
  logo: string | null;
  /** Número de WhatsApp de contacto (E.164). */
  whatsapp: string | null;
  /** Enlace wa.me con la referencia de la propiedad (el mismo del QR). */
  enlaceWhatsApp: string | null;
  /** QR (data URL PNG) al enlace de WhatsApp con la referencia. */
  qr: string | null;
  /** Fotos a usar, en orden: la primera es la portada. */
  fotos: FotoFicha[];
}

export function precioFicha(p: Pick<PropiedadConFotos, "precio" | "moneda" | "operacion">): string | null {
  if (p.precio === null) return null;
  const cifra = Math.round(p.precio).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const valor = p.moneda === "USD" ? `$${cifra}` : `${p.moneda} ${cifra}`;
  return p.operacion === "alquiler" ? `${valor} al mes` : valor;
}

function numero(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

function telefono(e164: string): string {
  const d = e164.replace(/\D/g, "");
  return d.startsWith("506") && d.length === 11 ? `+506 ${d.slice(3, 7)} ${d.slice(7)}` : e164;
}

const TIPO: Record<string, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  lote: "Lote",
  local: "Local comercial",
  oficina: "Oficina",
  finca: "Finca",
  otro: "Propiedad",
};

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Las cifras que la ficha trae, con su ícono. Solo las que existen: nunca "N/D" de relleno. */
export function cifrasFicha(p: PropiedadConFotos): { valor: string; etiqueta: string; icono: NombreIcono }[] {
  const datos: ({ valor: string; etiqueta: string; icono: NombreIcono } | null)[] = [
    p.habitaciones !== null ? { valor: numero(p.habitaciones), etiqueta: p.habitaciones === 1 ? "Habitación" : "Habitaciones", icono: "cama" } : null,
    p.banos !== null ? { valor: numero(p.banos), etiqueta: p.banos === 1 ? "Baño" : "Baños", icono: "bano" } : null,
    p.m2_construccion !== null ? { valor: `${numero(p.m2_construccion)} m²`, etiqueta: "Construcción", icono: "construccion" } : null,
    p.m2_terreno !== null ? { valor: `${numero(p.m2_terreno)} m²`, etiqueta: "Terreno", icono: "terreno" } : null,
  ];
  return datos.filter((d) => d !== null);
}

/** Párrafos de la descripción: el primero va destacado. Un solo bloque largo se parte en su primera frase. */
export function parrafosDescripcion(texto: string | null): string[] {
  const limpio = (texto ?? "").replace(/\r\n?/g, "\n").trim();
  if (!limpio) return [];
  const partes = limpio.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean);
  if (partes.length === 1 && partes[0].length > 280) {
    const corte = /^(.{60,260}?[.!?])\s+(.+)$/s.exec(partes[0]);
    if (corte) return [corte[1], corte[2]];
  }
  return partes;
}

const ANCHO = 595.28;
const ALTO = 841.89;
const ARRIBA = 72;
const ABAJO = 62;

export function FichaPropiedad({ propiedad: p, marca, logo, whatsapp, enlaceWhatsApp, qr, fotos }: DatosFicha) {
  const c = marca.colores;
  const t = tipografiaDe(marca);
  const fondoLogo = marca.fondoLogo ?? c.profundo;
  const suave = mezclar(c.base, c.soporte, 0.12);
  const linea = mezclar(c.soporte, c.base, 0.45);
  const etiqueta = { fontSize: 7, letterSpacing: 1.6, textTransform: "uppercase" as const, color: c.soporte, fontWeight: 500 };
  const tituloSerif = { fontFamily: t.titulo, fontWeight: t.pesoTitulo };

  const ubicacionCorta = [p.distrito, p.canton].filter(Boolean).join(", ") || p.zona || p.provincia;
  const operacion = p.operacion === "alquiler" ? "En alquiler" : "En venta";
  const tipo = TIPO[p.tipo] ?? "Propiedad";
  const valorPrecio = precioFicha(p);
  const cifras = cifrasFicha(p);
  const parrafos = parrafosDescripcion(p.descripcion);
  const [portada, ...resto] = fotos;
  const galeria = resto.slice(0, MAX_FOTOS_GALERIA);
  const filas = reticulaGaleria(galeria.length);
  const ubicacion = [
    ["Provincia", p.provincia],
    ["Cantón", p.canton],
    ["Distrito", p.distrito],
    ["Zona", p.zona && ![p.canton, p.distrito].includes(p.zona) ? p.zona : null],
  ].filter((u): u is [string, string] => !!u[1]);
  const amenidades = p.amenidades.map((a) => a.trim()).filter(Boolean).slice(0, 24);
  const mitad = Math.ceil(amenidades.length / 2);
  const firmaPie = `${marca.nombre} · Ref. ${p.codigo}`;

  const encabezado = <EncabezadoDelgado izquierda={marca.nombre} derecha={`Ref. ${p.codigo}`} colores={c} marca={marca} />;
  const pie = <PieDePagina izquierda={firmaPie} colores={c} />;
  const paginaInterior = { backgroundColor: c.base, fontFamily: "Inter", color: c.profundo, fontSize: 9.5, paddingTop: ARRIBA, paddingBottom: ABAJO, paddingHorizontal: M };

  const logoDe = (tam: number) =>
    logo ? (
      <View style={{ width: tam, height: tam, backgroundColor: fondoLogo, borderRadius: 2 }}>
        <Image src={logo} style={{ width: tam, height: tam }} />
      </View>
    ) : (
      <Text style={{ ...tituloSerif, fontSize: tam / 4.2, color: c.base, letterSpacing: 0.5 }}>{marca.nombre}</Text>
    );

  // Degradado vertical del color profundo: solo donde va el texto, la foto queda limpia.
  // Degradado del color profundo hecho con franjas (los visores no respetan stopOpacity de react-pdf): solo donde
  // va el texto, la foto queda limpia. Se ancla con top o bottom, nunca con top + alto = alto de página: react-pdf
  // se queda paginando sin fin si un elemento absoluto toca justo el borde inferior por cálculo.
  const degradado = (alto: number, oscuro: number, abajo = false) => {
    // Capas que se suman desde el extremo claro hasta el oscuro: cada una agrega lo justo para llegar a su tono,
    // sin franjas superpuestas que dejen líneas.
    const capas = 40;
    const h = alto / capas;
    let previo = 0;
    const rects = Array.from({ length: capas }, (_, k) => {
      const x = (k + 1) / capas;
      const meta = oscuro * x * x * (3 - 2 * x);
      const opacidad = previo >= 1 ? 0 : 1 - (1 - meta) / (1 - previo);
      previo = meta;
      // Capa k: desde su franja hasta el extremo oscuro.
      const y = abajo ? k * h : 0;
      const largo = alto - k * h;
      return <Rect key={k} x="0" y={y} width={ANCHO} height={largo} fill={c.profundo} fillOpacity={Math.max(0, opacidad)} />;
    });
    return (
      <Svg width={ANCHO} height={alto} style={abajo ? { position: "absolute", left: 0, bottom: 0 } : { position: "absolute", left: 0, top: 0 }}>
        {rects}
      </Svg>
    );
  };

  const rotulo = (
    <View style={{ position: "absolute", left: 8, bottom: 8, backgroundColor: c.profundo, borderRadius: 2, paddingVertical: 3, paddingHorizontal: 6 }}>
      <Text style={{ fontSize: 6.5, color: c.base, letterSpacing: 0.6 }}>Imagen ilustrativa</Text>
    </View>
  );

  const fotoEn = (foto: FotoFicha, ancho: number, alto: number) => (
    <View style={{ width: ancho, height: alto, borderRadius: 3, overflow: "hidden", backgroundColor: suave }}>
      <Image src={foto.src} style={{ width: ancho, height: alto, objectFit: "cover" }} />
      {foto.ilustrativa && rotulo}
    </View>
  );

  const anchoUtil = ANCHO - 2 * M;
  const separacion = 8;
  const altoGaleria = ALTO - ARRIBA - ABAJO - 58 - separacion * Math.max(0, filas.length - 1);
  let siguiente = 0;

  return (
    <Document title={`${p.titulo} · ${marca.nombre}`} author={marca.nombre} creator={marca.nombre} language="es">
      {/* Portada: la foto a sangre, degradado abajo y arriba para el texto. */}
      <Page size="A4" style={{ backgroundColor: c.profundo, fontFamily: "Inter" }}>
        {portada ? (
          <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
                <Image src={portada.src} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </View>
        ) : (
          <View style={{ position: "absolute", left: 26, top: 26, right: 26, bottom: 26, borderWidth: 0.75, borderColor: c.principal }} />
        )}
        {portada && degradado(190, 0.6)}
        {portada && degradado(520, 0.93, true)}
        {portada?.ilustrativa && (
          <View style={{ position: "absolute", right: M, top: 140 }}>
            <Text style={{ fontSize: 7, color: c.base, letterSpacing: 0.6 }}>Imagen ilustrativa</Text>
          </View>
        )}

        <View style={{ position: "absolute", top: 40, left: M, right: M, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          {logoDe(76)}
          <Text style={{ ...etiqueta, color: c.base, marginTop: 4 }}>Ref. {p.codigo}</Text>
        </View>

        <View style={{ position: "absolute", left: M, right: M, bottom: 54 }}>
          <View style={{ flexDirection: "row" }}>
            <Text
              style={{ ...etiqueta, fontSize: 7.5, color: c.profundo, backgroundColor: c.principal, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 2, fontWeight: 600 }}
            >
              {operacion}
            </Text>
            <Text style={{ ...etiqueta, fontSize: 7.5, color: c.base, paddingVertical: 4, paddingHorizontal: 9 }}>{tipo}</Text>
          </View>
          <Text style={{ ...tituloSerif, fontSize: tamanoTitulo(p.titulo), lineHeight: 1.18, color: c.base, marginTop: 14 }}>
            {p.titulo}
          </Text>
          {ubicacionCorta && (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
              <Icono nombre="ubicacion" color={c.principal} tam={13} />
              <Text style={{ fontSize: 10.5, color: c.base, marginLeft: 6 }}>
                {[ubicacionCorta, p.provincia !== ubicacionCorta ? p.provincia : null].filter(Boolean).join(" · ")}
              </Text>
            </View>
          )}
          <View style={{ width: 64, height: 1, backgroundColor: c.principal, marginTop: 18, marginBottom: 14 }} />
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            {valorPrecio ? (
              <View>
                <Text style={{ ...etiqueta, color: mezclar(c.base, c.soporte, 0.35) }}>Precio</Text>
                <Text style={{ ...tituloSerif, fontSize: 30, color: c.principal, marginTop: 3 }}>{valorPrecio}</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 10, color: mezclar(c.base, c.soporte, 0.35) }}>Precio a consultar</Text>
            )}
            {marca.eslogan && (
              <Text style={{ fontFamily: t.serif ? "Playfair" : "Inter", fontStyle: t.serif ? "italic" : "normal", fontSize: 10, color: mezclar(c.base, c.soporte, 0.3) }}>
                {marca.eslogan}
              </Text>
            )}
          </View>
        </View>
      </Page>

      {/* Datos: cifras, descripción, ubicación y amenidades. */}
      <Page size="A4" style={paginaInterior}>
        {encabezado}
        <Text style={{ ...etiqueta, color: c.principal, marginTop: 8 }}>La propiedad</Text>
        <Text style={{ ...tituloSerif, fontSize: 21, lineHeight: 1.22, marginTop: 6 }}>
          {p.titulo}
        </Text>
        <View style={{ width: 48, height: 1, backgroundColor: c.principal, marginTop: 12, marginBottom: 18 }} />

        <View
          wrap={false}
          style={{ flexDirection: "row", alignItems: "center", backgroundColor: suave, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 16, marginBottom: cifras.length ? 10 : 20 }}
        >
          <View style={{ flexGrow: 1 }}>
            <Text style={etiqueta}>{valorPrecio ? "Precio" : "Precio a consultar"}</Text>
            {valorPrecio && <Text style={{ ...tituloSerif, fontSize: 20, marginTop: 3 }}>{valorPrecio}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 10, fontWeight: 600 }}>{tipo}</Text>
            <Text style={{ fontSize: 9, color: c.soporte, marginTop: 2 }}>{operacion}</Text>
          </View>
        </View>

        {cifras.length > 0 && (
          <View style={{ marginBottom: 22 }}>
            <FilaCifras>
              {cifras.map((d) => (
                <TarjetaCifra key={d.etiqueta} valor={d.valor} etiqueta={d.etiqueta} icono={d.icono} colores={c} marca={marca} />
              ))}
            </FilaCifras>
          </View>
        )}

        <View style={{ flexDirection: parrafos.length ? "row" : "column" }}>
          {parrafos.length > 0 && (
            <View style={{ width: "61%", paddingRight: 24 }}>
              <Text style={{ ...etiqueta, marginBottom: 8 }} minPresenceAhead={60}>
                Descripción
              </Text>
              {parrafos.map((texto, i) => (
                <Text
                  key={i}
                  orphans={3}
                  widows={3}
                  style={
                    i === 0
                      ? { fontFamily: t.serif ? "Playfair" : "Inter", fontSize: t.serif ? 12.5 : 11.5, lineHeight: 1.55, color: c.profundo, marginBottom: 10 }
                      : { fontSize: 9.8, lineHeight: 1.7, color: mezclar(c.profundo, c.soporte, 0.25), marginBottom: 8 }
                  }
                >
                  {texto}
                </Text>
              ))}
            </View>
          )}
          {ubicacion.length > 0 && (
            <View style={{ width: parrafos.length ? "39%" : "100%" }} wrap={false}>
              <View style={{ borderWidth: 0.75, borderColor: linea, borderRadius: 4, padding: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                  <Icono nombre="ubicacion" color={c.principal} tam={14} />
                  <Text style={{ ...etiqueta, marginLeft: 6 }}>Ubicación</Text>
                </View>
                {ubicacion.map(([nombre, valor], i) => (
                  <View
                    key={nombre}
                    style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: linea }}
                  >
                    <Text style={{ fontSize: 8.5, color: c.soporte }}>{nombre}</Text>
                    <Text style={{ fontSize: 9, fontWeight: 500, textAlign: "right", maxWidth: "65%" }}>{valor}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {amenidades.length > 0 && (
          <View style={{ marginTop: 22 }} wrap={false}>
            <Text style={{ ...etiqueta, marginBottom: 10 }}>Amenidades y detalles</Text>
            <View style={{ flexDirection: "row", borderTopWidth: 0.75, borderTopColor: linea, paddingTop: 10 }}>
              {[amenidades.slice(0, mitad), amenidades.slice(mitad)].map((col, j) => (
                <View key={j} style={{ width: "50%", paddingRight: 12 }}>
                  {col.map((a) => (
                    <View key={a} style={{ flexDirection: "row", marginBottom: 6 }}>
                      <Rombo color={c.principal} />
                      <Text style={{ fontSize: 9.5, flex: 1 }}>{mayuscula(a)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}
        {pie}
      </Page>

      {/* Galería: retícula según cuántas fotos hay. */}
      {galeria.length > 0 && (
        <Page size="A4" style={paginaInterior}>
          {encabezado}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8, marginBottom: 16 }}>
            <Text style={{ ...tituloSerif, fontSize: 19 }}>Galería</Text>
            <Text style={etiqueta}>{p.titulo.length > 60 ? `Ref. ${p.codigo}` : p.titulo}</Text>
          </View>
          {filas.map((fila, i) => {
            const ancho = (anchoUtil - separacion * (fila.columnas - 1)) / fila.columnas;
            const alto = altoGaleria * fila.alto;
            return (
              <View key={i} style={{ flexDirection: "row", marginTop: i === 0 ? 0 : separacion }} wrap={false}>
                {Array.from({ length: fila.columnas }, (_, j) => {
                  const foto = galeria[siguiente++];
                  return (
                    <View key={j} style={{ marginLeft: j === 0 ? 0 : separacion }}>
                      {fotoEn(foto, ancho, alto)}
                    </View>
                  );
                })}
              </View>
            );
          })}
          {pie}
        </Page>
      )}

      {/* Cierre: contacto del corredor, QR a WhatsApp con la referencia y nota legal. */}
      <Page size="A4" style={{ backgroundColor: c.profundo, fontFamily: "Inter", color: c.base, paddingHorizontal: M, paddingTop: 96, paddingBottom: ABAJO }}>
        <View style={{ alignItems: "center" }}>
          {logoDe(112)}
          <Text style={{ ...etiqueta, color: c.principal, marginTop: 34 }}>Agende su visita</Text>
          <Text style={{ ...tituloSerif, fontSize: 26, color: c.base, marginTop: 10, textAlign: "center" }}>Conozcamos esta propiedad</Text>
          <Text style={{ fontSize: 9.5, color: mezclar(c.base, c.soporte, 0.4), marginTop: 10, textAlign: "center", maxWidth: 380 }}>
            Ref. {p.codigo} · {p.titulo}
          </Text>
          <View style={{ width: 48, height: 1, backgroundColor: c.principal, marginTop: 22, marginBottom: 30 }} />
        </View>

        <View style={{ flexDirection: "row", backgroundColor: c.base, borderRadius: 6, padding: 24, alignItems: "center", color: c.profundo }} wrap={false}>
          <View style={{ flexGrow: 1, flexBasis: 0, paddingRight: qr ? 20 : 0 }}>
            <Text style={{ ...tituloSerif, fontSize: 16 }}>{marca.firma?.nombre ?? marca.nombre}</Text>
            {marca.firma?.cargo && (
              <Text style={{ fontFamily: t.serif ? "Playfair" : "Inter", fontStyle: t.serif ? "italic" : "normal", fontSize: 9.5, color: c.soporte, marginTop: 3 }}>
                {marca.firma.cargo}
              </Text>
            )}
            <View style={{ height: 0.75, backgroundColor: linea, marginVertical: 14 }} />
            {(
              [
                whatsapp ? (["whatsapp", `WhatsApp ${telefono(whatsapp)}`, enlaceWhatsApp] as const) : null,
                marca.correo ? (["correo", marca.correo, `mailto:${marca.correo}`] as const) : null,
                marca.sitio ? (["web", marca.sitio.replace(/^https?:\/\//, "").replace(/\/$/, ""), /^https?:\/\//.test(marca.sitio) ? marca.sitio : `https://${marca.sitio}`] as const) : null,
              ].filter((x) => x !== null)
            ).map(([icono, texto, enlace]) => (
              <View key={icono} style={{ flexDirection: "row", alignItems: "center", marginBottom: 7 }}>
                <Icono nombre={icono} color={c.principal} tam={14} />
                {enlace ? (
                  <Link src={enlace} style={{ fontSize: 10, color: c.profundo, textDecoration: "none", marginLeft: 8 }}>
                    {texto}
                  </Link>
                ) : (
                  <Text style={{ fontSize: 10, marginLeft: 8 }}>{texto}</Text>
                )}
              </View>
            ))}
          </View>
          {qr && (
            <View style={{ alignItems: "center", width: 112 }}>
                    <Image src={qr} style={{ width: 96, height: 96 }} />
              <Text style={{ fontSize: 7, color: c.soporte, marginTop: 6, textAlign: "center" }}>Escanee para escribir por WhatsApp con esta referencia</Text>
            </View>
          )}
        </View>

        {marca.eslogan && (
          <Text style={{ fontFamily: t.serif ? "Playfair" : "Inter", fontStyle: t.serif ? "italic" : "normal", fontSize: 13, color: c.principal, textAlign: "center", marginTop: 34 }}>
            {marca.eslogan}
          </Text>
        )}

        <Text style={{ position: "absolute", left: M, right: M, bottom: 52, fontSize: 7, lineHeight: 1.5, color: mezclar(c.base, c.profundo, 0.55), textAlign: "center" }}>
          Información sujeta a cambios sin previo aviso. Precios, medidas y disponibilidad a confirmar con el corredor.
        </Text>
        <PieDePagina izquierda={firmaPie} colores={{ ...c, soporte: mezclar(c.base, c.profundo, 0.5), base: c.profundo }} />
      </Page>
    </Document>
  );
}
