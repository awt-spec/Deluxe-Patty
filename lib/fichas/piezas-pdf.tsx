import { Path, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { Marca } from "./marca";

// Piezas compartidas por los dos PDF (la ficha de la propiedad y el documento de Patty) para que se vean de la
// misma familia: íconos dibujados, tarjeta de cifra, viñeta de la marca, encabezado delgado y pie con "N de M".

export type Colores = Marca["colores"];

/** Familias de letra: la serif de la marca (Playfair Display) o todo en Inter para la versión sobria. */
export function tipografiaDe(marca: Pick<Marca, "tipografia"> | null) {
  const serif = (marca?.tipografia ?? "serif") === "serif";
  return { titulo: serif ? "Playfair" : "Inter", pesoTitulo: serif ? 400 : 600, serif } as const;
}

// Trazos de 24×24, solo líneas: se ven igual en papel y en pantalla y no dependen de una fuente de íconos.
const TRAZOS = {
  cama: "M3 18V7 M3 14h18v4 M21 14v-1.5A3.5 3.5 0 0 0 17.5 9H11v5 M7 12.5a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z",
  bano: "M4 12h16v2.5A4.5 4.5 0 0 1 15.5 19h-7A4.5 4.5 0 0 1 4 14.5z M6.5 12V6a2 2 0 0 1 4 0 M7.5 19l-1 2 M16.5 19l1 2",
  construccion: "M3.5 11L12 4l8.5 7 M6 9v11h12V9 M10 20v-5h4v5",
  terreno: "M4 8V4h4 M16 4h4v4 M20 16v4h-4 M8 20H4v-4 M9 9h6v6H9z",
  ubicacion: "M12 21s-7-6.1-7-11.4a7 7 0 0 1 14 0C19 14.9 12 21 12 21z M12 12.3a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z",
  whatsapp: "M4.5 19.5l1.3-3.8A8 8 0 1 1 8.4 18.3z M9 9.5c.3 2.3 2.2 4.2 4.5 4.6l1.2-1.1 1.8.8-.3 1.6c-3.6.3-7.2-3.3-6.9-6.9l1.6-.3.8 1.8z",
  correo: "M3.5 6h17v12h-17z M3.5 7l8.5 6 8.5-6",
  web: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3.2 3.6 3.2 14.4 0 18 M12 3c-3.2 3.6-3.2 14.4 0 18",
  precio: "M3.5 12V4h8l9 9-8 8z M8 9.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z",
} as const;

/** Mezcla dos colores #rrggbb (t = 0 es `a`, 1 es `b`): tonos suaves sin depender de transparencias. */
export function mezclar(a: string, b: string, t: number): string {
  const rgb = (h: string) => {
    const x = h.replace("#", "");
    const n = x.length === 3 ? x.split("").map((c) => c + c).join("") : x.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) || 0);
  };
  const [ca, cb] = [rgb(a), rgb(b)];
  return "#" + ca.map((v, i) => Math.round(v + (cb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, color, tam = 14, grosor = 1.5 }: { nombre: NombreIcono; color: string; tam?: number; grosor?: number }) {
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24">
      <Path d={TRAZOS[nombre]} stroke={color} strokeWidth={grosor} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Viñeta de la marca: un rombo pequeño del color principal. */
export function Rombo({ color, tam = 4.5, arriba = 4.2 }: { color: string; tam?: number; arriba?: number }) {
  return <View style={{ width: tam, height: tam, backgroundColor: color, transform: "rotate(45deg)", marginTop: arriba, marginRight: 9 }} />;
}

/** Tarjeta de una cifra: ícono opcional, la cifra en la letra de títulos y la etiqueta en versalitas. */
export function TarjetaCifra({
  valor,
  etiqueta,
  icono,
  colores,
  marca,
  fondo,
}: {
  valor: string;
  etiqueta: string;
  icono?: NombreIcono;
  colores: Colores;
  marca: Pick<Marca, "tipografia"> | null;
  /** Fondo de la tarjeta (por defecto, el base de la marca). */
  fondo?: string;
}) {
  const t = tipografiaDe(marca);
  return (
    <View
      wrap={false}
      style={{
        flexGrow: 1,
        flexBasis: 0,
        backgroundColor: fondo ?? colores.base,
        borderWidth: 0.75,
        borderColor: mezclar(colores.soporte, colores.base, 0.55),
        borderRadius: 4,
        paddingVertical: 12,
        paddingHorizontal: 10,
        alignItems: "center",
      }}
    >
      {icono && (
        <View style={{ marginBottom: 7 }}>
          <Icono nombre={icono} color={colores.principal} tam={18} />
        </View>
      )}
      <Text style={{ fontFamily: t.titulo, fontWeight: t.pesoTitulo, fontSize: 17, lineHeight: 1.2, color: colores.profundo, textAlign: "center" }}>{valor}</Text>
      <Text style={{ fontSize: 6.8, letterSpacing: 1.3, textTransform: "uppercase", color: colores.soporte, marginTop: 4, lineHeight: 1.3, textAlign: "center", fontWeight: 500 }}>
        {etiqueta}
      </Text>
    </View>
  );
}

/** Fila de tarjetas con separación constante. */
export function FilaCifras({ children, separacion = 8 }: { children: ReactNode[]; separacion?: number }) {
  return (
    <View style={{ flexDirection: "row" }} wrap={false}>
      {children.map((c, i) => (
        <View key={i} style={{ flexGrow: 1, flexBasis: 0, marginLeft: i === 0 ? 0 : separacion, flexDirection: "row" }}>
          {c}
        </View>
      ))}
    </View>
  );
}

const MARGEN = 44;

/**
 * Encabezado delgado y fijo (se repite en cada página del bloque): nombre a la izquierda, dato a la derecha y una
 * línea fina. `desdePagina` lo oculta en las primeras páginas (la portada ya lo dice).
 */
export function EncabezadoDelgado({
  izquierda,
  derecha,
  colores,
  marca,
  desdePagina = 1,
}: {
  izquierda: string;
  derecha: string;
  colores: Colores;
  marca: Pick<Marca, "tipografia"> | null;
  desdePagina?: number;
}) {
  const t = tipografiaDe(marca);
  return (
    <View
      fixed
      style={{ position: "absolute", top: 22, left: MARGEN, right: MARGEN }}
      render={({ pageNumber }) =>
        pageNumber < desdePagina ? null : (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 0.6, borderBottomColor: colores.principal, paddingBottom: 6 }}>
            <Text style={{ fontFamily: t.titulo, fontWeight: t.pesoTitulo, fontSize: 9.5, color: colores.profundo }}>{izquierda}</Text>
            <Text style={{ fontSize: 7, letterSpacing: 1.2, textTransform: "uppercase", color: colores.soporte, maxWidth: 300, textAlign: "right" }}>{derecha}</Text>
          </View>
        )
      }
    />
  );
}

/** Pie fijo con firma a la izquierda y "N de M" a la derecha. */
export function PieDePagina({ izquierda, colores }: { izquierda: string; colores: Colores }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 20,
        left: MARGEN,
        right: MARGEN,
        flexDirection: "row",
        justifyContent: "space-between",
        borderTopWidth: 0.6,
        borderTopColor: mezclar(colores.soporte, colores.base, 0.5),
        paddingTop: 7,
      }}
    >
      <Text style={{ fontSize: 7.5, color: colores.soporte }}>{izquierda}</Text>
      <Text style={{ fontSize: 7.5, color: colores.soporte }} render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`} />
    </View>
  );
}

export const MARGEN_PAGINA = MARGEN;
